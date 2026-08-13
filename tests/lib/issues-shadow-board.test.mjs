/**
 * issue-615 — shadow issue board in git worktrees.
 *
 * `.context-index/tasks/tasks.json` is git-tracked, so `git worktree add`
 * materialises a frozen copy of the board inside every linked worktree, while
 * `resolveStorageRoot()` sends all adapter access to the MAIN repo working
 * copy. The two drift apart silently: anything that opens the board by path
 * (subagent, script, editor search) reads stale data with no error.
 *
 * These tests build a real main-repo + linked-worktree pair, diverge the two
 * copies, and assert that the divergence is now reported instead of ignored.
 *
 * Node built-ins only (node:test, node:fs, node:path, node:child_process).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { getIssueManager } from "../../lib/issues/registry.mjs";
import { resolveStorageRoot } from "../../lib/issues/resolve-root.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BOARD_REL = join(".context-index", "tasks", "tasks.json");

/** Load the shadow-board helpers lazily so that a missing export fails only
 *  the tests that use it, leaving the behavioural `getIssueManager` tests
 *  free to fail on their own assertions. */
async function loadShadowHelpers() {
  return import("../../lib/issues/resolve-root.mjs");
}

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
}

function board(issues, seq = issues.length) {
  return JSON.stringify(
    {
      version: 2,
      seq,
      epics: [],
      issues: issues.map((id) => ({
        id,
        title: `t-${id}`,
        status: "open",
        priority: 2,
        type: "task",
      })),
    },
    null,
    2
  );
}

/**
 * Build a main repo (with a committed board) plus a linked worktree, then
 * advance ONLY the main repo's board so the worktree copy is stale.
 *
 * @returns {{ main: string, worktree: string, cleanup: () => void }}
 */
function makeWorktreePair({ diverge = true } = {}) {
  const main = realpathSync(createTempDir());
  const wtParent = realpathSync(createTempDir());
  const worktree = join(wtParent, "wt");

  git(["init", "-b", "main"], main);
  git(["config", "user.email", "test@test.com"], main);
  git(["config", "user.name", "Test"], main);
  git(["config", "commit.gpgsign", "false"], main);

  mkdirSync(join(main, ".context-index", "tasks"), { recursive: true });
  writeFileSync(
    join(main, ".context-index", "manifest.yaml"),
    "project:\n  name: shadow-fixture\ntasks:\n  backend: json\n"
  );
  // The board as committed — this is what the worktree will check out.
  writeFileSync(join(main, BOARD_REL), board(["issue-1", "issue-2"]));
  git(["add", "-A"], main);
  git(["commit", "-m", "init board"], main);

  git(["worktree", "add", "-b", "feature", worktree], main);

  if (diverge) {
    // Advance the real board only. The worktree's tracked copy stays frozen,
    // exactly reproducing the measured 270-vs-296 divergence.
    writeFileSync(
      join(main, BOARD_REL),
      board(["issue-1", "issue-2", "issue-3", "issue-4", "issue-5"])
    );
  }

  return {
    main,
    worktree,
    cleanup: () => {
      try {
        rmSync(wtParent, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      cleanupTempDir(main);
    },
  };
}

/** Run a snippet in a child process rooted at `cwd`, returning its stderr. */
function runInChild(cwd, source, env = {}) {
  const scriptPath = join(cwd, `.shadow-probe-${process.pid}.mjs`);
  writeFileSync(scriptPath, source);
  try {
    const res = spawnSync(process.execPath, [scriptPath], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY: "1",
        ...env,
      },
    });
    return { stdout: res.stdout || "", stderr: res.stderr || "", status: res.status };
  } finally {
    rmSync(scriptPath, { force: true });
  }
}

const PROBE = (repoRoot) => `
import { getIssueManager } from ${JSON.stringify(join(repoRoot, "lib/issues/registry.mjs"))};
const m = getIssueManager({ tasks: { backend: "json" } }, process.cwd());
const issues = await m.list();
process.stdout.write(JSON.stringify({ count: issues.length }));
`;

describe("shadow issue board detection (issue-615)", () => {
  beforeEach(async () => {
    const mod = await loadShadowHelpers().catch(() => null);
    mod?.resetShadowBoardWarningState?.();
  });

  it("warns on stderr when a worktree's tracked board diverges from the real one", () => {
    const fx = makeWorktreePair();
    try {
      // Sanity: the fixture really does reproduce the defect.
      const localIssues = JSON.parse(readFileSync(join(fx.worktree, BOARD_REL), "utf8")).issues;
      const realIssues = JSON.parse(readFileSync(join(fx.main, BOARD_REL), "utf8")).issues;
      assert.equal(localIssues.length, 2, "worktree copy should be the stale committed board");
      assert.equal(realIssues.length, 5, "main repo copy should be the advanced board");

      const { stderr, stdout } = runInChild(fx.worktree, PROBE(REPO_ROOT));

      // The adapter itself was always correct — it reads the real board.
      assert.equal(JSON.parse(stdout).count, 5, "adapter must read the resolved board");

      // The fix: the stale shadow copy is announced instead of ignored.
      assert.match(
        stderr,
        /SHADOW_ISSUE_BOARD/,
        `expected a shadow-board advisory on stderr, got: ${JSON.stringify(stderr)}`
      );
      assert.match(stderr, /tasks\.json/);
      // Both paths are named so an operator can tell them apart.
      assert.ok(
        stderr.includes(join(fx.worktree, BOARD_REL)),
        "advisory must name the stale worktree copy"
      );
      assert.ok(
        stderr.includes(join(fx.main, BOARD_REL)),
        "advisory must name the authoritative board"
      );
      // Counts make the staleness concrete.
      assert.match(stderr, /2 issues/);
      assert.match(stderr, /5 issues/);
    } finally {
      fx.cleanup();
    }
  });

  it("stays silent in the main repo, where no shadow copy exists", () => {
    const fx = makeWorktreePair();
    try {
      const { stderr } = runInChild(fx.main, PROBE(REPO_ROOT));
      assert.doesNotMatch(
        stderr,
        /SHADOW_ISSUE_BOARD/,
        `main repo must not warn, got: ${JSON.stringify(stderr)}`
      );
    } finally {
      fx.cleanup();
    }
  });

  it("stays silent when the worktree copy is byte-identical to the real board", () => {
    const fx = makeWorktreePair({ diverge: false });
    try {
      const { stderr } = runInChild(fx.worktree, PROBE(REPO_ROOT));
      assert.doesNotMatch(
        stderr,
        /SHADOW_ISSUE_BOARD/,
        `identical copies must not warn, got: ${JSON.stringify(stderr)}`
      );
    } finally {
      fx.cleanup();
    }
  });

  it("honours ADEV_SILENCE_SHADOW_BOARD=1", () => {
    const fx = makeWorktreePair();
    try {
      const { stderr } = runInChild(fx.worktree, PROBE(REPO_ROOT), {
        ADEV_SILENCE_SHADOW_BOARD: "1",
      });
      assert.doesNotMatch(stderr, /SHADOW_ISSUE_BOARD/);
    } finally {
      fx.cleanup();
    }
  });

  it("warns at most once per process", () => {
    const fx = makeWorktreePair();
    try {
      const source = `
import { getIssueManager } from ${JSON.stringify(join(REPO_ROOT, "lib/issues/registry.mjs"))};
for (let i = 0; i < 5; i++) getIssueManager({ tasks: { backend: "json" } }, process.cwd());
`;
      const { stderr } = runInChild(fx.worktree, source);
      const hits = stderr.split("SHADOW_ISSUE_BOARD").length - 1;
      assert.equal(hits, 1, `expected exactly one advisory, got ${hits}`);
    } finally {
      fx.cleanup();
    }
  });

  it("detectShadowBoard reports both boards' contents", async () => {
    const { detectShadowBoard } = await loadShadowHelpers();
    const fx = makeWorktreePair();
    try {
      const report = detectShadowBoard({ tasks: { backend: "json" } }, fx.worktree);
      assert.equal(report.shadowed, true);
      assert.equal(report.divergent, true);
      assert.equal(report.localPath, join(fx.worktree, BOARD_REL));
      assert.equal(report.resolvedPath, join(fx.main, BOARD_REL));
      assert.equal(report.local.count, 2);
      assert.equal(report.resolved.count, 5);
      assert.equal(report.local.maxId, "issue-2");
      assert.equal(report.resolved.maxId, "issue-5");
    } finally {
      fx.cleanup();
    }
  });

  it("detectShadowBoard is side-effect free and never throws on junk input", async () => {
    const { detectShadowBoard } = await loadShadowHelpers();
    const nonRepo = createTempDir();
    try {
      // Not a git repo at all.
      assert.equal(detectShadowBoard({}, nonRepo).shadowed, false);
      // cwd does not exist.
      assert.equal(detectShadowBoard(null, "/definitely/not/a/path").shadowed, false);
      // Missing arguments must not throw either. (No claim about the verdict:
      // process.cwd() may legitimately BE a shadowed worktree.)
      assert.equal(typeof detectShadowBoard(undefined, undefined).shadowed, "boolean");
    } finally {
      cleanupTempDir(nonRepo);
    }
  });

  it("detectShadowBoard flags a shadow whose real board is missing entirely", async () => {
    const { detectShadowBoard } = await loadShadowHelpers();
    const fx = makeWorktreePair();
    try {
      rmSync(join(fx.main, BOARD_REL));
      const report = detectShadowBoard({ tasks: { backend: "json" } }, fx.worktree);
      assert.equal(report.shadowed, true);
      assert.equal(report.divergent, true);
      assert.equal(report.resolved.exists, false);
    } finally {
      fx.cleanup();
    }
  });

  it("resolveStorageRoot still points a worktree at the main repo (regression guard)", async () => {
    const fx = makeWorktreePair();
    try {
      assert.equal(
        realpathSync(resolveStorageRoot({ tasks: { backend: "json" } }, fx.worktree)),
        fx.main
      );
      // And the adapter built from it reads the authoritative board. Silence
      // the advisory: this assertion is about storage resolution, and the
      // fixture would otherwise print a (correct) warning into test output.
      const prev = process.env.ADEV_SILENCE_SHADOW_BOARD;
      process.env.ADEV_SILENCE_SHADOW_BOARD = "1";
      try {
        const manager = getIssueManager({ tasks: { backend: "json" } }, fx.worktree);
        assert.equal((await manager.list()).length, 5);
      } finally {
        if (prev === undefined) delete process.env.ADEV_SILENCE_SHADOW_BOARD;
        else process.env.ADEV_SILENCE_SHADOW_BOARD = prev;
      }
    } finally {
      fx.cleanup();
    }
  });
});
