// tests/lib/implement/lite-eligible-parity.test.mjs
//
// EV-4 parity: liteEligible must agree with the gloss that skills/route/SKILL.md
// (Rigor Tier Signal) gives beside its liteEligible citation: routed auto-agent
// and no dimension below 3 on route's 1–5 scale. Route scores in those units,
// and the sidecar stores each dimension as d/5, so 3/5 is exactly the 0.6
// threshold.

import { test } from "node:test";
import assert from "node:assert/strict";
import { liteEligible } from "../../../lib/implement/review-depth.mjs";

const DIMENSIONS = ["spec_completeness", "pattern_coverage", "blast_radius", "novelty"];
const routeSaysEasy = (agent, dims5) => agent === "auto-agent" && dims5.every((d) => d >= 3);
const toSidecarScale = (dims5) => Object.fromEntries(DIMENSIONS.map((dim, i) => [dim, dims5[i] / 5]));

const TABLE = [
  ["auto-agent", [3, 3, 3, 3]],
  ["auto-agent", [5, 5, 5, 5]],
  ["auto-agent", [2, 5, 5, 5]],
  ["auto-agent", [5, 2, 5, 5]],
  ["auto-agent", [5, 5, 2, 5]],
  ["auto-agent", [5, 5, 5, 2]],
  ["auto-agent", [5, 5, 5, 3]],
  ["auto-agent", [4, 4, 4, 4]],
  ["auto-agent", [1, 5, 5, 5]],
  ["assisted-agent", [5, 5, 5, 5]],
  ["assisted-agent", [3, 3, 3, 3]],
  ["human-only", [4, 4, 4, 4]],
];

for (const [agent, dims5] of TABLE) {
  test(`parity ${agent} ${dims5.join(",")}`, () => {
    const scores = toSidecarScale(dims5);
    assert.equal(liteEligible({ selected_agent: agent, scores }).eligible, routeSaysEasy(agent, dims5));
  });
}

test("the 3-of-5 boundary is exactly the threshold on the sidecar scale", () => {
  assert.equal(3 / 5, 0.6);
  assert.equal(liteEligible({ selected_agent: "auto-agent", scores: toSidecarScale([3, 3, 3, 3]) }).eligible, true);
});

test("non-numeric scores are never eligible", () => {
  for (const bad of ["0.8", null]) {
    const scores = { ...toSidecarScale([5, 5, 5, 5]), novelty: bad };
    const r = liteEligible({ selected_agent: "auto-agent", scores });
    assert.equal(r.eligible, false, `novelty=${String(bad)}`);
    assert.deepEqual(r.warnings.map((w) => [w.code, w.dimension]), [["ROUTING_SCORE_OUT_OF_RANGE", "novelty"]]);
  }
});
