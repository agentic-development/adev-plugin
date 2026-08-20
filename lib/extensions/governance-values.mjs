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

import { refuse } from '../errors.mjs';

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
 * A colon followed by whitespace, or a trailing colon, anywhere in a scalar.
 *
 * `parseSequence` (yaml.mjs:142-166) matches a block-sequence item against
 * `/^([^:{\[\s][^:]*?):(?:\s+(.+))?\s*$/` and, on a hit, builds a MAP instead
 * of pushing a string. Verified against the repo's own parser:
 *
 *     after:\n  - foo: bar     →  { after: [ { foo: "bar" } ] }
 *     after:\n  - "foo: bar"   →  { after: [ { '"foo': 'bar"' } ] }
 *     after:\n  - foo:         →  { after: [ { foo: {} } ] }
 *
 * So a list element of `run: rm -rf /` reparses into a map with an
 * attacker-chosen key — the same attack class as the `{command: …}` flow-map
 * case above. Quoting does not close it, because `unquote` (yaml.mjs:244-252)
 * performs no unescape, so the quotes end up inside the key and value.
 *
 * Scoped deliberately to `:` + whitespace and trailing `:`. A colon with no
 * following whitespace does NOT trigger the parser's map branch and stays a
 * string (verified: `plugin:tier1/x.mjs` and `a:b` both round-trip), so
 * runner and prompt references keep working.
 */
const UNSAFE_COLON = /:\s|:$/;

/**
 * String scalars that `parseInlineValue` (yaml.mjs:173-183) coerces to a
 * different type on reparse: `''` → `{}`, `/^-?\d+$/` → Number,
 * `true`/`false` → boolean, `null`/`~` → null.
 *
 * A scalar that does not survive its own round trip is refused. Governance
 * config has no legitimate need for the literal string `"42"`, and no
 * escaping layer could help — this parser has no unescape to reverse it.
 *
 * Only the STRING forms are refused. A real number or a real boolean is a
 * typed value that reparses correctly and stays acceptable in
 * {@link assertValidValue}.
 */
const TYPE_FLIP_SCALAR = /^(|-?\d+|true|false|null|~)$/;

/**
 * Argv tokens get their own rule, deliberately NOT the scalar rule: a leading
 * `-` is permitted so `[npm, test, --, --silent]` survives. The token must be
 * a flag (`-q`, `--silent`, `--config=a/b`), the bare `--` separator, or a
 * plain word/path. No whitespace and no shell metacharacter at any position.
 */
const ARGV_TOKEN = /^(--?[A-Za-z0-9][A-Za-z0-9._-]*(=[A-Za-z0-9._/-]+)?|--|[A-Za-z0-9._/-]+)$/;

/** A flag of the form `<flag>=<value>`; group 1 is the value. */
const FLAG_ASSIGNMENT = /^--?[^=]+=(.*)$/s;

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

  if (UNSAFE_COLON.test(value)) {
    refuse(
      `Field '${fieldPath}' contains a colon followed by whitespace, or a trailing colon. ` +
      `lib/profiles/yaml.mjs:142-166 reparses such a block-sequence item as a map with an ` +
      `extension-chosen key, and quoting does not prevent it, so the value is refused. ` +
      `A colon with no following whitespace (e.g. 'plugin:tier1/x.mjs') is allowed.`,
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

  if (TYPE_FLIP_SCALAR.test(value)) {
    refuse(
      `Field '${fieldPath}' is the string ${JSON.stringify(value)}, which lib/profiles/yaml.mjs:173-183 ` +
      `coerces to a different type on reparse (empty → {}, digits → number, true/false → boolean, ` +
      `null/~ → null). A scalar that does not survive its own round trip is refused. ` +
      `Use a real number or boolean if a typed value is intended.`,
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
 * Refuse an element that cannot be written into an emitted FLOW SEQUENCE.
 *
 * A flow sequence (`command: ["npm", "test"]`) is the one place the two
 * sanctioned rules above disagree, and each of them alone is wrong for it:
 *
 *   - the SCALAR rule refuses a leading `-`, so an argv list that
 *     {@link assertSafeArgvToken} (and `assertArgvCommand`) ACCEPTS — `["npm",
 *     "test", "--", "--silent"]` — could not be serialised back out; and
 *   - the ARGV rule refuses `:`, which every `plugin:<skill>/<file>` runner and
 *     every `npm run test:integration` script name carries.
 *
 * So an element is admitted when it satisfies EITHER rule. What that union
 * admits, stated exactly (proved by an exhaustive U+0000–U+20FF sweep in three
 * positions, Review Stage 1 of Task 9): **everything the scalar rule admits,
 * plus tokens drawn from `[A-Za-z0-9._/=-]` that match `ARGV_TOKEN` and either
 * begin with `-` or read as `true` / `false` / `null` / `-?\d+`.** It admits no
 * character the scalar rule did not already admit — `ARGV_TOKEN`'s charset is a
 * strict subset — so the union relaxes exactly two guards, {@link UNSAFE_LEADING}
 * and {@link TYPE_FLIP_SCALAR}, and nothing else.
 *
 * Relaxing those two is sound HERE and only here, because the element is
 * emitted DOUBLE-QUOTED inside a flow sequence, where `lib/profiles/yaml.mjs`
 * neither honours a leading YAML indicator nor coerces a quoted `42` / `true`
 * back to a number or a boolean (round trip verified). The characters that DO
 * change a flow sequence's structure — `"`, `,`, `[`, `]`, `#`, newline, CR —
 * are refused by BOTH rules, so the union widens nothing that matters. Both
 * caps also still apply on both branches.
 *
 * @param {unknown} element - One element of an emitted flow sequence.
 * @param {string} fieldPath - Dotted path of the field, used in the message.
 * @throws {Error} code `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_FIELD_VALUE_INVALID`
 *   or `GOVERNANCE_LIMIT_EXCEEDED` — the SCALAR rule's verdict, since it is the
 *   stricter of the two and its message names the field and the reason.
 */
export function assertSafeFlowElement(element, fieldPath) {
  let argvOk = true;
  try {
    assertSafeArgvToken(element);
  } catch {
    argvOk = false;
  }
  if (argvOk) return;
  assertSafeScalar(element, fieldPath);
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

/**
 * Keys accepted inside the one narrowly-scoped two-level shape this module
 * validates: `dispatch: { triggered: { keywords, patterns, min_score } }`.
 * See {@link assertValidDispatchTriggered}.
 */
const VALID_TRIGGERED_KEYS = new Set(['keywords', 'patterns', 'min_score']);

/**
 * Validate the `dispatch.triggered` value — `{ keywords?: string[],
 * patterns?: string[], min_score?: number }` — for BUNDLED or domain-sourced
 * registry content emitted by `lib/extensions/governance-splice.mjs::emitEntry`.
 *
 * This is a SEPARATE, narrowly-scoped function, not a widening of
 * {@link assertValidValue}. `assertValidValue({ triggered: {...} }, 'dispatch')`
 * must keep refusing (pinned by
 * `tests/lib/extensions/governance-values.test.mjs`), because that function is
 * also the generic value-safety pass `lib/extensions/governance-registry.mjs`
 * runs on EXTENSION-installed content — a separate, harder trust boundary
 * (Decision B) that closes `dispatch` to the flat `always`/`never` enum
 * (`VALID_DISPATCH`) and must not be loosened. This function is reachable only
 * from `governance-splice.mjs`'s emitter for the plugin's own bundled/domain
 * templates, analogous in spirit to `assertPackageKeys`
 * (`governance-registry.mjs`) but for a different, less-constrained content
 * source.
 *
 * `keywords` / `patterns` are checked with {@link assertSafeFlowElement}
 * because they are emitted as a double-quoted flow sequence, exactly like
 * every other array field this module governs. `min_score` must be a real
 * `number` — a numeric STRING would round-trip back as a different type
 * (`lib/profiles/yaml.mjs:179`), which is exactly what {@link TYPE_FLIP_SCALAR}
 * refuses for every other field, so the same standard applies here even though
 * `min_score` never reaches the scalar rule directly.
 *
 * @param {unknown} value - Purported `{ keywords?, patterns?, min_score? }`.
 * @param {string} fieldPath - Dotted path, used in messages (`dispatch.triggered`).
 * @throws {Error} code `GOVERNANCE_FIELD_VALUE_INVALID`, `GOVERNANCE_SCALAR_UNSAFE`
 *   or `GOVERNANCE_LIMIT_EXCEEDED`.
 */
export function assertValidDispatchTriggered(value, fieldPath) {
  if (!isPlainObject(value)) {
    refuse(
      `Field '${fieldPath}' must be a map of ${[...VALID_TRIGGERED_KEYS].join('/')} entries, ` +
      `got ${describe(value)}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }

  for (const key of Object.keys(value)) {
    if (!VALID_TRIGGERED_KEYS.has(key)) {
      refuse(
        `Field '${fieldPath}.${key}' is not part of the dispatch.triggered shape. Only ` +
        `${[...VALID_TRIGGERED_KEYS].join(', ')} are accepted.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
  }

  for (const listKey of ['keywords', 'patterns']) {
    if (!(listKey in value)) continue;
    const list = value[listKey];
    if (!Array.isArray(list)) {
      refuse(
        `Field '${fieldPath}.${listKey}' must be an array of strings, got ${describe(list)}.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
      );
    }
    assertWithinCaps({ argvElements: list.length }, `${fieldPath}.${listKey}`);
    for (const [i, element] of list.entries()) {
      assertSafeFlowElement(element, `${fieldPath}.${listKey}[${i}]`);
    }
  }

  if ('min_score' in value) {
    const score = value.min_score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      refuse(
        `Field '${fieldPath}.min_score' must be a number, got ${describe(score)}.`,
        'GOVERNANCE_FIELD_VALUE_INVALID'
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
