/**
 * Branch-freshness computation for the autonomous bugfix loop.
 *
 * Before each turn, the bugfix loop needs to know whether its working
 * branch has fallen behind the remote default branch, so it can warn or
 * refuse to proceed on stale ground. This module answers that question by
 * shelling out to `git fetch` + `git rev-list --left-right --count`.
 *
 * Total-degrade contract (spec BEH-1/BEH-2, Error Cases row
 * FRESHNESS_CHECK_DEGRADED): "ANY other check-freshness failure ... Degrade
 * to a logged warning ... this degrade path is total, not limited to the
 * origin-unreachable case." Accordingly `computeFreshness` never throws —
 * any failure (unresolved default branch, unreachable origin, detached
 * HEAD, malformed rev-list output) is converted to
 * `{ degraded: true, reason }`.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/bugfix-loop-freshness
 */

import { execFileSync } from 'node:child_process';

/**
 * Resolve the remote's default branch from `refs/remotes/origin/HEAD`.
 * Mirrors the pattern in `lib/cli/coordination.mjs`'s
 * `resolveDefaultRemoteBranch`: never throws, returns `null` on any
 * non-zero exit or empty output.
 *
 * `git symbolic-ref --short` abbreviates `refs/remotes/origin/HEAD` the
 * same way `for-each-ref` does, so the result is remote-qualified (e.g.
 * `"origin/main"`, not bare `"main"`) — matching coordination.mjs's own
 * doc comment ("The remote's default branch (e.g. `origin/main`)").
 *
 * @param {string} cwd - git working directory
 * @returns {string|null} the remote-qualified short name (e.g. "origin/main"), or null
 */
export function resolveDefaultRemoteBranch(cwd) {
  try {
    const out = execFileSync(
      'git',
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      { cwd, encoding: 'utf8' },
    );
    const name = (out || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Compute how far HEAD is ahead of / behind the remote default branch.
 *
 * Fetches `origin/<defaultBranch>` to bring the remote-tracking ref
 * current, then reads ahead/behind counts via
 * `git rev-list --left-right --count origin/<branch>...HEAD`.
 *
 * @param {object} [opts]
 * @param {string} [opts.cwd] - git working directory (default: process.cwd())
 * @param {string} [opts.defaultBranch] - bare default branch name (e.g. "main");
 *   if omitted, resolved via {@link resolveDefaultRemoteBranch} (its
 *   remote-qualified result is stripped down to the bare branch name)
 * @returns {{ degraded: false, ahead: number, behind: number }
 *          | { degraded: true, reason: string }}
 *   Never throws — any failure degrades per the spec's total-degrade
 *   contract (Error Cases row FRESHNESS_CHECK_DEGRADED).
 */
export function computeFreshness({ cwd = process.cwd(), defaultBranch } = {}) {
  let branch = defaultBranch;
  if (!branch) {
    const resolved = resolveDefaultRemoteBranch(cwd);
    if (!resolved) {
      return { degraded: true, reason: 'could not resolve default remote branch' };
    }
    // resolveDefaultRemoteBranch returns a remote-qualified short name
    // (e.g. "origin/main"); strip the remote prefix for use in
    // `git fetch origin <branch>` / `origin/<branch>...HEAD` below.
    const slashIdx = resolved.indexOf('/');
    branch = slashIdx === -1 ? resolved : resolved.slice(slashIdx + 1);
  }

  try {
    execFileSync('git', ['fetch', 'origin', branch], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      killSignal: 'SIGKILL',
    });

    const out = execFileSync(
      'git',
      ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`],
      { cwd, encoding: 'utf8' },
    );

    const parts = out.trim().split(/\s+/);
    if (parts.length !== 2) {
      return { degraded: true, reason: `malformed rev-list output: "${out.trim()}"` };
    }

    const [behindStr, aheadStr] = parts;
    const behind = Number(behindStr);
    const ahead = Number(aheadStr);
    if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
      return { degraded: true, reason: `non-numeric rev-list output: "${out.trim()}"` };
    }

    return { degraded: false, ahead, behind };
  } catch (err) {
    return { degraded: true, reason: err.message };
  }
}
