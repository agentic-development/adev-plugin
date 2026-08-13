/**
 * issue-607 follow-on — `migrateExecutionState` must resolve its TARGET the
 * same way `writeExecutionState` resolves it.
 *
 * Once execution state became worktree-shared, the migrator's three moving
 * parts disagreed: the "already migrated?" guard checked
 * `<projectRoot>/.context-index/.execution-state.json` (worktree-local, hence
 * always absent in a linked worktree), the write went through
 * `writeExecutionState` to the SHARED root, and the returned result reported
 * the local path. A migration run from a worktree therefore skipped its own
 * guard and overwrote the main checkout's live session state.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { migrateExecutionState } from "../../lib/migrate-state-artifacts.mjs";

const STATE_REL = join(".context-index", ".execution-state.json");
const LEGACY_REL = join(".context-index", ".execution-state.md");
const MANIFEST_REL = join(".context-index", "manifest.yaml");

const LEGACY_BODY = [
  "---",
  "status: active",
  'planRef: ".context-index/specs/features/x/y.plan.md"',
  "currentTask: 7",
  'issueBinding: "issue-999"',
  "---",
  "",
].join("\n");

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
}

/** Main repo + linked worktree, the arrangement the bug needs to show up. */
function makeWorktreePair() {
  const main = createTempDir();
  mkdirSync(join(main, ".context-index"), { recursive: true });
  writeFileSync(join(main, MANIFEST_REL), "tasks:\n  backend: json\n");
  git(["init", "-q", "-b", "main"], main);
  git(["config", "user.email", "test@example.com"], main);
  git(["config", "user.name", "Test"], main);
  git(["config", "commit.gpgsign", "false"], main);
  writeFileSync(join(main, ".gitignore"), ".context-index/.execution-state.json\n");
  git(["add", "-A"], main);
  git(["commit", "-q", "-m", "init"], main);

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

describe("migrateExecutionState: shared-root target (issue-607)", () => {
  it("does not clobber the main checkout's live state when run from a worktree", async () => {
    const fx = makeWorktreePair();
    try {
      const live = JSON.stringify({
        status: "active",
        planRef: "live.plan.md",
        currentTask: 42,
        issueBinding: "issue-111",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-08-13T00:00:00.000Z",
      });
      writeFileSync(join(fx.main, STATE_REL), live);

      // The worktree still carries a legacy markdown state file.
      writeFileSync(join(fx.worktree, LEGACY_REL), LEGACY_BODY);

      const result = await migrateExecutionState(fx.worktree);

      assert.equal(
        result.action,
        "skipped",
        "the shared target already exists — migration must skip, not overwrite",
      );
      assert.equal(
        readFileSync(join(fx.main, STATE_REL), "utf8"),
        live,
        "the main checkout's live session state must be byte-identical afterwards",
      );
      assert.ok(
        result.advisories.some((a) => a.code === "LEGACY_FILE_LINGERING"),
        "the un-migrated legacy file must still be reported",
      );
    } finally {
      fx.cleanup();
    }
  });

  it("reports the target it actually writes to", async () => {
    const fx = makeWorktreePair();
    try {
      writeFileSync(join(fx.worktree, LEGACY_REL), LEGACY_BODY);

      const result = await migrateExecutionState(fx.worktree);

      assert.equal(result.action, "migrated");
      assert.ok(
        existsSync(result.target),
        `reported target must exist on disk: ${result.target}`,
      );
      assert.ok(
        !existsSync(join(fx.worktree, STATE_REL)),
        "no worktree-local shadow copy may be left behind",
      );
    } finally {
      fx.cleanup();
    }
  });
});
