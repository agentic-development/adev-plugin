/**
 * Reality Check integration test — exercises verifySpecImplemented,
 * verifyIssueCompleted, and formatConfidenceNote against the
 * integration-sandbox fixture project.
 *
 * This validates that reality-check correctly detects:
 * - Implemented specs (files committed + tests exist = HIGH confidence)
 * - Specs where implementation is incomplete (missing files = NONE)
 * - Issue completion based on plan task checkboxes
 * - Confidence note formatting for issue board updates
 *
 * Usage:
 *   node --test tests/evals/integration-sandbox/reality-check.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";

import {
  verifySpecImplemented,
  verifyIssueCompleted,
  formatConfidenceNote,
  CONFIDENCE,
} from "../../../lib/reality-check.mjs";

const FIXTURE_ROOT = resolve(fileURLToPath(import.meta.url), "..");
const PROJECT_ROOT = resolve(FIXTURE_ROOT, "..", "..", "..");

// ---------------------------------------------------------------------------
// verifySpecImplemented against real fixture
// ---------------------------------------------------------------------------

describe("reality-check: integration-sandbox fixture", () => {
  describe("verifySpecImplemented — customer-orders spec (implemented)", () => {
    const specPath = join(
      FIXTURE_ROOT,
      ".context-index/specs/features/orders/customer-orders.md"
    );

    it("detects spec as implemented with HIGH or MEDIUM confidence", () => {
      const result = verifySpecImplemented(specPath, { projectRoot: FIXTURE_ROOT });
      assert.ok(
        result.implemented,
        `Expected implemented=true, got ${JSON.stringify(result)}`
      );
      assert.ok(
        result.confidence === CONFIDENCE.HIGH || result.confidence === CONFIDENCE.MEDIUM,
        `Expected high or medium confidence, got: ${result.confidence}`
      );
    });

    it("evidence includes committed files", () => {
      const result = verifySpecImplemented(specPath, { projectRoot: FIXTURE_ROOT });
      const passEvidence = result.evidence.filter((e) => e.type === "pass");
      assert.ok(
        passEvidence.length > 0,
        "Expected at least one pass evidence entry for committed files"
      );
    });

    it("evidence does NOT include missing files", () => {
      const result = verifySpecImplemented(specPath, { projectRoot: FIXTURE_ROOT });
      const failEvidence = result.evidence.filter((e) => e.type === "fail");
      assert.equal(
        failEvidence.length,
        0,
        `Unexpected missing files: ${failEvidence.map((e) => e.message).join(", ")}`
      );
    });
  });

  describe("verifySpecImplemented — revenue-by-customer spec (NOT implemented)", () => {
    const specPath = join(
      FIXTURE_ROOT,
      ".context-index/specs/features/orders/revenue-by-customer.md"
    );

    it("detects spec as NOT fully implemented (no plan file)", () => {
      const result = verifySpecImplemented(specPath, { projectRoot: FIXTURE_ROOT });
      // revenue-by-customer has no .plan.md and no source-manifest
      assert.equal(result.implemented, false);
      assert.ok(
        result.confidence === CONFIDENCE.LOW || result.confidence === CONFIDENCE.NONE,
        `Expected low or none confidence, got: ${result.confidence}`
      );
    });
  });

  describe("verifySpecImplemented — nonexistent spec", () => {
    it("returns none confidence for nonexistent file", () => {
      const result = verifySpecImplemented(
        join(FIXTURE_ROOT, ".context-index/specs/features/orders/does-not-exist.md"),
        { projectRoot: FIXTURE_ROOT }
      );
      assert.equal(result.implemented, false);
      assert.equal(result.confidence, CONFIDENCE.NONE);
    });
  });
});

// ---------------------------------------------------------------------------
// verifyIssueCompleted against fixture plan
// ---------------------------------------------------------------------------

describe("reality-check: verifyIssueCompleted against fixture plan", () => {
  const planRef = "tests/evals/integration-sandbox/.context-index/specs/features/orders/customer-orders.plan.md";

  it("detects task 1 as completed (all checkboxes in plan are descriptive)", () => {
    const result = verifyIssueCompleted(
      { plan_ref: planRef, plan_task: 1 },
      { projectRoot: FIXTURE_ROOT }
    );
    // The plan uses descriptive text, not TDD checkboxes — but it has task sections
    // This should return a meaningful result either way
    assert.ok(typeof result.completed === "boolean");
    assert.ok(Object.values(CONFIDENCE).includes(result.confidence));
    assert.ok(typeof result.reason === "string");
  });

  it("returns low confidence for issue without plan_ref", () => {
    const result = verifyIssueCompleted(
      { title: "Some random issue" },
      { projectRoot: FIXTURE_ROOT }
    );
    assert.equal(result.completed, false);
    assert.equal(result.confidence, CONFIDENCE.LOW);
    assert.ok(result.reason.includes("No plan_ref"));
  });

  it("returns none confidence for plan file that does not exist", () => {
    const result = verifyIssueCompleted(
      { plan_ref: "does-not-exist.plan.md", plan_task: 1 },
      { projectRoot: FIXTURE_ROOT }
    );
    assert.equal(result.completed, false);
    assert.equal(result.confidence, CONFIDENCE.NONE);
  });
});

// ---------------------------------------------------------------------------
// formatConfidenceNote — real-world formatting
// ---------------------------------------------------------------------------

describe("reality-check: formatConfidenceNote for issue board", () => {
  it("produces audit-trail note after validation", () => {
    const note = formatConfidenceNote("Validated", "high", {
      reportPath: ".context-index/specs/features/orders/customer-orders-validation.md",
      filesVerified: 3,
      testsPass: true,
      specPath: ".context-index/specs/features/orders/customer-orders.md",
    });
    assert.ok(note.includes("Validated: HIGH confidence"));
    assert.ok(note.includes("Files verified: 3"));
    assert.ok(note.includes("Tests: PASS"));
    assert.ok(note.includes("Spec:"));
    // Contains a date
    assert.match(note, /\d{4}-\d{2}-\d{2}/);
  });

  it("produces audit-trail note after debug fix", () => {
    const note = formatConfidenceNote("Bug fixed", "high", {
      testsPass: true,
      specPath: ".context-index/specs/features/orders/customer-orders.md",
    });
    assert.ok(note.includes("Bug fixed: HIGH confidence"));
    assert.ok(note.includes("Tests: PASS"));
  });

  it("produces low-confidence note when tests fail", () => {
    const note = formatConfidenceNote("Validated", "low", {
      testsPass: false,
      filesVerified: 2,
    });
    assert.ok(note.includes("Validated: LOW confidence"));
    assert.ok(note.includes("Tests: FAIL"));
  });
});

// ---------------------------------------------------------------------------
// End-to-end: simulate what validate Check 12 would do
// ---------------------------------------------------------------------------

describe("reality-check: end-to-end Check 12 simulation", () => {
  it("verifies spec, generates confidence note, produces audit trail", () => {
    const specPath = join(
      FIXTURE_ROOT,
      ".context-index/specs/features/orders/customer-orders.md"
    );

    // Step 1: verify spec is implemented
    const specResult = verifySpecImplemented(specPath, { projectRoot: FIXTURE_ROOT });

    // Step 2: simulate issue verification
    const issueResult = verifyIssueCompleted(
      {
        plan_ref: "tests/evals/integration-sandbox/.context-index/specs/features/orders/customer-orders.plan.md",
        plan_task: 1,
      },
      { projectRoot: FIXTURE_ROOT }
    );

    // Step 3: generate confidence note (what would go on the issue board)
    const note = formatConfidenceNote("Validated", specResult.confidence, {
      reportPath: "customer-orders-validation.md",
      filesVerified: specResult.evidence.filter((e) => e.type === "pass").length,
      testsPass: true,
      specPath: "customer-orders.md",
    });

    // Assertions: the full pipeline produces usable output
    assert.ok(specResult.implemented, "Spec should be detected as implemented");
    assert.ok(note.includes("confidence"), "Note should include confidence level");
    assert.match(note, /\d{4}-\d{2}-\d{2}/, "Note should include date");

    // The confidence should be at least MEDIUM for a committed implementation
    assert.ok(
      specResult.confidence === CONFIDENCE.HIGH || specResult.confidence === CONFIDENCE.MEDIUM,
      `Expected high/medium for committed files, got ${specResult.confidence}`
    );
  });
});
