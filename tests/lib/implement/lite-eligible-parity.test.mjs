// tests/lib/implement/lite-eligible-parity.test.mjs
//
// EV-4 parity: liteEligible must agree with the gloss that skills/route/SKILL.md
// (Rigor Tier Signal) gives beside its liteEligible citation: routed
// auto-agent or assisted-agent, with the dimension scores not consulted. The
// table includes low and non-numeric scores, which must not change the answer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { liteEligible } from "../../../lib/implement/review-depth.mjs";

const DIMENSIONS = ["spec_completeness", "pattern_coverage", "blast_radius", "novelty"];
const routeSaysEligible = (agent) => agent === "auto-agent" || agent === "assisted-agent";
const toSidecarScale = (dims5) => Object.fromEntries(DIMENSIONS.map((dim, i) => [dim, dims5[i] / 5]));

const TABLE = [
  ["auto-agent", [3, 3, 3, 3]],
  ["auto-agent", [5, 5, 5, 5]],
  ["auto-agent", [2, 5, 5, 5]],
  ["auto-agent", [5, 2, 5, 5]],
  ["auto-agent", [5, 5, 2, 5]],
  ["auto-agent", [5, 5, 5, 2]],
  ["auto-agent", [1, 1, 1, 1]],
  ["assisted-agent", [5, 5, 5, 5]],
  ["assisted-agent", [3, 3, 3, 3]],
  ["assisted-agent", [1, 2, 1, 2]],
  ["human-only", [4, 4, 4, 4]],
  ["human-only", [5, 5, 5, 5]],
];

for (const [agent, dims5] of TABLE) {
  test(`parity ${agent} ${dims5.join(",")}`, () => {
    const scores = toSidecarScale(dims5);
    assert.equal(liteEligible({ selected_agent: agent, scores }).eligible, routeSaysEligible(agent));
  });
}

test("non-numeric, out-of-range and missing scores do not change eligibility, and raise no warning", () => {
  for (const agent of ["auto-agent", "assisted-agent", "human-only"]) {
    for (const bad of ["0.8", null, NaN, 1.2, -1]) {
      const scores = { ...toSidecarScale([5, 5, 5, 5]), novelty: bad };
      const r = liteEligible({ selected_agent: agent, scores });
      assert.equal(r.eligible, routeSaysEligible(agent), `${agent} novelty=${String(bad)}`);
      assert.deepEqual(r.warnings, []);
    }
    assert.equal(liteEligible({ selected_agent: agent }).eligible, routeSaysEligible(agent), `${agent} without scores`);
  }
});
