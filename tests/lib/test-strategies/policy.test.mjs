import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTestPolicy, resolveGranularity } from "../../../lib/test-strategies/policy.mjs";

test("parseTestPolicy returns per-behavior fallback with no warnings when block is absent", () => {
  const { policy, warnings } = parseTestPolicy({});
  assert.equal(policy.granularity, "per-behavior");
  assert.equal(policy.escalation, true);
  assert.deepEqual(warnings, []);
});

test("parseTestPolicy rejects an out-of-enumeration granularity", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { granularity: "per-sprint" } }),
    /INVALID_TEST_GRANULARITY/,
  );
});

test("parseTestPolicy rejects a non-boolean escalation flag", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation: "yes" } }),
    /INVALID_ESCALATION_FLAG/,
  );
});

test("parseTestPolicy rejects an escalation_rules when: expression against a 1-5 scale", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: [{ when: { blast_radius: "<=3" }, depth: "thorough" }] } }),
    /INVALID_ESCALATION_RULE_EXPRESSION/,
  );
});

test("parseTestPolicy rejects an escalation_rules entry naming an unknown dimension", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: [{ when: { made_up_dim: "<=0.3" }, depth: "thorough" }] } }),
    /UNKNOWN_ROUTING_DIMENSION/,
  );
});

test("parseTestPolicy rejects more than 32 escalation_rules", () => {
  const rules = Array.from({ length: 33 }, () => ({ when: { novelty: "<=0.3" }, depth: "thorough" }));
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: rules } }),
    /ESCALATION_RULES_LIMIT_EXCEEDED/,
  );
});

test("parseTestPolicy rejects a non-array escalation_rules (object form)", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: { a: 1 } } }),
    /INVALID_ESCALATION_RULE_EXPRESSION/,
  );
});

test("parseTestPolicy rejects a null entry within escalation_rules", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: [null] } }),
    /INVALID_ESCALATION_RULE_EXPRESSION/,
  );
});

test("parseTestPolicy rejects a non-array escalation_rules (string form)", () => {
  assert.throws(
    () => parseTestPolicy({ test_policy: { escalation_rules: "abc" } }),
    /INVALID_ESCALATION_RULE_EXPRESSION/,
  );
});

test("resolveGranularity: module override beats manifest beats domain beats fallback", () => {
  assert.equal(resolveGranularity({ moduleOverride: "per-task" }).granularity, "per-task");
  assert.equal(resolveGranularity({ manifestPolicy: "per-spec" }).source, "manifest");
  assert.equal(resolveGranularity({}).source, "fallback");
});
