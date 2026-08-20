/**
 * @module lib/evals/rubric
 *
 * The executable expression of the rubric contract declared as data in
 * `lib/evals/rubric-schema.mjs`. This module loads a rubric from disk and
 * (in later passes) parses and validates it against those constants; it must
 * never restate the contract, only consume it.
 *
 * Loading is a sequence of ordered passes, and the order is load-bearing —
 * each pass may only assume what the passes before it established. Established
 * so far:
 *
 *   1. containment — the caller-supplied path is resolved against the
 *      real-pathed project root and confirmed to stay inside it, both before
 *      and after symlink resolution. Nothing touches the filesystem for
 *      content until this pass succeeds, so a traversal or symlink escape is
 *      refused without ever reading the target.
 *   2. read — the contained real path is read as UTF-8 source.
 *   3. parse — the source is handed to the repo's minimal YAML reader. Any
 *      parser fault, and any document that is not a map at the top level,
 *      becomes a coded `RUBRIC_PARSE_ERROR`; no uncoded parser exception
 *      escapes to a caller.
 *   4. nesting — the parsed tree is walked for value shapes the rubric schema
 *      does not permit. This must run on the parsed tree, not on the source:
 *      the reader builds nested maps rather than flattening them, so nesting is
 *      only visible after parsing.
 *   5. required keys — the parsed document is diffed against
 *      `REQUIRED_TOP_LEVEL_KEYS`, and every absent key is reported in one
 *      error. It runs after nesting so that a rubric whose key IS present but
 *      unrepresentable is told to fix the value rather than told the key is
 *      missing. Extra top-level keys are not this pass's concern: the schema is
 *      open at the top level, so the skill-compression shape (`skill`,
 *      `scenario`) and the `budget_max_*` family load unremarked.
 *   6. entry completeness — every `required_elements` entry is diffed against
 *      `REQUIRED_ELEMENT_FIELDS` and every `quality_dimensions` entry against
 *      `REQUIRED_CRITERION_FIELDS`. It runs after the required-key pass, which
 *      is what guarantees both lists are PRESENT — but not that either is a
 *      list of maps, so this pass owns that shape check too (see
 *      `assertEntriesComplete`).
 *
 * Later passes (schema validation, reporting) append to this list and change
 * the return type; the containment pass stays first regardless.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { codedError } from "../errors.mjs";
import { isContained, lenientRealpath, resolveContained } from "../path-safety.mjs";
import { parseYaml } from "../profiles/yaml.mjs";
import {
  REQUIRED_CRITERION_FIELDS,
  REQUIRED_ELEMENT_FIELDS,
  REQUIRED_TOP_LEVEL_KEYS,
} from "./rubric-schema.mjs";

/**
 * Deepest key path `describeKeyPath` will build before giving up and reporting
 * what it has. The YAML reader cannot produce cycles, so this is a totality
 * guard rather than a cycle breaker — it keeps the descent finite whatever the
 * parsed shape turns out to be. `assertNoNestedMaps` needs no such cap: it does
 * not recurse, iterating a fixed three levels (top-level key, list item, item
 * property).
 */
const MAX_KEY_PATH_DEPTH = 32;

/**
 * Build the `UNSAFE_RUBRIC_PATH` error.
 *
 * Reports the caller-supplied path verbatim (never the resolved one): the
 * resolved form would leak filesystem layout outside the project root, and the
 * caller can only act on the input it actually passed.
 *
 * @param {string} offending - the rubric path exactly as the caller supplied it
 * @returns {Error}
 */
function unsafeRubricPathError(offending) {
  const err = codedError(
    "UNSAFE_RUBRIC_PATH",
    `UNSAFE_RUBRIC_PATH: rubric path "${offending}" escapes the project root.`,
  );
  err.offendingPath = offending;
  return err;
}

/**
 * True for a value the YAML reader produced as a map — an object that is
 * neither null nor an array.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extend a key path down into an offending map so the error names the deepest
 * scalar reached, not merely the key that opened the nesting.
 *
 * Descends into the map's FIRST entry and keeps descending while that entry's
 * value is itself a map, stopping at the first non-map. One offending example
 * is enough to tell an author which block to flatten, and taking the first
 * entry keeps the reported path deterministic for a given file. An empty map
 * has no entry to descend into, so the path stops where it started.
 *
 * @param {string[]} basePath - key path segments naming the offending map itself
 * @param {object} offendingMap - the map value that is not permitted here
 * @returns {string} dotted key path, e.g. `budgets.max_turns`
 */
function describeKeyPath(basePath, offendingMap) {
  const segments = [...basePath];
  let current = offendingMap;
  while (isPlainObject(current) && segments.length < MAX_KEY_PATH_DEPTH) {
    const entries = Object.entries(current);
    if (entries.length === 0) break;
    const [key, value] = entries[0];
    segments.push(key);
    current = value;
  }
  return segments.join(".");
}

/**
 * Build the `RUBRIC_NESTED_MAP` error for one offending key path.
 *
 * The message carries the reason as well as the location: the repo's minimal
 * YAML readers cannot represent a nested map, so a nested block would otherwise
 * load as an empty value and score as if the author had written nothing. BEH-2
 * exists precisely to make that silent load impossible — the rubric is
 * rejected, never partially returned.
 *
 * A key written with no value at all (`unknown_policy:` on a line by itself)
 * reaches this function too, because the YAML reader materialises a valueless
 * key as an empty map — it cannot tell "I wrote nothing here" apart from "I
 * wrote a block you cannot represent". That ambiguity is the whole reason
 * BEH-2 rejects instead of loading, but the two authoring mistakes need
 * different advice, so the empty case gets its own wording rather than being
 * told to flatten a block the author never wrote.
 *
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @param {string} keyPath - dotted key path naming the offender
 * @param {boolean} [isEmpty] - true when the offending map has no entries
 * @returns {Error}
 */
function nestedMapError(rubricPath, keyPath, isEmpty = false) {
  const reason = isEmpty
    ? `declares "${keyPath}" with no value. The repo's minimal YAML readers ` +
      "materialise a valueless key as an empty map, so a key left blank is " +
      "indistinguishable from a nested block that failed to load. Give the key " +
      "a flat value, or remove it."
    : `nests a map at "${keyPath}". Rubric values must be flat — a top-level ` +
      "scalar, a list of scalars, or a list of flat maps (required_elements, " +
      "quality_dimensions). The repo's minimal YAML readers cannot represent a " +
      "nested map, so this block would load as an empty value; the rubric is " +
      "rejected rather than silently loaded with a missing structure.";

  const err = codedError(
    "RUBRIC_NESTED_MAP",
    `RUBRIC_NESTED_MAP: rubric "${rubricPath}" ${reason}`,
  );
  err.keyPath = keyPath;
  return err;
}

/**
 * Walk a parsed rubric document for value shapes the schema does not permit,
 * throwing `RUBRIC_NESTED_MAP` at the first offender.
 *
 * The schema admits exactly three value shapes below a top-level key: a scalar,
 * a list of scalars, and a list of flat maps (the two sanctioned list-of-maps
 * keys being `required_elements` and `quality_dimensions`). Rather than
 * allow-listing those two key names, the walk distinguishes them by SHAPE — a
 * list whose items are maps of scalar-valued keys — so a rubric that adds a
 * further list-of-flat-maps key is not rejected for its name alone, while
 * genuine nesting inside any list item still is. Everything else is nesting:
 *
 *   - a top-level key whose value is a map;
 *   - inside a list item that is a map, a property whose value is a map or a
 *     list (the "one level deeper inside lists" case);
 *   - a list item that is itself a list.
 *
 * @param {object} document - the parsed rubric, already known to be a map
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_NESTED_MAP'` naming the offending key path.
 */
function assertNoNestedMaps(document, rubricPath) {
  for (const [key, value] of Object.entries(document)) {
    if (isPlainObject(value)) {
      throw nestedMapError(
        rubricPath,
        describeKeyPath([key], value),
        Object.keys(value).length === 0,
      );
    }
    if (!Array.isArray(value)) continue;

    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const itemPath = `${key}[${i}]`;
      if (Array.isArray(item)) {
        throw nestedMapError(rubricPath, itemPath);
      }
      if (!isPlainObject(item)) continue;

      // A list item that is a map is sanctioned only while every one of its
      // properties is a scalar. This is the level the dotted path must descend
      // one step further into.
      for (const [prop, propValue] of Object.entries(item)) {
        if (Array.isArray(propValue)) {
          throw nestedMapError(rubricPath, `${itemPath}.${prop}`);
        }
        if (isPlainObject(propValue)) {
          throw nestedMapError(
            rubricPath,
            describeKeyPath([itemPath, prop], propValue),
            Object.keys(propValue).length === 0,
          );
        }
      }
    }
  }
}

/**
 * Reject a parsed rubric that omits any required top-level key, naming every
 * absent key in a single `RUBRIC_MISSING_KEY`.
 *
 * The aggregation IS the behaviour (BEH-3), not a convenience: an author who
 * fixes one key at a time, reloading between each, pays a full round trip per
 * missing key, so the loader collects the whole diff before throwing rather
 * than short-circuiting on the first miss.
 *
 * Missing keys are reported in `REQUIRED_TOP_LEVEL_KEYS` declaration order —
 * the shipped rubric's own order — so the message reads as a checklist against
 * the schema rather than against whatever order this particular file happened
 * to use.
 *
 * Only ABSENCE is checked. A key present with an empty value is declared as far
 * as this pass is concerned; whether that value is acceptable belongs to the
 * later value-validation passes. Extra top-level keys are likewise not checked:
 * the top level is open, and `OPTIONAL_TOP_LEVEL_KEYS` is not consulted here —
 * it carries the placeholder `budget_max_*`, which is a family name rather than
 * a key any rubric literally declares.
 *
 * @param {object} document - the parsed rubric, already known to be a flat map
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_MISSING_KEY'` listing every absent required key.
 */
function assertRequiredKeysPresent(document, rubricPath) {
  const declared = new Set(Object.keys(document));
  const missing = REQUIRED_TOP_LEVEL_KEYS.filter((key) => !declared.has(key));
  if (missing.length === 0) return;

  const err = codedError(
    "RUBRIC_MISSING_KEY",
    `RUBRIC_MISSING_KEY: rubric "${rubricPath}" omits ${missing.length} required ` +
      `top-level ${missing.length === 1 ? "key" : "keys"}: ${missing.join(", ")}.`,
  );
  err.missingKeys = missing;
  throw err;
}

/**
 * Name one entry of a rubric list for an error message.
 *
 * Prefers the entry's own `id`, which is what an author searches the file for.
 * Falls back to `<listName>[<index>]` whenever no usable id is available — the
 * entry is not a map, declares no `id`, or declares one that is not a non-empty
 * string. `id` is itself a required field, so a missing one IS a completeness
 * failure and must still be reportable; the positional form is what keeps such
 * a message from ever printing `undefined`.
 *
 * @param {any} entry - the list entry, of whatever shape the rubric declared
 * @param {string} listName - `required_elements` or `quality_dimensions`
 * @param {number} index - the entry's position in that list
 * @returns {string} the entry's id, else `<listName>[<index>]`
 */
function describeEntry(entry, listName, index) {
  if (isPlainObject(entry) && typeof entry.id === "string" && entry.id !== "") {
    return entry.id;
  }
  return `${listName}[${index}]`;
}

/**
 * Reject any entry of one rubric list that omits a field the schema requires.
 *
 * Only ABSENCE is checked, exactly as in `assertRequiredKeysPresent`: a field
 * present but empty-string is DECLARED as far as this pass is concerned, and
 * whether its value is acceptable belongs to the later value-validation passes.
 * Fields outside `requiredFields` are not this pass's concern either — notably
 * `not_applicable_when`, which the shipped rubric carries on every element but
 * which BEH-5 does not require; demanding it here would reject conforming
 * rubrics.
 *
 * Shape is only PARTLY this pass's problem. The required-key pass guarantees
 * both list keys are PRESENT, and the nesting pass rejects nesting INSIDE a list
 * of maps, but neither rejects `required_elements: "oops"` (a scalar where a
 * list belongs) or a list whose items are scalars. The two are handled
 * differently, on purpose:
 *
 *   - A non-map ENTRY inside a real list IS reported here, as an entry that
 *     declares nothing: every required field is missing from a scalar, which is
 *     precisely what "incomplete" means, so it reuses the same coded error an
 *     author already knows how to act on rather than escaping as a TypeError
 *     from `field in entry`.
 *   - A non-list VALUE for the list key is NOT reported here. It has no entries
 *     to be incomplete, and treating it as one empty entry would contradict the
 *     established contract that this loader's earlier passes check absence
 *     rather than value shape — `tests/lib/evals/rubric-missing-keys.test.mjs`
 *     pins a rubric declaring all twelve required keys as scalar placeholders as
 *     loadable. Whether the value is a list at all belongs to the later
 *     value-validation passes. It is skipped without a property read, so no
 *     TypeError escapes from here either.
 *
 * @param {object} document - the parsed rubric, already known to declare `listName`
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @param {string} listName - `required_elements` or `quality_dimensions`
 * @param {readonly string[]} requiredFields - the schema's field list for this entry kind
 * @param {string} code - the coded error to raise (`RUBRIC_INCOMPLETE_*`)
 * @param {boolean} namesMissingFields - true to name the missing fields in the
 *   message. BEH-5 asks the criterion error to name the entry AND the missing
 *   field, while the element error names only the entry; the missing fields are
 *   attached as `err.missingKeys` either way, so nothing is lost to a caller.
 * @throws {Error} `code` — at the first incomplete entry.
 */
function assertListEntriesComplete(
  document,
  rubricPath,
  listName,
  requiredFields,
  code,
  namesMissingFields,
) {
  const entries = document[listName];
  if (!Array.isArray(entries)) return;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const missing = isPlainObject(entry)
      ? requiredFields.filter((field) => !(field in entry))
      : [...requiredFields];
    if (missing.length === 0) continue;

    const label = describeEntry(entry, listName, i);
    const detail = namesMissingFields
      ? `omits ${missing.length === 1 ? "the required field" : "required fields"}: ` +
        `${missing.join(", ")}.`
      : `omits ${missing.length} required ` +
        `${missing.length === 1 ? "field" : "fields"}.`;

    const err = codedError(
      code,
      `${code}: rubric "${rubricPath}" ${listName} entry ${label} ${detail}`,
    );
    err.keyPath = `${listName}[${i}]`;
    err.entryId = label;
    err.missingKeys = missing;
    throw err;
  }
}

/**
 * Reject a parsed rubric whose `required_elements` or `quality_dimensions`
 * entries are incomplete (BEH-5), elements first.
 *
 * Elements are checked before criteria so a rubric with faults in both is told
 * about them in the schema's own declaration order, matching how
 * `assertRequiredKeysPresent` reports against `REQUIRED_TOP_LEVEL_KEYS` order.
 *
 * @param {object} document - the parsed rubric, already known to declare both lists
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_INCOMPLETE_ELEMENT'` naming the offending element.
 * @throws {Error} `code: 'RUBRIC_INCOMPLETE_CRITERION'` naming the offending
 *   criterion and the field(s) it omits.
 */
function assertEntriesComplete(document, rubricPath) {
  assertListEntriesComplete(
    document,
    rubricPath,
    "required_elements",
    REQUIRED_ELEMENT_FIELDS,
    "RUBRIC_INCOMPLETE_ELEMENT",
    false,
  );
  assertListEntriesComplete(
    document,
    rubricPath,
    "quality_dimensions",
    REQUIRED_CRITERION_FIELDS,
    "RUBRIC_INCOMPLETE_CRITERION",
    true,
  );
}

/**
 * Load a rubric's source from disk, refusing any path that escapes the project
 * root by traversal or by symlink.
 *
 * @param {string} rubricPath - rubric path, absolute or relative to `projectRoot`
 * @param {object} [options]
 * @param {string} [options.projectRoot] - containment boundary (default `process.cwd()`)
 * @returns {object} the parsed rubric document (later passes add validation)
 *
 * @throws {Error} `code: 'UNSAFE_RUBRIC_PATH'` if the path escapes `projectRoot`,
 *   before or after symlink resolution.
 * @throws {Error} `code: 'RUBRIC_NOT_FOUND'` if the contained path does not exist
 *   or cannot be read.
 * @throws {Error} `code: 'RUBRIC_PARSE_ERROR'` if the source is not parseable as
 *   YAML, or parses to something other than a map at the top level.
 * @throws {Error} `code: 'RUBRIC_NESTED_MAP'` if any value nests a map; the
 *   message names the offending dotted key path and nothing partial is returned.
 * @throws {Error} `code: 'RUBRIC_MISSING_KEY'` if any required top-level key is
 *   absent; the message lists every missing key, not only the first.
 * @throws {Error} `code: 'RUBRIC_INCOMPLETE_ELEMENT'` if a `required_elements`
 *   entry omits a required field; the message names the entry by its id, or by
 *   `required_elements[<index>]` when it declares none.
 * @throws {Error} `code: 'RUBRIC_INCOMPLETE_CRITERION'` if a
 *   `quality_dimensions` entry omits a required field; the message names the
 *   entry and the field(s) it omits.
 */
export function loadRubric(rubricPath, { projectRoot = process.cwd() } = {}) {
  // Real-path the root FIRST: on macOS a temp/project root under /var is itself
  // reached through a symlink (/var -> /private/var), so comparing a real path
  // against a non-real root would reject every contained path as unsafe.
  const rootReal = lenientRealpath(resolve(projectRoot));

  const abs = resolveContained(rootReal, rubricPath);
  if (abs === null) throw unsafeRubricPathError(rubricPath);

  // Symlink escape: a link file inside the root whose target lives outside it.
  const real = lenientRealpath(abs);
  if (!isContained(real, rootReal)) throw unsafeRubricPathError(rubricPath);

  // Only now touch the filesystem for content.
  if (!existsSync(real)) {
    throw codedError(
      "RUBRIC_NOT_FOUND",
      `RUBRIC_NOT_FOUND: no rubric file exists at "${real}".`,
    );
  }

  let source;
  try {
    source = readFileSync(real, "utf8");
  } catch (err) {
    throw codedError(
      "RUBRIC_NOT_FOUND",
      `RUBRIC_NOT_FOUND: rubric file "${real}" exists but could not be read: ${err.message}`,
    );
  }

  // Parse pass. The reader raises YamlParseError on malformed input; catching
  // every throw (not just that class) guarantees no uncoded parser exception
  // reaches a caller who is branching on `.code`.
  let document;
  try {
    document = parseYaml(source);
  } catch (err) {
    throw codedError(
      "RUBRIC_PARSE_ERROR",
      `RUBRIC_PARSE_ERROR: rubric "${rubricPath}" could not be parsed: ${err.message}`,
    );
  }

  if (!isPlainObject(document)) {
    throw codedError(
      "RUBRIC_PARSE_ERROR",
      `RUBRIC_PARSE_ERROR: rubric "${rubricPath}" must be a map at the top level, ` +
        `but parsed to ${Array.isArray(document) ? "a list" : typeof document}.`,
    );
  }

  assertNoNestedMaps(document, rubricPath);
  assertRequiredKeysPresent(document, rubricPath);
  assertEntriesComplete(document, rubricPath);

  return document;
}
