import { test } from "node:test";
import assert from "node:assert/strict";
import { captureThrow } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { buildJudgeContext } from "../../../lib/evals/score.mjs";

const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
const [first, second] = rubric.quality_dimensions;

test("the context carries the criterion's own fields", () => {
  const ctx = buildJudgeContext(first);
  for (const field of ["id", "criterion", "reference", "met_when", "not_met_when", "unknown_when"]) {
    assert.equal(ctx[field], first[field], `missing or altered ${field}`);
  }
});

test("no other criterion's id, verdict, or wording appears anywhere in the output", () => {
  const serialized = JSON.stringify(buildJudgeContext(first));
  assert.ok(!serialized.includes(second.id), "leaked a sibling criterion id");
  assert.ok(!serialized.includes(second.criterion), "leaked a sibling criterion's wording");
});

test("no running total and no verdict field is present", () => {
  const ctx = buildJudgeContext(first);
  const keys = Object.keys(ctx);
  for (const forbidden of ["total", "points", "score", "verdict", "verdicts", "deterministic", "judged"]) {
    assert.ok(!keys.includes(forbidden), `context exposes ${forbidden}`);
  }
});

test("the builder takes one criterion and cannot be handed the whole rubric", () => {
  const err = captureThrow(() => buildJudgeContext(rubric));
  assert.equal(err.code, "SCORE_INVALID_VERDICT_CONTEXT");
});

test("mutating the returned context cannot reach back into the rubric", () => {
  const ctx = buildJudgeContext(first);
  ctx.criterion = "tampered";
  assert.notEqual(rubric.quality_dimensions[0].criterion, "tampered");
});

test("the output's keys are exactly the six allow-listed fields, even when the input carries adversarial extras", () => {
  // Pins the allow-list shape: a delete-list would pass every prior test yet still leak these.
  const adversarial = {
    ...first,
    verdict: "met",
    points: 12,
    sibling_id: "other",
    total: { score: 99, of: 100 },
  };
  const ctx = buildJudgeContext(adversarial);
  assert.deepEqual(
    [...Object.keys(ctx)].sort(),
    ["criterion", "id", "met_when", "not_met_when", "reference", "unknown_when"],
  );
  for (const forbidden of ["verdict", "points", "sibling_id", "total"]) {
    assert.ok(!(forbidden in ctx), `context exposes adversarial key ${forbidden}`);
  }
});

test("a criterion whose required fields are all present but undefined is rejected, not silently emptied", () => {
  // Pins that the guard is presence-AND-value, not presence-only: a
  // presence-only check would let this through and return an object of
  // undefineds instead of throwing.
  const err = captureThrow(() =>
    buildJudgeContext({
      id: undefined,
      criterion: undefined,
      reference: undefined,
      met_when: undefined,
      not_met_when: undefined,
      unknown_when: undefined,
    }),
  );
  assert.equal(err.code, "SCORE_INVALID_VERDICT_CONTEXT");
});
