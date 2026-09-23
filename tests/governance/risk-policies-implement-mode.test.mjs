import test from "node:test";
import assert from "node:assert/strict";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";

test("live risk-policies.yaml declares implement_mode for all three risk levels", () => {
  const policies = loadRigorPolicies(process.cwd());
  assert.equal(policies.high.implement_mode, "full");
  // medium runs ONE synthesized post-implementation reviewer instead of the
  // spec-compliance -> code-quality pair. Deliberate policy change: the
  // baseline is only a proposal, and quickGrantPredicate still has to grant it
  // per task (auto-agent routing, all routing dimensions at or above
  // threshold, no boundary crossing, additive-only file set).
  assert.equal(policies.medium.implement_mode, "quick");
  assert.equal(policies.low.implement_mode, "quick");
});
