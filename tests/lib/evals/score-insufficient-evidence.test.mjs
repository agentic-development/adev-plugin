import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const load = (n) => loadRubric(`tests/fixtures/evals/rubrics/${n}.yaml`);
const elementsMet = [
  { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
  { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every file" },
];

test("clause 2: an unknown share above the threshold sets the judged half to a status", () => {
  // conforming.yaml threshold is 40; 1 unknown of 2 criteria is 50% > 40%.
  const result = scoreRubric(load("conforming"), [
    ...elementsMet,
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.judged.points, null);
});

test("the deterministic half is unaffected and keeps its points and maximum", () => {
  const result = scoreRubric(load("conforming"), [
    ...elementsMet,
    { id: "readability_naming", value: "unknown", evidence: "" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.deterministic.status, null);
  assert.equal(result.deterministic.points, 10);
  assert.equal(result.deterministic.max, 10);
  assert.equal(result.total, null, "no blended total when one half carries a status");
});

test("clause 1 at threshold 100: an all-unknown judged half is INSUFFICIENT_EVIDENCE anyway", () => {
  // REGRESSION GUARD — review round 3. threshold: 100 is in range (Task 2), and
  // an unknown share of 100 does NOT exceed 100, so clause 2 cannot fire. Only
  // the threshold-independent clause 1 keeps this half off the numeric path.
  // If this test fails with NaN or a division-by-zero value, clause 1 was deleted.
  const result = scoreRubric(load("threshold-100"), [
    ...elementsMet,
    { id: "readability_naming", value: "unknown", evidence: "" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.judged.points, null);
  assert.notEqual(result.judged.points, 0, "a status half is never reported as 0");
});

test("a share exactly at the threshold does not trip clause 2", () => {
  // 1 unknown of 2 is 50%; a rubric with threshold 50 must still score numerically,
  // because the spec says "exceeds", not "reaches".
  const result = scoreRubric(load("threshold-50"), [
    ...elementsMet,
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, null);
  assert.equal(result.judged.points, 15);
});
