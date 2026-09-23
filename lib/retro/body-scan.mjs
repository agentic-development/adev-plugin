// lib/retro/body-scan.mjs
//
// Bounded, non-backtracking body-scan helpers for retro session bodies.
// Defense-in-depth (SEC-B1) — the only module allowed to scan session bodies.
//
// Invariants:
//   - All scans use String.prototype.includes() / indexOf() / split() — no
//     regex with backtracking quantifiers over body content.
//   - Bodies above BODY_SIZE_LIMIT (5 MB) are rejected before any scan.
//   - Context Gaps scans are frame-anchored: matches must occur inside a
//     tool-output frame delimited by ```output … ``` fences.

/** Body-size cap (5 MB). Bodies above this are skipped for metric extraction. */
export const BODY_SIZE_LIMIT = 5 * 1024 * 1024;

/** Frame markers used for Context Gaps anchoring. */
const FRAME_OPEN = '```output';
const FRAME_CLOSE = '```';

/**
 * Returns true if the body exceeds BODY_SIZE_LIMIT.
 * Non-string inputs return false (treated as "nothing to scan").
 *
 * @param {string|null|undefined} body
 * @returns {boolean}
 */
export function isOversizeBody(body) {
  if (typeof body !== 'string') return false;
  return body.length > BODY_SIZE_LIMIT;
}

/**
 * Count how many times each literal token appears in the body. Uses
 * String.prototype.indexOf() exclusively — no regex, no backtracking.
 * Tokens that never appear are omitted from the result.
 *
 * Bodies exceeding BODY_SIZE_LIMIT return an empty array (skipped).
 *
 * @param {string} body
 * @param {string[]} tokens - Literal substrings to count.
 * @returns {{ token: string, count: number }[]}
 */
export function scanLiteralTokens(body, tokens) {
  if (typeof body !== 'string' || body.length === 0) return [];
  if (isOversizeBody(body)) return [];
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const results = [];
  for (const token of tokens) {
    if (typeof token !== 'string' || token.length === 0) continue;
    let count = 0;
    let idx = 0;
    while (true) {
      const found = body.indexOf(token, idx);
      if (found === -1) break;
      count++;
      idx = found + token.length;
    }
    if (count > 0) results.push({ token, count });
  }
  return results;
}

/**
 * Returns true iff `body` contains `needle` (literal substring check).
 * Wraps String.prototype.includes() to keep all body-scanning in one module.
 *
 * @param {string} body
 * @param {string} needle
 * @returns {boolean}
 */
export function containsLiteralToken(body, needle) {
  if (typeof body !== 'string' || body.length === 0) return false;
  if (typeof needle !== 'string' || needle.length === 0) return false;
  if (isOversizeBody(body)) return false;
  return body.includes(needle);
}

/**
 * Extract all tool-output frame contents from a body. A frame is a block
 * delimited by lines starting with FRAME_OPEN (```output) and FRAME_CLOSE
 * (```). Unclosed frames are ignored.
 *
 * @param {string} body
 * @returns {string[]} Frame bodies (without the fence lines).
 */
function extractFrames(body) {
  if (typeof body !== 'string' || body.length === 0) return [];
  if (isOversizeBody(body)) return [];
  const lines = body.split('\n');
  const frames = [];
  let inFrame = false;
  let buf = [];
  for (const line of lines) {
    if (!inFrame && line.startsWith(FRAME_OPEN)) {
      inFrame = true;
      buf = [];
      continue;
    }
    if (inFrame && line.startsWith(FRAME_CLOSE)) {
      frames.push(buf.join('\n'));
      inFrame = false;
      buf = [];
      continue;
    }
    if (inFrame) buf.push(line);
  }
  // Unclosed frame: skip (do not emit `buf`).
  return frames;
}

/**
 * Scan only within tool-output frames for the literal `needle`. Returns one
 * entry per occurrence (across all frames). Out-of-frame matches are NOT
 * counted — defends against adversarial prose injection (SEC-B1(3)).
 *
 * @param {string} body
 * @param {string} needle
 * @returns {{ frameIndex: number, frameOffset: number }[]}
 */
export function scanWithinToolOutputFrame(body, needle) {
  if (typeof needle !== 'string' || needle.length === 0) return [];
  const frames = extractFrames(body);
  const hits = [];
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];
    let idx = 0;
    while (true) {
      const found = frame.indexOf(needle, idx);
      if (found === -1) break;
      hits.push({ frameIndex, frameOffset: found });
      idx = found + needle.length;
    }
  }
  return hits;
}
