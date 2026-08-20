import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";
import { captureThrow } from "../../helpers.mjs";

const load = (name) => loadRubric(`tests/fixtures/evals/rubrics/${name}.yaml`);

test("a non-numeric threshold is rejected before any tallying, naming the value", () => {
  const err = captureThrow(() => scoreRubric(load("threshold-non-numeric"), []));
  assert.equal(err.code, "SCORE_INVALID_THRESHOLD");
  assert.match(err.message, /forty/);
});

test("a threshold outside [0, 100] is rejected, naming the value", () => {
  const err = captureThrow(() => scoreRubric(load("threshold-out-of-range"), []));
  assert.equal(err.code, "SCORE_INVALID_THRESHOLD");
  assert.match(err.message, /140/);
});

test("the boundary values 0 and 100 are in range and do not throw here", () => {
  // threshold: 100 is explicitly legal — see BEH-3 clause 1, which is the only
  // path that catches an all-unknown judged half at this threshold (Task 5).
  assert.doesNotThrow(() => scoreRubric(load("threshold-100"), []), /SCORE_INVALID_THRESHOLD/);
});

test("threshold validation runs before verdict-set validation", () => {
  // A rubric with a bad threshold AND a verdict set that is also invalid must
  // report the threshold: "before any tallying" is an ordering claim, not a hint.
  const err = captureThrow(() =>
    scoreRubric(load("threshold-non-numeric"), [{ id: "no_such_id", value: "met", evidence: "x" }]));
  assert.equal(err.code, "SCORE_INVALID_THRESHOLD");
});

test("an object that did not come from loadRubric is rejected by origin", () => {
  const err = captureThrow(() => scoreRubric({ rubric_id: "hand-rolled" }, []));
  assert.equal(err.code, "SCORE_INVALID_RUBRIC");
  assert.match(err.message, /loadRubric/);
});
