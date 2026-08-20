import { test } from "node:test";
import assert from "node:assert/strict";
import { HALF_STATUSES, SCORE_ERROR_CODES, VERDICT_KINDS } from "../../../lib/evals/score-schema.mjs";

test("the half-status set is closed and holds exactly the two spec statuses", () => {
  assert.deepEqual([...HALF_STATUSES].sort(), ["INSUFFICIENT_EVIDENCE", "NOT_SCORED"]);
  assert.ok(Object.isFrozen(HALF_STATUSES));
});

test("every error code named in the spec's Error Cases table is declared", () => {
  for (const code of [
    "SCORE_EMPTY_EVIDENCE", "SCORE_UNKNOWN_VERDICT_ID", "SCORE_MISSING_VERDICT",
    "SCORE_INVALID_VERDICT", "SCORE_DUPLICATE_VERDICT", "SCORE_INVALID_RUBRIC",
    "SCORE_INVALID_THRESHOLD", "UNSAFE_SCORE_PATH", "SCORE_INPUT_NOT_FOUND",
    "SCORE_INVALID_VERDICT_CONTEXT", "SCORE_INPUT_PARSE_ERROR",
    "SCORE_DEFAULT_RUBRIC_MISSING",
  ]) {
    assert.ok(SCORE_ERROR_CODES.includes(code), `missing code ${code}`);
  }
  assert.ok(Object.isFrozen(SCORE_ERROR_CODES));
});

test("the two verdict kinds name the two rubric lists and nothing else", () => {
  assert.deepEqual([...VERDICT_KINDS].sort(), ["criterion", "element"]);
  assert.ok(Object.isFrozen(VERDICT_KINDS));
});
