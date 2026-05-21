// lib/retro/safe-frontmatter.mjs
//
// SEC-B3 defense-in-depth: YAML frontmatter reader that rejects unsafe
// constructs before parsing. Wraps the existing hand-rolled key:value
// parser approach from lib/meta-tools.mjs (kept dependency-free per
// constitution Principle 1) with:
//
//   - 16 KB size cap on the frontmatter slice (`---\n…\n---`).
//   - Rejection of YAML anchors (`&name`), aliases (`*name`), and any
//     custom/explicit tags (`!Tag`, `!!js/function`, etc.) found at the
//     value-slot position of any line.
//   - Returns a typed result: `{ ok, frontmatter, reason }`.
//
// The parser produces flat key/value pairs only. Multi-line scalars,
// nested objects, and YAML sequences are not supported by design — the
// hook-driven-capture spec's frontmatter is flat key/value (strings,
// numbers, dates), so anything more elaborate is suspicious.

/** Maximum allowed size of the `---\n…\n---` frontmatter slice. */
export const FRONTMATTER_SIZE_LIMIT = 16 * 1024;

/**
 * Read and validate frontmatter from a raw markdown text.
 *
 * Result shape:
 *   { ok: true,  frontmatter: object, reason: null }    // success
 *   { ok: true,  frontmatter: {},     reason: null }    // no frontmatter present
 *   { ok: false, frontmatter: null,   reason: 'oversize'      | 'unsafe-tag'
 *                                            | 'anchor-alias' | 'parse-error' }
 *
 * @param {unknown} rawText
 * @returns {{ ok: boolean, frontmatter: object|null, reason: string|null }}
 */
export function readSafeFrontmatter(rawText) {
  if (typeof rawText !== 'string') {
    return { ok: false, frontmatter: null, reason: 'parse-error' };
  }

  // Locate the frontmatter slice. Must START with `---\n` and contain a
  // closing `\n---` boundary.
  if (!rawText.startsWith('---\n') && rawText !== '---' && !rawText.startsWith('---\r\n')) {
    // No frontmatter present.
    return { ok: true, frontmatter: {}, reason: null };
  }

  // Look for the closing `---` on its own line, AFTER the opening one.
  const openLen = rawText.startsWith('---\r\n') ? 5 : 4;
  const closeIdx = rawText.indexOf('\n---', openLen);
  if (closeIdx === -1) {
    // Opening fence but no closing — treat as no frontmatter.
    return { ok: true, frontmatter: {}, reason: null };
  }

  const slice = rawText.slice(openLen, closeIdx);
  if (slice.length > FRONTMATTER_SIZE_LIMIT) {
    return { ok: false, frontmatter: null, reason: 'oversize' };
  }

  // Pre-scan for unsafe sentinels at line-start (after key + `:` + spaces),
  // or as bare value markers. The pre-scan inspects each line.
  for (const line of slice.split('\n')) {
    const valueSlot = extractValueSlot(line);
    if (valueSlot === null) continue; // not a "key: value" line — skip
    const trimmed = valueSlot.trimStart();
    // Custom YAML tag detection (e.g. !!js/function, !Custom)
    if (trimmed.startsWith('!')) {
      return { ok: false, frontmatter: null, reason: 'unsafe-tag' };
    }
    // Anchor / alias detection
    if (trimmed.startsWith('&') || trimmed.startsWith('*')) {
      return { ok: false, frontmatter: null, reason: 'anchor-alias' };
    }
  }

  // Safe to parse with a simple key/value loop.
  const frontmatter = parseSimpleFrontmatter(slice);
  return { ok: true, frontmatter, reason: null };
}

/**
 * Given a frontmatter line, extract the "value slot" (everything after
 * `key:` up to end of line). Returns null when the line is not a key:value
 * shape (e.g. comments, blank, list continuation).
 *
 * @param {string} line
 * @returns {string|null}
 */
function extractValueSlot(line) {
  // Match "key:" at the start of the line. Allow leading whitespace for
  // nested keys; we still inspect the value slot for unsafe markers.
  const m = line.match(/^\s*([\w-]+):\s*(.*)$/);
  if (!m) return null;
  return m[2];
}

/**
 * Simple key/value frontmatter parser. Flat shape only. String quotes
 * stripped if balanced.
 *
 * @param {string} slice - The frontmatter slice (without fences).
 * @returns {object}
 */
function parseSimpleFrontmatter(slice) {
  const result = {};
  for (const line of slice.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[kv[1]] = value;
  }
  return result;
}
