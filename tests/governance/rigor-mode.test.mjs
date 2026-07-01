// Unit tests for the graduated-rigor-tiers resolver.
// Spec: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveRigorMode,
  loadRigorPolicies,
  isValidTier,
  InvalidTierError,
  RIGOR_MODES,
} from "../../lib/governance/rigor-mode.mjs";

const POLICIES = {
  high: { review_mode: "full", validate_mode: "full" },
  medium: { review_mode: "full", validate_mode: "full" },
  low: { review_mode: "quick", validate_mode: "quick" },
};

test("isValidTier accepts full/quick, rejects others", () => {
  assert.equal(isValidTier("full"), true);
  assert.equal(isValidTier("quick"), true);
  assert.equal(isValidTier("fast"), false);
  assert.equal(isValidTier(undefined), false);
  assert.deepEqual([...RIGOR_MODES], ["full", "quick"]);
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

test("precedence 3: risk policy maps low → quick (review)", () => {
  assert.equal(
    resolveRigorMode({ skill: "review", riskLevel: "low", policies: POLICIES }),
    "quick",
  );
  assert.equal(
    resolveRigorMode({ skill: "review", riskLevel: "high", policies: POLICIES }),
    "full",
  );
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

test("empty-string tierOverride is ignored (falls through)", () => {
  assert.equal(
    resolveRigorMode({ skill: "review", riskLevel: "low", policies: POLICIES, tierOverride: "" }),
    "quick",
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
