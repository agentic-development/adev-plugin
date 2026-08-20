import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempGitRepo, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

/**
 * destructive-git-guard hook.
 *
 * Blocks git commands that discard the ENTIRE uncommitted working tree:
 * `git reset --hard` (any form), `git clean` with a force flag (any form),
 * and `git checkout`/`git restore` invocations whose final pathspec token
 * is exactly `.` (whole tree) rather than a named file.
 *
 * Regression context: a pipeline subagent ran `git checkout HEAD -- .`
 * mid-diagnosis and reverted 8 rounds of uncommitted review history.
 * See adev-plugin-implement-destructive-checkout-fabricated-proven-2s9i.
 */
describe("destructive-git-guard hook", () => {
  /** Build stdin JSON for a bash command. */
  function commandInput(cmd) {
    return JSON.stringify({ command: cmd });
  }

  it("allows non-git commands", () => {
    const { exitCode } = runHook("destructive-git-guard.sh", {
      stdin: commandInput("npm install"),
    });
    assert.equal(exitCode, 0);
  });

  it("allows read-only git commands", () => {
    for (const cmd of ["git status", "git log --oneline -5", "git diff", "git show HEAD"]) {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput(cmd),
      });
      assert.equal(exitCode, 0, `${cmd} should be allowed`);
    }
  });

  describe("git reset --hard", () => {
    it("blocks bare `git reset --hard`", () => {
      const { exitCode, stderr } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git reset --hard"),
      });
      assert.equal(exitCode, 2);
      assert.match(stderr, /git status/);
      assert.match(stderr, /git stash push -u/);
    });

    it("blocks `git reset --hard HEAD~3`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git reset --hard HEAD~3"),
      });
      assert.equal(exitCode, 2);
    });

    it("blocks `git reset --hard origin/main`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git reset --hard origin/main"),
      });
      assert.equal(exitCode, 2);
    });

    it("allows `git reset --soft HEAD~1`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git reset --soft HEAD~1"),
      });
      assert.equal(exitCode, 0);
    });

    it("allows bare `git reset` (mixed, index-only)", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git reset"),
      });
      assert.equal(exitCode, 0);
    });
  });

  describe("git clean with a force flag", () => {
    for (const cmd of ["git clean -f", "git clean -fd", "git clean -fx", "git clean -fdx", "git clean --force"]) {
      it(`blocks \`${cmd}\``, () => {
        const { exitCode } = runHook("destructive-git-guard.sh", {
          stdin: commandInput(cmd),
        });
        assert.equal(exitCode, 2, `${cmd} should be blocked`);
      });
    }

    it("allows `git clean -n` (dry run)", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git clean -n"),
      });
      assert.equal(exitCode, 0);
    });

    it("allows `git clean --dry-run`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git clean --dry-run -fd"),
      });
      assert.equal(exitCode, 0);
    });

    it("allows `git clean -d` (no force, refused by git itself)", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git clean -d"),
      });
      assert.equal(exitCode, 0);
    });
  });

  describe("git checkout against the whole tree", () => {
    for (const cmd of ["git checkout HEAD -- .", "git checkout -- .", "git checkout ."]) {
      it(`blocks \`${cmd}\``, () => {
        const { exitCode, stderr } = runHook("destructive-git-guard.sh", {
          stdin: commandInput(cmd),
        });
        assert.equal(exitCode, 2, `${cmd} should be blocked`);
        assert.match(stderr, /whole|entire/i);
      });
    }

    it("allows switching branches: `git checkout feature/x`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git checkout feature/x"),
      });
      assert.equal(exitCode, 0);
    });

    it("allows creating a new branch: `git checkout -b feature/x`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git checkout -b feature/x"),
      });
      assert.equal(exitCode, 0);
    });

    it("allows reverting a specific named file: `git checkout -- path/to/file.txt`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git checkout -- path/to/file.txt"),
      });
      assert.equal(exitCode, 0);
    });

    it("allows a dotfile-looking path that is not the whole-tree pathspec: `git checkout -- .github`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git checkout -- .github"),
      });
      assert.equal(exitCode, 0);
    });

    it("catches the whole-tree checkout when chained after another command", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git checkout main && git checkout HEAD -- ."),
      });
      assert.equal(exitCode, 2);
    });
  });

  describe("git restore against the whole tree", () => {
    it("blocks `git restore .`", () => {
      const { exitCode, stderr } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git restore ."),
      });
      assert.equal(exitCode, 2);
      assert.match(stderr, /whole|entire/i);
    });

    it("blocks `git restore --worktree .`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git restore --worktree ."),
      });
      assert.equal(exitCode, 2);
    });

    it("blocks `git restore --staged --worktree .` (touches worktree too)", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git restore --staged --worktree ."),
      });
      assert.equal(exitCode, 2);
    });

    it("allows `git restore --staged .` (unstage only, worktree untouched)", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git restore --staged ."),
      });
      assert.equal(exitCode, 0);
    });

    it("allows restoring a specific named file: `git restore path/to/file.txt`", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        stdin: commandInput("git restore path/to/file.txt"),
      });
      assert.equal(exitCode, 0);
    });
  });

  describe("completion.allow_destructive_git escape hatch", () => {
    let gitDir;

    beforeEach(() => {
      gitDir = createTempGitRepo({ branch: "feat/test" });
    });

    afterEach(() => cleanupTempDir(gitDir));

    it("blocks by default with no manifest", () => {
      const { exitCode } = runHook("destructive-git-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git reset --hard"),
      });
      assert.equal(exitCode, 2);
    });

    it("allows when the project opts in via manifest.yaml", () => {
      writeFixture(gitDir, ".context-index/manifest.yaml", "completion:\n  allow_destructive_git: true\n");
      const { exitCode } = runHook("destructive-git-guard.sh", {
        cwd: gitDir,
        stdin: commandInput("git reset --hard"),
      });
      assert.equal(exitCode, 0);
    });

    it("only the literal `true` opts in", () => {
      for (const value of ["false", "yes", "1"]) {
        writeFixture(gitDir, ".context-index/manifest.yaml", `completion:\n  allow_destructive_git: ${value}\n`);
        const { exitCode } = runHook("destructive-git-guard.sh", {
          cwd: gitDir,
          stdin: commandInput("git reset --hard"),
        });
        assert.equal(exitCode, 2, `"${value}" must not be read as consent`);
      }
    });
  });
});
