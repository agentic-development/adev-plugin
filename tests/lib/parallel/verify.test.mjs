// tests/lib/parallel/verify.test.mjs
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyGroupComplete } from "../../../lib/parallel/verify.mjs";
import { WorktreeError } from "../../../lib/worktree.mjs";

function git(a, cwd) { return execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim(); }
function mkRepo() {
  const dir = realpathSync((() => { const d = join(tmpdir(), `adev-vf-${Date.now()}-${process.hrtime()[1]}`); mkdirSync(d, { recursive: true }); return d; })());
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@t.co"], dir); git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "f.txt"), "x\n"); git(["add", "."], dir); git(["commit", "-qm", "init"], dir);
  return dir;
}

describe("lib/parallel/verify", () => {
  let repo, base;
  before(() => {
    repo = mkRepo();
    base = git(["rev-parse", "HEAD"], repo);
    git(["checkout", "-q", "-b", "adev/plan-a"], repo);
    writeFileSync(join(repo, "a.txt"), "a\n"); git(["add", "."], repo); git(["commit", "-qm", "task work"], repo);
    git(["checkout", "-q", "main"], repo);
  });
  after(() => { rmSync(repo, { recursive: true, force: true }); });

  it("passes when all group tasks are done and the branch advanced", () => {
    const r = verifyGroupComplete({ cwd: repo, branch: "adev/plan-a", base, tasks: ["3", "5"], doneTasks: ["3", "5", "9"] });
    assert.equal(r.ok, true);
    assert.ok(r.commitCount >= 1);
  });

  it("throws COMMITS_NOT_VERIFIED when a group task is not done (partial commit)", () => {
    assert.throws(
      () => verifyGroupComplete({ cwd: repo, branch: "adev/plan-a", base, tasks: ["3", "5"], doneTasks: ["3"] }),
      (e) => e instanceof WorktreeError && e.code === "COMMITS_NOT_VERIFIED" && /5/.test(e.message),
    );
  });

  it("throws COMMITS_NOT_VERIFIED when the branch did not advance past base", () => {
    git(["checkout", "-q", "-b", "adev/empty"], repo);
    git(["checkout", "-q", "main"], repo);
    assert.throws(
      () => verifyGroupComplete({ cwd: repo, branch: "adev/empty", base, tasks: ["1"], doneTasks: ["1"] }),
      (e) => e instanceof WorktreeError && e.code === "COMMITS_NOT_VERIFIED" && /no commits|advance/i.test(e.message),
    );
  });
});
