/**
 * Eval tests for Check 12 "Success Heuristic Extraction" of /adev:validate.
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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { runCheck12 } from "./validate-success-heuristic-harness.mjs";

const MODULE_SLUG = "hooks";
const DATE = "2026-04-09";
const SPEC_TITLE = "Some Feature";

/**
 * Seed a temp project with a manifest declaring one module and a target
 * spec at `.context-index/specs/features/<module>/some-feature.md`.
 *
 * Returns paths the test needs for the Check 12 context.
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

describe("validate Check 12 — eval paths", () => {
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

    // Create the sibling validation report BEFORE running Check 12.
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
