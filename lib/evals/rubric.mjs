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

  return document;
}
