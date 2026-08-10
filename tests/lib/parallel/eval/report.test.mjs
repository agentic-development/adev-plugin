// tests/lib/parallel/eval/report.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderReport, scoreRubric } from "../../../../lib/parallel/eval/report.mjs";

const RUN = {
  date: "2026-07-08",
  verdict: "equivalent",
  d_ctrl: { tests: [], surface: [] },
  d_par: { tests: [], surface: [] },
  arms: {
    serialA: { wallClockMs: 1000, tokens: 10000 },
    serialB: { wallClockMs: 1050, tokens: 10200 },
    parallel: { wallClockMs: 600, tokens: 11000 },
  },
  overlapOk: true,
  orphaned: { worktrees: [], branches: [], lock: false },
  implDiffSummary: "12 files differ (advisory)",
};

describe("renderReport", () => {
  it("returns markdown + json capturing verdict and noise-floor comparison", () => {
    const r = renderReport(RUN);
    assert.match(r.markdown, /equivalent/i);
    assert.match(r.markdown, /noise floor|d_ctrl|control/i);
    assert.match(r.markdown, /advisory/i); // impl diff labeled advisory
    assert.equal(r.json.verdict, "equivalent");
    assert.equal(r.json.wall_clock.parallel_ms, 600);
  });

  it("flags the wall-clock WARN when parallel is not faster", () => {
    const slow = { ...RUN, arms: { ...RUN.arms, parallel: { wallClockMs: 2000, tokens: 11000 } } };
    const r = renderReport(slow);
    assert.match(r.markdown, /WARN/);
  });

  it("flags the token WARN when overhead exceeds 1.15x", () => {
    const costly = { ...RUN, arms: { ...RUN.arms, parallel: { wallClockMs: 600, tokens: 99999 } } };
    const r = renderReport(costly);
    assert.match(r.markdown, /WARN/);
  });
});

describe("scoreRubric", () => {
  it("computes 50/50 layer-1 + layer-3 total", () => {
    const s = scoreRubric({ elementsPassed: 8, elementsTotal: 10, qualityAvg5: 4 });
    // (8/10)*50 + (4/5)*50 = 40 + 40 = 80
    assert.equal(s.layer1, 40);
    assert.equal(s.layer3, 40);
    assert.equal(s.total, 80);
  });
  it("is 0 when nothing passes", () => {
    const s = scoreRubric({ elementsPassed: 0, elementsTotal: 10, qualityAvg5: 0 });
    assert.equal(s.total, 0);
  });
  it("handles an empty element set without dividing by zero", () => {
    const s = scoreRubric({ elementsPassed: 0, elementsTotal: 0, qualityAvg5: 5 });
    assert.equal(s.layer1, 0);
    assert.equal(s.layer3, 50);
  });
});
