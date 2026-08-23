import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const rubric = () => loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
const allMet = () => [
  { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
  { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every file" },
  { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
  { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
];

test("a complete verdict set returns the table and both halves as distinct fields", () => {
  const result = scoreRubric(rubric(), allMet());
  assert.equal(result.verdicts.length, 4);
  assert.deepEqual(result.verdicts.map((v) => v.kind), ["element", "element", "criterion", "criterion"]);
  assert.deepEqual(result.deterministic, { status: null, points: 10, max: 10 });
  assert.deepEqual(result.judged, { status: null, points: 15, max: 15 });
});

test("the blended total appears only when both halves are numeric, rounded and capped", () => {
  const both = scoreRubric(rubric(), allMet());
  assert.deepEqual(both.total, { points: 25, max: 25 });   // 10 + 15, capped at layer3_max_points

  const oneStatus = scoreRubric(rubric(), [
    ...allMet().slice(0, 2),
    { id: "readability_naming", value: "unknown", evidence: "" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(oneStatus.total, null);
});

test("the total is rounded, and a status half never contributes a 0", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "a" },
    { id: "tests_accompany_source", value: "not_met", evidence: "b" },
    { id: "readability_naming", value: "met", evidence: "c" },
    { id: "separation_of_concerns", value: "not_met", evidence: "d" },
  ]);
  assert.equal(result.total.points, Math.round(5 + 7.5));
  assert.ok(Number.isInteger(result.total.points));
});

test("the verdict table always accompanies the numbers", () => {
  const result = scoreRubric(rubric(), allMet());
  assert.ok(Array.isArray(result.verdicts) && result.verdicts.length > 0,
    "a numeric aggregate is never returned without its verdict table");
});

test("identical inputs produce a deeply identical result across runs", () => {
  const a = scoreRubric(rubric(), allMet());
  const b = scoreRubric(rubric(), allMet());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "key order is stable, so output is byte-identical");
});

test("a rejected verdict set produces no partial score", () => {
  assert.throws(() => scoreRubric(rubric(), allMet().slice(0, 2)), (err) => {
    assert.equal(err.code, "SCORE_MISSING_VERDICT");
    assert.equal(err.result, undefined, "no half-built result rides along on the error");
    return true;
  });
});
