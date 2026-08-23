import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHalfStatus } from "../../../lib/evals/score.mjs";

// The partition, stated as data, exactly as the plan's table states it.
const judged = (declared, unknownCount, threshold) =>
  resolveHalfStatus({ kind: "criterion", declared, excluded: unknownCount, threshold });
const deterministic = (declared, naCount) =>
  resolveHalfStatus({ kind: "element", declared, excluded: naCount, threshold: 40 });

test("the judged rows of the partition resolve as the table says", () => {
  assert.equal(judged(0, 0, 40), "NOT_SCORED");
  assert.equal(judged(2, 2, 40), "INSUFFICIENT_EVIDENCE");
  assert.equal(judged(2, 2, 100), "INSUFFICIENT_EVIDENCE"); // clause 1, threshold-independent
  assert.equal(judged(4, 3, 40), "INSUFFICIENT_EVIDENCE");  // 75% > 40%
  assert.equal(judged(4, 1, 40), null);                     // 25% <= 40% → numeric
});

test("the deterministic rows of the partition resolve as the table says", () => {
  assert.equal(deterministic(0, 0), "NOT_SCORED");
  assert.equal(deterministic(2, 2), "NOT_SCORED");
  assert.equal(deterministic(2, 1), null);
});

test("exhaustive sweep: every half either carries a status or has a denominator >= 1", () => {
  for (const kind of ["element", "criterion"]) {
    for (let declared = 0; declared <= 6; declared++) {
      for (let excluded = 0; excluded <= declared; excluded++) {
        for (const threshold of [0, 40, 50, 99, 100]) {
          const status = resolveHalfStatus({ kind, declared, excluded, threshold });
          if (status === null) {
            assert.ok(declared - excluded >= 1,
              `numeric with zero denominator at ${kind}/${declared}/${excluded}/${threshold}`);
          } else {
            assert.ok(["INSUFFICIENT_EVIDENCE", "NOT_SCORED"].includes(status));
          }
        }
      }
    }
  }
});

test("mutual exclusivity: the resolver returns one status, never a set", () => {
  // INSUFFICIENT_EVIDENCE requires declared >= 1; NOT_SCORED requires nothing
  // answerable. No input satisfies both, so a single return value is sound.
  assert.equal(judged(0, 0, 100), "NOT_SCORED", "an empty judged half is never INSUFFICIENT_EVIDENCE");
  assert.equal(deterministic(0, 0), "NOT_SCORED");
  assert.notEqual(judged(3, 3, 40), "NOT_SCORED", "declared-but-unanswered is not the same as nothing to answer");
});
