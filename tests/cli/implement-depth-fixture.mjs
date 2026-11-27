// Shared fixture for the `adev implement resolve-depth` and `task-begin` CLI
// suites: a committed git repo whose Task 1 resolves `quick` with no floor
// leg, and is lite-eligible once `--lite` (or a policy `lite`) authorizes it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { appendEvent } from "../../lib/lifecycle-state.mjs";

export const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "index.mjs");
export const ENV = { ...process.env, NODE_OPTIONS: "" };

export const SPEC = "x.spec.md";
export const PLAN = "p.plan.md";
export const LOG = ".context-index/lifecycle-state/x.jsonl";
export const POLICIES = ".context-index/governance/risk-policies.yaml";
export const IDS = ["--spec", SPEC, "--plan", PLAN, "--task-id", "t1"];

export function git(dir, ...args) {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function write(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

export function commitAll(dir) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "fixture");
  return git(dir, "rev-parse", "HEAD");
}

/** Runs `adev implement <verb> ...args` with no implicit flags. */
export function runVerbRaw(verb, cwd, ...args) {
  return spawnSync("node", [CLI, "implement", verb, ...args], { encoding: "utf8", env: ENV, cwd });
}

/** Runs `adev implement <verb>`, appending `--run-base HEAD` unless the case passes its own. */
export function runVerb(verb, cwd, ...args) {
  const hasRunBase = args.some((a) => a === "--run-base" || a.startsWith("--run-base="));
  return runVerbRaw(verb, cwd, ...args, ...(hasRunBase ? [] : ["--run-base", git(cwd, "rev-parse", "HEAD")]));
}

export function okJson(r) {
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

export function readLog(dir) {
  return readFileSync(join(dir, LOG), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function readLogIfAny(dir) {
  try {
    return readLog(dir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

export const PERFECT_SCORES = { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 };

export function sidecar(entry = {}) {
  return JSON.stringify({
    version: 1,
    entries: [{ task_id: "t1", selected_agent: "auto-agent", scores: PERFECT_SCORES, rationale: "", ...entry }],
  });
}

export function makeFixture(t, { declared = "new.txt", policies = "policies:\n  low:\n    implement_mode: quick\n" } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-resolve-depth-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, ".context-index/manifest.yaml", "project:\n  name: t\n");
  write(dir, POLICIES, policies);
  write(dir, SPEC, "---\nrisk_level: low\n---\n# x\n");
  write(dir, PLAN,
    "> **Spec:** x.spec.md\n\n" +
    "### Task 1: Example [specialist: none]\n\n" +
    `**Files:**\n- Create: \`${declared}\`\n\n` +
    "**Tests:** `new.test.mjs`\n");
  write(dir, "p.routing.json", sidecar());
  const head = commitAll(dir);
  return { dir, specPath: join(dir, SPEC), planPath: join(dir, PLAN), head };
}

export function startRun(dir) {
  appendEvent(dir, SPEC, { event: "lifecycle_step", step: "implement", status: "started" });
}

export function markInProgress(dir, ts = new Date().toISOString()) {
  appendEvent(dir, SPEC, { event: "plan_task", plan: PLAN, task_id: "t1", status: "in_progress", notes: null, ts });
  return Date.parse(ts);
}

export function snapshot(dir) {
  const r = runVerbRaw("snapshot-base", dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
