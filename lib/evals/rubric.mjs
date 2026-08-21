/**
 * @module lib/evals/rubric
 *
 * The executable expression of the rubric contract declared as data in
 * `lib/evals/rubric-schema.mjs`. This module loads a rubric from disk and
 * (in later passes) parses and validates it against those constants; it must
 * never restate the contract, only consume it.
 *
 * Loading is a sequence of ordered passes, and the order is load-bearing —
 * each pass may only assume what the passes before it established, and the
 * order decides WHICH error a rubric with several faults receives. The full
 * sequence:
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
 *   7. verdict enums — every entry that DECLARES a `verdict` is checked against
 *      the enum for its kind: `ELEMENT_VERDICTS` for a `required_elements`
 *      entry, `CRITERION_VERDICTS` for a `quality_dimensions` entry. The two
 *      enums are deliberately not the same set (see `assertVerdictsLegal`). It
 *      runs after completeness so an entry is known to declare its required
 *      fields before its optional pinned verdict is judged.
 *   8. budget keys — every TOP-LEVEL key matching `BUDGET_KEY_PATTERN` must
 *      carry a finite number strictly greater than zero, and every offender is
 *      reported in one error. Budget keys are optional, so absence is never a
 *      fault; this pass judges the SHAPE of a declared budget only, never
 *      whether a run came in under it (see `assertBudgetsValid`).
 *   9. legacy scale — every `quality_dimensions` entry carrying a NUMERIC
 *      `weight` is reported in one `RUBRIC_LEGACY_SCALE`, because the
 *      binary-verdict schema has no `weight` field at all and a weighted
 *      criterion therefore predates the migration. It runs after completeness
 *      and verdict validation, so an entry that reaches it is
 *      already known to declare its required fields: the migration notice then
 *      names criteria whose only remaining fault IS the weight, rather than
 *      being raised over a rubric whose real problem is a missing
 *      `unknown_when` (see `assertNoLegacyWeights`).
 *  10. uniqueness — `required_elements` ids and `quality_dimensions` ids are
 *      each checked for repeats WITHIN their own list, elements first. It runs
 *      last of all the passes because an id is only meaningfully unique once
 *      every entry is known to declare one, which the completeness pass
 *      established (see `assertIdsUnique`).
 *
 * Only after all ten passes have succeeded is the Rubric constructed and
 * returned. That ordering IS the "no partially-populated Rubric" postcondition:
 * there is no object for a caller to receive until every pass has passed, so a
 * failed load cannot hand back a half-built rubric.
 *
 * The loader keeps no module-level state and memoizes nothing: `parseYaml`
 * builds a fresh tree on every call, so two loads of the same file are
 * structurally identical but share no object, and a caller who mutates one
 * cannot affect the next load.
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
  BUDGET_KEY_PATTERN,
  CRITERION_VERDICTS,
  ELEMENT_VERDICTS,
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
 * The entry key that carries a DECLARED verdict.
 *
 * The key is OPTIONAL and appears in neither `REQUIRED_ELEMENT_FIELDS` nor
 * `REQUIRED_CRITERION_FIELDS`, because a verdict is what SCORING produces, not
 * what authoring declares: neither the shipped `skills/eval/default-rubric.yaml`
 * nor `tests/fixtures/evals/rubrics/conforming.yaml` writes one on any entry,
 * and both must keep loading. The verdict pass therefore never REQUIRES this
 * key — it exists so that a rubric which does pin an expected verdict (a
 * fixture, a regression rubric, a self-test) cannot pin an impossible one and
 * have the mistake surface only at scoring time.
 *
 * Not to be confused with the top-level `verdict_values` key, which is a
 * human-readable description string (`"met | not_met | unknown (judged
 * criteria) | not_applicable (deterministic elements)"`) rather than a machine
 * list; the enums come from the schema module, never from that string.
 */
const VERDICT_FIELD = "verdict";

/**
 * Reject any entry of one rubric list whose declared verdict is outside the
 * enum for that entry kind, naming the entry and the illegal value.
 *
 * A non-string declared value (a number, a boolean, `null`) is illegal too and
 * raises the same code: membership is tested against the enum, which holds
 * strings only, so a non-string simply fails to match — no separate branch and
 * no TypeError. It is rendered with `JSON.stringify` so `null`, `3` and `"3"`
 * read distinguishably in the message.
 *
 * Only a DECLARED verdict is judged; an entry that omits the key is untouched
 * (see `VERDICT_FIELD`). A non-map entry is skipped without a property read,
 * matching `assertListEntriesComplete` — an entry that cannot carry a key
 * cannot have declared an illegal one, and its real fault (declaring nothing at
 * all) has already been reported by the completeness pass.
 *
 * @param {object} document - the parsed rubric, already known to declare `listName`
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @param {string} listName - `required_elements` or `quality_dimensions`
 * @param {readonly string[]} legalVerdicts - the schema's enum for this entry kind
 * @throws {Error} `code: 'RUBRIC_INVALID_VERDICT'` — at the first illegal verdict.
 */
function assertListVerdictsLegal(document, rubricPath, listName, legalVerdicts) {
  const entries = document[listName];
  if (!Array.isArray(entries)) return;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isPlainObject(entry) || !(VERDICT_FIELD in entry)) continue;

    const declared = entry[VERDICT_FIELD];
    if (legalVerdicts.includes(declared)) continue;

    const label = describeEntry(entry, listName, i);
    const err = codedError(
      "RUBRIC_INVALID_VERDICT",
      `RUBRIC_INVALID_VERDICT: rubric "${rubricPath}" ${listName} entry ${label} ` +
        `declares verdict ${JSON.stringify(declared)}, which is not one of: ` +
        `${legalVerdicts.join(", ")}.`,
    );
    err.keyPath = `${listName}[${i}].${VERDICT_FIELD}`;
    err.entryId = label;
    err.verdict = declared;
    err.legalVerdicts = [...legalVerdicts];
    throw err;
  }
}

/**
 * Reject a parsed rubric whose entries pin an impossible verdict (BEH-4),
 * elements first — the same schema-declaration order the earlier passes report
 * in.
 *
 * The two enums stay separate on purpose, and collapsing them into one set
 * would discard the whole point of the pass: a deterministic `required_elements`
 * check either applies and answers or does not apply, so it never resolves to
 * `unknown`; a judged `quality_dimensions` criterion is either decided or
 * undecidable, so it never resolves to `not_applicable`.
 *
 * @param {object} document - the parsed rubric, already known to declare both lists
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_INVALID_VERDICT'` naming the offending entry and value.
 */
function assertVerdictsLegal(document, rubricPath) {
  assertListVerdictsLegal(document, rubricPath, "required_elements", ELEMENT_VERDICTS);
  assertListVerdictsLegal(document, rubricPath, "quality_dimensions", CRITERION_VERDICTS);
}

/**
 * True for a value acceptable as a budget: a finite number strictly greater
 * than zero.
 *
 * Deliberately does NOT coerce. A string is rejected however numeric it looks,
 * because coercion is precisely what would let a quoted `"12"` load silently as
 * a budget the author never typed as a number — an authoring mistake the loader
 * exists to surface. `Number.isFinite` additionally excludes `NaN` and both
 * infinities, and the `typeof` guard excludes booleans (which `>` would happily
 * compare) and `null`.
 *
 * @param {any} value - the declared budget value, as the YAML reader typed it
 * @returns {boolean}
 */
function isPositiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Reject a parsed rubric whose declared budget keys do not carry a positive
 * finite number (BEH-6), naming every offender in a single error.
 *
 * Budget keys are recognised by matching `BUDGET_KEY_PATTERN` against the
 * TOP-LEVEL key name, never by membership in `OPTIONAL_TOP_LEVEL_KEYS`: that
 * list carries the placeholder `budget_max_*`, a family name rather than a key
 * any rubric literally declares, so testing against it would recognise nothing.
 * Matching by pattern also means a new `budget_max_<unit>` key is validated the
 * day it is written, with no edit to the schema module.
 *
 * The pass AGGREGATES rather than stopping at the first offender, matching
 * `assertRequiredKeysPresent` for the same reason: a rubric typically declares
 * its budgets as a block, and an author who mistyped the block pays one reload
 * per key if told about them one at a time. Offenders are reported in the
 * rubric's own declaration order, so the first-listed offending key leads the
 * message.
 *
 * Budget keys are OPTIONAL. A rubric declaring none — which is what
 * `conforming.yaml` and the shipped `skills/eval/default-rubric.yaml` both do —
 * passes without remark; absence is never a fault here.
 *
 * SCOPE: this pass judges the SHAPE of a declared budget only. Whether an
 * actual run came in under its budget — the median-plus-spread threshold
 * evaluation over a sample set — belongs to the separate "budget thresholds as
 * failing verdicts" capability and must never appear in the loader: loading a
 * rubric reads no run data.
 *
 * @param {object} document - the parsed rubric, already known to be a flat map
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_INVALID_BUDGET'` naming every offending key and
 *   the value it declared.
 */
function assertBudgetsValid(document, rubricPath) {
  const offenders = Object.entries(document).filter(
    ([key, value]) => BUDGET_KEY_PATTERN.test(key) && !isPositiveFiniteNumber(value),
  );
  if (offenders.length === 0) return;

  // JSON.stringify so `"12"` and `12` read differently — the distinction IS the
  // fault in the quoted-number case, and a bare `${value}` would hide it.
  const rendered = offenders
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");

  const err = codedError(
    "RUBRIC_INVALID_BUDGET",
    `RUBRIC_INVALID_BUDGET: rubric "${rubricPath}" declares ${offenders.length} budget ` +
      `${offenders.length === 1 ? "key" : "keys"} whose value is not a positive ` +
      `number: ${rendered}. A budget must be a finite number greater than zero, ` +
      "and a string is never coerced into one. A value shown here in quotes " +
      "arrived as a string for one of two reasons: the author quoted it, or it " +
      "is a decimal — this repo's YAML reader types bare integers only " +
      "(lib/profiles/yaml.mjs), so `0.5` parses as the string \"0.5\". A " +
      "fractional budget therefore cannot be expressed today; use a whole-number " +
      "unit (cents rather than dollars) until the reader types decimals.",
  );
  err.invalidBudgetKeys = offenders.map(([key]) => key);
  err.invalidBudgets = Object.fromEntries(offenders);
  throw err;
}

/**
 * The entry key a PRE-MIGRATION rubric carried to weight one judged criterion
 * against another on the historical 1-5 scale.
 *
 * The binary-verdict schema declares no such field — `REQUIRED_CRITERION_FIELDS`
 * does not list it and `OPTIONAL_TOP_LEVEL_KEYS` has no entry-level counterpart
 * — which is exactly what makes its presence diagnostic rather than merely
 * unusual.
 */
const WEIGHT_FIELD = "weight";

/**
 * Reject a parsed rubric whose judged criteria still carry numeric weights
 * (BEH-8), naming every offender in a single error.
 *
 * TRIGGER (review note SA-1, binding): the PRESENCE of a numeric `weight` on a
 * `quality_dimensions` entry — never a 1-5 range check. The binary-verdict
 * schema has no `weight` field at all, so any numeric weight is by definition a
 * pre-migration rubric; a range check would wave a 1-10 or a 0-1 rescaling
 * straight through, which is the same legacy shape wearing different numbers.
 * `weight: 9` and `weight: 0` are therefore just as legacy as `weight: 3`.
 *
 * SCOPE, also from SA-1: JUDGED criteria only. A `required_elements` entry is
 * deterministic — met / not_met / not_applicable — so a weight there was never
 * part of the scale being migrated away from, and is left alone. A NON-numeric
 * weight (`weight: "heavy"`) is left alone too: it declares no scale, and
 * rejecting it would mean inferring an author's intent from a key name, while
 * every other unrecognised entry field goes unpoliced.
 *
 * NEVER COERCES. There is no mapping from a weight to a verdict — the two
 * express different things, one a relative importance and the other a decision —
 * so a "migrated" rubric this loader synthesised would be a guess presented as
 * the author's own rubric. The rubric is refused and nothing partial is
 * returned; the author rewrites the criteria as reference-anchored yes/no
 * questions.
 *
 * The pass AGGREGATES rather than stopping at the first offender, matching
 * `assertRequiredKeysPresent` and `assertBudgetsValid`: weights arrive as a
 * block, and an author migrating a whole rubric pays one reload per criterion
 * otherwise. Offenders are reported in the rubric's own declaration order.
 *
 * @param {object} document - the parsed rubric, already known to declare both lists
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_LEGACY_SCALE'` naming every weighted criterion
 *   and the weight it declared.
 */
function assertNoLegacyWeights(document, rubricPath) {
  const entries = document.quality_dimensions;
  if (!Array.isArray(entries)) return;

  const offenders = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isPlainObject(entry)) continue;
    if (typeof entry[WEIGHT_FIELD] !== "number") continue;
    offenders.push({
      label: describeEntry(entry, "quality_dimensions", i),
      index: i,
      weight: entry[WEIGHT_FIELD],
    });
  }
  if (offenders.length === 0) return;

  const rendered = offenders.map((o) => `${o.label} (weight ${o.weight})`).join(", ");

  const err = codedError(
    "RUBRIC_LEGACY_SCALE",
    `RUBRIC_LEGACY_SCALE: rubric "${rubricPath}" declares a numeric weight on ` +
      `${offenders.length} judged ${offenders.length === 1 ? "criterion" : "criteria"}: ` +
      `${rendered}. The binary verdict schema has no weight field, so a weighted ` +
      "criterion predates the migration to binary verdicts (met | not_met | " +
      "unknown). Migrate each criterion to a single reference-anchored yes/no " +
      "question with met_when, not_met_when and unknown_when, and delete its " +
      "weight; the scale is never coerced into verdicts.",
  );
  err.entryIds = offenders.map((o) => o.label);
  err.keyPaths = offenders.map((o) => `quality_dimensions[${o.index}].${WEIGHT_FIELD}`);
  err.legacyWeights = Object.fromEntries(offenders.map((o) => [o.label, o.weight]));
  throw err;
}

/**
 * The entry key that identifies one entry within its list.
 *
 * It is a REQUIRED field on both entry kinds (`REQUIRED_ELEMENT_FIELDS` and
 * `REQUIRED_CRITERION_FIELDS` both list it), which is what lets the uniqueness
 * pass assume every entry reaching it declares one.
 */
const ID_FIELD = "id";

/**
 * Reject one rubric list that declares the same id on more than one entry,
 * naming every repeated id and the positions that claim it.
 *
 * Uniqueness is scoped to a SINGLE list. An id repeated inside
 * `required_elements` is a collision, and so is one repeated inside
 * `quality_dimensions`, but an element and a criterion sharing a name is not:
 * the two lists answer different questions (deterministic checks versus judged
 * criteria) and a verdict is always attributed within one of them, so the same
 * name in both is legal, if unusual. Merging the two into one namespace would
 * reject a rubric that is perfectly reportable.
 *
 * A non-map entry, or one whose `id` is not a string, is skipped without a
 * property read — matching `assertListEntriesComplete` and
 * `assertListVerdictsLegal`. Such an entry's real fault is that it declares no
 * usable id at all, which the completeness pass has already reported; counting
 * it here would raise a second, more confusing error over the same defect.
 *
 * The pass AGGREGATES rather than stopping at the first repeat, matching
 * `assertRequiredKeysPresent`, `assertBudgetsValid` and `assertNoLegacyWeights`:
 * a rubric assembled by copy-paste repeats several ids at once, and an author
 * pays one reload per repeat if told about them one at a time. Repeats are
 * reported in the rubric's own declaration order.
 *
 * @param {object} document - the parsed rubric, already known to declare `listName`
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @param {string} listName - `required_elements` or `quality_dimensions`
 * @throws {Error} `code: 'RUBRIC_DUPLICATE_ID'` naming every repeated id in this list.
 */
function assertListIdsUnique(document, rubricPath, listName) {
  const entries = document[listName];
  if (!Array.isArray(entries)) return;

  // Insertion-ordered, so repeats are reported in the rubric's own order.
  const positionsById = new Map();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isPlainObject(entry) || typeof entry[ID_FIELD] !== "string") continue;
    const id = entry[ID_FIELD];
    const seen = positionsById.get(id);
    if (seen) seen.push(i);
    else positionsById.set(id, [i]);
  }

  const repeats = [...positionsById.entries()].filter(([, positions]) => positions.length > 1);
  if (repeats.length === 0) return;

  const rendered = repeats
    .map(([id, positions]) => `${id} (entries ${positions.join(", ")})`)
    .join(", ");

  const err = codedError(
    "RUBRIC_DUPLICATE_ID",
    `RUBRIC_DUPLICATE_ID: rubric "${rubricPath}" ${listName} declares ` +
      `${repeats.length} repeated ${repeats.length === 1 ? "id" : "ids"}: ${rendered}. ` +
      "An id must be unique within its own list — it is how a verdict is " +
      "attributed back to the entry that produced it, so two entries sharing " +
      "one are indistinguishable in a report. Ids are checked separately " +
      "within each list, so an element and a criterion may share a name.",
  );
  err.listName = listName;
  err.duplicateIds = repeats.map(([id]) => id);
  err.entryIds = repeats.map(([id]) => id);
  err.keyPaths = repeats.flatMap(([, positions]) =>
    positions.map((index) => `${listName}[${index}].${ID_FIELD}`),
  );
  err.duplicatePositions = Object.fromEntries(repeats);
  throw err;
}

/**
 * Reject a parsed rubric that repeats an id within either of its two lists,
 * elements first — the same schema-declaration order the earlier passes report
 * in.
 *
 * This is the last validation pass; a rubric that clears it is returned to the
 * caller.
 *
 * @param {object} document - the parsed rubric, already known to declare both lists
 * @param {string} rubricPath - the rubric path as the caller supplied it
 * @throws {Error} `code: 'RUBRIC_DUPLICATE_ID'` naming the repeated id and its list.
 */
function assertIdsUnique(document, rubricPath) {
  assertListIdsUnique(document, rubricPath, "required_elements");
  assertListIdsUnique(document, rubricPath, "quality_dimensions");
}

/**
 * Load a rubric's source from disk, refusing any path that escapes the project
 * root by traversal or by symlink.
 *
 * @param {string} rubricPath - rubric path, absolute or relative to `projectRoot`
 * @param {object} [options]
 * @param {string} [options.projectRoot] - containment boundary (default `process.cwd()`)
 * @returns {object} the validated Rubric — the parsed document, carrying every
 *   declared `required_elements` entry and every `quality_dimensions` entry
 *   (BEH-1). It is built fresh on every call and shared with nothing, so a
 *   caller may hold or mutate it without affecting any later load.
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
 * @throws {Error} `code: 'RUBRIC_INVALID_VERDICT'` if an entry DECLARES a
 *   `verdict` outside the enum for its kind (`ELEMENT_VERDICTS` for elements,
 *   `CRITERION_VERDICTS` for criteria); the message names the entry and the
 *   illegal value. Declaring no verdict at all is legal, and is what a rubric
 *   normally does.
 * @throws {Error} `code: 'RUBRIC_INVALID_BUDGET'` if any top-level
 *   `budget_max_*` key carries a value that is not a finite number greater than
 *   zero; the message names every offending key and the value it declared.
 *   Declaring no budget key at all is legal.
 * @throws {Error} `code: 'RUBRIC_LEGACY_SCALE'` if any `quality_dimensions`
 *   entry carries a NUMERIC `weight`, whatever its range — the binary-verdict
 *   schema has no such field, so the rubric predates the migration. The message
 *   names every weighted criterion and points at binary verdicts; the scale is
 *   never coerced.
 * @throws {Error} `code: 'RUBRIC_DUPLICATE_ID'` if either list declares the same
 *   id on more than one entry; the message names every repeated id, the list it
 *   repeats in, and the positions claiming it. Uniqueness is per-list: an
 *   element and a criterion sharing a name is legal.
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
  assertVerdictsLegal(document, rubricPath);
  assertBudgetsValid(document, rubricPath);
  assertNoLegacyWeights(document, rubricPath);
  assertIdsUnique(document, rubricPath);

  // Construction. Reached only when every pass above has succeeded — a throw
  // from any of them leaves no object for the caller to receive, which is the
  // "no partially-populated Rubric" postcondition expressed structurally rather
  // than by convention.
  //
  // The validated document IS the Rubric, and it is already a fresh tree:
  // `parseYaml` allocates new objects and arrays on every call and nothing here
  // is memoized, so two loads of one file are structurally identical yet share
  // no reference. Copying it again would buy no isolation that is not already
  // there.
  return document;
}
