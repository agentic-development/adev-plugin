/**
 * Tests for lib/spec-drift.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanForDrift, stampDrift, clearDrift, hasDrift } from "../../lib/spec-drift.mjs";

/**
 * Helper: create a temp project directory.
 */
function makeTempProject() {
  return mkdtempSync(join(tmpdir(), "drift-test-"));
}

/**
 * Helper: write a file inside a project root.
 */
function writeFile(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(join(root, relPath, ".."), { recursive: true });
  writeFileSync(full, content);
  return relPath;
}

describe("scanForDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();

    // Spec with source manifest tracking lib/foo.mjs
    writeFile(root, ".context-index/specs/features/auth/login.md", [
      "---",
      "type: live-spec",
      "title: Login",
      "source-manifest:",
      '  sha: "abc1234"',
      "  files:",
      "    - lib/foo.mjs",
      "    - tests/foo.test.mjs",
      '  computed-at: "2026-04-01T12:00:00Z"',
      "---",
      "",
      "# Login",
    ].join("\n"));

    // Second spec also tracking lib/foo.mjs (shared file)
    writeFile(root, ".context-index/specs/features/dashboard/widgets.md", [
      "---",
      "type: live-spec",
      "title: Widgets",
      "source-manifest:",
      '  sha: "def5678"',
      "  files:",
      "    - lib/foo.mjs",
      "    - lib/widgets.mjs",
      '  computed-at: "2026-04-02T10:00:00Z"',
      "---",
      "",
      "# Widgets",
    ].join("\n"));

    // Spec without source-manifest
    writeFile(root, ".context-index/specs/features/auth/session.md", [
      "---",
      "type: live-spec",
      "title: Session",
      "status: draft",
      "---",
      "",
      "# Session",
    ].join("\n"));

    // Spec with malformed frontmatter
    writeFile(root, ".context-index/specs/features/auth/broken.md", [
      "---",
      "type: live-spec",
      "title: Broken",
      "source-manifest: [invalid yaml that breaks",
      "---",
      "",
      "# Broken",
    ].join("\n"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns matching specs when file is tracked by source manifest", async () => {
    const results = await scanForDrift("lib/foo.mjs", root);
    assert.ok(results.length >= 1);
    const specPaths = results.map(r => r.specPath);
    assert.ok(specPaths.some(p => p.includes("login.md")));
  });

  it("returns empty array when file is not tracked", async () => {
    const results = await scanForDrift("untracked.mjs", root);
    assert.deepEqual(results, []);
  });

  it("returns multiple specs when file is tracked by multiple specs", async () => {
    const results = await scanForDrift("lib/foo.mjs", root);
    assert.equal(results.length, 2);
    const specPaths = results.map(r => r.specPath);
    assert.ok(specPaths.some(p => p.includes("login.md")));
    assert.ok(specPaths.some(p => p.includes("widgets.md")));
  });

  it("skips specs with malformed frontmatter", async () => {
    // Should not throw even though broken.md has bad frontmatter
    const results = await scanForDrift("lib/foo.mjs", root);
    assert.ok(Array.isArray(results));
  });

  it("skips specs without source-manifest block", async () => {
    // session.md has no source-manifest, should not appear in results
    const results = await scanForDrift("some-untracked.mjs", root);
    assert.deepEqual(results, []);
  });

  it("returns empty when context-index does not exist", async () => {
    const emptyRoot = makeTempProject();
    const results = await scanForDrift("lib/foo.mjs", emptyRoot);
    assert.deepEqual(results, []);
    rmSync(emptyRoot, { recursive: true, force: true });
  });
});

describe("stampDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();
    writeFile(root, "spec.md", [
      "---",
      "title: Test Spec",
      "status: review-passed",
      "---",
      "",
      "# Test",
    ].join("\n"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes drift_detected, drift_source, drift_at to frontmatter", async () => {
    const specPath = join(root, "spec.md");
    await stampDrift(specPath, "lib/foo.mjs");
    const content = readFileSync(specPath, "utf-8");
    assert.ok(content.includes("drift_detected: true"));
    assert.ok(content.includes("drift_source: lib/foo.mjs"));
    assert.ok(content.includes("drift_at:"));
  });

  it("overwrites existing drift fields on re-stamp (idempotent)", async () => {
    const specPath = join(root, "spec.md");
    await stampDrift(specPath, "lib/bar.mjs");
    const content = readFileSync(specPath, "utf-8");
    assert.ok(content.includes("drift_source: lib/bar.mjs"));
    // Ensure only one drift_detected field
    const matches = content.match(/drift_detected/g);
    assert.equal(matches.length, 1);
  });

  it("stores drift_source as project-root-relative path", async () => {
    const specPath = join(root, "spec.md");
    await stampDrift(specPath, "lib/foo.mjs");
    const content = readFileSync(specPath, "utf-8");
    assert.ok(content.includes("drift_source: lib/foo.mjs"));
    // Should not contain absolute path
    assert.ok(!content.includes(root));
  });
});

describe("clearDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("removes all three drift fields from frontmatter", async () => {
    const specPath = join(root, "drifted.md");
    writeFile(root, "drifted.md", [
      "---",
      "title: Drifted Spec",
      "status: review-passed",
      "drift_detected: true",
      "drift_source: lib/foo.mjs",
      "drift_at: 2026-05-01T10:00:00.000Z",
      "---",
      "",
      "# Drifted",
    ].join("\n"));

    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.ok(!content.includes("drift_detected"));
    assert.ok(!content.includes("drift_source"));
    assert.ok(!content.includes("drift_at"));
  });

  it("is a no-op on specs without drift fields", async () => {
    const specPath = join(root, "clean.md");
    const original = [
      "---",
      "title: Clean Spec",
      "status: review-passed",
      "---",
      "",
      "# Clean",
    ].join("\n");
    writeFile(root, "clean.md", original);

    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.equal(content, original);
  });

  it("preserves other frontmatter fields", async () => {
    const specPath = join(root, "preserve.md");
    writeFile(root, "preserve.md", [
      "---",
      "title: Preserve Spec",
      "charter: auth",
      "status: review-passed",
      "revision: 3",
      "drift_detected: true",
      "drift_source: lib/foo.mjs",
      "drift_at: 2026-05-01T10:00:00.000Z",
      "---",
      "",
      "# Preserve",
    ].join("\n"));

    await clearDrift(specPath);
    const content = readFileSync(specPath, "utf-8");
    assert.ok(content.includes("title: Preserve Spec"));
    assert.ok(content.includes("charter: auth"));
    assert.ok(content.includes("status: review-passed"));
    assert.ok(content.includes("revision: 3"));
    assert.ok(!content.includes("drift_detected"));
    assert.ok(!content.includes("drift_source"));
    assert.ok(!content.includes("drift_at"));
  });
});

describe("hasDrift", () => {
  let root;

  before(() => {
    root = makeTempProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns true when drift_detected is true", async () => {
    const specPath = join(root, "drifted.md");
    writeFile(root, "drifted.md", [
      "---",
      "title: Drifted",
      "drift_detected: true",
      "---",
      "",
      "# Drifted",
    ].join("\n"));
    const result = await hasDrift(specPath);
    assert.equal(result, true);
  });

  it("returns false when drift_detected is absent", async () => {
    const specPath = join(root, "clean.md");
    writeFile(root, "clean.md", [
      "---",
      "title: Clean",
      "---",
      "",
      "# Clean",
    ].join("\n"));
    const result = await hasDrift(specPath);
    assert.equal(result, false);
  });

  it("returns false when drift_detected is false", async () => {
    const specPath = join(root, "explicit-false.md");
    writeFile(root, "explicit-false.md", [
      "---",
      "title: Explicit False",
      "drift_detected: false",
      "---",
      "",
      "# Explicit False",
    ].join("\n"));
    const result = await hasDrift(specPath);
    assert.equal(result, false);
  });

  it("returns false for specs with malformed frontmatter", async () => {
    const specPath = join(root, "malformed.md");
    writeFile(root, "malformed.md", "No frontmatter at all\n# Just markdown\n");
    const result = await hasDrift(specPath);
    assert.equal(result, false);
  });
});
