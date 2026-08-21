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
  // GIT_TITLE_MAX is stricter than validateCommitContent's own 200-char cap
  // (the conventional git subject-line length, not just "not an attack") —
  // enforced here, not inside validateCommitContent, so that generic check
  // stays reusable for both title and notes with one shared safety bar.
  const safeTitle = validateCommitContent(title) && title.length <= GIT_TITLE_MAX ? title : null;
  const safeNotes = notes != null && notes !== '' ? (validateCommitContent(notes) ? notes : null) : '';

  if (safeTitle === null || safeNotes === null) {
    return `fix(bugfix-loop): resolve ${issueId}\n\nWorkItem title/notes omitted — unsafe content refused (BEH-11).`;
  }

  return safeNotes
    ? `fix(bugfix-loop): ${safeTitle}\n\n${safeNotes}\n\nIssue: ${issueId}`
    : `fix(bugfix-loop): ${safeTitle}\n\nIssue: ${issueId}`;
}
