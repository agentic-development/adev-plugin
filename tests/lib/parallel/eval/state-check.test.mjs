// tests/lib/parallel/eval/state-check.test.mjs
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertGroupSelection, scanOrphanedState, assertNoOrphans } from "../../../../lib/parallel/eval/state-check.mjs";
import { WorktreeError, add } from "../../../../lib/worktree.mjs";

function git(a, cwd) { return execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim(); }
function mkRepo() {
  const dir = realpathSync((() => { const d = join(tmpdir(), `adev-sc-${Date.now()}-${process.hrtime()[1]}`); mkdirSync(d, { recursive: true }); return d; })());
  git(["init", "-q", "-b", "main"], dir); git(["config", "user.email", "t@t.co"], dir);
  git(["config", "user.name", "t"], dir); git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "f.txt"), "x\n"); git(["add", "."], dir); git(["commit", "-qm", "init"], dir);
  return dir;
}

describe("assertGroupSelection", () => {
  it("passes when only independent groups have worktrees", () => {
    assert.deepEqual(
      assertGroupSelection({ independentSlugs: ["p-a", "p-b"], sequentialSlugs: ["p-c"], createdSlugs: ["p-a", "p-b"] }),
      { ok: true },
    );
  });
  it("throws OVERLAP_PARALLELIZED when a sequential group got a worktree", () => {
    assert.throws(
      () => assertGroupSelection({ independentSlugs: ["p-a"], sequentialSlugs: ["p-c"], createdSlugs: ["p-a", "p-c"] }),
      (e) => e instanceof WorktreeError && e.code === "OVERLAP_PARALLELIZED" && /p-c/.test(e.message),
    );
  });
});

describe("scanOrphanedState / assertNoOrphans", () => {
  let repo;
  before(() => { repo = mkRepo(); });
  after(() => { try { git(["worktree", "prune"], repo); } catch {} rmSync(repo, { recursive: true, force: true }); });

  it("reports clean state after full teardown", () => {
    const s = scanOrphanedState(repo);
    assert.deepEqual(s.worktrees, []);
    assert.deepEqual(s.branches, []);
    assert.equal(s.lock, false);
    assert.deepEqual(assertNoOrphans(repo), { ok: true });
  });

  it("detects a leftover adev worktree + branch (ORPHANED_STATE)", () => {
    add({ slug: "leftover", cwd: repo });
    const s = scanOrphanedState(repo);
    assert.ok(s.worktrees.includes("leftover"));
    assert.ok(s.branches.includes("adev/leftover"));
    assert.throws(() => assertNoOrphans(repo), (e) => e instanceof WorktreeError && e.code === "ORPHANED_STATE");
  });
});
