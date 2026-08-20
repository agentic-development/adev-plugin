import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureThrow, cleanupTempDir, createTempDir, PLUGIN_ROOT } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { CRITERION_VERDICTS, ELEMENT_VERDICTS } from "../../../lib/evals/rubric-schema.mjs";

// The fixture paths below are relative to the repository root, which is what
// PLUGIN_ROOT resolves to.
const repoRoot = PLUGIN_ROOT;

/**
 * The ten other required top-level keys, so a one-off source clears the
 * required-key pass and reaches the verdict pass. `required_elements` and
 * `quality_dimensions` are supplied by each caller, since they are what these
 * one-off shapes exist to vary.
 */
const OTHER_REQUIRED_KEYS = [
  'rubric_id: "x"',
  "version: 1",
  "layer: 3",
  'verdict_values: "met | not_met | unknown"',
  "layer3_max_points: 25",
  "required_element_points: 10",
  "judged_criterion_points: 15",
  'unknown_policy: "exclude_from_denominator"',
  'not_applicable_policy: "exclude_from_denominator"',
  "insufficient_evidence_threshold_percent: 40",
].join("\n");

/** A complete element entry, with `extra` appended verbatim inside the entry. */
function elementEntry(extra = "") {
  return `  - id: e0\n    source: "s"\n    met_when: "m"\n${extra}`;
}

/** A complete criterion entry, with `extra` appended verbatim inside the entry. */
function criterionEntry(extra = "") {
  return (
    `  - id: c0\n    criterion: "c"\n    reference: "r"\n` +
    `    met_when: "m"\n    not_met_when: "n"\n    unknown_when: "u"\n${extra}`
  );
}

/** Assemble a full rubric source from the two list bodies. */
function rubricSource(elements, criteria) {
  return (
    `${OTHER_REQUIRED_KEYS}\n` +
    `required_elements:\n${elements}` +
    `quality_dimensions:\n${criteria}`
  );
}

/** Load `source` as a rubric from a throwaway root, returning the loaded document. */
function loadSource(source) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), source);
    return loadRubric("rubric.yaml", { projectRoot: root });
  } finally {
    cleanupTempDir(root);
  }
}

/** Load `source` as a rubric from a throwaway root, returning the error it threw. */
function loadSourceExpectingThrow(source) {
  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), source);
    return captureThrow(() => loadRubric("rubric.yaml", { projectRoot: root }));
  } finally {
    cleanupTempDir(root);
  }
}

test("an element declaring unknown is rejected — elements never resolve to unknown", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-element-verdict.yaml", {
      projectRoot: repoRoot,
    }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /no_debug_residue/); // entry id
  assert.match(err.message, /unknown/); // the illegal value
});

test("a criterion declaring not_applicable is rejected — criteria never resolve to not_applicable", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-criterion-verdict.yaml", {
      projectRoot: repoRoot,
    }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /not_applicable/);
});

test("the conforming fixture passes the verdict pass unchanged", () => {
  assert.ok(loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot }));
});

test("every ELEMENT_VERDICTS value is accepted on an element", () => {
  for (const verdict of ELEMENT_VERDICTS) {
    const loaded = loadSource(
      rubricSource(elementEntry(`    verdict: ${verdict}\n`), criterionEntry()),
    );
    assert.equal(loaded.required_elements[0].verdict, verdict);
  }
});

test("an element declaring unknown — legal for criteria, not for elements — is rejected", () => {
  // The mirror of the fixture-driven test 1, built inline so the two enums are
  // pinned as DIFFERENT sets rather than one shared set.
  const err = loadSourceExpectingThrow(
    rubricSource(elementEntry("    verdict: unknown\n"), criterionEntry()),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /e0/);
  assert.match(err.message, /unknown/);
});

test("every CRITERION_VERDICTS value is accepted on a criterion", () => {
  for (const verdict of CRITERION_VERDICTS) {
    const loaded = loadSource(
      rubricSource(elementEntry(), criterionEntry(`    verdict: ${verdict}\n`)),
    );
    assert.equal(loaded.quality_dimensions[0].verdict, verdict);
  }
});

test("a criterion pinning not_applicable is named by its entry id in the message", () => {
  // Fixture-driven test 2 asserts only the illegal value; the entry id matters
  // just as much, since it is what an author searches the file for.
  const err = loadSourceExpectingThrow(
    rubricSource(elementEntry(), criterionEntry("    verdict: not_applicable\n")),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /c0/);
  assert.match(err.message, /not_applicable/);
});

test("an entry declaring no verdict at all loads — a declared verdict is optional", () => {
  // The pass validates a DECLARED verdict; it never requires one. A rubric
  // normally omits the key entirely, which is why conforming.yaml loads.
  const loaded = loadSource(rubricSource(elementEntry(), criterionEntry()));
  assert.equal("verdict" in loaded.required_elements[0], false);
  assert.equal("verdict" in loaded.quality_dimensions[0], false);
});

test("a non-string declared verdict is rejected with the same code, not a TypeError", () => {
  for (const literal of ["3", "true", "null"]) {
    const err = loadSourceExpectingThrow(
      rubricSource(elementEntry(`    verdict: ${literal}\n`), criterionEntry()),
    );
    assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
    assert.match(err.message, /e0/);
  }
});

test("an id-less entry declaring an illegal verdict is named by position, never as undefined", () => {
  const err = loadSourceExpectingThrow(
    rubricSource(
      elementEntry(),
      `  - id: ""\n    criterion: "c"\n    reference: "r"\n    met_when: "m"\n` +
        `    not_met_when: "n"\n    unknown_when: "u"\n    verdict: not_applicable\n`,
    ),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /quality_dimensions\[0\]/);
  assert.doesNotMatch(err.message, /undefined/);
});
