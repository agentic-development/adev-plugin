/**
 * Tests for lib/source-manifest.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { computeManifest, verifyManifest, buildReverseIndex } from "../../lib/source-manifest.mjs";

/**
 * Helper: create a temp project directory.
 */
function makeTempProject() {
  return mkdtempSync(join(tmpdir(), "manifest-test-"));
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

describe("computeManifest", () => {
  let root;

  before(() => {
    root = makeTempProject();
    writeFile(root, "a.mjs", "const a = 1;\n");
    writeFile(root, "b.mjs", "const b = 2;\n");
    writeFile(root, "sub/c.mjs", "const c = 3;\n");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns deterministic SHA for same files", async () => {
    const m1 = await computeManifest(["a.mjs", "b.mjs"], root);
    const m2 = await computeManifest(["a.mjs", "b.mjs"], root);
    assert.equal(m1.sha, m2.sha);
    assert.equal(m1.sha.length, 7);
  });

  it("returns same SHA regardless of input order", async () => {
    const m1 = await computeManifest(["a.mjs", "b.mjs"], root);
    const m2 = await computeManifest(["b.mjs", "a.mjs"], root);
    assert.equal(m1.sha, m2.sha);
  });

  it("uses per-file hashing, not concatenation", async () => {
    // Create files where concatenation would collide but per-file hashing differs.
    const collisionRoot = makeTempProject();
    writeFile(collisionRoot, "x.txt", "ab");
    writeFile(collisionRoot, "y.txt", "cd");
    const m1 = await computeManifest(["x.txt", "y.txt"], collisionRoot);

    // Rewrite so concatenation is the same ("abcd") but individual files differ.
    writeFile(collisionRoot, "x.txt", "abc");
    writeFile(collisionRoot, "y.txt", "d");
    const m2 = await computeManifest(["x.txt", "y.txt"], collisionRoot);

    assert.notEqual(m1.sha, m2.sha);
    rmSync(collisionRoot, { recursive: true, force: true });
  });

  it("returns sorted file list", async () => {
    const m = await computeManifest(["sub/c.mjs", "a.mjs", "b.mjs"], root);
    assert.deepEqual(m.files, ["a.mjs", "b.mjs", "sub/c.mjs"]);
  });

  it("includes computedAt as ISO timestamp", async () => {
    const before = new Date().toISOString();
    const m = await computeManifest(["a.mjs"], root);
    const after = new Date().toISOString();
    assert.ok(m.computedAt >= before);
    assert.ok(m.computedAt <= after);
  });

  it("returns null SHA for empty file list", async () => {
    const m = await computeManifest([], root);
    assert.equal(m.sha, null);
    assert.deepEqual(m.files, []);
    assert.ok(m.computedAt);
  });

  it("throws PATH_OUTSIDE_ROOT for path traversal", async () => {
    await assert.rejects(
      () => computeManifest(["../../../etc/passwd"], root),
      (err) => {
        assert.equal(err.code, "PATH_OUTSIDE_ROOT");
        return true;
      }
    );
  });

  it("throws FILES_NOT_FOUND for missing files", async () => {
    await assert.rejects(
      () => computeManifest(["nonexistent.mjs"], root),
      (err) => {
        assert.equal(err.code, "FILES_NOT_FOUND");
        assert.ok(err.missingFiles.includes("nonexistent.mjs"));
        return true;
      }
    );
  });
});

describe("verifyManifest", () => {
  let root;

  before(() => {
    root = makeTempProject();
    writeFile(root, "a.mjs", "const a = 1;\n");
    writeFile(root, "b.mjs", "const b = 2;\n");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns matches: true for unchanged files", async () => {
    const manifest = await computeManifest(["a.mjs", "b.mjs"], root);
    const result = await verifyManifest(manifest, root);
    assert.equal(result.matches, true);
    assert.equal(result.currentSha, manifest.sha);
  });

  it("returns matches: false for changed files", async () => {
    const manifest = await computeManifest(["a.mjs", "b.mjs"], root);
    // Modify a file after manifest was computed.
    writeFile(root, "a.mjs", "const a = 999;\n");
    const result = await verifyManifest(manifest, root);
    assert.equal(result.matches, false);
    assert.ok(result.currentSha);
    assert.notEqual(result.currentSha, manifest.sha);
    // Restore original.
    writeFile(root, "a.mjs", "const a = 1;\n");
  });

  it("returns matches: false and missingFiles for deleted files", async () => {
    const manifest = await computeManifest(["a.mjs", "b.mjs"], root);
    // Delete one file.
    unlinkSync(join(root, "b.mjs"));
    const result = await verifyManifest(manifest, root);
    assert.equal(result.matches, false);
    assert.equal(result.currentSha, null);
    assert.ok(result.missingFiles);
    assert.ok(result.missingFiles.includes("b.mjs"));
    // Restore for other tests.
    writeFile(root, "b.mjs", "const b = 2;\n");
  });

  it("handles empty manifest (sha: null)", async () => {
    const manifest = { sha: null, files: [], computedAt: new Date().toISOString() };
    const result = await verifyManifest(manifest, root);
    assert.equal(result.matches, true);
    assert.equal(result.currentSha, null);
  });
});

describe("buildReverseIndex", () => {
  let root;

  before(() => {
    root = makeTempProject();

    // Spec with source manifest claiming two files
    writeFile(root, "specs/features/auth/login.md", [
      "---",
      "type: live-spec",
      "title: Login",
      "source-manifest:",
      '  sha: "abc1234"',
      "  files:",
      "    - lib/login.mjs",
      "    - tests/login.test.mjs",
      '  computed-at: "2026-04-01T12:00:00Z"',
      "---",
      "",
      "# Login",
    ].join("\n"));

    // Spec with source manifest claiming one file
    writeFile(root, "specs/features/dashboard/widgets.md", [
      "---",
      "type: live-spec",
      "title: Widgets",
      "source-manifest:",
      '  sha: "def5678"',
      "  files:",
      "    - lib/widgets.mjs",
      '  computed-at: "2026-04-02T10:00:00Z"',
      "---",
      "",
      "# Widgets",
    ].join("\n"));

    // Spec without source manifest
    writeFile(root, "specs/features/auth/session.md", [
      "---",
      "type: live-spec",
      "title: Session",
      "status: draft",
      "---",
      "",
      "# Session",
    ].join("\n"));

    // Non-spec file (should be ignored)
    writeFile(root, "specs/features/auth/charter.md", [
      "---",
      "type: charter",
      "title: Auth",
      "---",
      "",
      "# Auth Charter",
    ].join("\n"));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("maps claimed files to their spec paths", async () => {
    const index = await buildReverseIndex(join(root, "specs/features"), root);
    assert.equal(index.get("lib/login.mjs"), "specs/features/auth/login.md");
    assert.equal(index.get("tests/login.test.mjs"), "specs/features/auth/login.md");
    assert.equal(index.get("lib/widgets.mjs"), "specs/features/dashboard/widgets.md");
  });

  it("does not include files from specs without manifests", async () => {
    const index = await buildReverseIndex(join(root, "specs/features"), root);
    // session.md has no source-manifest, so nothing mapped from it
    assert.equal(index.size, 3);
  });

  it("returns empty map for nonexistent directory", async () => {
    const index = await buildReverseIndex(join(root, "nonexistent"), root);
    assert.equal(index.size, 0);
  });

  it("returns empty map for directory with no manifests", async () => {
    writeFile(root, "empty-specs/readme.md", "# No specs here\n");
    const index = await buildReverseIndex(join(root, "empty-specs"), root);
    assert.equal(index.size, 0);
  });
});
