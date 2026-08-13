/**
 * issue-607 — execution state must resolve across git worktrees like the
 * issue board and the milestone registry already do.
 *
 * Before this change `lib/execution-state.mjs` wrote
 * `<projectRoot>/.context-index/.execution-state.json`, which is worktree-local:
 * `/adev:work` reported "idle" in one worktree while another worktree held
 * in-progress work. `resolveStorageRoot()` (lib/issues/resolve-root.mjs) is now
 * the single resolver for all three artifacts, with `tasks.db_path` as the
 * unified knob.
 *
 * These tests build a real main-repo + linked-worktree pair, mirroring
 * `tests/milestones-integration.test.mjs` (Task 9/10).
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  writeExecutionState,
  readExecutionState,
  clearExecutionState,
} from "../../lib/execution-state.mjs";

const STATE_REL = join(".context-index", ".execution-state.json");
const MANIFEST_REL = join(".context-index", "manifest.yaml");

/** Create a temp project root with `.context-index/manifest.yaml` seeded. */
function makeProject(manifestBody = "tasks:\n  backend: json\n") {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, MANIFEST_REL), manifestBody);
  return dir;
}

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
}

/** Init a git repo with one commit so worktrees can be created. */
function initGitRepo(dir) {
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "test@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, ".gitignore"), ".context-index/.execution-state.json\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "init"], dir);
  return dir;
}

/**
 * Main repo + linked worktree. The worktree gets its own
 * `.context-index/manifest.yaml` (committed, so `git worktree add` checks it
 * out) — exactly the arrangement `/adev:work` runs in.
 */
function makeWorktreePair() {
  const main = makeProject();
  initGitRepo(main);

  const parent = createTempDir();
  const worktree = join(parent, "wt");
  git(["worktree", "add", "-q", "--detach", worktree], main);

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

describe("execution-state: worktree-shared storage (issue-607)", () => {
  it("writes from a linked worktree land in the main repo, not the worktree", () => {
    const fx = makeWorktreePair();
    try {
      assert.ok(
        existsSync(join(fx.worktree, MANIFEST_REL)),
        "fixture sanity: the worktree checks out its own manifest"
      );

      writeExecutionState(fx.worktree, {
        status: "active",
        planRef: ".context-index/specs/features/x/y.plan.md",
        currentTask: 3,
        issueBinding: "issue-607",
      });

      assert.ok(
        existsSync(join(fx.main, STATE_REL)),
        "state file must be written to the main repo root"
      );
      assert.ok(
        !existsSync(join(fx.worktree, STATE_REL)),
        "worktree-local state file must NOT exist (storage is shared)"
      );
    } finally {
      fx.cleanup();
    }
  });

  it("a worktree reads the state the main repo wrote", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, {
        status: "active",
        planRef: "plan.md",
        currentTask: 7,
        issueBinding: "issue-607",
      });

      const fromWorktree = readExecutionState(fx.worktree);
      assert.ok(fromWorktree, "worktree must see the main repo's state");
      assert.equal(fromWorktree.status, "active");
      assert.equal(fromWorktree.currentTask, 7);
      assert.equal(fromWorktree.issueBinding, "issue-607");
    } finally {
      fx.cleanup();
    }
  });

  it("ignores a stale worktree-local state file (shadow file)", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, {
        status: "active",
        planRef: "plan.md",
        currentTask: 2,
        issueBinding: "issue-607",
      });
      // A frozen copy left behind in the worktree — the exact failure mode
      // that reported "idle" while work was in progress elsewhere.
      writeFileSync(
        join(fx.worktree, STATE_REL),
        JSON.stringify({ status: "idle", planRef: "", currentTask: "" }, null, 2) + "\n"
      );

      const fromWorktree = readExecutionState(fx.worktree);
      assert.equal(
        fromWorktree.status,
        "active",
        "the shared state, not the worktree-local shadow copy, must win"
      );
      assert.equal(fromWorktree.currentTask, 2);
    } finally {
      fx.cleanup();
    }
  });

  it("clearExecutionState from a worktree clears the shared state", () => {
    const fx = makeWorktreePair();
    try {
      writeExecutionState(fx.main, {
        status: "active",
        planRef: "plan.md",
        currentTask: 1,
      });
      clearExecutionState(fx.worktree);

      const fromMain = readExecutionState(fx.main);
      assert.equal(fromMain.status, "idle");
      assert.equal(fromMain.planRef, "");
      const onDisk = JSON.parse(readFileSync(join(fx.main, STATE_REL), "utf8"));
      assert.equal(onDisk.status, "idle");
    } finally {
      fx.cleanup();
    }
  });

  it("a non-git project root still writes locally (fallback unchanged)", () => {
    const dir = makeProject();
    try {
      writeExecutionState(dir, { status: "idle" });
      assert.ok(
        existsSync(join(dir, STATE_REL)),
        "outside a git checkout the caller's root remains the storage root"
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("execution-state: tasks.db_path unified knob (issue-607)", () => {
  it("relocates the state file to tasks.db_path", () => {
    const shared = createTempDir();
    const dir = makeProject(`tasks:\n  backend: json\n  db_path: ${shared}\n`);
    try {
      writeExecutionState(dir, {
        status: "blocked",
        blockers: "waiting on review",
      });

      assert.ok(
        existsSync(join(shared, STATE_REL)),
        "state file must live under tasks.db_path"
      );
      assert.ok(
        !existsSync(join(dir, STATE_REL)),
        "project-local state file must NOT exist when db_path is set"
      );
      assert.equal(readExecutionState(dir).status, "blocked");
    } finally {
      cleanupTempDir(shared);
      cleanupTempDir(dir);
    }
  });

  it("throws INVALID_STORAGE_PATH when tasks.db_path is a regular file", () => {
    const dir = makeProject();
    try {
      const decoy = join(dir, "not-a-directory.txt");
      writeFileSync(decoy, "decoy");
      writeFileSync(
        join(dir, MANIFEST_REL),
        `tasks:\n  backend: json\n  db_path: ${decoy}\n`
      );

      assert.throws(
        () => writeExecutionState(dir, { status: "idle" }),
        (err) =>
          err.code === "INVALID_STORAGE_PATH" &&
          /must point at an existing directory/.test(err.message)
      );
      assert.throws(
        () => readExecutionState(dir),
        (err) => err.code === "INVALID_STORAGE_PATH"
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("throws INVALID_STORAGE_PATH when tasks.db_path does not exist", () => {
    const dir = makeProject();
    try {
      const missing = join(dir, "no", "such", "dir");
      writeFileSync(
        join(dir, MANIFEST_REL),
        `tasks:\n  backend: json\n  db_path: ${missing}\n`
      );
      assert.throws(
        () => readExecutionState(dir),
        (err) => err.code === "INVALID_STORAGE_PATH"
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("still rejects a projectRoot without a manifest (INVALID_PROJECT_ROOT precedes resolution)", () => {
    const dir = createTempDir();
    try {
      assert.throws(
        () => readExecutionState(dir),
        (err) => err.code === "INVALID_PROJECT_ROOT"
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});
