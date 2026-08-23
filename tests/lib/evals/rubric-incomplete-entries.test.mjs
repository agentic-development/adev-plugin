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
 * The ten other required top-level keys, so a one-off source clears the
 * required-key pass and reaches the completeness pass. `required_elements` and
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

/**
 * Load `source` as a rubric from a throwaway root and return the error it
 * threw. Used for the degenerate shapes (a scalar where a list belongs, a
 * scalar list item) that no on-disk fixture should teach later suites to copy.
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

test("a required_elements entry missing met_when throws RUBRIC_INCOMPLETE_ELEMENT naming the id", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/incomplete-element.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_ELEMENT");
  assert.match(err.message, /tests_accompany_source/); // the entry id
});

test("a quality_dimensions entry missing unknown_when names the id AND the missing field", () => {
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/incomplete-criterion.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_CRITERION");
  assert.match(err.message, /naming_clarity/);
  assert.match(err.message, /unknown_when/);
});

test("an entry with no id at all is reported by its list position, never as undefined", () => {
  // dedicated fixture: element[1] declares source + met_when but no id, so this
  // exercises the entry[<index>] fallback rather than re-testing the id path.
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/element-without-id.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_ELEMENT");
  assert.match(err.message, /required_elements\[1\]/);
  assert.doesNotMatch(err.message, /undefined/);
});

test("the conforming fixture still loads through the completeness pass", () => {
  // Guards against an over-strict check: `not_applicable_when` is optional on
  // elements, and no conforming entry may be rejected for omitting it.
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", {
    projectRoot: repoRoot,
  });
  assert.equal(rubric.required_elements.length, 2);
  assert.equal(rubric.quality_dimensions.length, 2);
});

test("a scalar where required_elements belongs passes this pass, and never raises a TypeError", () => {
  // The list keys are guaranteed PRESENT by the required-key pass but not
  // guaranteed to be lists. Whether the value is a list at all is a later
  // value-validation concern — rubric-missing-keys.test.mjs already pins a
  // rubric declaring every required key as a scalar placeholder as loadable —
  // so this pass must step over it rather than read properties off a string.
  const root = createTempDir();
  try {
    writeFileSync(
      join(root, "rubric.yaml"),
      `${OTHER_REQUIRED_KEYS}\nrequired_elements: "oops"\nquality_dimensions: "oops"\n`,
    );
    const loaded = loadRubric("rubric.yaml", { projectRoot: root });
    assert.equal(loaded.required_elements, "oops");
  } finally {
    cleanupTempDir(root);
  }
});

test("a scalar list item is incomplete at its index, not a TypeError", () => {
  const err = loadSourceExpectingThrow(
    `${OTHER_REQUIRED_KEYS}\nrequired_elements: []\nquality_dimensions:\n  - oops\n`,
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_CRITERION");
  assert.match(err.message, /quality_dimensions\[0\]/);
  assert.doesNotMatch(err.message, /undefined/);
});

test("a field present but empty-string counts as declared", () => {
  // Matches the required-key pass's absence-not-emptiness rule: an empty value
  // is a later pass's problem, not this one's.
  const root = createTempDir();
  try {
    const source =
      `${OTHER_REQUIRED_KEYS}\n` +
      "required_elements:\n" +
      '  - id: e0\n    source: ""\n    met_when: ""\n' +
      "quality_dimensions:\n" +
      '  - id: c0\n    criterion: ""\n    reference: ""\n' +
      '    met_when: ""\n    not_met_when: ""\n    unknown_when: ""\n';
    writeFileSync(join(root, "rubric.yaml"), source);
    const loaded = loadRubric("rubric.yaml", { projectRoot: root });
    assert.equal(loaded.required_elements[0].met_when, "");
  } finally {
    cleanupTempDir(root);
  }
});
