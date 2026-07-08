// tests/lib/parallel/baseline.test.mjs
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recordBaseline, assertOrchestratorClean } from "../../../lib/parallel/baseline.mjs";
import { WorktreeError } from "../../../lib/worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}
function mkRepo() {
  const dir = realpathSync((() => { const d = join(tmpdir(), `adev-bl-${Date.now()}-${process.hrtime()[1]}`); mkdirSync(d, { recursive: true }); return d; })());
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@t.co"], dir);
  git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(["add", "."], dir); git(["commit", "-qm", "init"], dir);
  return dir;
}

describe("lib/parallel/baseline", () => {
  let repo;
  before(() => { repo = mkRepo(); });
  after(() => { rmSync(repo, { recursive: true, force: true }); });

  it("recordBaseline captures branch, head, clean", () => {
    const b = recordBaseline(repo);
    assert.equal(b.branch, "main");
    assert.match(b.head, /^[0-9a-f]{40}$/);
    assert.equal(b.clean, true);
  });

  it("assertOrchestratorClean passes when HEAD and tree are unchanged", () => {
    const b = recordBaseline(repo);
    assert.deepEqual(assertOrchestratorClean(repo, b), { ok: true });
  });

  it("throws ORCHESTRATOR_POLLUTED when HEAD advanced", () => {
    const b = recordBaseline(repo);
    writeFileSync(join(repo, "g.txt"), "y\n");
    git(["add", "."], repo); git(["commit", "-qm", "advance"], repo);
    assert.throws(() => assertOrchestratorClean(repo, b),
      (e) => e instanceof WorktreeError && e.code === "ORCHESTRATOR_POLLUTED");
  });

  it("throws ORCHESTRATOR_POLLUTED when the tree is dirty", () => {
    const b = recordBaseline(repo);
    writeFileSync(join(repo, "f.txt"), "dirty\n");
    assert.throws(() => assertOrchestratorClean(repo, b),
      (e) => e instanceof WorktreeError && e.code === "ORCHESTRATOR_POLLUTED" && /dirty|clean/i.test(e.message));
    git(["checkout", "--", "f.txt"], repo); // restore
  });
});
