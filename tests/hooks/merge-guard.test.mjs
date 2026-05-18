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

  // Bug 3 regression: the merge-guard hook previously blocked ANY 'git merge'
  // command that mentioned a protected branch, including 'git merge origin/main'
  // run FROM a feature branch (the routine "keep my PR current" workflow).
  // The corrected semantics is: block 'git merge' iff the CURRENT branch is
  // protected. The argument to git merge is irrelevant — what matters is which
  // branch would be advanced by the merge (the current branch).

  it("blocks git merge when current branch is protected (default policy)", () => {
    const gitDir = createTempGitRepo({ branch: "main" });
    try {
      const { exitCode, stderr } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git merge feature/foo"),
      });
      assert.equal(exitCode, 2);
      assert.ok(stderr.includes("main"), "stderr should mention main");
    } finally {
      cleanupTempDir(gitDir);
    }
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

  it("allows git merge to feature branch (current is not protected)", () => {
    const gitDir = createTempGitRepo({ branch: "feat/test" });
    try {
      const { exitCode } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git merge feature/foo"),
      });
      assert.equal(exitCode, 0);
    } finally {
      cleanupTempDir(gitDir);
    }
  });

  it("Bug 3: allows 'git merge origin/main' from a feature branch", () => {
    // The routine "keep my PR current with main" workflow. The old regex
    // matched `\bmain\b` anywhere in the command and blocked this case,
    // forcing every operator to use 'git rebase origin/main' as a workaround.
    const gitDir = createTempGitRepo({ branch: "feat/keep-current" });
    try {
      const { exitCode } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git merge origin/main"),
      });
      assert.equal(
        exitCode,
        0,
        "merging origin/main INTO a feature branch must be allowed",
      );
    } finally {
      cleanupTempDir(gitDir);
    }
  });

  it("blocks 'git merge origin/main' when current branch is main", () => {
    // Even though 'origin/main' is a remote ref, merging anything while on
    // main itself advances main directly and should still block.
    const gitDir = createTempGitRepo({ branch: "main" });
    try {
      const { exitCode } = runHook("merge-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git merge origin/main"),
      });
      assert.equal(exitCode, 2);
    } finally {
      cleanupTempDir(gitDir);
    }
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
