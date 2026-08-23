import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureThrow, cleanupTempDir, createTempDir, PLUGIN_ROOT } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";

// The fixture paths below are relative to the repository root, which is what
// PLUGIN_ROOT resolves to.
const repoRoot = PLUGIN_ROOT;

/**
 * Load `source` as a rubric from a throwaway root and return the error it
 * threw. The on-disk fixtures cover the shapes later suites also read; these
 * one-off shapes exist only to pin a single branch of the nesting walk, so
 * they live inline rather than adding files every later suite would inherit.
 */
function loadSourceExpectingThrow(source) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), source);
    return captureThrow(() => loadRubric("rubric.yaml", { projectRoot: root }));
  } finally {
    cleanupTempDir(root);
  }
}

test("a nested map below a top-level key is rejected, naming the key path", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/nested-map.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_NESTED_MAP");
  assert.match(err.message, /budgets\.max_turns/); // the offending key path, not just the top key
});

test("the two sanctioned list-of-flat-maps shapes are not treated as nesting", () => {
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.ok(Array.isArray(rubric.required_elements));
  assert.ok(Array.isArray(rubric.quality_dimensions));
});

test("a malformed YAML document surfaces as a coded rubric error, not a raw YamlParseError", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/malformed.yaml", { projectRoot: repoRoot }),
  );
  assert.ok(typeof err.code === "string" && err.code.startsWith("RUBRIC_"));
  // Pin the specific code too: the prefix check alone would also accept
  // RUBRIC_NOT_FOUND, so it would stay green if the fixture path ever broke.
  assert.equal(err.code, "RUBRIC_PARSE_ERROR");
});

test("a document that parses to a list, not a map, is a coded parse error", () => {
  const err = loadSourceExpectingThrow("- one\n- two\n");
  assert.equal(err.code, "RUBRIC_PARSE_ERROR");
  assert.match(err.message, /top level/);
});

test("a list-item property holding a list is nesting, named at the item index", () => {
  const err = loadSourceExpectingThrow(
    "quality_dimensions:\n  - id: readability_naming\n    tags: [a, b]\n",
  );
  assert.equal(err.code, "RUBRIC_NESTED_MAP");
  assert.match(err.message, /quality_dimensions\[0\]\.tags/);
});

test("a list-item property holding a map is nesting, named one level deeper", () => {
  const err = loadSourceExpectingThrow(
    "quality_dimensions:\n  - id: a\n  - id: b\n  - id: c\n    thresholds: { high: 5 }\n",
  );
  assert.equal(err.code, "RUBRIC_NESTED_MAP");
  assert.match(err.message, /quality_dimensions\[2\]\.thresholds\.high/);
});

test("a key written with no value is rejected, and is not told to flatten a block", () => {
  // The YAML reader materialises a valueless key as an empty map, so it cannot
  // tell a blank key from a nested block. Both are rejected, but the advice
  // differs — an author who wrote nothing must not be told to flatten nothing.
  const err = loadSourceExpectingThrow("rubric_id: x\nunknown_policy:\n");
  assert.equal(err.code, "RUBRIC_NESTED_MAP");
  assert.match(err.message, /unknown_policy/);
  assert.match(err.message, /no value/);
  assert.doesNotMatch(err.message, /undefined/);
});
