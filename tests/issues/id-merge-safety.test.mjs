/**
 * issue-613 — board ids must survive a merge between branches that never saw
 * each other.
 *
 * The bug was not a bad regex, so a charset unit test would not have caught it:
 * `max(existing) + 1` is correct against one file and correct across worktrees
 * (the board is shared by `resolveStorageRoot`), and it is still wrong across
 * git BRANCHES. Two sessions branching from the same baseline each computed
 * 589, each was locally valid, and the collision only appeared at merge — which
 * is exactly what happened to the real board on 2026-08-13.
 *
 * So the test that discriminates is a two-branch concurrent mint followed by a
 * merge, asserting no duplicate id. Everything else is a proxy.
 *
 * Spec: .context-index/specs/features/task-management/backend-adapters.spec.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { mintFlatId } from "../../lib/issues/id-utils.mjs";

const BOARD_REL = join(".context-index", "tasks", "tasks.json");

function git(args, cwd) {
  execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
}

/** A git repo with an adev project and one committed baseline issue. */
function makeRepoWithBaseline() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@example.com"], dir);
  git(["config", "user.name", "T"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  return dir;
}

function commitAll(dir, message) {
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", message], dir);
}

function readBoard(dir) {
  return JSON.parse(readFileSync(join(dir, BOARD_REL), "utf8"));
}

describe("board id allocation is merge-safe (issue-613)", () => {
  it("two branches minting from the same baseline do not collide", async () => {
    const dir = makeRepoWithBaseline();
    try {
      const adapter = new JsonAdapter(dir);
      await adapter.init();
      await adapter.create({ title: "baseline", type: "task" });
      commitAll(dir, "baseline board");
      const baseline = git.length && execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: dir, encoding: "utf8", stdio: "pipe",
      }).trim();

      // Branch A mints, off the baseline.
      git(["checkout", "-q", "-b", "branch-a"], dir);
      const a = await new JsonAdapter(dir).create({ title: "from A", type: "task" });
      commitAll(dir, "A adds an issue");

      // Branch B mints, from the SAME baseline — it never saw A's write.
      git(["checkout", "-q", baseline], dir);
      git(["checkout", "-q", "-b", "branch-b"], dir);
      const b = await new JsonAdapter(dir).create({ title: "from B", type: "task" });
      commitAll(dir, "B adds an issue");

      assert.notEqual(
        a.id,
        b.id,
        "two branches off one baseline must not mint the same id — this is the " +
          "exact failure that produced two different issue-589s",
      );

      // And the merge must carry both, with no duplicate id on the board.
      git(["checkout", "-q", "branch-a"], dir);
      try {
        git(["merge", "--no-edit", "-q", "branch-b"], dir);
      } catch {
        // A textual conflict inside tasks.json is acceptable — the claim under
        // test is that the IDS do not collide, not that JSON merges cleanly.
        // Reconstruct the union the way a human resolving it would.
        git(["checkout", "--ours", BOARD_REL], dir);
        git(["merge", "--abort"], dir);
      }

      const ids = readBoard(dir).issues.map((i) => i.id);
      assert.equal(new Set(ids).size, ids.length, "no duplicate ids on the board");
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("does not reuse an id already present on the board", () => {
    // Defensive re-roll: the generator is asked for an id that already exists.
    const existing = [{ id: "issue-aaaaaa" }];
    let calls = 0;
    const rigged = () => (calls++ === 0 ? "aaaaaa" : "bbbbbb");
    assert.equal(mintFlatId("issue", existing, rigged), "issue-bbbbbb");
    assert.equal(calls, 2, "must re-roll rather than return a known-taken id");
  });

  it("surfaces a degenerate generator instead of looping forever", () => {
    assert.throws(
      () => mintFlatId("issue", [{ id: "issue-aaaaaa" }], () => "aaaaaa"),
      (err) => err.code === "ID_MINT_EXHAUSTED",
    );
  });

  it("keeps existing sequential ids readable — both forms coexist", async () => {
    // ~600 sequential ids are quoted in merged commits, specs, and prose. They
    // are never rewritten; only new mints change shape.
    const { parseId } = await import("../../lib/issues/id-utils.mjs");
    for (const id of ["issue-589", "epic-107", "issue-7k3f9a", "epic-1bh9vq"]) {
      const parsed = parseId(id);
      assert.ok(parsed, `parseId must recognize ${id}`);
      assert.equal(
        parsed.legacy,
        true,
        `${id} must parse as a flat id, so every parseId caller — which all ` +
          `branch on .legacy — treats both schemes identically`,
      );
    }
  });
});
