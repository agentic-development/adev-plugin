import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const rubric = () => loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
// conforming.yaml budgets: required_element_points 10, judged_criterion_points 15.

test("not_applicable leaves the element denominator, so one met of one answered is full points", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "not_applicable", evidence: "" },
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
  ]);
  assert.equal(result.deterministic.status, null);
  assert.equal(result.deterministic.points, 10);   // 1/1 * 10, NOT 1/2 * 10
  assert.equal(result.deterministic.max, 10);
});

test("unknown leaves the criterion denominator, so one met of one answered is full points", () => {
  // threshold-100.yaml carries conforming.yaml's budgets with a threshold of 100, so the
  // 50% unknown share below does not trip BEH-3 clause 2 and this stays a test of
  // denominator exclusion rather than of the insufficient-evidence guard.
  const result = scoreRubric(loadRubric("tests/fixtures/evals/rubrics/threshold-100.yaml"), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "not_met", evidence: "lib/y.mjs has no test" },
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, null);
  assert.equal(result.judged.points, 15);          // 1/1 * 15, NOT 1/2 * 15
  assert.equal(result.judged.max, 15);
});

test("not_met stays in the denominator and earns nothing", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "not_met", evidence: "lib/y.mjs has no test" },
    { id: "readability_naming", value: "not_met", evidence: "lib/x.mjs:4 is opaque" },
    { id: "separation_of_concerns", value: "not_met", evidence: "lib/x.mjs:9 mixes concerns" },
  ]);
  assert.equal(result.deterministic.points, 5);    // 1/2 * 10
  assert.equal(result.judged.points, 0);           // 0/2 * 15 — scored, earned nothing
  assert.equal(result.judged.status, null);        // and NOT a status: 0 is a real score
});

test("a half's max is its own budget, never the layer total", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "a" },
    { id: "tests_accompany_source", value: "met", evidence: "b" },
    { id: "readability_naming", value: "met", evidence: "c" },
    { id: "separation_of_concerns", value: "met", evidence: "d" },
  ]);
  assert.equal(result.deterministic.max, 10);
  assert.equal(result.judged.max, 15);
});
