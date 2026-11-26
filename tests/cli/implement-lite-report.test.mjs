// `adev implement lite-report` tells /adev:validate which tasks of the latest
// implement run shipped without per-task review. The window opens at the most
// recent implement `lifecycle_step` started event, and a task counts only when
// its latest final-pass `review_depth_resolved` in that window is `lite`. Every
// case runs the real CLI against a seeded lifecycle log.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { reportReviewDepthResolved, reportStep } from "../../lib/lifecycle-state.mjs";

const CLI = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

const SPEC = ".context-index/specs/features/demo/demo.spec.md";
const LOG = ".context-index/lifecycle-state/demo.jsonl";
const PLAN = ".context-index/plans/demo.plan.md";
const OTHER_PLAN = ".context-index/plans/other.plan.md";

const RUN1_TS = "2026-11-01T10:00:00.000Z";
const RUN2_TS = "2026-11-02T10:00:00.000Z";

function write(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function fixtureRepo(t, events) {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  write(dir, ".context-index/manifest.yaml", "project:\n  name: t\n");
  write(dir, SPEC, "---\nrisk_level: medium\n---\n# Demo\n");
  if (events) write(dir, LOG, events.map((e) => `${JSON.stringify(e)}\n`).join(""));
  return dir;
}

const started = (ts, step = "implement") => ({ ts, event: "lifecycle_step", step, status: "started" });

function depthEvent(ts, taskId, depth, { pass = "final", plan = PLAN, source = "lite-grant" } = {}) {
  return {
    ts,
    event: "review_depth_resolved",
    plan,
    task_id: taskId,
    pass,
    depth,
    source,
    floor_applied: false,
    floor_legs: [],
  };
}

function liteReport(cwd, ...args) {
  return spawnSync("node", [CLI, "implement", "lite-report", ...args], { cwd, encoding: "utf8", env: ENV });
}

function okJson(r) {
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const TWO_RUNS = [
  started(RUN1_TS),
  depthEvent("2026-11-01T10:01:00.000Z", "1", "lite"),
  started(RUN2_TS),
  depthEvent("2026-11-02T10:01:00.000Z", "2", "lite"),
  depthEvent("2026-11-02T10:02:00.000Z", "3", "lite"),
  depthEvent("2026-11-02T10:03:00.000Z", "3", "quick", { source: "lite-tripwire" }),
];

test("counts only tasks whose latest final-pass event after the latest implement start has depth lite", (t) => {
  const repo = fixtureRepo(t, TWO_RUNS);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 1, task_ids: ["2"], since: RUN2_TS });
});

test("reads raw events, not the reviewDepthResolutions projection", (t) => {
  // The projection keeps run 1's task 1 lite across runs; the report must not.
  const repo = fixtureRepo(t, [
    started(RUN1_TS),
    depthEvent("2026-11-01T10:01:00.000Z", "1", "lite"),
    started(RUN2_TS),
    depthEvent("2026-11-02T10:01:00.000Z", "2", "quick", { source: "default-quick" }),
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 0, task_ids: [], since: RUN2_TS });
});

test("no implement start event → count 0", (t) => {
  const repo = fixtureRepo(t, [
    started(RUN1_TS, "plan"),
    depthEvent("2026-11-01T10:01:00.000Z", "1", "lite"),
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 0, task_ids: [], since: null });
});

test("a missing lifecycle log → count 0", (t) => {
  const repo = fixtureRepo(t);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 0, task_ids: [], since: null });
});

test("only the final pass counts: a provisional-only lite task is not counted", (t) => {
  const repo = fixtureRepo(t, [
    started(RUN1_TS),
    depthEvent("2026-11-01T10:01:00.000Z", "1", "lite", { pass: "provisional" }),
    depthEvent("2026-11-01T10:02:00.000Z", "2", "lite", { pass: "provisional" }),
    depthEvent("2026-11-01T10:03:00.000Z", "2", "lite"),
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 1, task_ids: ["2"], since: RUN1_TS });
});

test("an implement step_completed or step_failed event does not open a new window", (t) => {
  const repo = fixtureRepo(t, [
    started(RUN1_TS),
    depthEvent("2026-11-01T10:01:00.000Z", "1", "lite"),
    { ts: "2026-11-01T11:00:00.000Z", event: "step_completed", step: "implement" },
    { ts: "2026-11-01T12:00:00.000Z", event: "step_failed", step: "implement" },
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 1, task_ids: ["1"], since: RUN1_TS });
});

test("tasks are folded per (plan, task_id)", (t) => {
  const repo = fixtureRepo(t, [
    started(RUN1_TS),
    depthEvent("2026-11-01T10:01:00.000Z", "1", "lite", { plan: PLAN }),
    depthEvent("2026-11-01T10:02:00.000Z", "1", "lite", { plan: OTHER_PLAN }),
    depthEvent("2026-11-01T10:03:00.000Z", "1", "full", { plan: OTHER_PLAN, source: "lite-tripwire" }),
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 1, task_ids: ["1"], since: RUN1_TS });
});

test("an id shared by two plans in one window is listed once and counted per (plan, task_id)", (t) => {
  const repo = fixtureRepo(t, [
    started(RUN1_TS),
    depthEvent("2026-11-01T10:01:00.000Z", "1", "lite", { plan: PLAN }),
    depthEvent("2026-11-01T10:02:00.000Z", "1", "lite", { plan: OTHER_PLAN }),
    depthEvent("2026-11-01T10:03:00.000Z", "2", "lite", { plan: PLAN }),
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 3, task_ids: ["1", "2"], since: RUN1_TS });
});

test("events whose plan or task_id is not a string are skipped", (t) => {
  const repo = fixtureRepo(t, [
    started(RUN1_TS),
    { ...depthEvent("2026-11-01T10:01:00.000Z", "1", "lite"), task_id: 7 },
    { ...depthEvent("2026-11-01T10:02:00.000Z", "8", "lite"), plan: null },
    { ...depthEvent("2026-11-01T10:03:00.000Z", "9", "lite"), plan: undefined },
    depthEvent("2026-11-01T10:04:00.000Z", "3", "lite"),
  ]);
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 1, task_ids: ["3"], since: RUN1_TS });
});

test("matches the event shapes written by reportStep and reportReviewDepthResolved", (t) => {
  const repo = fixtureRepo(t);
  reportStep(repo, SPEC, { step: "implement", status: "started" });
  for (const [taskId, depth] of [["4", "lite"], ["5", "quick"]]) {
    reportReviewDepthResolved(repo, SPEC, {
      plan: PLAN,
      task_id: taskId,
      pass: "final",
      depth,
      source: depth === "lite" ? "lite-grant" : "default-quick",
      floor_applied: false,
      floor_legs: [],
    });
  }
  const startTs = JSON.parse(readFileSync(join(repo, LOG), "utf8").split("\n")[0]).ts;
  const out = okJson(liteReport(repo, "--spec", SPEC, "--json"));
  assert.deepEqual(out, { count: 1, task_ids: ["4"], since: startTs });
});

test("text mode prints the advisory line only when count > 0", (t) => {
  const withLite = fixtureRepo(t, [
    started(RUN1_TS),
    depthEvent("2026-11-01T10:01:00.000Z", "2", "lite"),
    depthEvent("2026-11-01T10:02:00.000Z", "5", "lite"),
  ]);
  const r = liteReport(withLite, "--spec", SPEC);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "implemented without per-task review: 2 task(s) (2, 5)\n");

  const without = fixtureRepo(t, TWO_RUNS.slice(0, 3));
  const empty = liteReport(without, "--spec", SPEC);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(empty.stdout, "");
});

test("missing --spec exits 1 with usage", (t) => {
  const repo = fixtureRepo(t, TWO_RUNS);
  const r = liteReport(repo, "--json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--spec <spec-path> is required/);
  assert.match(r.stderr, /usage: adev implement lite-report --spec <spec-path> \[--json\]/);
  assert.equal(r.stdout, "");
});

test("an unknown flag exits 1 with an argument error", (t) => {
  const repo = fixtureRepo(t, TWO_RUNS);
  const r = liteReport(repo, "--spec", SPEC, "--bogus");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^argument error: /);
  assert.equal(r.stdout, "");
});

test("a spec path that is not a .spec.md exits 1 with INVALID_SPEC_PATH", (t) => {
  const repo = fixtureRepo(t, TWO_RUNS);
  const r = liteReport(repo, "--spec", "README.md", "--json");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /INVALID_SPEC_PATH/);
  assert.equal(r.stdout, "");
});
