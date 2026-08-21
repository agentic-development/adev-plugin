/**
 * Commit-content safe-character validation and commit/push/PR automation
 * for `/adev:bugfix-loop`'s `--auto-commit`/`--worktree-per-bug` paths.
 *
 * BEH-11 (spec): WorkItem-derived content (title/notes) is untrusted — it
 * flows into a commit message, and eventually a PR title, that this module
 * hands to `git`/`gh` via argv-array subprocess calls only (never a shell
 * string). This module's posture is refuse-not-sanitize: content that fails
 * the safe-character allowlist is never partially cleaned and reused — the
 * caller falls back to a generic templated message keyed only by the issue
 * id, exactly the pattern `lib/extensions/governance-values.mjs` uses for
 * argv-token validation (a different allowlist shape, since a commit
 * message/PR title has different valid characters than a single argv
 * token).
 *
 * Branch names are NOT validated by this module and must never be derived
 * from `title`/`notes` — `adev/bugfix-<issue-id>` (Task 9) is built solely
 * from the already-safe, board-controlled issue id. `SAFE_COMMIT_CONTENT`
 * admits characters (space, `:`, `?`, `'`, `"`, `(`, `)`) that are invalid
 * in a git ref per `git-check-ref-format(1)`, so a title/notes string that
 * passes {@link validateCommitContent} is not automatically branch-name-safe.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/bugfix-loop-commit
 */

import { execFileSync } from 'node:child_process';

// Allowlist: word characters, whitespace, and a conservative set of
// punctuation commonly found in bug titles/notes. Deliberately excludes:
//   - shell metacharacters (`;`, `&`, `|`, backtick, `$`, `<`, `>`, `\`) and
//     newlines — refused outright rather than stripped, per BEH-11's
//     refuse-not-sanitize posture;
//   - `/` — not a shell metacharacter, but excluded so a title/notes string
//     can never be mistaken for (or misused as) a path fragment or part of
//     a branch name (see the module header: branch names are never derived
//     from this content in the first place, but the allowlist stays
//     conservative rather than relying on that discipline alone).
const SAFE_COMMIT_CONTENT = /^[\w\s.,:'"()#!?-]+$/;

// 200 chars is a conservative cap for `notes`, which becomes a commit-body
// paragraph (no git length convention applies there). `title` is tighter:
// GIT_TITLE_MAX below enforces the ~50-72-char git subject-line convention
// separately in `safeCommitMessage`, so a 200-char title never reaches that
// far — this constant only bounds the outer "is it garbage/an attack"
// check shared by both fields.
const MAX_COMMIT_CONTENT_LENGTH = 200;

// Conventional git commit subject-line length (e.g. `git commit` itself
// warns past 50, hard-wraps display past ~72). Applied to `title` only,
// in `safeCommitMessage` — `validateCommitContent` alone stays a generic
// content-safety check reusable for both title and notes.
const GIT_TITLE_MAX = 72;

/**
 * @param {unknown} text
 * @returns {boolean} whether `text` is safe to splice into a commit
 *   message or PR title argv element. NOT a branch-name-safety check — see
 *   the module header; branch names must never be derived from this
 *   content regardless of what this function returns.
 */
export function validateCommitContent(text) {
  if (typeof text !== 'string') return false;
  if (text.length === 0 || text.length > MAX_COMMIT_CONTENT_LENGTH) return false;
  if (text.trim().length === 0) return false; // whitespace-only content refused
  // \r\n cover ASCII line breaks; U+2028/U+2029 (LINE/PARAGRAPH SEPARATOR)
  // are genuine Unicode line terminators that some downstream renderers
  // (GitHub's web UI, JS-based commit tooling) treat as line breaks even
  // though git's own trailer parser only splits on \n — refused here too,
  // since \s in the allowlist regex below would otherwise admit them.
  if (/[\r\n\u2028\u2029]/.test(text)) return false;
  if (text.startsWith('-')) return false; // avoid argv flag-position ambiguity downstream
  return SAFE_COMMIT_CONTENT.test(text);
}

/**
 * Resolve `title` to itself when it is safe to use as a commit-subject/PR
 * title, or `null` otherwise. Shared by {@link safeCommitMessage} and
 * `commitAndOpenPr`'s PR-title resolution so the two call sites cannot
 * drift on what "safe title" means.
 *
 * `GIT_TITLE_MAX` is stricter than {@link validateCommitContent}'s own
 * 200-char cap (the conventional git subject-line length, not just "is
 * this an attack") — enforced here, not inside `validateCommitContent`, so
 * that generic check stays reusable for both title and notes with one
 * shared safety bar.
 *
 * @param {unknown} title
 * @returns {string|null}
 */
function resolveSafeTitle(title) {
  return validateCommitContent(title) && title.length <= GIT_TITLE_MAX ? title : null;
}

/**
 * Build a commit message body from a WorkItem's `title`/`notes`, refusing
 * (never sanitizing) unsafe content. When either field fails
 * {@link validateCommitContent}, the whole message falls back to a generic
 * template keyed only by `issueId` — never a partially-cleaned title/notes
 * string, since a "cleaned" unsafe string is still attacker-influenced
 * content by construction.
 *
 * @param {string} issueId
 * @param {string} title
 * @param {string|null|undefined} [notes]
 * @returns {string} a safe commit message body (subject + optional blank-line body)
 */
export function safeCommitMessage(issueId, title, notes) {
  const safeTitle = resolveSafeTitle(title);
  const safeNotes = notes != null && notes !== '' ? (validateCommitContent(notes) ? notes : null) : '';

  if (safeTitle === null || safeNotes === null) {
    return `fix(bugfix-loop): resolve ${issueId}\n\nWorkItem title/notes omitted — unsafe content refused (BEH-11).`;
  }

  return safeNotes
    ? `fix(bugfix-loop): ${safeTitle}\n\n${safeNotes}\n\nIssue: ${issueId}`
    : `fix(bugfix-loop): ${safeTitle}\n\nIssue: ${issueId}`;
}

/** `adev/bugfix-<issue-id>` — the branch-naming convention `lib/worktree.mjs` uses for `--worktree-per-bug`, reused here so commit/push targets the same branch a per-bug worktree was already created on (BEH-3/BEH-4). */
export function branchNameFor(issueId) {
  return `adev/bugfix-${issueId}`;
}

/**
 * Commit, push, and open a PR for a `FIXED` bug (spec BEH-4/BEH-5/BEH-7,
 * Migration Path Step 3). Every `git`/`gh` invocation is an argv-array call
 * to `execFileImpl` (default `execFileSync`) — never a shell string — per
 * BEH-11's injection-safety requirement.
 *
 * Degrade-gracefully posture (BEH-7, Error Cases `COMMIT_PR_SKIPPED`): ANY
 * failure in the commit/push/PR sequence — `gh` missing/unauthenticated,
 * push rejected, no changes to commit — returns `{ skipped: true, reason }`
 * rather than throwing. The caller's `AttemptRecord`/board state (already
 * written before this is called) is never affected by a degrade here.
 *
 * @param {object} params
 * @param {string} params.cwd - the tree to commit in: the per-bug worktree
 *   path when `--worktree-per-bug` is active, else the loop's shared tree.
 * @param {string} params.issueId
 * @param {string} params.title - WorkItem title (untrusted; validated via {@link safeCommitMessage})
 * @param {string|null} [params.notes] - WorkItem notes (untrusted; validated via {@link safeCommitMessage})
 * @param {string} [params.specPath] - project-root-relative spec path, added as a `Spec:` trailer.
 *   Caller-controlled (not WorkItem content), so it is not passed through
 *   {@link validateCommitContent} — it is spliced directly as a trusted trailer.
 * @param {string} params.prBase - the PR's base branch: the loop's starting
 *   branch, or (when `--worktree-per-bug` stacking is active) the previous
 *   bug's completed branch — resolved by the caller via
 *   `resolveWorktreeBaseRef` (Task 4/5), not by this function.
 * @param {(cmd: string, args: string[], opts?: object) => string} [params.execFileImpl] -
 *   injection point for tests; defaults to `node:child_process`'s `execFileSync`.
 * @returns {{ skipped: false, branch: string, prUrl: string }
 *          | { skipped: true, reason: string }}
 */
export function commitAndOpenPr({
  cwd,
  issueId,
  title,
  notes,
  specPath,
  prBase,
  execFileImpl = execFileSync,
}) {
  const branch = branchNameFor(issueId);
  const bodyMessage = safeCommitMessage(issueId, title, notes);
  // specPath is caller-controlled (a project-root-relative file path this
  // codebase itself owns), never WorkItem content — spliced directly as a
  // trusted trailer, not run through validateCommitContent (BEH-11 only
  // governs untrusted title/notes).
  const commitMessage = specPath ? `${bodyMessage}\n\nSpec: ${specPath}` : bodyMessage;

  // Each git sub-stage gets its own try/catch so a degrade `reason` names
  // the sub-stage that actually failed (e.g. "checkout failed" vs. "commit
  // failed") rather than blaming "commit" for a branch-resolution or
  // staging failure that happened before any commit was attempted.
  let currentBranch;
  try {
    currentBranch = execFileImpl('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  } catch (err) {
    return { skipped: true, reason: `branch resolution failed: ${err.message}` };
  }

  if (currentBranch !== branch) {
    // Already on `branch` when `--worktree-per-bug` created this worktree
    // (Task 6); otherwise (plain `--auto-commit`) cut it fresh here so the
    // commit never lands directly on the loop's own working branch.
    try {
      execFileImpl('git', ['checkout', '-b', branch], { cwd, encoding: 'utf8' });
    } catch (err) {
      return { skipped: true, reason: `checkout failed: ${err.message}` };
    }
  }

  try {
    execFileImpl('git', ['add', '-A'], { cwd, encoding: 'utf8' });
  } catch (err) {
    return { skipped: true, reason: `staging failed: ${err.message}` };
  }

  try {
    execFileImpl('git', ['commit', '-m', commitMessage], { cwd, encoding: 'utf8' });
  } catch (err) {
    return { skipped: true, reason: `commit failed: ${err.message}` };
  }

  try {
    execFileImpl('git', ['push', '-u', 'origin', branch], { cwd, encoding: 'utf8' });
  } catch (err) {
    return { skipped: true, reason: `push failed: ${err.message}` };
  }

  const safeTitle = resolveSafeTitle(title) ?? `resolve ${issueId}`;
  const prTitle = `fix(bugfix-loop): ${safeTitle}`;
  const prBody = specPath ? `Issue: ${issueId}\nSpec: ${specPath}` : `Issue: ${issueId}`;

  try {
    const out = execFileImpl(
      'gh',
      ['pr', 'create', '--base', prBase, '--head', branch, '--title', prTitle, '--body', prBody],
      { cwd, encoding: 'utf8' },
    );
    const prUrl = (out || '').trim().split('\n').pop() ?? '';
    return { skipped: false, branch, prUrl };
  } catch (err) {
    return { skipped: true, reason: `gh pr create failed: ${err.message}` };
  }
}
