/**
 * In-place, line-range splice of governance registry entries.
 *
 * ## Why this is a text operation, not a serializer
 *
 * The function this replaces (`serializeGovernanceYaml`, `content-install.mjs`)
 * reserialized the WHOLE file from a partial parse. Installing an extension
 * against a real `validate.yaml` therefore replaced 7 checks and 20 comment
 * lines with three lines.
 *
 * Comment preservation here is achieved by NOT reserializing. `lib/profiles/yaml.mjs`
 * has a parser and no serializer, and its `preprocess`/`stripComment` discard every
 * `#` comment before parsing, so any round trip through it loses them. This module
 * instead reads the file as TEXT, locates the target key's block by LINE RANGE,
 * replaces exactly those lines, and writes every other byte back unchanged —
 * comments, sibling keys and formatting included, because they are never parsed.
 *
 * The splice must nonetheless agree with `parseYaml` on reading (same notion of a
 * top-level key, same two-space indent convention) so that a file written here
 * parses back to what was intended. That agreement is pinned by round-trip tests.
 *
 * ## The seven on-disk forms
 *
 *  1. Block sequence under the key      → append after the last item of the block.
 *  2. Empty inline list (`key: []`)     → rewrite the line as `key:` + new items.
 *  3. Key with only indented comments   → insert above the comment block.
 *  4. Key absent                        → append `key:` + items at end of file.
 *  5. File absent (`rawText === null`)  → generate a header comment, then form 4.
 *  6. Key duplicated at top level       → REFUSE (`GOVERNANCE_PARSE_REFUSED`).
 *  7. Key present but not a sequence    → REFUSE (`GOVERNANCE_PARSE_REFUSED`).
 *
 * Form 5 is signalled by `null`, NOT by an empty string. An existing-but-blank file
 * takes the form-4 path so it never gains a fabricated "created by adev" header.
 * Mixed or lone-CR line endings are refused; a uniform CRLF file stays CRLF.
 *
 * Form 7 exists because `content-install.mjs` requires `Array.isArray` at the root
 * key: a map or scalar there silently yields an empty `existingEntries`, degrading
 * collision detection to append-everything. Refusing is the whole point. A block
 * sequence written at column 0 is the same class and refuses too — it is legal YAML
 * but also a block boundary, so splicing beside it would drop those items.
 *
 * Values are emitted UNQUOTED, so an unsafe scalar cannot be escaped into safety —
 * every leaf is re-checked with `assertSafeScalar` at emission time so a value that
 * slipped past upstream validation still cannot become YAML structure.
 *
 * Spec: .context-index/specs/cross-cutting/extension-governance-merge-hardening.spec.md
 *
 * @module lib/extensions/governance-splice
 */

import { assertSafeArgvToken, assertSafeScalar } from './governance-values.mjs';

/**
 * The shape a registry root key must have. Deliberately narrow: this constrains
 * what a CALLER may ask for, and is NOT the pattern used to find block boundaries.
 */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Default indent for emitted sequence items when the block has none to copy. */
const DEFAULT_ITEM_INDENT = '  ';

function refuse(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

/**
 * Splice new registry entries into a governance YAML file, in place.
 *
 * Every byte outside the inserted lines is preserved verbatim.
 *
 * @param {string|null} rawText - Current file text, or `null` when the file does not
 *   exist on disk (form 5 — the ONLY input that generates a provenance header).
 *   An empty or whitespace-only string means the file EXISTS and is blank: it is
 *   appended to without a header, because claiming adev created a file the project
 *   already owns would be a false provenance claim.
 * @param {string} rootKey - Top-level registry key (`checks`, `gates`, `reviewers`, …).
 * @param {Array<object>} newEntries - Entries to append, in order.
 * @param {{ extensionName?: string }} [options] - `extensionName` names the extension
 *   in the generated header comment (form 5 only).
 * @returns {{ text: string, insertedAt: number|null }} Spliced text and the 0-based
 *   line index at which the first new entry landed (`null` when nothing was inserted).
 * @throws {Error} code `GOVERNANCE_PARSE_REFUSED` (forms 6 and 7, mixed line endings),
 *   `GOVERNANCE_SCALAR_UNSAFE` or `GOVERNANCE_FIELD_VALUE_INVALID` (emission).
 */
export function spliceRegistryEntries(rawText, rootKey, newEntries, options = {}) {
  // Deliberately `=== null`, not a loose nullish check: an accidental `undefined`
  // must fail loudly rather than quietly fabricate a "created by adev" header on a
  // file that already exists.
  const fileAbsent = rawText === null;
  if (!fileAbsent && typeof rawText !== 'string') {
    refuse(
      `Governance file text must be a string, or exactly null when the file is absent; ` +
      `got ${rawText === undefined ? 'undefined' : typeof rawText}.`,
      'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  }
  if (typeof rootKey !== 'string' || !PLAIN_KEY.test(rootKey)) {
    refuse(`Registry root key ${JSON.stringify(rootKey)} is not a plain YAML key.`, 'GOVERNANCE_FIELD_VALUE_INVALID');
  }
  if (!Array.isArray(newEntries)) {
    refuse(`Entries to splice must be an array, got ${typeof newEntries}.`, 'GOVERNANCE_FIELD_VALUE_INVALID');
  }
  if (newEntries.length === 0) return { text: fileAbsent ? '' : rawText, insertedAt: null };

  // Form 5 — file absent. Generate the header, then fall through as form 4.
  const source = fileAbsent ? generateHeader(rootKey, options.extensionName) : rawText;
  const eol = detectLineEnding(source);

  const lines = source.split(eol);
  const keyIndices = lines
    .map((line, i) => (isRootKeyLine(line, rootKey) ? i : -1))
    .filter((i) => i >= 0);

  // Form 6 — an ambiguous target is not spliceable.
  if (keyIndices.length > 1) {
    refuse(
      `Root key '${rootKey}' appears ${keyIndices.length} times at the top level of the ` +
      `governance file. An ambiguous splice target cannot be resolved safely, so the ` +
      `merge is refused rather than guessing which block owns the entries.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }

  if (keyIndices.length === 0) {
    return appendNewKey(lines, rootKey, newEntries, source, eol);
  }

  return spliceExistingKey(lines, keyIndices[0], rootKey, newEntries, eol);
}

/**
 * Emit one entry as block-sequence lines.
 *
 * The first key rides the `- ` marker; subsequent keys align two columns deeper.
 * A one-level object value becomes an indented block map beneath its key. Arrays
 * become flow sequences (`["a", "b"]`) because that is what `parseYaml` reads back
 * as an array. Strings are emitted bare — there is no escape that round-trips
 * through `lib/profiles/yaml.mjs`, which is why every string leaf (and every key)
 * is re-checked with `assertSafeScalar` here even though upstream already validated.
 *
 * @param {object} entry - Registry entry.
 * @param {string} indent - Leading whitespace for the `- ` marker.
 * @returns {string[]} Emitted lines, without trailing newlines.
 * @throws {Error} code `GOVERNANCE_SCALAR_UNSAFE` or `GOVERNANCE_FIELD_VALUE_INVALID`.
 */
export function emitEntry(entry, indent) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    refuse('Registry entry must be a plain object.', 'GOVERNANCE_FIELD_VALUE_INVALID');
  }
  const pad = typeof indent === 'string' ? indent : DEFAULT_ITEM_INDENT;
  const keyPad = `${pad}  `;
  const out = [];

  const pairs = Object.entries(entry);
  if (pairs.length === 0) {
    refuse('Registry entry has no fields to emit.', 'GOVERNANCE_FIELD_VALUE_INVALID');
  }

  for (const [key, value] of pairs) {
    assertSafeScalar(key, `entry key '${key}'`);
    const prefix = out.length === 0 ? `${pad}- ` : keyPad;

    if (isPlainObject(value)) {
      out.push(`${prefix}${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        assertSafeScalar(subKey, `${key}.${subKey}`);
        out.push(`${keyPad}  ${subKey}: ${emitScalar(subValue, `${key}.${subKey}`)}`);
      }
      continue;
    }

    if (Array.isArray(value)) {
      const items = value.map((element, i) => {
        assertSafeSeqElement(element, `${key}[${i}]`);
        return `"${element}"`;
      });
      out.push(`${prefix}${key}: [${items.join(', ')}]`);
      continue;
    }

    out.push(`${prefix}${key}: ${emitScalar(value, key)}`);
  }

  return out;
}

// ── Internals ────────────────────────────────────────────────────────────

/**
 * True when `line` is the registry root key's own line.
 *
 * `rootKey` is validated against {@link PLAIN_KEY}, so no regex escaping is needed
 * and a prefix match cannot collide with a longer key: `checks-extra:` has `-`
 * where `checks:` has `:`.
 */
function isRootKeyLine(line, rootKey) {
  return line.startsWith(`${rootKey}:`);
}

/**
 * True when `line` ends the root key's block.
 *
 * Any non-blank, non-comment line at indent 0 is a boundary. This is deliberately
 * broader than {@link PLAIN_KEY}: `lib/profiles/yaml.mjs:98` accepts key shapes a
 * conservative identifier pattern rejects (`some.key`, `a$b`, `"quoted key"`), and a
 * sibling missed here would make new items land AFTER it at indent 2, producing a
 * file that `parseYaml` rejects with "unexpected indentation". Anything unindented
 * belongs to the document, not to this block, so treating it as a boundary is both
 * safe and complete.
 */
function isBlockBoundary(line) {
  return /^[^\s#]/.test(line);
}

/**
 * Determine the file's line terminator, refusing anything this splice cannot
 * reproduce byte-for-byte.
 *
 * A `\r` that is not recognised as part of the terminator makes `checks:\r`
 * invisible to the key scan: the key reads as absent, a SECOND block is appended,
 * and the pre-existing entries silently vanish from the effective registry. Mixed
 * endings are refused rather than normalised, because normalising would rewrite
 * bytes outside the splice — exactly what this module exists to avoid.
 */
function detectLineEnding(source) {
  const lf = (source.match(/\n/g) ?? []).length;
  const crlf = (source.match(/\r\n/g) ?? []).length;
  const strayCr = (source.match(/\r(?!\n)/g) ?? []).length;

  if (strayCr > 0) {
    refuse(
      `The governance file contains a carriage return that is not part of a CRLF ` +
      `terminator. This splice preserves a file's existing line endings verbatim and ` +
      `cannot do so for lone-CR text, so the merge is refused rather than rewriting it. ` +
      `Convert the file to LF (or CRLF) line endings and retry.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }
  if (crlf > 0 && crlf < lf) {
    refuse(
      `The governance file mixes CRLF and LF line endings (${crlf} CRLF, ${lf - crlf} LF). ` +
      `Normalising them would rewrite bytes outside the splice, so the merge is refused. ` +
      `Normalise the file to a single line-ending convention and retry.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }
  return crlf > 0 ? '\r\n' : '\n';
}

/**
 * Validate one element of an emitted flow sequence.
 *
 * The scalar rule alone is WRONG here, and the argv rule alone is too. A gate's
 * `command` is an argv list validated by `assertArgvCommand`
 * (governance-registry.mjs), which deliberately permits a leading `-` so
 * `[npm, test, --, --silent]` stays contributable — yet the scalar rule refuses
 * a leading `-` outright, so an argv the contribution layer ACCEPTS could not be
 * written back out. Conversely the argv rule refuses `:`, which every
 * `plugin:<skill>/<file>` and `npm run test:integration` token carries.
 *
 * An element that satisfies EITHER sanctioned rule is emitted. That is sound
 * because the element is emitted DOUBLE-QUOTED inside a flow sequence, where
 * `lib/profiles/yaml.mjs` neither honours a leading YAML indicator nor coerces
 * a quoted `42` / `true` back to a number or boolean (verified round trip). The
 * characters that DO change a flow sequence's structure — `"`, `,`, `[`, `]`,
 * `#`, newline — are refused by both rules, so the union narrows nothing that
 * matters.
 *
 * @param {unknown} element
 * @param {string} fieldPath
 * @throws {Error} code `GOVERNANCE_SCALAR_UNSAFE`, `GOVERNANCE_FIELD_VALUE_INVALID`
 *   or `GOVERNANCE_LIMIT_EXCEEDED` — the SCALAR rule's verdict, since it is the
 *   stricter of the two and gives the more informative message.
 */
function assertSafeSeqElement(element, fieldPath) {
  let argvOk = true;
  try {
    assertSafeArgvToken(element);
  } catch {
    argvOk = false;
  }
  if (argvOk) return;
  assertSafeScalar(element, fieldPath);
}

function emitScalar(value, fieldPath) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  assertSafeScalar(value, fieldPath);
  return value;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Stable, documented shape of the generated header (form 5). The trailing blank
 * line separates the header from the key that `appendNewKey` writes next.
 */
function generateHeader(rootKey, extensionName) {
  const lines = [`# ${rootKey} — governance registry created by adev extension install`];
  if (typeof extensionName === 'string' && extensionName !== '') {
    assertSafeScalar(extensionName, 'extensionName');
    lines.push(`# Extension: ${extensionName}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

/** Form 4 (and the tail of form 5): the key is absent, so append it at end of file. */
function appendNewKey(lines, rootKey, newEntries, source, eol) {
  const endsWithNewline = source.endsWith(eol);
  const body = endsWithNewline ? lines.slice(0, -1) : lines;

  let at = body.length;
  while (at > 0 && body[at - 1].trim() === '') at--;

  const block = [`${rootKey}:`, ...emitAll(newEntries, DEFAULT_ITEM_INDENT)];
  const merged = [...body.slice(0, at), ...block, ...body.slice(at)];
  const text = merged.join(eol) + (endsWithNewline ? eol : '');
  return { text, insertedAt: at + 1 };
}

/** Forms 1, 2, 3 and 7: the key exists exactly once. */
function spliceExistingKey(lines, keyIndex, rootKey, newEntries, eol) {
  const keyLine = lines[keyIndex];
  const rest = keyLine.slice(rootKey.length + 1);
  const commentAt = findCommentIndex(rest);
  const inline = (commentAt < 0 ? rest : rest.slice(0, commentAt)).trim();
  // Carry the comment over with the whitespace that separated it from the value,
  // so a rewritten `key: []  # note` line keeps its original spacing.
  let suffixStart = commentAt;
  while (suffixStart > 0 && /\s/.test(rest[suffixStart - 1])) suffixStart--;
  const commentSuffix = commentAt < 0 ? '' : rest.slice(suffixStart);

  // Block extent: up to (but excluding) the next indent-0 content line, or EOF.
  let blockEnd = lines.length;
  for (let i = keyIndex + 1; i < lines.length; i++) {
    if (isBlockBoundary(lines[i])) { blockEnd = i; break; }
  }

  // Form-7 class — a block sequence written at column 0. `- id: a` at indent 0 is
  // legal YAML, but it is also a block boundary, so inserting our own items at
  // indent 2 beside it produces mixed indentation that `parseYaml` reads as a
  // single-entry list: the zero-indent items AND every following sibling key
  // silently vanish. The root key does not read as an array this splice can
  // extend, so refuse rather than write a file that loses data.
  if (blockEnd < lines.length && /^-(\s|$)/.test(lines[blockEnd])) {
    refuse(
      `Root key '${rootKey}' is followed by a block sequence written at column 0 ` +
      `(${JSON.stringify(lines[blockEnd])}). A zero-indent sequence is also a block ` +
      `boundary, so splicing beside it would mix indentation and drop both those items ` +
      `and any following sibling key. Re-indent the sequence by two spaces and retry.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }

  const hasBlockContent = lines
    .slice(keyIndex + 1, blockEnd)
    .some((l) => l.trim() !== '' && !l.trim().startsWith('#'));

  if (inline !== '') {
    // Form 2 — `key: []` becomes `key:` + items. Anything else at the key line is
    // a scalar, a flow map, or a non-empty flow sequence: none is spliceable.
    if (inline !== '[]') {
      refuse(
        `Root key '${rootKey}' carries the inline value ${JSON.stringify(inline)}, which is ` +
        `not an empty sequence. Only a block sequence or an empty inline list can be ` +
        `spliced in place; a scalar, a map, or a non-empty flow sequence at this key is ` +
        `refused rather than silently overwritten.`,
        'GOVERNANCE_PARSE_REFUSED'
      );
    }
    if (hasBlockContent) {
      refuse(
        `Root key '${rootKey}' is written as an empty inline list but also has content ` +
        `indented beneath it. The file's intent is ambiguous, so the merge is refused.`,
        'GOVERNANCE_PARSE_REFUSED'
      );
    }
    const emitted = emitAll(newEntries, DEFAULT_ITEM_INDENT);
    const rewritten = `${rootKey}:${commentSuffix}`;
    const merged = [
      ...lines.slice(0, keyIndex),
      rewritten,
      ...emitted,
      ...lines.slice(keyIndex + 1),
    ];
    return { text: merged.join(eol), insertedAt: keyIndex + 1 };
  }

  // Form 7 — a block map beneath the key is not a sequence.
  const firstContent = lines
    .slice(keyIndex + 1, blockEnd)
    .find((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  if (firstContent !== undefined && !/^\s*-(\s|$)/.test(firstContent)) {
    refuse(
      `Root key '${rootKey}' is not a sequence — the first content line beneath it is ` +
      `${JSON.stringify(firstContent.trim())}. A map or scalar at a registry root key ` +
      `would silently yield zero existing entries and degrade collision detection to ` +
      `append-everything, so the merge is refused.`,
      'GOVERNANCE_PARSE_REFUSED'
    );
  }

  // Forms 1 and 3 — insert after the last content line of the block, so a trailing
  // comment/blank run (form 3's commented example block) stays exactly where it is.
  let insertAt = blockEnd;
  while (insertAt > keyIndex + 1) {
    const candidate = lines[insertAt - 1];
    if (candidate.trim() === '' || candidate.trim().startsWith('#')) insertAt--;
    else break;
  }

  const itemIndent = firstContent === undefined
    ? DEFAULT_ITEM_INDENT
    : firstContent.match(/^(\s*)/)[1];
  const emitted = emitAll(newEntries, itemIndent);

  const merged = [...lines.slice(0, insertAt), ...emitted, ...lines.slice(insertAt)];
  return { text: merged.join(eol), insertedAt: insertAt };
}

function emitAll(entries, indent) {
  return entries.flatMap((entry) => emitEntry(entry, indent));
}

/**
 * Index of a trailing `#` comment that is outside quotes and braces, or -1.
 *
 * Mirrors `lib/profiles/yaml.mjs:stripComment` so the splice and the parser agree
 * on what a key line's inline value is. The index (rather than the stripped text)
 * is returned so the comment can be carried over verbatim when the line is rewritten.
 */
function findCommentIndex(line) {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble && (c === '{' || c === '[')) depth++;
    else if (!inSingle && !inDouble && (c === '}' || c === ']')) depth = Math.max(0, depth - 1);
    else if (!inSingle && !inDouble && depth === 0 && c === '#') return i;
  }
  return -1;
}
