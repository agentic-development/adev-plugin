import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidTierError, RIGOR_MODES, isValidTier, loadRigorPolicies, resolveRigorMode } from "../../lib/governance/rigor-mode.mjs";
import { cleanupTempDir, createTempDir, writeFixture } from "../helpers.mjs";

// Unit tests for the graduated-rigor-tiers resolver.
// Spec: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md


const POLICIES = {
  high: { review_mode: "full", validate_mode: "full" },
  medium: { review_mode: "full", validate_mode: "full" },
  low: { review_mode: "quick", validate_mode: "quick" },
};

test("isValidTier accepts full/quick, rejects others (+2 more contract assertions)", () => {
  // isValidTier accepts full/quick, rejects others
  assert.equal(isValidTier("full"), true);
  assert.equal(isValidTier("quick"), true);
  assert.equal(isValidTier("fast"), false);
  assert.equal(isValidTier(undefined), false);
  assert.deepEqual([...RIGOR_MODES], ["full", "quick"]);

  // precedence 3: risk policy maps low → quick (review)
  assert.equal(
  resolveRigorMode({ skill: "review", riskLevel: "low", policies: POLICIES }),
  "quick",
  );
  assert.equal(
  resolveRigorMode({ skill: "review", riskLevel: "high", policies: POLICIES }),
  "full",
  );

  // empty-string tierOverride is ignored (falls through)
  assert.equal(
  resolveRigorMode({ skill: "review", riskLevel: "low", policies: POLICIES, tierOverride: "" }),
  "quick",
  );
});

test("precedence 1: explicit tierOverride wins over everything", () => {
  const mode = resolveRigorMode({
    skill: "review",
    riskLevel: "low",
    policies: POLICIES,
    tierOverride: "full",
    routingEasy: true,
  });
  assert.equal(mode, "full");
});

test("precedence 2: routingEasy → quick when no override", () => {
  const mode = resolveRigorMode({
    skill: "review",
    riskLevel: "high",
    policies: POLICIES,
    routingEasy: true,
  });
  assert.equal(mode, "quick");
});


test("validate skill reads validate_mode, not review_mode", () => {
  const policies = {
    low: { review_mode: "full", validate_mode: "quick" },
  };
  assert.equal(
    resolveRigorMode({ skill: "validate", riskLevel: "low", policies }),
    "quick",
  );
  assert.equal(
    resolveRigorMode({ skill: "review", riskLevel: "low", policies }),
    "full",
  );
});

test("precedence 4: defaults to full when nothing resolves", () => {
  assert.equal(resolveRigorMode({}), "full");
  assert.equal(
    resolveRigorMode({ skill: "review", riskLevel: "low", policies: null }),
    "full",
  );
  // unknown risk level falls back to medium bucket
  assert.equal(
    resolveRigorMode({ skill: "review", riskLevel: "bogus", policies: POLICIES }),
    "full",
  );
});

test("invalid tierOverride throws InvalidTierError with code", () => {
  assert.throws(
    () => resolveRigorMode({ tierOverride: "fast" }),
    (err) => err instanceof InvalidTierError && err.code === "INVALID_TIER",
  );
});


test("loadRigorPolicies reads risk-policies.yaml, null when absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "rigor-"));
  try {
    assert.equal(loadRigorPolicies(dir), null);
    const gov = join(dir, ".context-index", "governance");
    mkdirSync(gov, { recursive: true });
    writeFileSync(
      join(gov, "risk-policies.yaml"),
      "policies:\n  low:\n    review_mode: quick\n    validate_mode: quick\n",
    );
    const policies = loadRigorPolicies(dir);
    assert.equal(policies.low.review_mode, "quick");
    assert.equal(
      resolveRigorMode({ skill: "validate", riskLevel: "low", policies }),
      "quick",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── merged from tests/governance/rigor-mode-test-depth.test.mjs ──────────────────────────────────────────────
{
  // Unit tests for the test_depth extension to loadRigorPolicies.
  // Spec: .context-index/specs/features/test-strategies/test-depth-policy.spec.md


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
}
