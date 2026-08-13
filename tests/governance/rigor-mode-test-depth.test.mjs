// Unit tests for the test_depth extension to loadRigorPolicies.
// Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("loadRigorPolicies surfaces test_depth per risk level", () => {
  const dir = createTempDir();
  try {
    writeFixture(
      dir,
      ".context-index/governance/risk-policies.yaml",
      `
policies:
  high:   { review_mode: full,  validate_mode: full,  test_depth: thorough }
  medium: { review_mode: full,  validate_mode: full,  test_depth: standard }
  low:    { review_mode: quick, validate_mode: quick, test_depth: minimal }
`,
    );
    const policies = loadRigorPolicies(dir);
    assert.equal(policies.high.test_depth, "thorough");
    assert.equal(policies.medium.test_depth, "standard");
    assert.equal(policies.low.test_depth, "minimal");
  } finally {
    cleanupTempDir(dir);
  }
});

test("an out-of-enumeration test_depth raises INVALID_TEST_DEPTH", () => {
  const dir = createTempDir();
  try {
    writeFixture(
      dir,
      ".context-index/governance/risk-policies.yaml",
      `
policies:
  high: { review_mode: full, validate_mode: full, test_depth: extreme }
`,
    );
    assert.throws(() => loadRigorPolicies(dir), /INVALID_TEST_DEPTH/);
  } finally {
    cleanupTempDir(dir);
  }
});
