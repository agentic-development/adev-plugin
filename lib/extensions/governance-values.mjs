/**
 * Value-safety primitives for extension-supplied governance content.
 *
 * Every value an extension contributes to a governance config is eventually
 * re-serialized into YAML and re-read by this repo's own hand-rolled parser,
 * `lib/profiles/yaml.mjs`. That parser IS the threat model:
 *
 *   - `parseInlineValue` (yaml.mjs:176-179) coerces `null`/`~` to null,
 *     `true`/`false` to booleans, and `/^-?\d+$/` to a Number — so a numeric
 *     `id` is not a string and would slip past a string-keyed collision map.
 *   - `parseInlineValue` (yaml.mjs:180-181) reparses a scalar that starts `{`
 *     and ends `}` as a flow map, and `[`…`]` as a flow sequence. A scalar of
 *     `{command: rm -rf /}` therefore becomes an object carrying an
 *     extension-supplied `command` key.
 *   - `unquote` (yaml.mjs:244-252) strips surrounding quotes and performs NO
 *     unescape. There is no escape scheme that round-trips through this
 *     parser.
 *   - `stripComment` (yaml.mjs:50-65) truncates a value at a bare `#`.
 *
 * Because no escape round-trips, this module REFUSES unsafe input. It never
 * trims, escapes, sanitizes, or coerces a value into safety.
 *
 * Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
 *
 * @module lib/extensions/governance-values
 */

/**
 * Resource caps shared by every governance merge check. Downstream tasks cite
 * this object rather than re-deriving the numbers.
 * @type {{ scalarChars: number, argvElements: number, entriesPerTarget: number, payloadFiles: number }}
 */
export const CAPS = Object.freeze({
  scalarChars: 512,
  argvElements: 32,
  entriesPerTarget: 32,
  payloadFiles: 32,
});

/** Characters that are unsafe anywhere in a scalar (newline, quotes, comment, flow indicators). */
const UNSAFE_ANYWHERE = /[\n\r"'#{}[\],]/;

/** Characters that are unsafe only as the first character of a scalar (YAML indicators). */
const UNSAFE_LEADING = /^[-?:&*!|>%@`]/;

/**
 * Argv tokens get their own rule, deliberately NOT the scalar rule: a leading
 * `-` is permitted so `[npm, test, --, --silent]` survives. The token must be
 * a flag (`-q`, `--silent`, `--config=a/b`), the bare `--` separator, or a
 * plain word/path. No whitespace and no shell metacharacter at any position.
 */
const ARGV_TOKEN = /^(--?[A-Za-z0-9][A-Za-z0-9._-]*(=[A-Za-z0-9._/-]+)?|--|[A-Za-z0-9._/-]+)$/;

/** A flag of the form `<flag>=<value>`; group 1 is the value. */
const FLAG_ASSIGNMENT = /^--?[^=]+=(.*)$/s;

function refuse(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * Refuse a scalar that could change meaning when re-read by `parseYaml`.
 *
 * @param {string} value - The scalar to check.
 * @param {string} fieldPath - Dotted path of the field, used in the message.
 * @throws {Error} code `GOVERNANCE_SCALAR_UNSAFE` or `GOVERNANCE_LIMIT_EXCEEDED`.
 */
export function assertSafeScalar(value, fieldPath) {
  if (typeof value !== 'string') {
    refuse(
      `Field '${fieldPath}' must be a string scalar, got ${describe(value)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  assertWithinCaps({ scalarChars: value.length }, fieldPath);

  const anywhere = value.match(UNSAFE_ANYWHERE);
  if (anywhere) {
    refuse(
      `Field '${fieldPath}' contains the unsafe character ${JSON.stringify(anywhere[0])}. ` +
      `Newlines, quotes, '#' and YAML flow indicators ({ } [ ] ,) change how the value is ` +
      `re-read by lib/profiles/yaml.mjs and cannot be escaped, so the value is refused.`,
      'GOVERNANCE_SCALAR_UNSAFE'
    );
  }

  const leading = value.match(UNSAFE_LEADING);
  if (leading) {
    refuse(
      `Field '${fieldPath}' starts with the YAML indicator ${JSON.stringify(leading[0])}. ` +
      `A leading indicator changes how the value is re-read by lib/profiles/yaml.mjs, ` +
      `so the value is refused.`,
      'GOVERNANCE_SCALAR_UNSAFE'
    );
  }
}

/**
 * Require a governance entry's `id` to still be a string after parsing.
 *
 * This is not redundant with a truthiness check. `lib/profiles/yaml.mjs:179`
 * coerces `/^-?\d+$/` to a Number and `:176-178` coerces `null`/`~`/`true`/
 * `false`, so an entry written as `id: 42` arrives here as the number 42 and
 * would miss a string-keyed collision map entirely. Do not "simplify" this to
 * a falsy check.
 *
 * @param {{ id?: unknown }} entry - Parsed governance entry.
 * @throws {Error} code `GOVERNANCE_FIELD_VALUE_INVALID`.
 */
export function assertStringId(entry) {
  const id = entry?.id;
  if (typeof id !== 'string' || id === '') {
    refuse(
      `Governance entry 'id' must be a non-empty string, got ${describe(id)}. ` +
      `lib/profiles/yaml.mjs coerces integers, booleans and null during parse, so a ` +
      `non-string id would bypass collision detection.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
}

/**
 * Positive definition of an argv element that denotes a path.
 *
 * A token is a path element when it contains `/`, or starts with `.`, or is a
 * `<flag>=<value>` whose value contains `/`. Everything else is a literal.
 * Stated positively so that a new token shape defaults to "literal" rather
 * than silently escaping path containment checks.
 *
 * @param {string} token - Argv element.
 * @returns {boolean} True when the token denotes a path.
 */
export function isArgvPathElement(token) {
  if (typeof token !== 'string' || token === '') return false;
  if (token.includes('/')) return true;
  if (token.startsWith('.')) return true;
  const assignment = token.match(FLAG_ASSIGNMENT);
  if (assignment && assignment[1].includes('/')) return true;
  return false;
}

/**
 * Refuse an argv element that is not a plain flag, separator, word or path.
 *
 * Deliberately not the scalar rule: a leading `-` is permitted here so CLI
 * flags and the `--` separator survive. Whitespace and shell metacharacters
 * (`;`, `$`, `(`, `)`, `\`, `<`, `>`, backtick, quotes, `#`) are refused at
 * any position.
 *
 * @param {string} token - Argv element.
 * @throws {Error} code `GOVERNANCE_SCALAR_UNSAFE`.
 */
export function assertSafeArgvToken(token) {
  if (typeof token !== 'string') {
    refuse(
      `Argv element must be a string, got ${describe(token)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
  assertWithinCaps({ scalarChars: token.length }, 'argv element');
  if (!ARGV_TOKEN.test(token)) {
    refuse(
      `Argv element ${JSON.stringify(token)} is not a plain flag, separator, word or path. ` +
      `Whitespace and shell metacharacters are refused.`,
      'GOVERNANCE_SCALAR_UNSAFE'
    );
  }
}

/**
 * Validate an extension-supplied field value.
 *
 * Accepts a string, number, boolean, an array of safe string scalars, or a
 * one-level object whose own values are safe strings / numbers / booleans.
 * Two levels of nesting are refused before any leaf is inspected, because
 * `parseFlowMap`/`parseFlowSeq` (yaml.mjs:185-206) reparse nested structure
 * from the emitted text and the deeper shape has no safe round-trip.
 *
 * Array elements and object values are checked with the identical scalar rule
 * as a top-level scalar.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} fieldPath - Dotted path of the field, used in messages.
 * @throws {Error} code `GOVERNANCE_FIELD_VALUE_INVALID`, `GOVERNANCE_SCALAR_UNSAFE`
 *   or `GOVERNANCE_LIMIT_EXCEEDED`.
 */
export function assertValidValue(value, fieldPath) {
  if (typeof value === 'number' || typeof value === 'boolean') return;

  if (typeof value === 'string') {
    assertSafeScalar(value, fieldPath);
    return;
  }

  if (Array.isArray(value)) {
    // Shape pass first: a non-scalar element is a nesting violation, and that
    // verdict must not be masked by a leaf-level scalar complaint.
    for (const [i, element] of value.entries()) {
      if (typeof element !== 'string') {
        refuse(
          `Field '${fieldPath}[${i}]' must be a string, got ${describe(element)}. ` +
          `Governance values nest at most one level.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
    }
    for (const [i, element] of value.entries()) {
      assertSafeScalar(element, `${fieldPath}[${i}]`);
    }
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, own] of Object.entries(value)) {
      if (!isScalarLeaf(own)) {
        refuse(
          `Field '${fieldPath}.${key}' must be a string, number or boolean, got ${describe(own)}. ` +
          `Governance values nest at most one level.`,
          'GOVERNANCE_FIELD_VALUE_INVALID'
        );
      }
    }
    for (const [key, own] of Object.entries(value)) {
      if (typeof own === 'string') assertSafeScalar(own, `${fieldPath}.${key}`);
    }
    return;
  }

  refuse(
    `Field '${fieldPath}' must be a string, number, boolean, array or one-level object, ` +
    `got ${describe(value)}.`,
    'GOVERNANCE_FIELD_VALUE_INVALID'
  );
}

/**
 * Enforce the resource caps in {@link CAPS}.
 *
 * Only the counts present on `counts` are checked; an absent key is not
 * defaulted, so a caller may check a single dimension.
 *
 * @param {{ scalarChars?: number, argvElements?: number, entriesPerTarget?: number, payloadFiles?: number }} counts
 * @param {string} [context] - Optional context appended to the message.
 * @throws {Error} code `GOVERNANCE_LIMIT_EXCEEDED`.
 */
export function assertWithinCaps(counts, context) {
  for (const [name, limit] of Object.entries(CAPS)) {
    const actual = counts?.[name];
    if (typeof actual !== 'number') continue;
    if (actual > limit) {
      refuse(
        `Governance cap '${name}' exceeded: ${actual} > ${limit}` +
        `${context ? ` (at '${context}')` : ''}.`,
        'GOVERNANCE_LIMIT_EXCEEDED'
      );
    }
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalarLeaf(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'undefined') return 'undefined';
  return `${typeof value} (${JSON.stringify(value)})`;
}
