/**
 * Shared YAML-frontmatter preamble reader for lifecycle artifacts.
 *
 * Single source of truth for locating the leading `---` fence in a spec (or
 * charter / plan) file and reading its indent-0 scalar fields. Replaces three
 * near-duplicate copies that each carried the same defect:
 *
 *   - `lib/specify-amend.mjs`   — broke `adev specify amend`
 *   - `lib/specify-revise.mjs`  — broke `adev specify revise`
 *   - `lib/amendment-graph.mjs` — silently reported no `amends:` relationships,
 *                                 and via `lib/cli/test-policy.mjs` silently
 *                                 dropped spec-level `test_strategy` /
 *                                 `test_depth`
 *
 * **The defect (adev-plugin-akoy.1).** Each copy scanned the preamble by
 * skipping blank lines, lines starting with `#`, and lines starting with
 * `<!--` — but never tracked an *unclosed* comment. A continuation line of a
 * multi-line HTML comment is non-blank, does not start with `#`, and does not
 * start with `<!--`, so the scan treated it as body content and gave up before
 * reaching the fence. 129 of this repo's 254 `.spec.md` files open with an
 * H1 + multi-line comment preamble and were read as `{}`.
 *
 * A second, independent defect compounded it: the scan capped at 10 lines,
 * while 7 files carry a REVISION HISTORY comment that pushes the fence to
 * line 11 or 15. Comment tracking alone would still have missed those.
 *
 * Pure Node.js built-ins — no external dependencies (constitution principle 1).
 *
 * @module lib/frontmatter
 */

/** The YAML frontmatter delimiter. */
export const FRONTMATTER_FENCE = '---';

/**
 * Safety bound on the preamble scan.
 *
 * The scan already terminates at the first line of real content, so this is
 * only a guard against pathological files (a comment thousands of lines long).
 * The longest real preamble in this repo puts the fence at line 15; 200 leaves
 * generous headroom without letting a malformed file drive an unbounded walk.
 */
export const MAX_PREAMBLE_LINES = 200;

/** Matches an indent-0 `key: value` line. */
const FIELD_RE = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/;

/**
 * Locate the opening fence, tolerating a preamble of blank lines, ATX headings
 * and HTML comments (single- or multi-line).
 *
 * @param {string[]} lines
 * @returns {number} index of the opening fence, or -1 when there is none
 */
function findOpeningFence(lines) {
  const limit = Math.min(lines.length, MAX_PREAMBLE_LINES);
  let inComment = false;

  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inComment) {
      // Everything inside an open comment is preamble, including a line that
      // happens to read `---`. Only the closing delimiter matters here.
      if (trimmed.includes('-->')) inComment = false;
      continue;
    }

    if (trimmed === FRONTMATTER_FENCE) return i;
    if (trimmed === '') continue;

    if (trimmed.startsWith('<!--')) {
      // A comment that does not close on this line opens multi-line mode.
      if (!trimmed.includes('-->')) inComment = true;
      continue;
    }

    // ATX heading — the `# Live Spec: <title>` line these artifacts open with.
    if (trimmed.startsWith('#')) continue;

    // Real content before any fence: this file has no frontmatter.
    return -1;
  }
  return -1;
}

/**
 * Parse the leading frontmatter block into its raw text, trailing body, and
 * indent-0 scalar fields.
 *
 * Only top-level `key: value` lines are captured; nested/indented keys and
 * list items are ignored (callers that need structure read the raw
 * `frontmatterText`). A missing or unclosed fence yields
 * `{ frontmatterText: null, body: <input>, fields: {} }` — the same fail-soft
 * contract the three original copies had.
 *
 * `lines`, `openIdx` and `closeIdx` are returned so a caller can rewrite the
 * frontmatter block while preserving every line outside it byte-identically —
 * including the H1/comment preamble that precedes the opening fence. That is
 * what `lib/specify-revise.mjs::rewriteFrontmatter` splices on. When there is
 * no usable frontmatter, `openIdx`/`closeIdx` are `-1`.
 *
 * @param {string} text - full file contents
 * @returns {{ frontmatterText: string|null, body: string, fields: Record<string,string>,
 *            lines: string[], openIdx: number, closeIdx: number }}
 */
export function parseFrontmatter(text) {
  const safe = typeof text === 'string' ? text : '';
  const lines = safe.split('\n');
  const absent = {
    frontmatterText: null, body: text, fields: {}, lines, openIdx: -1, closeIdx: -1,
  };
  if (safe === '') return absent;

  const openIdx = findOpeningFence(lines);
  if (openIdx === -1) return absent;

  let closeIdx = -1;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_FENCE) { closeIdx = i; break; }
  }
  if (closeIdx === -1) return absent; // malformed — never closed

  const frontmatterLines = lines.slice(openIdx + 1, closeIdx);
  const fields = {};
  for (const line of frontmatterLines) {
    const m = FIELD_RE.exec(line);
    if (m) fields[m[1]] = m[2].trim();
  }

  return {
    frontmatterText: frontmatterLines.join('\n'),
    body: lines.slice(closeIdx + 1).join('\n'),
    fields,
    lines,
    openIdx,
    closeIdx,
  };
}

/**
 * Convenience wrapper returning only the indent-0 scalar fields.
 *
 * @param {string} text - full file contents
 * @returns {Record<string,string>} map of top-level scalar fields
 */
export function parseFrontmatterFields(text) {
  return parseFrontmatter(text).fields;
}
