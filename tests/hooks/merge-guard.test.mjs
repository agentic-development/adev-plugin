import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createTempDir, createTempGitRepo, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

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
    const gitDir = createTempGitRepo({ branch: "main" });
    try {
      writeFixture(gitDir, ".context-index/manifest.yaml", "merge_policy: ask\n");

      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git merge main"),
      });
      assert.equal(exitCode, 0);
      assert.ok(stderr.includes("Advisory"), "stderr should contain advisory message");
    } finally {
      cleanupTempDir(gitDir);
    }
  });

  it("blocks protected branch even with merge policy", () => {
    const gitDir = createTempGitRepo({ branch: "main" });
    try {
      writeFixture(gitDir, ".context-index/manifest.yaml", "merge_policy: merge\n");

      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git push origin main"),
      });
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes("protected"), "stderr should mention protected branch");
    } finally {
      cleanupTempDir(gitDir);
    }
  });

  it("respects custom protected_branches", () => {
    const gitDir = createTempGitRepo({ branch: "main" });
    try {
      writeFixture(
        gitDir,
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
        cwd: gitDir,
        stdin: commandInput("git push origin production"),
      });
      assert.equal(blockResult.exitCode, 2);

      // Should allow push to main (not in custom list)
      const allowResult = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git push origin main"),
      });
      assert.equal(allowResult.exitCode, 0);
    } finally {
      cleanupTempDir(gitDir);
    }
  });

  it("finds manifest from a subdirectory of the repo", () => {
    const gitDir = createTempGitRepo({ branch: "main" });
    try {
      writeFixture(gitDir, ".context-index/manifest.yaml", "merge_policy: ask\n");
      const subDir = join(gitDir, "packages", "core");
      mkdirSync(subDir, { recursive: true });

      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: subDir,
        stdin: commandInput("git merge main"),
      });
      // ask policy => exit 0 with Advisory, proving the manifest was found
      assert.equal(exitCode, 0);
      assert.ok(stderr.includes("Advisory"), "should find manifest via git repo root and apply ask policy");
    } finally {
      cleanupTempDir(gitDir);
    }
  });

  it("does not leak parent repo manifest into child repo", () => {
    // Simulate parent repo with manifest and a child submodule repo without one
    const parentDir = createTempGitRepo({ branch: "main" });
    try {
      writeFixture(parentDir, ".context-index/manifest.yaml", "merge_policy: ask\n");
      const childDir = join(parentDir, "tests", "evals", "child-repo");
      mkdirSync(childDir, { recursive: true });
      // Initialize child as its own git repo
      execSync("git init && git checkout -b main", { cwd: childDir, stdio: "ignore" });

      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: childDir,
        stdin: commandInput("git push origin main"),
      });
      // Child has no manifest, so default pr policy applies (blocks main push)
      // But crucially, it does NOT pick up the parent's "ask" policy
      assert.equal(exitCode, 2);
      assert.ok(!stderr.includes("Advisory"), "should not inherit parent repo manifest");
    } finally {
      cleanupTempDir(parentDir);
    }
  });

  it("blocks git checkout main && git merge", () => {
    const { exitCode } = runHook("merge-guard.sh", {
      cwd: tempDir,
      stdin: commandInput("git checkout main && git merge feature/x"),
    });
    assert.equal(exitCode, 2);
  });

  describe("git commit guard", () => {
    let gitDir;

    beforeEach(() => {
      gitDir = createTempGitRepo({ branch: "main" });
    });

    afterEach(() => {
      cleanupTempDir(gitDir);
    });

    it("blocks git commit when on main branch", () => {
      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput('git commit -m "bad commit"'),
      });
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes("main"), "stderr should mention main");
    });

    it("allows git commit when on a feature branch", () => {
      const featureDir = createTempGitRepo({ branch: "feat/test" });
      try {
        const { exitCode } = runHook("merge-guard.sh", {
          cwd: featureDir,
          stdin: commandInput('git commit -m "ok commit"'),
        });
        assert.equal(exitCode, 0);
      } finally {
        cleanupTempDir(featureDir);
      }
    });

    it("blocks git commit on custom protected branch", () => {
      writeFixture(
        gitDir,
        ".context-index/manifest.yaml",
        "merge_policy: pr\nprotected_branches:\n  - main\n  - release\n"
      );

      const { exitCode } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput('git commit -m "bad"'),
      });
      assert.equal(exitCode, 2);
    });

    it("advisory for git commit on main with ask policy", () => {
      writeFixture(gitDir, ".context-index/manifest.yaml", "merge_policy: ask\n");

      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput('git commit -m "ask commit"'),
      });
      assert.equal(exitCode, 0);
      assert.ok(stderr.includes("Advisory"), "stderr should contain advisory");
    });
  });
});
