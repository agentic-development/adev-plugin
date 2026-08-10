// tests/cli/parallel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

function git(a, cwd) { return execFileSync("git", a, { cwd, encoding: "utf8", stdio: "pipe" }).trim(); }
function mkRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-par-cli-")));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@t.co"], dir); git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "f.txt"), "x\n"); git(["add", "."], dir); git(["commit", "-qm", "init"], dir);
  return dir;
}
function run(cwd, ...args) { return spawnSync("node", [CLI, "parallel", ...args], { encoding: "utf8", cwd, env: ENV }); }

test("parallel with no subcommand exits 1 with usage", () => {
  const dir = mkRepo();
  try { const r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /usage: adev parallel/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parallel groups --plan parses a Parallelization section to JSON", () => {
  const dir = mkRepo();
  try {
    const plan = join(dir, "p.plan.md");
    writeFileSync(plan, "## Parallelization\n\n- Group A (independent): Task 1\n- Group B (independent): Task 2\n\n## Next\n");
    const r = run(dir, "groups", "--plan", plan);
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.malformed, false);
    assert.equal(j.groups.length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parallel baseline emits branch/head/clean JSON", () => {
  const dir = mkRepo();
  try {
    const r = run(dir, "baseline");
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.branch, "main");
    assert.match(j.head, /^[0-9a-f]{40}$/);
    assert.equal(j.clean, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parallel assert-clean fails with ORCHESTRATOR_POLLUTED on a stale base-head", () => {
  const dir = mkRepo();
  try {
    const r = run(dir, "assert-clean", "--base-head", "0000000000000000000000000000000000000000");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ORCHESTRATOR_POLLUTED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parallel max-parallel emits a floored integer", () => {
  const dir = mkRepo();
  try {
    const r = run(dir, "max-parallel");
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.ok(Number.isInteger(j.max_parallel) && j.max_parallel >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("parallel unknown subcommand exits 1", () => {
  const dir = mkRepo();
  try { const r = run(dir, "bogus"); assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /unknown parallel subcommand/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
