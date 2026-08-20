import test from "node:test";
import assert from "node:assert/strict";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";

test("live risk-policies.yaml declares implement_mode for all three risk levels", () => {
  const policies = loadRigorPolicies(process.cwd());
  assert.equal(policies.high.implement_mode, "full");
  assert.equal(policies.medium.implement_mode, "full");
  assert.equal(policies.low.implement_mode, "quick");
});
