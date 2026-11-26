/**
 * Named error codes and token redaction for the GitHub board backend.
 *
 * Every message that may carry text from `gh` or GitHub passes through
 * `redact()` before it is attached to a thrown error, so a token echoed by
 * `gh` (or embedded in a GitHub error message) never reaches logs or output.
 *
 * @module lib/issues/github/errors
 */

export const GITHUB_ERROR_CODES = Object.freeze({
  GITHUB_CLI_MISSING: "GITHUB_CLI_MISSING",
  GITHUB_AUTH_REQUIRED: "GITHUB_AUTH_REQUIRED",
  GITHUB_SCOPE_MISSING: "GITHUB_SCOPE_MISSING",
  GITHUB_PERMISSION_DENIED: "GITHUB_PERMISSION_DENIED",
  GITHUB_RATE_LIMITED: "GITHUB_RATE_LIMITED",
  GITHUB_UNREACHABLE: "GITHUB_UNREACHABLE",
  GITHUB_PAGINATION_INVALID: "GITHUB_PAGINATION_INVALID",
  GITHUB_INVALID_CONFIG: "GITHUB_INVALID_CONFIG",
  // Any GitHub/gh failure that has no more specific code; carries redacted detail only.
  GITHUB_REQUEST_FAILED: "GITHUB_REQUEST_FAILED",
  // The transport's own invariants were violated (e.g. argv shape); never reachable from callers.
  GITHUB_TRANSPORT_INTERNAL: "GITHUB_TRANSPORT_INTERNAL",
});

const REDACTED = "[REDACTED]";

// Classic/OAuth/user/server/refresh tokens are `gh[pousr]_` + 36 base62 chars;
// fine-grained PATs are `github_pat_` + base62/underscore. The minimum lengths
// keep short look-alikes (e.g. `ghp_short`) intact.
const TOKEN_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
];

// Literal secrets shorter than this are ignored: scrubbing a one- or two-character
// value would shred ordinary text without protecting anything.
const MIN_LITERAL_SECRET_LENGTH = 8;

/**
 * Replace every GitHub token in `text`, and every literal value in `secrets`
 * (e.g. the GH_TOKEN / GITHUB_TOKEN the transport was given, whatever their
 * format), with a fixed marker.
 *
 * @param {unknown} text
 * @param {unknown[]} [secrets]
 * @returns {string}
 */
export function redact(text, secrets = []) {
  let out = String(text ?? "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= MIN_LITERAL_SECRET_LENGTH) out = out.split(secret).join(REDACTED);
  }
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

function redactValue(value, secrets) {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, secrets));
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v, secrets)]));
  }
  return value;
}

/**
 * Build an Error carrying a named `code`, a redacted message, and any extra
 * structured fields (e.g. `resetAt`, `scopes`, `operation`). String values in
 * `extra` — including inside arrays and plain objects — are redacted too, since
 * they are often lifted from GitHub's own error text.
 *
 * @param {string} code
 * @param {string} message
 * @param {object} [extra]
 * @param {{ secrets?: unknown[] }} [options] - literal values to scrub in addition to the token patterns
 * @returns {Error & { code: string }}
 */
export function githubError(code, message, extra = {}, { secrets = [] } = {}) {
  const err = new Error(redact(message, secrets));
  Object.assign(err, redactValue(extra, secrets));
  err.code = code;
  return err;
}
