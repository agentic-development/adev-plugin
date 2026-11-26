import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidTierError, RIGOR_MODES, isValidTier, loadRigorPolicies, parseRigorPolicies, resolveRigorMode } from "../../lib/governance/rigor-mode.mjs";
import { cleanupTempDir, createTempDir, writeFixture } from "../helpers.mjs";

// Unit tests for the graduated-rigor-tiers resolver.
// Spec: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md


const POLICIES = {
  high: { review_mode: "full", validate_mode: "full" },
  medium: { review_mode: "full", validate_mode: "full" },
  low: { review_mode: "quick", validate_mode: "quick" },
};

test("isValidTier accepts full/quick/lite, rejects others (+2 more contract assertions)", () => {
  // isValidTier accepts full/quick/lite, rejects others
  assert.equal(isValidTier("full"), true);
  assert.equal(isValidTier("quick"), true);
  assert.equal(isValidTier("lite"), true);
  assert.equal(isValidTier("fast"), false);
  assert.equal(isValidTier("Lite"), false);
  assert.equal(isValidTier(undefined), false);
  assert.deepEqual([...RIGOR_MODES], ["full", "quick", "lite"]);

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

test("resolveRigorMode: skill='implement' resolves against implement_mode, never review_mode", () => {
  const policies = { medium: { review_mode: "quick", implement_mode: "full" } };
  const result = resolveRigorMode({ skill: "implement", riskLevel: "medium", policies });
  assert.equal(result, "full"); // would be "quick" under the old ternary
});

test("resolveRigorMode: routingEasy does NOT short-circuit to quick when skill='implement'", () => {
  const result = resolveRigorMode({
    skill: "implement", riskLevel: "medium", policies: { medium: { implement_mode: "full" } },
    routingEasy: true,
  });
  assert.equal(result, "full"); // old code returned "quick" unconditionally here
});

test("resolveRigorMode: routingEasy still short-circuits to quick for review-specs (regression)", () => {
  const result = resolveRigorMode({ skill: "review-specs", routingEasy: true });
  assert.equal(result, "quick");
});

test("resolveRigorMode: routingEasy still short-circuits to quick for validate (regression)", () => {
  const result = resolveRigorMode({ skill: "validate", routingEasy: true });
  assert.equal(result, "quick");
});

test("resolveRigorMode: unrecognized skill keeps the review_mode fallback", () => {
  const policies = { medium: { review_mode: "quick" } };
  const result = resolveRigorMode({ skill: "route", riskLevel: "medium", policies });
  assert.equal(result, "quick");
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

// ─── lite tier, implement quick fallback, policy-value validation ─────────────

const POLICY_FILE = ".context-index/governance/risk-policies.yaml";

test("lite is a legal tier", () => {
  assert.deepEqual([...RIGOR_MODES], ["full", "quick", "lite"]);
  assert.equal(isValidTier("lite"), true);
  assert.throws(() => resolveRigorMode({ skill: "validate", tierOverride: "Lite" }), { code: "INVALID_TIER" });
  assert.throws(() => resolveRigorMode({ skill: "implement", tierOverride: "LITE" }), { code: "INVALID_TIER" });
});

test("non-implement skills map lite to quick; implement keeps lite", () => {
  for (const skill of ["review-specs", "validate"]) {
    assert.equal(resolveRigorMode({ skill, tierOverride: "lite" }), "quick");
    assert.equal(
      resolveRigorMode({ skill, riskLevel: "medium", policies: { medium: { review_mode: "lite", validate_mode: "lite" } } }),
      "quick",
    );
  }
  assert.equal(resolveRigorMode({ skill: "implement", tierOverride: "lite" }), "lite");
  assert.equal(
    resolveRigorMode({ skill: "implement", riskLevel: "low", policies: { low: { implement_mode: "lite" } } }),
    "lite",
  );
  assert.equal(resolveRigorMode({ tierOverride: "lite" }), "quick");
  assert.equal(
    resolveRigorMode({ skill: "route", riskLevel: "low", policies: { low: { review_mode: "lite" } } }),
    "quick",
  );
});

test("an explicit tierOverride outranks a lite implement policy", () => {
  const policies = { medium: { implement_mode: "lite" } };
  assert.equal(resolveRigorMode({ skill: "implement", riskLevel: "medium", policies, tierOverride: "quick" }), "quick");
  assert.equal(resolveRigorMode({ skill: "implement", riskLevel: "medium", policies, tierOverride: "full" }), "full");
});

test("implement falls back to quick; review-specs and validate still fall back to full", () => {
  assert.equal(resolveRigorMode({ skill: "implement", riskLevel: "medium", policies: null }), "quick");
  assert.equal(resolveRigorMode({ skill: "implement" }), "quick");
  assert.equal(
    resolveRigorMode({ skill: "implement", riskLevel: "high", policies: { high: { review_mode: "full" } } }),
    "quick",
  );
  assert.equal(resolveRigorMode({ skill: "review-specs", riskLevel: "medium", policies: null }), "full");
  assert.equal(resolveRigorMode({ skill: "validate", riskLevel: "medium", policies: null }), "full");
});

test("loadRigorPolicies rejects bad mode values, unparseable files, and high lite", (t) => {
  const root = createTempDir(); t.after(() => cleanupTempDir(root));
  const write = (body) => writeFixture(root, POLICY_FILE, body);
  write("policies:\n  medium:\n    implement_mode: bogus\n");
  assert.throws(() => loadRigorPolicies(root), (e) => e.code === "INVALID_TIER" && /medium/.test(e.message) && /risk-policies\.yaml/.test(e.message));
  write("policies:\n  medium:\n    review_mode: [\n");
  assert.throws(() => loadRigorPolicies(root), { code: "INVALID_TIER" });
  write("policies:\n  high:\n    implement_mode: lite\n");
  assert.throws(() => loadRigorPolicies(root), { code: "LITE_NOT_ALLOWED_FOR_HIGH" });
  write("policies:\n  medium:\n    implement_mode: lite\n  low:\n    implement_mode: lite\n");
  assert.equal(loadRigorPolicies(root).medium.implement_mode, "lite");
});

test("parseRigorPolicies is the shared validator", () => {
  assert.throws(() => parseRigorPolicies("policies:\n  low:\n    validate_mode: nope\n", "run-base:abc"), (e) => e.code === "INVALID_TIER" && /run-base:abc/.test(e.message));
});

test("an invalid mode error names the level and field and is an InvalidTierError", () => {
  for (const field of ["review_mode", "validate_mode", "implement_mode"]) {
    assert.throws(
      () => parseRigorPolicies(`policies:\n  low:\n    ${field}: Quick\n`, "policies.yaml"),
      (e) => e instanceof InvalidTierError
        && e.code === "INVALID_TIER"
        && e.file === "policies.yaml"
        && e.level === "low"
        && e.field === field
        && e.message.includes("'Quick'")
        && e.message.includes(`low.${field}`)
        && e.message.includes("policies.yaml"),
      `expected INVALID_TIER for ${field}: Quick`,
    );
  }
});

test("a risk-policies file that does not parse throws INVALID_TIER naming the label", () => {
  assert.throws(
    () => parseRigorPolicies("policies:\n  medium:\n    review_mode: full\n  : bad\n", "run-base:def"),
    (e) => e instanceof InvalidTierError && e.code === "INVALID_TIER" && /run-base:def/.test(e.message) && /does not parse/.test(e.message),
  );
});

test("a non-mapping policies value is rejected as unparseable", () => {
  assert.throws(
    () => parseRigorPolicies("policies: [\n", "x.yaml"),
    (e) => e.code === "INVALID_TIER" && /x\.yaml/.test(e.message),
  );
});

test("LITE_NOT_ALLOWED_FOR_HIGH names the file; lite stays legal for review_mode/validate_mode at high", () => {
  assert.throws(
    () => parseRigorPolicies("policies:\n  high:\n    implement_mode: lite\n", "run-base:123"),
    (e) => e.code === "LITE_NOT_ALLOWED_FOR_HIGH" && /run-base:123/.test(e.message) && /high/.test(e.message),
  );
  const policies = parseRigorPolicies("policies:\n  high:\n    review_mode: lite\n    validate_mode: lite\n    implement_mode: full\n", "p");
  assert.equal(policies.high.review_mode, "lite");
  assert.equal(policies.high.validate_mode, "lite");
});

test("parseRigorPolicies keeps the INVALID_TEST_DEPTH check and returns null for an empty document", () => {
  assert.throws(() => parseRigorPolicies("policies:\n  low:\n    test_depth: extreme\n", "p"), /INVALID_TEST_DEPTH/);
  assert.equal(parseRigorPolicies("", "p"), null);
  assert.equal(parseRigorPolicies("other: 1\n", "p"), null);
  assert.deepEqual(
    parseRigorPolicies("policies:\n  low:\n    review_mode: quick\n    implement_mode: lite\n    test_depth: minimal\n", "p"),
    { low: { review_mode: "quick", implement_mode: "lite", test_depth: "minimal" } },
  );
});

test("loadRigorPolicies still returns null for an absent file", (t) => {
  const root = createTempDir(); t.after(() => cleanupTempDir(root));
  assert.equal(loadRigorPolicies(root), null);
});
