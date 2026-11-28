// tests/lib/implement/quick-tier-signal.test.mjs
//
// Route's rigor-tier signal: the predicate behind its `--tier quick`
// recommendation for /adev:review-specs and /adev:validate. It stays on the
// routing scores (routed auto-agent, every dimension a finite number in
// [0, 1] at or above the threshold), unlike liteEligible, which reads none.
// The table is also checked against route's gloss in its own 1–5 units.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  liteEligible,
  QUICK_TIER_SCORE_THRESHOLD,
  quickTierSignal,
} from "../../../lib/implement/review-depth.mjs";

const DIMENSIONS = ["spec_completeness", "pattern_coverage", "blast_radius", "novelty"];
const s = (spec_completeness, pattern_coverage, blast_radius, novelty) => ({ spec_completeness, pattern_coverage, blast_radius, novelty });
const toSidecarScale = (dims5) => Object.fromEntries(DIMENSIONS.map((dim, i) => [dim, dims5[i] / 5]));

test("the threshold is 0.6 on the sidecar scale, route's 3 of 5", () => {
  assert.equal(QUICK_TIER_SCORE_THRESHOLD, 0.6);
  assert.equal(3 / 5, QUICK_TIER_SCORE_THRESHOLD);
});

test("auto-agent with every score at the 0.6 boundary or above is eligible, without a warning", () => {
  for (const scores of [s(0.6, 0.6, 0.6, 0.6), s(1, 1, 1, 1), s(0.8, 0.6, 1, 0.7)]) {
    assert.deepEqual(quickTierSignal({ selected_agent: "auto-agent", scores }), { eligible: true, warnings: [] }, JSON.stringify(scores));
  }
});

test("a valid score of 0.59 is not eligible and raises no warning", () => {
  assert.deepEqual(quickTierSignal({ selected_agent: "auto-agent", scores: s(0.8, 0.8, 0.8, 0.59) }), { eligible: false, warnings: [] });
});

test("a non-numeric, non-finite, out-of-range or missing score is not eligible and raises ROUTING_SCORE_OUT_OF_RANGE", () => {
  for (const bad of ["0.8", NaN, Infinity, 1.2, -0.1, null, undefined]) {
    const r = quickTierSignal({ selected_agent: "auto-agent", scores: s(bad, 0.8, 0.8, 0.8) });
    assert.equal(r.eligible, false, `score=${String(bad)}`);
    assert.deepEqual(r.warnings.map((w) => [w.code, w.dimension]), [["ROUTING_SCORE_OUT_OF_RANGE", "spec_completeness"]], `score=${String(bad)}`);
  }
  const noScores = quickTierSignal({ selected_agent: "auto-agent" });
  assert.equal(noScores.eligible, false);
  assert.deepEqual(noScores.warnings.map((w) => w.dimension), DIMENSIONS);
});

test("assisted-agent, human-only, an unknown agent and a missing entry are not eligible, whatever the scores", () => {
  for (const entry of [
    { selected_agent: "assisted-agent", scores: s(1, 1, 1, 1) },
    { selected_agent: "human-only", scores: s(1, 1, 1, 1) },
    { selected_agent: "robot", scores: s(1, 1, 1, 1) },
    null,
    undefined,
  ]) {
    assert.equal(quickTierSignal(entry).eligible, false, JSON.stringify(entry));
  }
});

test("it diverges from liteEligible exactly where the scores or assisted-agent routing matter", () => {
  const assisted = { selected_agent: "assisted-agent", scores: s(1, 1, 1, 1) };
  const lowAuto = { selected_agent: "auto-agent", scores: s(0.4, 0.8, 0.8, 0.8) };
  for (const entry of [assisted, lowAuto]) {
    assert.equal(liteEligible(entry).eligible, true);
    assert.equal(quickTierSignal(entry).eligible, false);
  }
});

const PARITY = [
  ["auto-agent", [3, 3, 3, 3]],
  ["auto-agent", [5, 5, 5, 5]],
  ["auto-agent", [2, 5, 5, 5]],
  ["auto-agent", [5, 2, 5, 5]],
  ["auto-agent", [5, 5, 2, 5]],
  ["auto-agent", [5, 5, 5, 2]],
  ["auto-agent", [1, 5, 5, 5]],
  ["assisted-agent", [5, 5, 5, 5]],
  ["human-only", [4, 4, 4, 4]],
];
const routeSaysEasy = (agent, dims5) => agent === "auto-agent" && dims5.every((d) => d >= 3);

for (const [agent, dims5] of PARITY) {
  test(`parity with route's gloss: ${agent} ${dims5.join(",")}`, () => {
    assert.equal(quickTierSignal({ selected_agent: agent, scores: toSidecarScale(dims5) }).eligible, routeSaysEasy(agent, dims5));
  });
}
