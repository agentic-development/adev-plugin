// `adev implement task-begin` is the provisional pass of `resolve-depth` plus,
// for a `lite` result only, the bookkeeping an inline task needs before it is
// implemented: `plan_task` `in_progress`, execution state and the dispatch-time
// snapshot. Every case runs the real CLI against a committed temp repo.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { writeExecutionState } from "../../lib/execution-state.mjs";
import {
  IDS, PLAN, SPEC,
  commitAll, git, makeFixture, okJson, readLogIfAny, runVerb, runVerbRaw, snapshot, write,
} from "./implement-depth-fixture.mjs";

const taskBegin = (cwd, ...args) => runVerb("task-begin", cwd, ...args);
const resolveDepth = (cwd, ...args) => runVerb("resolve-depth", cwd, ...args);

const BOOKKEEPING_KEYS = ["snapshot", "execution_state"];

function withoutBookkeeping(out) {
  const copy = { ...out };
  for (const k of BOOKKEEPING_KEYS) delete copy[k];
  return copy;
}

const depthEvents = (dir) => readLogIfAny(dir).filter((e) => e.event === "review_depth_resolved");
const planTaskEvents = (dir) => readLogIfAny(dir).filter((e) => e.event === "plan_task");
const readState = (dir) => JSON.parse(readFileSync(join(dir, ".context-index/.execution-state.json"), "utf8"));

describe("adev implement task-begin: the provisional pass", () => {
  for (const [label, flags, depth] of [
    ["lite", ["--lite"], "lite"],
    ["quick", [], "quick"],
    ["full", ["--tier", "full"], "full"],
  ]) {
    it(`prints the same resolution JSON as resolve-depth --pass provisional (${label})`, (t) => {
      const a = makeFixture(t);
      const b = makeFixture(t);
      const viaResolve = okJson(resolveDepth(a.dir, ...IDS, ...flags, "--pass", "provisional"));
      const viaBegin = okJson(taskBegin(b.dir, ...IDS, ...flags));
      assert.equal(viaBegin.depth, depth);
      assert.deepEqual(withoutBookkeeping(viaBegin), viaResolve);
    });
  }

  it("emits exactly one provisional review_depth_resolved event with the contract's key set", (t) => {
    const { dir } = makeFixture(t);
    okJson(taskBegin(dir, ...IDS, "--lite"));
    const events = depthEvents(dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].pass, "provisional");
    assert.equal(events[0].depth, "lite");
    assert.equal(events[0].source, "lite-grant");
    const { ts, event, ...rest } = events[0];
    assert.deepEqual(rest, {
      plan: PLAN, task_id: "t1", pass: "provisional", depth: "lite", source: "lite-grant",
      floor_applied: false, floor_legs: [],
    });
  });

  it("echoes --review-cycles as review_cycles and rejects an illegal value with INVALID_REVIEW_CYCLES", (t) => {
    const { dir } = makeFixture(t);
    assert.equal(okJson(taskBegin(dir, ...IDS, "--review-cycles", "5")).review_cycles, 5);
    const bad = taskBegin(dir, ...IDS, "--review-cycles", "0");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /INVALID_REVIEW_CYCLES/);
  });

  it("--parallel denies lite with lite_denied parallel and adds no bookkeeping", (t) => {
    const { dir } = makeFixture(t);
    const out = okJson(taskBegin(dir, ...IDS, "--lite", "--parallel"));
    assert.notEqual(out.depth, "lite");
    assert.equal(out.lite_denied, "parallel");
    for (const k of BOOKKEEPING_KEYS) assert.ok(!(k in out), k);
    assert.deepEqual(planTaskEvents(dir), []);
  });
});

describe("adev implement task-begin: bookkeeping for a lite result", () => {
  it("emits plan_task in_progress after the provisional event, prints the snapshot and writes execution state", (t) => {
    const { dir } = makeFixture(t);
    const out = okJson(taskBegin(dir, ...IDS, "--lite"));
    assert.equal(out.depth, "lite");

    const log = readLogIfAny(dir);
    const provisional = log.findIndex((e) => e.event === "review_depth_resolved");
    const inProgress = log.findIndex((e) => e.event === "plan_task");
    assert.ok(provisional >= 0 && provisional < inProgress, "provisional event, then plan_task");
    assert.deepEqual(
      planTaskEvents(dir).map(({ plan, task_id, status }) => ({ plan, task_id, status })),
      [{ plan: PLAN, task_id: "t1", status: "in_progress" }],
    );

    assert.match(out.snapshot, /^[0-9a-f]{40,64}$/);
    assert.equal(git(dir, "cat-file", "-t", out.snapshot), "tree");
    assert.equal(out.snapshot, snapshot(dir), "an unchanged tree snapshots to the same id snapshot-base prints");

    assert.equal(out.execution_state, "written");
    const state = readState(dir);
    assert.equal(state.status, "active");
    assert.equal(state.planRef, PLAN);
    assert.equal(state.currentTask, "t1");
    assert.equal(state.nextAction, "Example");
    assert.deepEqual(state.progress, [{ task: "Task 1: Example", done: false }]);
  });

  it("execution-state progress marks the plan's done tasks and names the current task by its title", (t) => {
    const { dir } = makeFixture(t);
    write(dir, PLAN,
      "> **Spec:** x.spec.md\n\n" +
      "### Task 1: First thing [specialist: none]\n\n**Files:**\n- Create: `a.txt`\n\n" +
      "### Task 2: Second thing [specialist: none]\n\n**Files:**\n- Create: `new.txt`\n");
    write(dir, "p.routing.json", JSON.stringify({
      version: 1,
      entries: ["t1", "t2"].map((task_id) => ({
        task_id, selected_agent: "auto-agent",
        scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 }, rationale: "",
      })),
    }));
    const head = commitAll(dir);
    write(dir, ".context-index/lifecycle-state/x.jsonl",
      JSON.stringify({ ts: new Date().toISOString(), event: "plan_task", plan: PLAN, task_id: "1", status: "done", notes: null }) + "\n");
    const out = okJson(taskBegin(dir, "--spec", SPEC, "--plan", PLAN, "--task-id", "2", "--lite", "--run-base", head));
    assert.equal(out.depth, "lite");
    const state = readState(dir);
    assert.equal(state.currentTask, 2);
    assert.equal(state.nextAction, "Second thing");
    assert.deepEqual(state.progress, [
      { task: "Task 1: First thing", done: true },
      { task: "Task 2: Second thing", done: false },
    ]);
  });

  it("an execution-state conflict is reported, never fatal", (t) => {
    const { dir } = makeFixture(t);
    writeExecutionState(dir, { status: "active", planRef: "other.plan.md", currentTask: 4, nextAction: "x" });
    const out = okJson(taskBegin(dir, ...IDS, "--lite"));
    assert.equal(out.execution_state, "conflict");
    assert.match(out.snapshot, /^[0-9a-f]{40,64}$/);
    assert.equal(planTaskEvents(dir).length, 1);
    assert.equal(readState(dir).planRef, "other.plan.md", "the other build's state is left untouched");
  });

  it("a failed snapshot after the provisional event exits 1 with TASK_BEGIN_FAILED naming the step", (t) => {
    const { dir } = makeFixture(t);
    // A corrupt index breaks `git add -A` in the snapshot while leaving the
    // run-base reads (`rev-parse`, `cat-file`) the provisional pass uses intact.
    writeFileSync(join(dir, ".git", "index"), "not an index\n");
    const r = taskBegin(dir, ...IDS, "--lite");
    assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /TASK_BEGIN_FAILED/);
    assert.match(r.stderr, /snapshot/);
    assert.equal(r.stdout.trim(), "", "no success JSON");
    assert.equal(depthEvents(dir).length, 1, "the provisional event was written before the failure");
  });
});

describe("adev implement task-begin: a quick or full result", () => {
  for (const [label, flags] of [["quick", []], ["full", ["--tier", "full"]]]) {
    it(`adds no plan_task event, snapshot or execution state (${label})`, (t) => {
      const { dir } = makeFixture(t);
      const out = okJson(taskBegin(dir, ...IDS, ...flags));
      assert.equal(out.depth, label);
      for (const k of BOOKKEEPING_KEYS) assert.ok(!(k in out), k);
      assert.deepEqual(planTaskEvents(dir), []);
      assert.equal(depthEvents(dir).length, 1);
    });
  }
});

describe("adev implement task-begin: flag validation", () => {
  it("--run-base is required", (t) => {
    const { dir } = makeFixture(t);
    const r = runVerbRaw("task-begin", dir, ...IDS, "--lite");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--run-base <sha> is required/);
    assert.deepEqual(readLogIfAny(dir), []);
  });

  it("rejects a malformed --run-base with INVALID_COMMIT_ID, writing nothing", (t) => {
    const { dir, head } = makeFixture(t);
    for (const bad of ["--output=x", head.slice(0, 12), "f".repeat(40)]) {
      const r = taskBegin(dir, ...IDS, "--lite", "--run-base", bad);
      assert.equal(r.status, 1, bad);
      assert.match(r.stderr, /INVALID_COMMIT_ID/, bad);
    }
    assert.deepEqual(readLogIfAny(dir), []);
  });

  it("refuses the final-pass flags, which only resolve-depth takes", (t) => {
    const { dir, head } = makeFixture(t);
    for (const extra of [["--pass", "final"], ["--base-sha", head], ["--had-critical-finding"], ["--in-batch"]]) {
      const r = taskBegin(dir, ...IDS, ...extra);
      assert.equal(r.status, 1, extra.join(" "));
      assert.match(r.stderr, /argument error/, extra.join(" "));
    }
  });

  it("the usage banner and --help name task-begin and TASK_BEGIN_FAILED", (t) => {
    const { dir } = makeFixture(t);
    assert.match(runVerbRaw("bogus", dir).stderr, /task-begin/);
    const help = runVerbRaw("--help", dir).stdout;
    assert.match(help, /task-begin --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha>/);
    assert.match(help, /Exit codes \(task-begin\):[\s\S]*TASK_BEGIN_FAILED/);
  });
});
