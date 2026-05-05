/**
 * Tests for sync-trigger.sh drift detection path.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHook } from "../helpers.mjs";

/**
 * Helper: create a temp project directory with .context-index.
 */
function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "drift-hook-test-"));
  return dir;
}

function writeFile(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(join(root, relPath, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("sync-trigger drift detection", () => {
  let root;

  before(() => {
    root = makeTempProject();

    // Create manifest
    writeFile(root, ".context-index/manifest.yaml", "project:\n  name: test\n");

    // Create spec with source-manifest tracking lib/foo.mjs
    writeFile(root, ".context-index/specs/features/auth/login.spec.md", [
      "---",
      "type: live-spec",
      "title: Login",
      "source-manifest:",
      '  sha: "abc1234"',
      "  files:",
      "    - lib/foo.mjs",
      '  computed-at: "2026-04-01T12:00:00Z"',
      "---",
      "",
      "# Login",
    ].join("\n"));

    // Create the tracked source file
    writeFile(root, "lib/foo.mjs", "export const foo = 1;\n");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("emits JSON warning when edited file is tracked by a spec", async () => {
    const result = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: join(root, "lib/foo.mjs") },
      cwd: root,
    });

    assert.equal(result.exitCode, 0);
    // Should contain a drift warning
    assert.ok(result.stdout.includes("Spec drift"), `stdout should contain drift warning but got: ${result.stdout}`);
  });

  it("emits no warning when edited file is not tracked", async () => {
    const result = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: join(root, "lib/untracked.mjs") },
      cwd: root,
    });

    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("Spec drift"));
  });

  it("still handles constitution.md edits (existing behavior)", async () => {
    const result = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: join(root, ".context-index/constitution.md") },
      cwd: root,
    });

    assert.equal(result.exitCode, 0);
    // Should trigger the existing sync suggestion
    assert.ok(result.stdout.includes("Constitution was updated") || result.stdout.includes("adev"));
  });

  it("skips drift scan when .context-index does not exist", async () => {
    const emptyRoot = makeTempProject();
    const result = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: join(emptyRoot, "lib/foo.mjs") },
      cwd: emptyRoot,
    });

    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("Spec drift"));
    rmSync(emptyRoot, { recursive: true, force: true });
  });

  it("always exits 0 (never blocks)", async () => {
    const result = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: join(root, "lib/foo.mjs") },
      cwd: root,
    });

    assert.equal(result.exitCode, 0);
  });

  it("skips files outside project root", async () => {
    const result = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "/etc/passwd" },
      cwd: root,
    });

    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("Spec drift"));
  });
});
