import test from "node:test";
import assert from "node:assert/strict";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";

test("live risk-policies.yaml declares implement_mode for all three risk levels", () => {
  const policies = loadRigorPolicies(process.cwd());
  // quick is only the baseline at every level: the floor pass still raises a
  // task to full (a high-risk spec on a task not routed auto-agent, a boundary
  // or sensitive path, human-only routing, a Critical finding), so high is not
  // pinned to full here.
  assert.equal(policies.high.implement_mode, "quick");
  assert.equal(policies.medium.implement_mode, "quick");
  assert.equal(policies.low.implement_mode, "quick");
});
