import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const load = (n) => loadRubric(`tests/fixtures/evals/rubrics/${n}.yaml`);

test("a half the rubric declares no entries for is NOT_SCORED", () => {
  const result = scoreRubric(load("no-quality-dimensions"), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every file" },
  ]);
  assert.equal(result.judged.status, "NOT_SCORED");
  assert.equal(result.judged.points, null);
  assert.equal(result.judged.max, null);
  assert.equal(result.deterministic.points, 10);
  assert.equal(result.total, null);
});

test("the mirror case: no required_elements makes the deterministic half NOT_SCORED", () => {
  const result = scoreRubric(load("no-required-elements"), [
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
  ]);
  assert.equal(result.deterministic.status, "NOT_SCORED");
  assert.equal(result.judged.points, 15);
});

test("a deterministic half where every entry is not_applicable is NOT_SCORED", () => {
  const result = scoreRubric(load("conforming"), [
    { id: "spec_criteria_referenced", value: "not_applicable", evidence: "" },
    { id: "tests_accompany_source", value: "not_applicable", evidence: "" },
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
  ]);
  assert.equal(result.deterministic.status, "NOT_SCORED");
  assert.equal(result.deterministic.points, null);
  assert.equal(result.judged.points, 15);
});

test("no NaN and no division-by-zero value reaches the caller in any not-scored case", () => {
  for (const fixture of ["no-quality-dimensions", "no-required-elements"]) {
    const rubric = load(fixture);
    const verdicts = [...(rubric.required_elements ?? []), ...(rubric.quality_dimensions ?? [])]
      .map((e) => ({ id: e.id, value: "met", evidence: "e" }));
    const result = scoreRubric(rubric, verdicts);
    for (const half of [result.deterministic, result.judged]) {
      assert.ok(half.points === null || Number.isFinite(half.points), `${fixture}: ${half.points}`);
    }
  }
});
