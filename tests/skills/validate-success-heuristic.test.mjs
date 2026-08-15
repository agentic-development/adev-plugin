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
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readHeuristics, deriveHeuristicId } from "../../lib/heuristics.mjs";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";
import { deriveId, deriveTitle, runCheck12 } from "./validate-success-heuristic-harness.mjs";

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

// ── Outcome-derived title prefix (PASS-path harness) ─────────────────────
//
// Spec: .context-index/specs/features/heuristics/failure-capture.spec.md
// Plan-task: 5
//
// The PASS-path suites import `runCheck12` from the harness and never invoke
// the hook, so the outcome-derived-prefix criterion has to be verified here
// too. The hook (`hooks/post-validate-extract-heuristics.mjs`) and the harness
// each own a copy of `prefixFor` BY DESIGN (plan decision D9): the acceptance
// criterion is that exactly two derivation copies exist and agree, which a
// shared `lib/` export would violate.

const HARNESS_PATH = join(PLUGIN_ROOT, "tests/skills/validate-success-heuristic-harness.mjs");
const HOOK_PATH = join(PLUGIN_ROOT, "hooks/post-validate-extract-heuristics.mjs");

/**
 * Count PREFIX-DERIVATION SITES across the repo's first-party source trees.
 *
 * The criterion is about copies of the prefix *derivation*, not every mention
 * of the literal — a plain grep for `"First-run PASS: "` also catches doc
 * comments and test assertions that legitimately name the string. So a file
 * counts as a derivation site iff BOTH hold:
 *
 *   1. it contains the literal `First-run PASS: ` at all, AND
 *   2. it contains a prefix-SELECTION construct at the start of a line —
 *      `const prefix =` or `function prefixFor` — i.e. the prefix is bound as
 *      a value used to compose a title, rather than appearing inside an
 *      argument to `assert.match(...)`.
 *
 * The line-start anchor is what separates a definition from an assertion:
 * `tests/hooks/post-validate-failure-capture.test.mjs` mentions
 * `function prefixFor` inside a regex literal on an `assert.match` line and is
 * correctly NOT a derivation site. `tests/skills/recover-extract-heuristic-
 * harness.mjs` binds a `const prefix` but never the PASS literal, so it is
 * excluded by (1).
 *
 * Today this returns exactly three files:
 *   1. hooks/post-validate-extract-heuristics.mjs      (survives)
 *   2. tests/skills/validate-success-heuristic-harness.mjs (survives)
 *   3. lib/cli/heuristics.mjs — the dead `extract` verb, deleted by Task 7
 *
 * TASK 7 TIGHTENS THE BOUND: after the dead verb is removed, Task 7 imports
 * this same helper and asserts `=== 2` instead of `<= 3`. Do not reimplement
 * the scan there.
 *
 * @returns {string[]} Repo-relative paths of derivation sites, sorted.
 */
export function findPrefixDerivationSites() {
  const roots = ["hooks", "lib", "skills", "tests"];
  const selection = /^\s*(?:const\s+prefix\s*=|function\s+prefixFor\b)/m;
  const sites = [];

  const walk = (absDir, relDir) => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const abs = join(absDir, entry.name);
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!/\.(mjs|js|md)$/.test(entry.name)) continue;
      const src = readFileSync(abs, "utf8");
      if (!src.includes("First-run PASS: ")) continue;
      if (!selection.test(src)) continue;
      sites.push(rel);
    }
  };

  for (const root of roots) walk(join(PLUGIN_ROOT, root), root);
  return sites.sort();
}

describe("validate harness — outcome-derived title prefix", () => {
  it("derives its prefix from the outcome, like the hook", () => {
    assert.equal(deriveTitle("PASS", "Foo"), "First-run PASS: Foo");
    assert.equal(deriveTitle("FAIL", "Foo"), "Validate FAIL: Foo");
  });

  it("defaults the outcome to PASS so single-argument callers keep working", () => {
    assert.equal(deriveTitle("Foo"), "First-run PASS: Foo");
    assert.equal(deriveTitle(), "First-run PASS: ");
  });

  it("treats an unknown outcome as PASS, matching the hook's ternary exactly", () => {
    // The hook is `outcome === 'FAIL' ? 'Validate FAIL: ' : 'First-run PASS: '`
    // — every non-FAIL value, settled or not, takes the PASS branch.
    assert.equal(deriveTitle("BLOCK", "Foo"), "First-run PASS: Foo");
    assert.equal(deriveTitle("SKIP", "Foo"), "First-run PASS: Foo");
    assert.equal(deriveTitle("", "Foo"), "First-run PASS: Foo");
  });

  it("caps both prefixes at 120 chars with unchanged truncation semantics", () => {
    const long = "X".repeat(150);

    const pass = deriveTitle("PASS", long);
    assert.equal(pass, `First-run PASS: ${"X".repeat(101)}...`);
    assert.equal(pass.length, 120);

    const fail = deriveTitle("FAIL", long);
    assert.equal(fail, `Validate FAIL: ${"X".repeat(102)}...`);
    assert.equal(fail.length, 120);

    // A title that exactly fits is not truncated for either prefix.
    const fitsPass = deriveTitle("PASS", "Y".repeat(104));
    assert.equal(fitsPass, `First-run PASS: ${"Y".repeat(104)}`);
    assert.equal(fitsPass.length, 120);
    const fitsFail = deriveTitle("FAIL", "Y".repeat(105));
    assert.equal(fitsFail, `Validate FAIL: ${"Y".repeat(105)}`);
    assert.equal(fitsFail.length, 120);
  });

  it("runCheck12 still produces the PASS prefix end-to-end", async () => {
    const tempDir = createTempDir();
    try {
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
      assert.equal(result.status, "PASS", JSON.stringify(result));
      // runCheck12 only ever runs on all-checks-passed, so it passes 'PASS'.
      assert.equal(result.heuristic.title, `First-run PASS: ${SPEC_TITLE}`);
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("the hook and the harness both own the prefix pair, and they agree", () => {
    const hookSrc = readFileSync(HOOK_PATH, "utf8");
    const harnessSrc = readFileSync(HARNESS_PATH, "utf8");

    // Extract the two literals from each source and compare them pairwise,
    // rather than merely asserting each source mentions them.
    const extract = (src, label) => {
      const fail = src.match(/['"`](Validate FAIL: )['"`]/);
      const pass = src.match(/['"`](First-run PASS: )['"`]/);
      assert.ok(fail, `${label} must own the FAIL prefix literal`);
      assert.ok(pass, `${label} must own the PASS prefix literal`);
      return { fail: fail[1], pass: pass[1] };
    };

    const hook = extract(hookSrc, "the hook");
    const harness = extract(harnessSrc, "the harness");
    assert.deepEqual(harness, hook, "the two mirrored copies must agree");

    // Both must select on the outcome, not hardcode one branch.
    assert.match(hookSrc, /function\s+prefixFor\s*\(/);
    assert.match(harnessSrc, /function\s+prefixFor\s*\(/);
  });

  it("exactly the expected prefix-derivation sites exist", () => {
    const sites = findPrefixDerivationSites();
    assert.ok(
      sites.includes("hooks/post-validate-extract-heuristics.mjs"),
      `hook must be a derivation site (got: ${sites.join(", ")})`,
    );
    assert.ok(
      sites.includes("tests/skills/validate-success-heuristic-harness.mjs"),
      `harness must be a derivation site (got: ${sites.join(", ")})`,
    );
    // Provisional bound: the third site is lib/cli/heuristics.mjs's dead
    // `extract` verb. Task 7 deletes it and tightens this to `=== 2`.
    assert.ok(
      sites.length <= 3,
      `expected at most 3 prefix-derivation sites, got ${sites.length}: ${sites.join(", ")}`,
    );
  });
});
