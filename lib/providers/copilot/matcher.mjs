// Matcher regex rewriter — Claude Code tool-name tokens → Copilot tool-name
// tokens, on `\b` (word-boundary) boundaries, longest-source-name-first so
// `MultiEdit` is substituted before `Edit` (otherwise `Edit` would corrupt
// the `Edit` substring inside `MultiEdit`).
//
// Pure function. No filesystem, no network, no environment access. Throws
// `MATCHER_TOO_LARGE` for input > 1024 bytes and `UNMAPPED_TOOL_NAME` when
// any PascalCase identifier token survives substitution unmapped — those
// are the only error paths the spec allows.

/** Maximum allowed matcher length in bytes (UTF-8). */
export const MAX_MATCHER_BYTES = 1024;

/** Identifier-shaped token: a single PascalCase word boundary-delimited. */
const IDENTIFIER_TOKEN_RE = /\b[A-Z][a-zA-Z]*\b/g;

/**
 * Escape a literal string for use inside a RegExp source.
 * @param {string} s
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite a Claude Code matcher regex into a Copilot matcher regex by
 * substituting tool-name tokens via `toolMap`. Identifier tokens are
 * matched on `\b` boundaries so substring matches inside other identifiers
 * cannot occur.
 *
 * @param {string} claudeRegex - matcher regex as authored in hooks/hooks.json
 * @param {Array<{claudeToolName: string, copilotToolName: string}>} toolMap
 * @returns {string} the rewritten matcher
 * @throws {Error} `MATCHER_TOO_LARGE` if input > 1024 bytes
 * @throws {Error} `UNMAPPED_TOOL_NAME: <token>` if any identifier token has
 *                 no mapping in `toolMap`
 */
export function rewriteMatcher(claudeRegex, toolMap) {
  // Byte-length cap. `Buffer.byteLength` would also work, but the matcher
  // vocabulary is ASCII-only so `string.length` suffices and avoids loading
  // `node:buffer` semantics into the hot path.
  if (claudeRegex.length > MAX_MATCHER_BYTES) {
    throw new Error(`MATCHER_TOO_LARGE: ${claudeRegex.length} > ${MAX_MATCHER_BYTES}`);
  }

  // Sort entries by source-name length descending so `MultiEdit` substitutes
  // before `Edit`. Without this, the `Edit` rule would clobber the `Edit`
  // substring inside `MultiEdit` first and produce `Multiedit`.
  const sorted = [...toolMap].sort(
    (a, b) => b.claudeToolName.length - a.claudeToolName.length,
  );

  let out = claudeRegex;
  for (const { claudeToolName, copilotToolName } of sorted) {
    const re = new RegExp(`\\b${escapeRegExp(claudeToolName)}\\b`, "g");
    out = out.replace(re, copilotToolName);
  }

  // After substitution, any surviving PascalCase token is unmapped — surface
  // the first occurrence per Error Cases (UNMAPPED_TOOL_NAME).
  const survivors = out.match(IDENTIFIER_TOKEN_RE);
  if (survivors && survivors.length > 0) {
    throw new Error(`UNMAPPED_TOOL_NAME: ${survivors[0]}`);
  }

  return out;
}
