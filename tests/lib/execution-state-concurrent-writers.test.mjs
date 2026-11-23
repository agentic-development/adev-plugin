/**
 * Execution state is one shared file per repository (every worktree resolves
 * to the main checkout's storage root), so two builds running at once — in
 * separate worktrees or on one branch — must not silently overwrite each
 * other's live state. A write that would replace another branch's live state,
 * or a different plan's fresh active state, is refused with
 * EXECUTION_STATE_CONFLICT unless forced.
 *
 * Fixtures are temp-dir git repos; nothing here resolves to the real repo's
 * storage root.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  clearExecutionState,
  readExecutionState,
  writeExecutionState,
} from "../../lib/execution-state.mjs";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "index.mjs");
const STATE_REL = join(".context-index", ".execution-state.json");
const MANIFEST_REL = join(".context-index", "manifest.yaml");

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
}

/** Main checkout on `main` plus a linked worktree on branch `feature-b`. */
function makeWorktreePair(manifestBody = "tasks:\n  backend: json\n") {
  const main = realpathSync(createTempDir());
  mkdirSync(join(main, ".context-index"), { recursive: true });
  writeFileSync(join(main, MANIFEST_REL), manifestBody);
  git(["init", "-q", "-b", "main"], main);
  git(["config", "user.email", "test@example.com"], main);
  git(["config", "user.name", "Test"], main);
  git(["config", "commit.gpgsign", "false"], main);
  writeFileSync(join(main, ".gitignore"), ".context-index/.execution-state.json\n");
  git(["add", "-A"], main);
  git(["commit", "-q", "-m", "init"], main);

  const parent = realpathSync(createTempDir());
  const worktree = join(parent, "wt");
  git(["worktree", "add", "-q", "-b", "feature-b", worktree], main);

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

function backdate(root, isoTimestamp) {
  const path = join(root, STATE_REL);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  doc.updated = isoTimestamp;
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

const PLAN_A = ".context-index/specs/features/a/a.plan.md";
const PLAN_B = ".context-index/specs/features/b/b.plan.md";

describe("execution-state: concurrent writers do not clobber each other", () => {
  it("a second worktree's active write is refused while another branch's build is active", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 3 });

      assert.throws(
        () => writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 1 }),
        (err) => {
          assert.equal(err.code, "EXECUTION_STATE_CONFLICT");
          assert.equal(err.owner.sourceBranch, "main");
          assert.equal(err.owner.planRef, PLAN_A);
          assert.equal(err.owner.status, "active");
          return true;
        }
      );

      const state = readExecutionState(fx.main);
      assert.equal(state.planRef, PLAN_A, "first build's state must survive");
      assert.equal(state.currentTask, 3);
      assert.equal(state.sourceBranch, "main");
    } finally {
      fx.cleanup();
    }
  });

  it("another branch's blocked state is never silently replaced, however old", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, {
        status: "blocked",
        blockers: "another session moved HEAD mid-run",
        nextAction: "re-run task 4",
      });
      backdate(fx.main, "2026-09-01T00:00:00.000Z");

      assert.throws(
        () => writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 1 }),
        { code: "EXECUTION_STATE_CONFLICT" }
      );
      assert.equal(readExecutionState(fx.main).blockers, "another session moved HEAD mid-run");
    } finally {
      fx.cleanup();
    }
  });

  it("a second worktree's clear does not wipe another branch's live state", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 2 });

      assert.throws(() => clearExecutionState(fx.worktree), { code: "EXECUTION_STATE_CONFLICT" });
      assert.throws(
        () => writeExecutionState(fx.worktree, { status: "standalone" }),
        { code: "EXECUTION_STATE_CONFLICT" }
      );
      assert.equal(readExecutionState(fx.main).status, "active");
    } finally {
      fx.cleanup();
    }
  });

  it("force overwrites another branch's live state", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 2 });
      writeExecutionState(
        fx.worktree,
        { status: "active", planRef: PLAN_B, currentTask: 1 },
        { force: true }
      );
      const state = readExecutionState(fx.main);
      assert.equal(state.planRef, PLAN_B);
      assert.equal(state.sourceBranch, "feature-b");

      clearExecutionState(fx.main, { force: true });
      assert.equal(readExecutionState(fx.main).status, "idle");
    } finally {
      fx.cleanup();
    }
  });

  it("another branch's active state past the claim lease can be taken over", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 2 });
      backdate(fx.main, new Date(Date.now() - 241 * 60_000).toISOString());

      writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 1 });
      assert.equal(readExecutionState(fx.main).planRef, PLAN_B);
    } finally {
      fx.cleanup();
    }
  });

  it("tasks.claim_ttl_minutes: 0 keeps another branch's active state live forever", () => {
    const fx = makeWorktreePair("tasks:\n  backend: json\n  claim_ttl_minutes: 0\n");
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 2 });
      backdate(fx.main, "2025-01-01T00:00:00.000Z");
      assert.throws(
        () => writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 1 }),
        { code: "EXECUTION_STATE_CONFLICT" }
      );
    } finally {
      fx.cleanup();
    }
  });

  it("a second plan on the same branch is refused while the first plan's state is fresh", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 3 });
      assert.throws(
        () => writeExecutionState(fx.main, { status: "active", planRef: PLAN_B, currentTask: 1 }),
        { code: "EXECUTION_STATE_CONFLICT" }
      );
      assert.equal(readExecutionState(fx.main).planRef, PLAN_A);
    } finally {
      fx.cleanup();
    }
  });

  it("the owning branch keeps writing its own state freely", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 1 });
      writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 2 });
      writeExecutionState(fx.worktree, { status: "blocked", blockers: "x", nextAction: "y" });
      writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_B, currentTask: 2 });
      clearExecutionState(fx.worktree);
      assert.equal(readExecutionState(fx.main).status, "idle");

      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 1 });
      assert.equal(readExecutionState(fx.worktree).planRef, PLAN_A, "idle state is free to claim");
    } finally {
      fx.cleanup();
    }
  });

  it("a legacy file without sourceBranch is not treated as another branch's", () => {
    const fx = makeWorktreePair();
    try {
      writeFileSync(
        join(fx.main, STATE_REL),
        JSON.stringify({
          status: "active",
          planRef: PLAN_A,
          currentTask: 2,
          updated: new Date().toISOString(),
        }) + "\n"
      );
      writeExecutionState(fx.worktree, { status: "active", planRef: PLAN_A, currentTask: 3 });
      assert.equal(readExecutionState(fx.main).currentTask, 3);
    } finally {
      fx.cleanup();
    }
  });

  it("CLI write/clear exit 2 with EXECUTION_STATE_CONFLICT; --force overrides", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, { status: "active", planRef: PLAN_A, currentTask: 3 });

      const refused = spawnSync(
        "node",
        [CLI, "execution-state", "write", "--status", "active", "--plan-ref", PLAN_B, "--current-task", "1"],
        { cwd: fx.worktree, encoding: "utf8" }
      );
      assert.equal(refused.status, 2, refused.stderr);
      assert.match(refused.stderr, /EXECUTION_STATE_CONFLICT/);
      assert.match(refused.stderr, /main/);

      const clearRefused = spawnSync("node", [CLI, "execution-state", "clear"], {
        cwd: fx.worktree,
        encoding: "utf8",
      });
      assert.equal(clearRefused.status, 2, clearRefused.stderr);
      assert.equal(readExecutionState(fx.main).planRef, PLAN_A);

      const forced = spawnSync(
        "node",
        [CLI, "execution-state", "write", "--status", "active", "--plan-ref", PLAN_B, "--current-task", "1", "--force"],
        { cwd: fx.worktree, encoding: "utf8" }
      );
      assert.equal(forced.status, 0, forced.stderr);
      assert.equal(readExecutionState(fx.main).planRef, PLAN_B);
    } finally {
      fx.cleanup();
    }
  });
});
