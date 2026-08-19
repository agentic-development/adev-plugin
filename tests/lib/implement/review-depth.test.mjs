// tests/lib/implement/review-depth.test.mjs
//
// Task 4: precedence chain for resolveImplementReviewDepth (tier-full absolute,
// policy baseline, quick-grant predicate, score validation). The floor pass is
// added by a later task extending this same suite/file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveImplementReviewDepth } from "../../../lib/implement/review-depth.mjs";

test("--tier full is absolute — resolves full even with perfect scores and no floor", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" },
    task: { id: "t1" },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: "full",
    policies: { low: { implement_mode: "quick" } },
  });
  assert.equal(result.depth, "full");
  assert.equal(result.source, "tier-full-absolute");
});

test("policy baseline resolves full when implement_mode is missing/malformed", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "medium" }, task: { id: "t1" },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { medium: { implement_mode: "not-a-real-tier" } },
  });
  assert.equal(result.depth, "full");
});

test("quick-grant predicate: all four rows pass -> quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.6 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
  assert.equal(result.source, "predicate-grant");
});

test("quick-grant predicate: a single failing dimension (novelty 0.4) keeps full even under --tier quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.4 } },
    tierFlag: "quick", policies: { low: { implement_mode: "full" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("--tier quick authorizes predicate evaluation even when baseline is full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "high" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.6, pattern_coverage: 0.6, blast_radius: 0.6, novelty: 0.6 } },
    tierFlag: "quick", policies: { high: { implement_mode: "full" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
});

test("selected_agent other than auto-agent never grants quick", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "assisted-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("a governance boundary crossing keeps full even with perfect scores", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: true,
  });
  assert.equal(result.depth, "full");
});

test("additive-only row fails independently — a task with an otherwise-perfect predicate but additive_only: false resolves full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: false },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});

test("an out-of-range score resolves full with ROUTING_SCORE_OUT_OF_RANGE, no coercion", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 5 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } },
    boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
  assert.ok(result.warnings.some(w => w.code === "ROUTING_SCORE_OUT_OF_RANGE"));
});

test("a raw un-normalized score of 1 documents the accepted boundary (not a regression)", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "quick");
});

test("non-finite / non-numeric score resolves full", () => {
  const result = resolveImplementReviewDepth({
    spec: { risk_level: "low" }, task: { id: "t1", additive_only: true },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: NaN, novelty: 1 } },
    tierFlag: null, policies: { low: { implement_mode: "quick" } }, boundaryCrossing: false,
  });
  assert.equal(result.depth, "full");
});
