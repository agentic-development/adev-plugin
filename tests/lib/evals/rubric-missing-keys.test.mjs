import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureThrow, cleanupTempDir, createTempDir, PLUGIN_ROOT } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { REQUIRED_TOP_LEVEL_KEYS } from "../../../lib/evals/rubric-schema.mjs";

// The fixture paths below are relative to the repository root, which is what
// PLUGIN_ROOT resolves to.
const repoRoot = PLUGIN_ROOT;

test("every missing key is listed in one error, not just the first", () => {
  // fixture omits three required keys: layer, unknown_policy, judged_criterion_points
  const err = captureThrow(() =>
    loadRubric("tests/fixtures/evals/rubrics/missing-keys.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_MISSING_KEY");
  for (const key of ["layer", "unknown_policy", "judged_criterion_points"]) {
    assert.match(err.message, new RegExp(key), `message omits ${key}`);
  }
});

test("a key present but empty still counts as declared", () => {
  // BEH-3 is about absence, not emptiness; an empty value is another pass's problem.
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.ok(rubric);

  // Stronger than the fixture check alone: a rubric declaring all twelve
  // required keys but leaving one of them an explicitly empty string is complete
  // as far as THIS pass is concerned, so it must not raise RUBRIC_MISSING_KEY.
  // The empty value is written as `""` rather than left blank because the YAML
  // reader materialises a valueless key as an empty map, which the earlier
  // nesting pass rejects before the missing-key pass ever sees it.
  const source = REQUIRED_TOP_LEVEL_KEYS.map((key) =>
    key === "unknown_policy" ? `${key}: ""` : `${key}: "placeholder"`,
  ).join("\n");

  const root = createTempDir();
  try {
    writeFileSync(join(root, "rubric.yaml"), `${source}\n`);
    const loaded = loadRubric("rubric.yaml", { projectRoot: root });
    assert.equal(loaded.unknown_policy, "");
  } finally {
    cleanupTempDir(root);
  }
});
