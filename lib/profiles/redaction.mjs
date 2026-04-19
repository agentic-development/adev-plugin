/**
 * Redaction pipeline.
 *
 * Contract: Behaviors 36, 36a, 36b of the cross-cutting spec.
 *
 * One-shot:  redact(buffer) — exact-substring replacement with <REDACTED:<KEY>>.
 * Streaming: createStream() — accepts chunks, emits redacted chunks with a
 *            lookback buffer sized to the longest redactionSet value so that
 *            matches split across chunk boundaries are still caught.
 *
 * Minimum-length gate: values shorter than 8 chars are excluded from redaction.
 * Shared-value disambiguation: when two keys share a value, placeholder is
 * <REDACTED:<K1>|<K2>> (keys sorted alphabetically).
 *
 * Bypass classes (base64, URL-encode, JSON-escape, whitespace mutations,
 * streaming across chunks split inside multi-byte encodings etc.) are
 * documented in the spec as v1-accepted residual risk; this implementation
 * does NOT attempt to mitigate them.
 */

const MIN_LENGTH = 8;

/**
 * @param {Record<string, string>} redactionMap  { KEY: value, ... }
 * @returns {{ redact: (input: string) => string, createStream: () => {push: (chunk: string) => string, flush: () => string}, minLength: number, maxValueLength: number }}
 */
export function createRedactor(redactionMap) {
  const valueToKeys = new Map();
  let maxValueLength = 0;
  for (const [key, value] of Object.entries(redactionMap || {})) {
    if (typeof value !== "string" || value.length < MIN_LENGTH) continue;
    const keys = valueToKeys.get(value) ?? [];
    keys.push(key);
    valueToKeys.set(value, keys);
    if (value.length > maxValueLength) maxValueLength = value.length;
  }
  // Build the replacement table: longest values first, so substring overlaps
  // prefer the longer match.
  const replacements = [...valueToKeys.entries()]
    .map(([value, keys]) => [value, buildPlaceholder(keys)])
    .sort((a, b) => b[0].length - a[0].length);

  function redact(input) {
    if (typeof input !== "string" || input === "" || replacements.length === 0) {
      return input;
    }
    let out = input;
    for (const [value, placeholder] of replacements) {
      if (out.indexOf(value) < 0) continue;
      out = out.split(value).join(placeholder);
    }
    return out;
  }

  function createStream() {
    let buffer = "";
    return {
      push(chunk) {
        buffer += chunk;
        if (buffer.length <= maxValueLength || maxValueLength === 0) return "";
        const redacted = redact(buffer);
        const cut = Math.max(0, redacted.length - maxValueLength);
        const emit = redacted.slice(0, cut);
        buffer = redacted.slice(cut);
        return emit;
      },
      flush() {
        const tail = redact(buffer);
        buffer = "";
        return tail;
      },
    };
  }

  return { redact, createStream, minLength: MIN_LENGTH, maxValueLength };
}

function buildPlaceholder(keys) {
  const sorted = [...keys].sort();
  return `<REDACTED:${sorted.join("|")}>`;
}
