import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("merge-guard hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  /** Build stdin JSON for a bash command. */
  function commandInput(cmd) {
    return JSON.stringify({ command: cmd });
  }

  it("allows non-git commands", () => {
    const { exitCode } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("npm install"),
    });
    assert.equal(exitCode, 0);
  });

  it("blocks git merge to main (default policy)", () => {
    const { exitCode, stderr } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git merge main"),
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("main"), "stderr should mention main");
  });

  it("blocks git push to main", () => {
    const { exitCode, stderr } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git push origin main"),
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("main"), "stderr should mention main");
  });

  it("blocks gh pr merge", () => {
    const { exitCode, stderr } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("gh pr merge 42"),
    });
    assert.equal(exitCode, 2);
  });

  it("allows git merge to feature branch", () => {
    const { exitCode } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git merge feature/foo"),
    });
    assert.equal(exitCode, 0);
  });

  it("advisory mode with ask policy", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "merge_policy: ask\n");

    const { exitCode, stderr } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git merge main"),
    });
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes("Advisory"), "stderr should contain advisory message");
  });

  it("blocks protected branch even with merge policy", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "merge_policy: merge\n");

    const { exitCode, stderr } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git push origin main"),
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("protected"), "stderr should mention protected branch");
  });

  it("respects custom protected_branches", () => {
    writeFixture(
      tempDir,
      ".context-index/manifest.yaml",
      [
        "merge_policy: pr",
        "protected_branches:",
        "  - production",
        "  - staging",
      ].join("\n") + "\n"
    );

    // Should block push to production
    const blockResult = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git push origin production"),
    });
    assert.equal(blockResult.exitCode, 2);

    // Should allow push to main (not in custom list)
    const allowResult = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git push origin main"),
    });
    assert.equal(allowResult.exitCode, 0);
  });

  it("blocks git checkout main && git merge", () => {
    const { exitCode } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git checkout main && git merge feature/x"),
    });
    assert.equal(exitCode, 2);
  });
});
