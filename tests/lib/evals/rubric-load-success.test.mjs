/**
 * BEH-1 and the four Postconditions — the successful load.
 *
 * Every other rubric suite pins a REJECTION; this one pins what a conforming
 * rubric actually gets back, and the properties that must hold of it:
 *
 *   - a Rubric carrying every declared element and criterion (BEH-1);
 *   - element ids and criterion ids each unique WITHIN their own list, with a
 *     duplicate refused as `RUBRIC_DUPLICATE_ID` (Error Cases table);
 *   - no partially-populated Rubric on a failed load — validation completes
 *     before anything is returned;
 *   - no filesystem writes, no spawned process, no network connection;
 *   - no cache: the same file loaded twice yields structurally identical but
 *     DISTINCT objects, so a caller mutating one cannot poison the next load.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { captureThrow, cleanupTempDir, createTempDir, PLUGIN_ROOT } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";

// The fixture paths below are relative to the repository root, which is what
// PLUGIN_ROOT resolves to.
const repoRoot = PLUGIN_ROOT;

/**
 * Build a one-off rubric source that clears every earlier pass — all twelve
 * required top-level keys, complete entries throughout — with caller-supplied
 * ids for the two lists, so a case can probe uniqueness without carrying a
 * dedicated on-disk fixture.
 *
 * @param {object} [ids]
 * @param {string[]} [ids.elementIds] - ids for the `required_elements` entries
 * @param {string[]} [ids.criterionIds] - ids for the `quality_dimensions` entries
 * @returns {string} the rubric source
 */
function buildSource({ elementIds = ["e1"], criterionIds = ["c1"] } = {}) {
  const elements = elementIds.flatMap((id) => [
    `  - id: ${id}`,
    '    source: "the diff file list"',
    '    met_when: "no changed source file lacks a corresponding test change"',
  ]);
  const criteria = criterionIds.flatMap((id) => [
    `  - id: ${id}`,
    '    criterion: "is every new symbol legible from its signature alone"',
    '    reference: "the matched golden sample"',
    '    met_when: "every new symbol reads clearly"',
    '    not_met_when: "at least one new symbol does not"',
    '    unknown_when: "no golden sample exists"',
  ]);
  return [
    'rubric_id: "x"',
    "version: 1",
    "layer: 3",
    'verdict_values: "met | not_met | unknown"',
    "required_elements:",
    ...elements,
    "quality_dimensions:",
    ...criteria,
    "layer3_max_points: 25",
    "required_element_points: 10",
    "judged_criterion_points: 15",
    'unknown_policy: "exclude_from_denominator"',
    'not_applicable_policy: "exclude_from_denominator"',
    "insufficient_evidence_threshold_percent: 40",
  ].join("\n");
}

/**
 * Load a one-off rubric built by {@link buildSource} from a throwaway root.
 *
 * @param {object} [ids] - forwarded to {@link buildSource}
 * @returns {object} the loaded rubric
 */
function loadInline(ids) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${buildSource(ids)}\n`);
    return loadRubric("rubric.yaml", { projectRoot: root });
  } finally {
    cleanupTempDir(root);
  }
}

/**
 * As {@link loadInline}, but asserts the load threw and returns the error.
 *
 * @param {object} [ids] - forwarded to {@link buildSource}
 * @returns {Error} the error the load threw
 */
function loadInlineExpectingThrow(ids) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${buildSource(ids)}\n`);
    return captureThrow(() => loadRubric("rubric.yaml", { projectRoot: root }));
  } finally {
    cleanupTempDir(root);
  }
}

/**
 * Snapshot a directory tree as sorted `<relative path>|<size>` lines, so a
 * write of any kind — a new file, a truncation, an appended byte — shows up as
 * a different snapshot.
 *
 * @param {string} root - directory to walk
 * @param {string} [base] - the path relative names are taken against
 * @returns {string[]} sorted entry descriptions
 */
function snapshotTree(root, base = root) {
  const lines = [];
  for (const name of readdirSync(root).sort()) {
    const full = join(root, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      lines.push(`${relative(base, full)}/`);
      lines.push(...snapshotTree(full, base));
    } else {
      lines.push(`${relative(base, full)}|${stats.size}`);
    }
  }
  return lines.sort();
}

test("a conforming rubric exposes every declared element and criterion", () => {
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.equal(rubric.required_elements.length, 2);
  assert.equal(rubric.quality_dimensions.length, 2);
  assert.equal(rubric.rubric_id, "fixture-conforming");
});

test("the real shipped default rubric loads", () => {
  // guards against the schema drifting away from the artifact it describes
  const rubric = loadRubric("skills/eval/default-rubric.yaml", { projectRoot: repoRoot });
  assert.ok(rubric.required_elements.length > 0);
  assert.ok(rubric.quality_dimensions.length > 0);
});

test("duplicate element or criterion ids are rejected, naming the id", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/duplicate-ids.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_DUPLICATE_ID");
  assert.match(err.message, /spec_criteria_referenced/);
});

test("loading twice in one process yields structurally identical objects — no cache", () => {
  const a = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  const b = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.deepEqual(a, b);
  assert.notEqual(a, b); // distinct objects: no shared mutable state between calls
});

test("a failed load exposes no partial Rubric", () => {
  // every rejecting fixture must throw rather than return a half-built object
  for (const f of ["missing-keys", "invalid-budget-nonpositive", "legacy-weight-scale", "duplicate-ids"]) {
    assert.throws(
      () => loadRubric(`tests/fixtures/evals/rubrics/${f}.yaml`, { projectRoot: repoRoot }),
      (e) => typeof e.code === "string",
    );
  }
});

// --- strengthening tests -----------------------------------------------------

test("a duplicate id inside quality_dimensions is rejected too — the check is per-list", () => {
  // The on-disk fixture duplicates an ELEMENT id; nothing about that proves the
  // criterion list is checked at all.
  const err = loadInlineExpectingThrow({ criterionIds: ["c1", "c1"] });
  assert.equal(err.code, "RUBRIC_DUPLICATE_ID");
  assert.match(err.message, /quality_dimensions/);
  assert.match(err.message, /c1/);
});

test("an element id matching a criterion id is not a duplicate — uniqueness is within each list", () => {
  // The two lists answer different questions (deterministic checks vs judged
  // criteria), so the same name in both is a legal, if unusual, rubric.
  const rubric = loadInline({ elementIds: ["shared_id"], criterionIds: ["shared_id"] });
  assert.equal(rubric.required_elements[0].id, "shared_id");
  assert.equal(rubric.quality_dimensions[0].id, "shared_id");
});

test("mutating a returned rubric cannot affect a later load", () => {
  const first = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  const originalLength = first.required_elements.length;
  first.required_elements.push({ id: "injected_by_caller" });
  first.rubric_id = "mutated-by-caller";

  const second = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.equal(second.required_elements.length, originalLength);
  assert.equal(second.rubric_id, "fixture-conforming");
});

test("a successful load writes nothing into the project root", () => {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${buildSource()}\n`);
    const before = snapshotTree(root);
    loadRubric("rubric.yaml", { projectRoot: root });
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    cleanupTempDir(root);
  }
});

test("the loader module imports no network, process-spawning, or socket built-in", () => {
  // A STATIC check over the module's own import lines, not a runtime one: the
  // postcondition is about what the loader is capable of reaching for, and
  // monkey-patching globals would only prove that this one call path stayed
  // quiet.
  const source = readFileSync(join(repoRoot, "lib/evals/rubric.mjs"), "utf8");
  const importLines = source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+"/.test(line));
  const forbidden = ["node:http", "node:https", "node:net", "node:dgram", "node:child_process"];
  for (const mod of forbidden) {
    assert.ok(
      !importLines.some((line) => line.includes(mod)),
      `lib/evals/rubric.mjs must not import ${mod}`,
    );
  }
});
