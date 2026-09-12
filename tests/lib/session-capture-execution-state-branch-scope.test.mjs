/**
 * `.session-tracking.jsonl`'s `issue`/`epic` fields feed the
 * `prepare-commit-msg` hook's `Issue:` commit trailer. Execution state is
 * deliberately shared across every worktree of a repo (issue-607), so a
 * concurrent session's `issueBinding` in another worktree — on another
 * branch, working an unrelated issue — must never be attributed to a commit
 * made in THIS worktree.
 *
 * Spec: .context-index/specs/features/session-awareness/execution-state-file.spec.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { writeExecutionState } from "../../lib/execution-state.mjs";
import { runToolUseCapture } from "../../lib/session-capture.mjs";

const MANIFEST_REL = join(".context-index", "manifest.yaml");

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, MANIFEST_REL), "project:\n  name: t\ntasks:\n  backend: file\n");
  return dir;
}

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
}

function initGitRepo(dir) {
  git(["init", "-q", "-b", "epic-branch"], dir);
  git(["config", "user.email", "test@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, ".gitignore"), ".context-index/.execution-state.json\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "init"], dir);
  return dir;
}

/**
 * Main repo checked out on "epic-branch" + a linked worktree checked out on
 * a DIFFERENT branch ("skill-branch") — the exact shape of the reported bug:
 * one worktree/session active on one branch, a second worktree committing
 * unrelated work on another.
 */
function makeCrossBranchWorktreePair() {
  const main = makeProject();
  initGitRepo(main);

  const parent = createTempDir();
  const worktree = join(parent, "wt");
  git(["worktree", "add", "-q", "-b", "skill-branch", worktree], main);

  return {
    main,
    worktree,
    cleanup() {
      try {
        git(["worktree", "remove", "-f", worktree], main);
      } catch {
        /* best effort */
      }
      cleanupTempDir(parent);
      cleanupTempDir(main);
    },
  };
}

describe("runToolUseCapture — execution-state binding scoped to the committing branch", () => {
  it("omits Issue:/epic when the shared active state belongs to a different worktree's branch", async () => {
    const fx = makeCrossBranchWorktreePair();
    try {
      // A concurrent session in the main worktree (branch "epic-branch") is
      // mid-implementation on an unrelated epic.
      writeExecutionState(fx.main, {
        status: "active",
        planRef: ".context-index/specs/features/x/y.plan.md",
        currentTask: 3,
        issueBinding: "adev-plugin-ok65",
      });

      // This worktree (branch "skill-branch") makes an unrelated edit and
      // its PostToolUse hook fires.
      const { entry } = await runToolUseCapture({
        payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "SKILL.md" } },
        projectRoot: fx.worktree,
      });

      assert.equal(
        entry.issue,
        undefined,
        "must not attribute another worktree's active issue binding to this commit"
      );
      assert.equal(entry.epic, undefined);
    } finally {
      fx.cleanup();
    }
  });

  it("still stamps Issue:/epic when the active state was set from this same worktree/branch", async () => {
    const fx = makeCrossBranchWorktreePair();
    try {
      // This worktree (branch "skill-branch") is itself the one bound to the
      // issue — same branch that is about to commit.
      writeExecutionState(fx.worktree, {
        status: "active",
        planRef: ".context-index/specs/features/x/y.plan.md",
        currentTask: 1,
        issueBinding: "adev-plugin-legit",
      });

      const { entry } = await runToolUseCapture({
        payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
        projectRoot: fx.worktree,
      });

      assert.equal(entry.issue, "adev-plugin-legit");
    } finally {
      fx.cleanup();
    }
  });
});
