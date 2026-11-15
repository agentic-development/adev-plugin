/**
 * Per-issue attempt cap for `/adev:bugfix-loop`.
 *
 * Owns the append-only JSONL event log at
 * `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl`. Reads fold
 * the log by `issue_id` (last valid line wins). Writes are append-only,
 * mirroring `lib/lifecycle-state.mjs`'s `appendEvent` pattern.
 *
 * This module is a caller of `lib/loop-convergence.mjs`, not a modification
 * of it — `partitionBlockers`/`evaluateStopCondition` are imported and
 * invoked as-is (see per-issue-attempt-cap.spec.md Preconditions).
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/bugfix-loop-attempts
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { codedError as mkErr } from './errors.mjs';
import { partitionBlockers, evaluateStopCondition } from './loop-convergence.mjs';

/** Default per-issue attempt cap when `tasks.bugfix_loop.attempt_cap` is unset. */
export const DEFAULT_ATTEMPT_CAP = 2;

/**
 * Resolve the path to the attempts JSONL log for a given project root.
 * @param {string} projectRoot
 * @returns {string}
 */
export function resolveAttemptsLogPath(projectRoot) {
  return join(projectRoot, '.context-index', 'lifecycle-state', 'bugfix-loop-attempts.jsonl');
}

/**
 * Fold the JSONL log by `issue_id` (last valid line wins). Corrupted lines
 * are skipped with a logged warning — fail-open per Error Cases row 2.
 * @param {string} projectRoot
 * @returns {Map<string, object>}
 */
function readAllRaw(projectRoot) {
  const logPath = resolveAttemptsLogPath(projectRoot);
  if (!existsSync(logPath)) return new Map();
  const raw = readFileSync(logPath, 'utf8');
  const byIssue = new Map();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[bugfix-loop-attempts] skipping corrupted line in ${logPath}`);
      continue;
    }
    if (!parsed || typeof parsed.issue_id !== 'string') continue;
    byIssue.set(parsed.issue_id, parsed);
  }
  return byIssue;
}

/**
 * Read the latest `AttemptRecord` for an issue, or `null` when none exists
 * (treated as zero attempts — BEH-5).
 * @param {string} projectRoot
 * @param {string} issueId
 * @returns {object|null}
 */
export function readAttemptRecord(projectRoot, issueId) {
  return readAllRaw(projectRoot).get(issueId) ?? null;
}

/**
 * Read the latest `AttemptRecord` for every issue with at least one
 * recorded attempt.
 * @param {string} projectRoot
 * @returns {Map<string, object>}
 */
export function readAllAttemptRecords(projectRoot) {
  return readAllRaw(projectRoot);
}

/**
 * Resolve the per-issue attempt cap from the manifest.
 * Defaults to {@link DEFAULT_ATTEMPT_CAP} when unset, non-integer, or
 * non-positive.
 * @param {object} [manifest]
 * @returns {number}
 */
export function resolveAttemptCap(manifest) {
  const raw = manifest?.tasks?.bugfix_loop?.attempt_cap;
  if (raw == null) return DEFAULT_ATTEMPT_CAP;
  if (Number.isInteger(raw) && raw > 0) return raw;
  // eslint-disable-next-line no-console
  console.warn(
    `[bugfix-loop-attempts] tasks.bugfix_loop.attempt_cap "${raw}" is not a positive integer; defaulting to ${DEFAULT_ATTEMPT_CAP}.`,
  );
  return DEFAULT_ATTEMPT_CAP;
}

/**
 * Degraded-mode fallback (Error Cases row 1, BD-6): when quality-gate
 * output has no stable/comparable check-ID shape, fall back to a bounded
 * hash of the raw output — never the raw output itself is persisted. 8 hex
 * chars mirrors the existing `lib/blocker-id.mjs::buildBlockerId` convention.
 * @param {string|null|undefined} rawOutput
 * @returns {string} 8 lowercase hex characters
 */
export function computeDegradedBlockerHash(rawOutput) {
  const text = rawOutput == null ? '' : String(rawOutput);
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * Append an `AttemptRecord` to the JSONL log.
 * @param {string} projectRoot
 * @param {object} record
 * @returns {object} the appended record
 */
function appendAttemptRecord(projectRoot, record) {
  const logPath = resolveAttemptsLogPath(projectRoot);
  mkdirSync(dirname(logPath), { recursive: true });
  const line = JSON.stringify(record) + '\n';
  appendFileSync(logPath, line, { flag: 'a' });
  return record;
}

/**
 * Record the outcome of a completed `/adev:debug --issue <id> --auto`
 * attempt, appending a new `AttemptRecord` for the issue.
 *
 * @param {string} projectRoot
 * @param {object} manifest - loaded manifest (used to resolve the attempt cap)
 * @param {object} params
 * @param {string} params.issueId
 * @param {'FIXED'|'PARKED'|'UNREPRODUCIBLE'} params.outcome
 * @param {string[]} [params.checkIds] - failing quality-gate check IDs (PARKED only)
 * @param {string} [params.rawOutput] - raw failure output, used only for the
 *   degraded-mode hash fallback when `checkIds` is absent/empty (PARKED only)
 * @returns {object} the appended `AttemptRecord`
 */
export function recordDebugAttempt(projectRoot, manifest, { issueId, outcome, checkIds, rawOutput } = {}) {
  if (typeof issueId !== 'string' || issueId.length === 0) {
    throw mkErr('INVALID_ISSUE_ID', 'issueId must be a non-empty string');
  }
  const prior = readAttemptRecord(projectRoot, issueId);
  const attempts = (prior?.attempts ?? 0) + 1;
  const base = { issue_id: issueId, attempts, updated_at: new Date().toISOString() };

  if (outcome === 'FIXED') {
    return appendAttemptRecord(projectRoot, {
      ...base,
      last_verdict: 'PASS',
      curr_blockers: [],
      parked_reason: null,
    });
  }

  if (outcome === 'UNREPRODUCIBLE') {
    // Distinct from BUDGET_EXHAUSTED: "doesn't reproduce" and "retry budget
    // exhausted on real, changing blockers" are different facts. Folding
    // both into BUDGET_EXHAUSTED made the per-issue AttemptRecord verdict
    // and the whole-run ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED completion token
    // read as the same event in logs when they were unrelated.
    return appendAttemptRecord(projectRoot, {
      ...base,
      last_verdict: 'UNREPRODUCIBLE',
      curr_blockers: [],
      parked_reason: 'does not reproduce',
    });
  }

  if (outcome === 'PARKED') {
    const prevBlockers = prior?.curr_blockers ?? [];
    const currBlockers =
      Array.isArray(checkIds) && checkIds.length > 0
        ? checkIds
        : [computeDegradedBlockerHash(rawOutput)];

    const { addressed, persistent, new_ } = partitionBlockers(prevBlockers, currBlockers);
    const cap = resolveAttemptCap(manifest);
    const { verdict } = evaluateStopCondition({
      addressed,
      persistent,
      new_,
      prev_blockers: prevBlockers,
      retries_remaining: cap - attempts,
      verdict: 'BLOCK', // debug attempts never reach PASS via this branch — FIXED is a separate outcome
    });

    return appendAttemptRecord(projectRoot, {
      ...base,
      last_verdict: verdict,
      curr_blockers: currBlockers,
      parked_reason: null,
    });
  }

  throw mkErr('UNSUPPORTED_OUTCOME', `outcome "${outcome}" not yet handled`);
}

/** Values `AttemptRecord.pr_state` may hold once a PR has been resolved. */
const PR_RESOLUTIONS = new Set(['merged', 'closed']);

/**
 * Record that a FIXED attempt's fix was committed and an (unmerged) PR
 * opened for it. Appends a new `AttemptRecord` line carrying forward the
 * issue's existing attempts/last_verdict/curr_blockers/parked_reason
 * unchanged (a PASS verdict is still a PASS) and adding `pr_url`/`pr_state:
 * "open"` — the signal `lib/issues/eligibility.mjs`'s `isOpenPrExcluded`
 * consults so `adev issues next` does not reselect an issue whose fix is
 * already committed and awaiting PR merge (issue-ypa68o /
 * adev-plugin-hg4n). Called by `adev bugfix-loop commit-pr` on a successful
 * commit/push/PR.
 *
 * @param {string} projectRoot
 * @param {string} issueId
 * @param {{ prUrl: string }} params
 * @returns {object} the appended `AttemptRecord`
 */
export function recordPrOpened(projectRoot, issueId, { prUrl } = {}) {
  if (typeof issueId !== 'string' || issueId.length === 0) {
    throw mkErr('INVALID_ISSUE_ID', 'INVALID_ISSUE_ID: issueId must be a non-empty string');
  }
  if (typeof prUrl !== 'string' || prUrl.length === 0) {
    throw mkErr('INVALID_PR_URL', 'INVALID_PR_URL: prUrl must be a non-empty string');
  }
  const prior = readAttemptRecord(projectRoot, issueId);
  return appendAttemptRecord(projectRoot, {
    issue_id: issueId,
    attempts: prior?.attempts ?? 0,
    last_verdict: prior?.last_verdict ?? null,
    curr_blockers: prior?.curr_blockers ?? [],
    parked_reason: prior?.parked_reason ?? null,
    pr_url: prUrl,
    pr_state: 'open',
    updated_at: new Date().toISOString(),
  });
}

/**
 * Record that a tracked PR (previously recorded via {@link recordPrOpened})
 * has merged or closed without merging, clearing the `isOpenPrExcluded`
 * signal so the issue becomes reselectable again. Everything else on the
 * `AttemptRecord` (attempts/last_verdict/curr_blockers/parked_reason/pr_url)
 * is carried forward unchanged — only `pr_state` moves off `"open"`.
 *
 * This module has no live GitHub poll of its own (deliberately — see
 * per-issue-attempt-cap.spec.md BEH-8): a caller with real knowledge of the
 * PR's outcome (a human, the orchestrating session, or a future
 * tracker-sync poller) invokes this to report it.
 *
 * @param {string} projectRoot
 * @param {string} issueId
 * @param {{ status: 'merged'|'closed' }} params
 * @returns {object} the appended `AttemptRecord`
 */
export function recordPrResolved(projectRoot, issueId, { status } = {}) {
  if (typeof issueId !== 'string' || issueId.length === 0) {
    throw mkErr('INVALID_ISSUE_ID', 'INVALID_ISSUE_ID: issueId must be a non-empty string');
  }
  if (!PR_RESOLUTIONS.has(status)) {
    throw mkErr('INVALID_PR_STATUS', `INVALID_PR_STATUS: status must be one of: ${[...PR_RESOLUTIONS].join(', ')}`);
  }
  const prior = readAttemptRecord(projectRoot, issueId);
  if (!prior || !prior.pr_url) {
    throw mkErr('NO_TRACKED_PR', `NO_TRACKED_PR: issue "${issueId}" has no tracked PR to resolve`);
  }
  return appendAttemptRecord(projectRoot, { ...prior, pr_state: status, updated_at: new Date().toISOString() });
}
