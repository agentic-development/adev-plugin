/**
 * Eval tests for Check 13 "Success Heuristic Extraction" of /adev:validate.
 *
 * Covers the four observable SKIP/PASS paths documented in
 * `skills/validate/SKILL.md`:
 *
 *   1. First-run PASS extracts a heuristic at `medium` confidence.
 *   2. A prior sibling `-validation.md` file causes SKIP `"not first-run PASS"`.
 *   3. A single failed sub-check causes SKIP `"non-PASS result"`.
 *   4. Simulated helper-unavailable causes SKIP `"helper unavailable"`.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics, deriveHeuristicId } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { deriveId, runCheck12 } from "./validate-success-heuristic-harness.mjs";

const MODULE_SLUG = "hooks";
const DATE = "2026-04-09";
const SPEC_TITLE = "Some Feature";

/**
 * Seed a temp project with a manifest declaring one module and a target
 * spec at `.context-index/specs/features/<module>/some-feature.md`.
 *
 * Returns paths the test needs for the Check 13 context.
 *
 * @param {string} root
 * @returns {{ specAbs: string, specRel: string, reportRel: string }}
 */
function seedFixture(root) {
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(
    join(root, ".context-index", "manifest.yaml"),
    `modules:\n  - slug: ${MODULE_SLUG}\n    path: ${MODULE_SLUG}/\n`,
  );

  const specDirRel = `.context-index/specs/features/${MODULE_SLUG}`;
  const specDirAbs = join(root, specDirRel);
  mkdirSync(specDirAbs, { recursive: true });

  const specRel = `${specDirRel}/some-feature.md`;
  const specAbs = join(root, specRel);
  writeFileSync(
    specAbs,
    `---\ncharter: ${MODULE_SLUG}\n---\n\n# Live Spec: ${SPEC_TITLE}\n\nBody.\n`,
  );

  const reportRel = `${specDirRel}/some-feature-validation.md`;
  return { specAbs, specRel, reportRel };
}

/**
 * Build a passing checkResults map for all 11 sub-checks.
 * @returns {Record<string, boolean>}
 */
function allPassing() {
  const results = {};
  for (let i = 1; i <= 11; i += 1) {
    results[String(i)] = true;
  }
  return results;
}

describe("validate Check 13 — eval paths", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("first-run PASS extracts heuristic at medium confidence", async () => {
    const { specAbs, reportRel } = seedFixture(tempDir);

    const result = await runCheck12(tempDir, {
      specPath: specAbs,
      charter: MODULE_SLUG,
      specTitle: SPEC_TITLE,
      reportPath: reportRel,
      checkResults: allPassing(),
      modules: [MODULE_SLUG],
      date: DATE,
    });

    assert.equal(result.status, "PASS", `expected PASS, got ${JSON.stringify(result)}`);
    assert.ok(result.heuristic, "heuristic should be returned on PASS");

    const h = result.heuristic;
    assert.ok(
      h.title.startsWith("First-run PASS: "),
      `title should start with 'First-run PASS: ' (got: ${h.title})`,
    );
    assert.equal(h.title, `First-run PASS: ${SPEC_TITLE}`);
    // A fresh first-run has exactly one evidence entry so auto-promotion
    // from `medium` to `high` cannot fire (needs ≥3 distinct paths).
    assert.equal(h.confidence, "medium");
    assert.equal(h.scope, MODULE_SLUG);
    assert.equal(h.evidence.length, 1);
    assert.equal(h.evidence[0].source, "validation");
    assert.equal(h.evidence[0].date, DATE);
    assert.equal(h.evidence[0].path, reportRel);
    // The harness passes antiPattern: "" through writeHeuristic, which
    // echoes it back on the returned entry. The serializer drops the
    // empty string when writing to disk, so the round-tripped entry
    // (asserted below) does not carry it.
    assert.ok(h.antiPattern === "" || h.antiPattern === undefined);

    // Round-trip through readHeuristics at the medium threshold.
    const found = await readHeuristics(tempDir, {
      module: MODULE_SLUG,
      minConfidence: "medium",
    });
    assert.equal(found.length, 1);
    assert.equal(found[0].id, h.id);
    assert.equal(found[0].title, h.title);
    assert.equal(found[0].confidence, "medium");
    assert.equal(found[0].antiPattern, undefined);
  });

  it("second-run SKIPs with 'not first-run PASS' when prior report exists", async () => {
    const { specAbs, reportRel } = seedFixture(tempDir);

    // Create the sibling validation report BEFORE running Check 13.
    writeFileSync(join(tempDir, reportRel), `# Validation Report\n`);

    const result = await runCheck12(tempDir, {
      specPath: specAbs,
      charter: MODULE_SLUG,
      specTitle: SPEC_TITLE,
      reportPath: reportRel,
      checkResults: allPassing(),
      modules: [MODULE_SLUG],
      date: DATE,
    });

    assert.equal(result.status, "SKIP");
    assert.equal(result.reason, "not first-run PASS");
    assert.equal(result.heuristic, undefined);

    // No heuristic should have been written.
    const found = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(found.length, 0);
  });

  it("partial FAIL SKIPs with 'non-PASS result'", async () => {
    const { specAbs, reportRel } = seedFixture(tempDir);

    const checkResults = allPassing();
    checkResults["2"] = false;

    const result = await runCheck12(tempDir, {
      specPath: specAbs,
      charter: MODULE_SLUG,
      specTitle: SPEC_TITLE,
      reportPath: reportRel,
      checkResults,
      modules: [MODULE_SLUG],
      date: DATE,
    });

    assert.equal(result.status, "SKIP");
    assert.equal(result.reason, "non-PASS result");
    assert.equal(result.heuristic, undefined);

    const found = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(found.length, 0);
  });

  it("helper unavailable SKIPs with 'helper unavailable'", async () => {
    const { specAbs, reportRel } = seedFixture(tempDir);

    const result = await runCheck12(tempDir, {
      specPath: specAbs,
      charter: MODULE_SLUG,
      specTitle: SPEC_TITLE,
      reportPath: reportRel,
      checkResults: allPassing(),
      modules: [MODULE_SLUG],
      date: DATE,
      simulateHelperUnavailable: true,
    });

    assert.equal(result.status, "SKIP");
    assert.equal(result.reason, "helper unavailable");
    assert.equal(result.heuristic, undefined);

    const found = await readHeuristics(tempDir, { module: MODULE_SLUG });
    assert.equal(found.length, 0);
  });
});

// ── Convergence on the shared digest function ────────────────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
// Plan-task: 6
//
// The harness used to hash the ABSOLUTE spec path, so the same spec extracted
// from two checkouts produced two different ids. Its derivation now takes a
// repo-relative path and delegates to the shared digest function.

describe("validate harness — convergence on the shared digest function", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("runCheck12 derives the id from the repo-relative spec path, not the absolute one", async () => {
    // The seam under test is the harness's absolute -> repo-relative
    // conversion. Asserting `deriveId === deriveHeuristicId` would be a
    // tautology (deriveId is a pass-through) and would pass with the
    // absolute-path bug fully intact, so pin runCheck12's actual output.
    const { specAbs, specRel, reportRel } = seedFixture(tempDir);

    const result = await runCheck12(tempDir, {
      specPath: specAbs,
      charter: MODULE_SLUG,
      specTitle: SPEC_TITLE,
      reportPath: reportRel,
      checkResults: allPassing(),
      modules: [MODULE_SLUG],
      date: DATE,
    });

    assert.equal(result.status, "PASS", JSON.stringify(result));
    assert.equal(
      result.heuristic.id,
      deriveHeuristicId("some-feature", specRel, result.heuristic.pattern),
    );
    // And the absolute-path derivation must NOT be what was used.
    assert.notEqual(
      result.heuristic.id,
      deriveHeuristicId("some-feature", specAbs, result.heuristic.pattern),
    );
  });

  it("two checkouts at different absolute paths yield the same id", async () => {
    const other = createTempDir();
    try {
      const a = seedFixture(tempDir);
      const b = seedFixture(other);
      assert.notEqual(a.specAbs, b.specAbs, "the two fixtures must differ in absolute path");

      const context = (seeded) => ({
        specPath: seeded.specAbs,
        charter: MODULE_SLUG,
        specTitle: SPEC_TITLE,
        reportPath: seeded.reportRel,
        checkResults: allPassing(),
        modules: [MODULE_SLUG],
        date: DATE,
      });

      const first = await runCheck12(tempDir, context(a));
      const second = await runCheck12(other, context(b));

      assert.equal(first.status, "PASS", JSON.stringify(first));
      assert.equal(second.status, "PASS", JSON.stringify(second));
      assert.equal(
        first.heuristic.id,
        second.heuristic.id,
        "the id must not depend on where the repository is checked out",
      );
    } finally {
      cleanupTempDir(other);
    }
  });

  it("two distinct spec paths still yield distinct ids", () => {
    assert.notEqual(
      deriveId("x", "specs/features/a/foo.md", "P"),
      deriveId("x", "specs/features/b/foo.md", "P"),
    );
  });

  it("the harness holds no private createHash call", () => {
    const source = readFileSync(
      new URL("./validate-success-heuristic-harness.mjs", import.meta.url),
      "utf8",
    );
    // Assert on the import graph rather than a raw substring: a comment that
    // merely names `createHash` must not fail this guard, but pulling the
    // primitive back in must.
    assert.doesNotMatch(
      source,
      /^\s*import\s[^\n]*["']node:crypto["']/m,
      "the harness must not import node:crypto — hashing belongs to the shared digest function",
    );
    assert.match(
      source,
      /from ["']\.\.\/\.\.\/lib\/heuristics\.mjs["']/,
      "the harness must import the shared helpers from lib/heuristics.mjs",
    );
  });
});
