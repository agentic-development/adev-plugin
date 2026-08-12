import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTestDepth } from "../../../lib/test-strategies/depth.mjs";
import { DEFAULT_SENSITIVE_PATHS } from "../../../lib/test-strategies/sensitive-paths.mjs";

const base = {
  spec: {}, riskLevel: "medium",
  policies: { medium: { test_depth: "standard" } },
  escalationEnabled: true, escalationRules: [],
  boundaryCrossing: false, targetPaths: [], sensitivePaths: DEFAULT_SENSITIVE_PATHS,
};

test("spec-declared test_depth beats module override and risk-policy default", () => {
  const r = resolveTestDepth({ ...base, spec: { test_depth: "thorough" }, moduleOverride: "minimal" });
  assert.equal(r.depth, "thorough");
  assert.equal(r.source, "spec-declared");
});

test("chain falls through to risk-policy default with no overrides", () => {
  const r = resolveTestDepth(base);
  assert.equal(r.depth, "standard");
  assert.equal(r.source, "risk-policy");
});

test("escalation is monotonic upward only — a lower-naming rule is a no-op", () => {
  const r = resolveTestDepth({
    ...base, spec: { test_depth: "thorough" },
    escalationRules: [{ when: { blast_radius: "<=0.3" }, depth: "minimal" }],
    routingScore: { blast_radius: 0.1 },
  });
  assert.equal(r.depth, "thorough");
});

test("two matching rules of different depths take the highest with a CONFLICTING_ESCALATION_RULE advisory", () => {
  const r = resolveTestDepth({
    ...base,
    escalationRules: [
      { when: { blast_radius: "<=0.3" }, depth: "standard" },
      { when: { novelty: "<=0.3" }, depth: "thorough" },
    ],
    routingScore: { blast_radius: 0.1, novelty: 0.1 },
  });
  assert.equal(r.depth, "thorough");
  assert.ok(r.warnings.some((w) => w.code === "CONFLICTING_ESCALATION_RULE"));
});

test("escalation_skipped distinguishes disabled / no-routing-entry / no-match", () => {
  assert.equal(resolveTestDepth({ ...base, escalationEnabled: false }).escalation_skipped, "disabled");
  assert.equal(resolveTestDepth({ ...base, escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }] }).escalation_skipped, "no-routing-entry");
  assert.equal(
    resolveTestDepth({ ...base, escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }], routingScore: { novelty: 0.9 } }).escalation_skipped,
    "no-match",
  );
});

test("floor fires on a sensitive-path match with risk_level low and no boundaries", () => {
  const r = resolveTestDepth({
    ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } },
    boundaryCrossing: false, targetPaths: ["src/auth/session.ts"],
  });
  assert.equal(r.depth, "thorough");
  assert.equal(r.floor_applied, true);
  assert.deepEqual(r.floor_legs, ["sensitive-path"]);
});

test("floor_applied is recorded even when escalation already reached thorough", () => {
  const r = resolveTestDepth({
    ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } },
    targetPaths: ["src/auth/session.ts"],
    escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }],
    routingScore: { novelty: 0.1 },
  });
  assert.equal(r.depth, "thorough");
  assert.equal(r.floor_applied, true);
});

test("DEPTH_FLOOR_APPLIED advisory fires whenever an evaluated floor leg holds, even when it did not change the resolved value", () => {
  const r = resolveTestDepth({
    ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } },
    targetPaths: ["src/auth/session.ts"],
    escalationRules: [{ when: { novelty: "<=0.3" }, depth: "thorough" }],
    routingScore: { novelty: 0.1 },
  });
  assert.equal(r.depth, "thorough");
  assert.equal(r.floor_applied, true);
  assert.ok(r.warnings.some((w) => w.code === "DEPTH_FLOOR_APPLIED" && w.legs.includes("sensitive-path")));
});

test("risk_level high with no parseable path block records floor_applied true and floor_inputs unavailable", () => {
  const r = resolveTestDepth({ ...base, riskLevel: "high", policies: { high: { test_depth: "thorough" } }, targetPaths: [] });
  assert.equal(r.floor_applied, true);
  assert.deepEqual(r.floor_legs, ["risk-level"]);
  assert.equal(r.floor_inputs, "unavailable");
});

test("an escalation rule with an invalid depth value throws INVALID_TEST_DEPTH instead of silently winning", () => {
  assert.throws(
    () =>
      resolveTestDepth({
        ...base,
        escalationRules: [{ when: { blast_radius: "<=0.3" }, depth: "thorogh" }],
        routingScore: { blast_radius: 0.1 },
      }),
    /INVALID_TEST_DEPTH: 'thorogh'/,
  );
});

test("floor legs are evaluated last, after chain and escalation, and only escalate", () => {
  const r = resolveTestDepth({ ...base, riskLevel: "low", policies: { low: { test_depth: "minimal" } }, targetPaths: [] });
  assert.equal(r.depth, "minimal"); // no leg held: risk low, no boundary, no sensitive path
  assert.equal(r.floor_applied, false);
});
