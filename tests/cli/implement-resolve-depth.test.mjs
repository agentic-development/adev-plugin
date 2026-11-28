import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { resolveImplementReviewDepth } from "../../lib/implement/review-depth.mjs";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";
import { lookupRoutingEntry } from "../../lib/plan-routing-sidecar.mjs";
import { appendEvent } from "../../lib/lifecycle-state.mjs";
import {
  CLI, ENV, SPEC, PLAN, LOG, POLICIES, IDS,
  git, write, commitAll, runVerb, runVerbRaw, okJson, readLog, sidecar, makeFixture,
  startRun, markInProgress, snapshot,
} from "./implement-depth-fixture.mjs";

const CONTRACT_KEYS = ["floor_applied", "floor_legs", "depth", "pass", "plan", "source", "task_id"].sort();

const runRaw = (cwd, ...args) => runVerbRaw("resolve-depth", cwd, ...args);
const run = (cwd, ...args) => runVerb("resolve-depth", cwd, ...args);

// started -> provisional pass -> plan_task in_progress -> dispatch snapshot,
// the order /adev:implement runs them in.
function dispatchTask(dir, head, provisionalFlags = []) {
  startRun(dir);
  const provisional = okJson(run(dir, ...IDS, "--run-base", head, ...provisionalFlags));
  const inProgressAt = markInProgress(dir);
  return { provisional, inProgressAt, snap: snapshot(dir) };
}

describe("adev implement resolve-depth", () => {
  it("provisional pass prints JSON with depth/source", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.equal(printed.depth, "quick");
    assert.equal(printed.source, "policy-baseline");
    assert.equal(printed.lite_denied, "not-authorized");
    assert.equal(printed.lite_source, null);
    assert.equal(printed.escalated_from, null);
  });

  it("final pass without --base-sha exits non-zero with MISSING_DIFF_RANGE", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--pass", "final");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /MISSING_DIFF_RANGE/);
  });

  it("unknown task-id in the sidecar exits non-zero with ROUTING_ENTRY_MISSING", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "does-not-exist");
    assert.equal(r.status, 3);
    assert.match(r.stderr, /ROUTING_ENTRY_MISSING/);
  });

  it("--review-cycles 0 exits non-zero with INVALID_REVIEW_CYCLES (distinct from the manifest's INVALID_MAX_REVIEW_CYCLES)", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--review-cycles", "0");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INVALID_REVIEW_CYCLES/);
  });

  it("--review-cycles 5 overrides implement.max_review_cycles and echoes the resolved value", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--review-cycles", "5");
    assert.equal(okJson(r).review_cycles, 5);
  });

  it("JSON output matches a direct resolveImplementReviewDepth() call for identical inputs", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const direct = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath },
      task: { id: "t1", declared_files: ["new.txt"], had_critical_finding: false },
      routingEntry: lookupRoutingEntry(planPath, "t1"), tierFlag: null,
      policies: loadRigorPolicies(dir), pass: "provisional",
    });
    const viaCli = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.equal(viaCli.depth, direct.depth);
    assert.equal(viaCli.source, direct.source);
    assert.deepEqual(viaCli.floor_legs, direct.floor_legs);
    assert.equal(viaCli.lite_denied, direct.lite_denied);
  });

  it("a task whose Files: block declares a Modify: entry still resolves quick (additive-only is no longer a grant condition)", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    writeFileSync(planPath,
      "> **Spec:** x.spec.md\n\n### Task 1: Example [specialist: none]\n\n" +
      "**Files:**\n- Modify: `existing.txt`\n\n**Tests:** `new.test.mjs`\n");
    commitAll(dir);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.equal(printed.depth, "quick");
    assert.equal(printed.source, "policy-baseline");
    assert.deepEqual(printed.floor_legs, []);
  });

  it("with no risk-policies.yaml at run_base and no --tier, resolves quick with source default-quick", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    rmSync(join(dir, POLICIES));
    commitAll(dir);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.equal(printed.depth, "quick");
    assert.equal(printed.source, "default-quick");
    assert.deepEqual(printed.floor_legs, []);
  });

  it("with a policy that has no implement_mode for the spec's risk level, resolves quick with source default-quick", (t) => {
    const { dir, specPath, planPath } = makeFixture(t, {
      policies: "policies:\n  high:\n    implement_mode: full\n  low:\n    review_mode: full\n",
    });
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.equal(printed.depth, "quick");
    assert.equal(printed.source, "default-quick");
  });

  it("a bare plan-side --task-id (as `adev implement batches` emits) resolves the same as the sidecar's t<n>", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    const tOut = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--lite"));
    const bare = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "1", "--lite"));
    assert.equal(bare.depth, "lite");
    assert.equal(bare.depth, tOut.depth);
    assert.equal(bare.source, tOut.source);
    assert.deepEqual(bare.floor_legs, tOut.floor_legs);
  });

  it("a bare --task-id still sees the task's declared Modify: file as a floor-leg input", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    writeFileSync(planPath,
      "> **Spec:** x.spec.md\n\n### Task 1: Example [specialist: none]\n\n" +
      "**Files:**\n- Modify: `src/auth/existing.ts`\n\n**Tests:** `new.test.mjs`\n");
    commitAll(dir);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "1"));
    assert.equal(printed.depth, "full");
    assert.deepEqual(printed.floor_legs, ["sensitive-path"]);
  });

  it("--in-batch is accepted and ignored: the result is the same with and without it", (t) => {
    const { dir } = makeFixture(t);
    const pick = (o) => ({ depth: o.depth, source: o.source, floor_legs: o.floor_legs, lite_denied: o.lite_denied, lite_source: o.lite_source });
    const without = okJson(run(dir, ...IDS, "--lite"));
    const withFlag = okJson(run(dir, ...IDS, "--lite", "--in-batch"));
    assert.deepEqual(pick(withFlag), pick(without));
    assert.equal(withFlag.depth, "lite");
    const quickWith = okJson(run(dir, ...IDS, "--in-batch"));
    assert.equal(quickWith.depth, "quick");
    assert.deepEqual(quickWith.floor_legs, []);
  });

  it("final pass: an undeclared non-sensitive touch resolves quick with no scope-mismatch leg", (t) => {
    const { dir, specPath, planPath, head } = makeFixture(t);
    writeFileSync(join(dir, "undeclared.txt"), "x\n");
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--pass", "final", "--base-sha", head));
    assert.equal(printed.depth, "quick");
    assert.ok(!printed.floor_legs.includes("scope-mismatch"));
    assert.deepEqual(printed.floor_legs, []);
  });

  // ── governance-signal floor legs: the CLI must forward real path signals ──
  //
  // Both legs are only reachable if the verb actually reads the project's
  // governance registries and forwards the task's declared files. The
  // fixtures below are built so the task would otherwise resolve `quick`, so a
  // `full` here can ONLY come from the floor leg firing.

  it("floors to full via the boundary leg when a declared file matches governance/boundaries.yaml", (t) => {
    const { dir, specPath, planPath } = makeFixture(t, { declared: "src/db/query.ts" });
    write(dir, ".context-index/governance/boundaries.yaml",
      "boundaries:\n  - id: no-direct-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n");
    commitAll(dir);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.ok(printed.floor_legs.includes("boundary"), `floor_legs=${JSON.stringify(printed.floor_legs)}`);
    assert.equal(printed.floor_applied, true);
    assert.equal(printed.depth, "full");
  });

  it("floors to full via the sensitive-path leg on a governance/sensitive-paths.yaml entry", (t) => {
    const { dir, specPath, planPath } = makeFixture(t, { declared: "src/payments/charge.ts" });
    // "src/payments/**" matches no DEFAULT_SENSITIVE_PATHS glob, so the leg
    // can only fire because this YAML file was actually read by the verb.
    write(dir, ".context-index/governance/sensitive-paths.yaml", 'sensitive_paths:\n  - "src/payments/**"\n');
    commitAll(dir);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.ok(printed.floor_legs.includes("sensitive-path"), `floor_legs=${JSON.stringify(printed.floor_legs)}`);
    assert.equal(printed.floor_applied, true);
    assert.equal(printed.depth, "full");
  });

  it("floors to full via the sensitive-path leg on a built-in pattern with no governance YAML present", (t) => {
    const { dir, specPath, planPath } = makeFixture(t, { declared: "src/auth/session.ts" });
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.ok(printed.floor_legs.includes("sensitive-path"), `floor_legs=${JSON.stringify(printed.floor_legs)}`);
    assert.equal(printed.depth, "full");
  });

  it("neither governance leg fires for an unrelated declared file (no false floor)", (t) => {
    const { dir, specPath, planPath } = makeFixture(t);
    write(dir, ".context-index/governance/boundaries.yaml",
      "boundaries:\n  - id: no-direct-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n");
    commitAll(dir);
    const printed = okJson(run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1"));
    assert.ok(!printed.floor_legs.includes("boundary"));
    assert.ok(!printed.floor_legs.includes("sensitive-path"));
  });
});

describe("adev implement resolve-depth: the rigor ladder", () => {
  it("--lite --run-base <sha> grants lite on the provisional pass", (t) => {
    const { dir, head } = makeFixture(t, { declared: "lib/a.mjs" });
    const out = okJson(run(dir, ...IDS, "--lite", "--run-base", head, "--pass", "provisional"));
    assert.equal(out.depth, "lite");
    assert.equal(out.source, "lite-grant");
    assert.equal(out.lite_denied, null);
    assert.equal(out.lite_source, "flag");
    assert.equal(out.escalated_from, null);
    assert.equal(out.review_cycles, 3);
  });

  it("--tier lite authorizes lite exactly as --lite does", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs" });
    const out = okJson(run(dir, ...IDS, "--tier", "lite"));
    assert.equal(out.depth, "lite");
    assert.equal(out.source, "lite-grant");
    assert.equal(out.lite_source, "flag");
  });

  it("governance edited in the working tree after run_base does not change the result", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs", policies: "policies:\n  low:\n    implement_mode: lite\n" });
    const before = okJson(run(dir, ...IDS));
    assert.equal(before.depth, "lite");
    assert.equal(before.lite_source, "policy");

    write(dir, POLICIES, "policies:\n  low:\n    implement_mode: full\n");
    write(dir, ".context-index/governance/sensitive-paths.yaml", 'sensitive_paths:\n  - "lib/**"\n');
    write(dir, ".context-index/governance/boundaries.yaml",
      "boundaries:\n  - id: no-lib\n    severity: error\n    pattern: '^lib/'\n    exclude: []\n");
    write(dir, "p.routing.json", sidecar({ selected_agent: "human-only" }));
    const after = okJson(run(dir, ...IDS));
    assert.equal(after.depth, "lite");
    assert.equal(after.source, "lite-grant");
    assert.equal(after.lite_source, "policy");
    assert.deepEqual(after.floor_legs, []);

    const reread = okJson(run(dir, ...IDS, "--run-base", commitAll(dir)));
    assert.equal(reread.depth, "full", "the same edits, once committed, are read");
  });

  it("the emitted review_depth_resolved event carries only REVIEW_DEPTH_RESOLVED_KEYS", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs" });
    okJson(run(dir, ...IDS, "--lite"));
    const events = readLog(dir).filter((e) => e.event === "review_depth_resolved");
    assert.equal(events.length, 1);
    const { ts, event, ...rest } = events[0];
    assert.equal(typeof ts, "string");
    assert.equal(event, "review_depth_resolved");
    assert.deepEqual(Object.keys(rest).sort(), CONTRACT_KEYS);
    assert.deepEqual(rest, {
      plan: PLAN, task_id: "t1", pass: "provisional", depth: "lite", source: "lite-grant",
      floor_applied: false, floor_legs: [],
    });
  });

  it("the lite cap prints floor_cap quick for a declared sensitive path and leaves the event's keys unchanged", (t) => {
    const { dir } = makeFixture(t, { declared: "src/auth/session.ts" });
    const capped = okJson(run(dir, ...IDS, "--lite"));
    assert.equal(capped.depth, "quick");
    assert.deepEqual(capped.floor_legs, ["sensitive-path"]);
    assert.equal(capped.floor_cap, "quick");
    assert.equal(capped.lite_denied, "floor:sensitive-path");
    const floor = capped.warnings.find((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED");
    assert.equal(floor.message, "review depth floored to quick (sensitive-path)");
    const unauthorized = okJson(run(dir, ...IDS));
    assert.equal(unauthorized.depth, "full");
    assert.equal(unauthorized.floor_cap, null);

    const events = readLog(dir).filter((e) => e.event === "review_depth_resolved");
    assert.equal(events.length, 2);
    for (const { ts, event, ...rest } of events) assert.deepEqual(Object.keys(rest).sort(), CONTRACT_KEYS);
    assert.deepEqual(events.map((e) => e.depth), ["quick", "full"]);
  });

  it("--run-base is required on both passes", (t) => {
    const { dir, head } = makeFixture(t);
    for (const extra of [[], ["--pass", "final", "--base-sha", head]]) {
      const r = runRaw(dir, ...IDS, ...extra);
      assert.equal(r.status, 1, `${extra.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, /--run-base/);
      assert.equal(r.stdout, "");
    }
    assert.equal(existsSync(join(dir, LOG)), false, "no lifecycle event is written");
  });

  it("INVALID_COMMIT_ID for --run-base --output=x, a short sha, and an unresolvable sha", (t) => {
    const { dir } = makeFixture(t);
    for (const bad of ["--output=x", "abc1234", "f".repeat(40)]) {
      const r = runRaw(dir, ...IDS, "--run-base", bad);
      assert.equal(r.status, 1, `${bad}: ${r.stderr}`);
      assert.match(r.stderr, /INVALID_COMMIT_ID/, bad);
      assert.match(r.stderr, /--run-base/, bad);
    }
    assert.equal(existsSync(join(dir, LOG)), false, "no lifecycle event is written");
  });

  it("--run-base must name a commit: a tree id is refused", (t) => {
    const { dir, head } = makeFixture(t);
    const r = runRaw(dir, ...IDS, "--run-base", git(dir, "rev-parse", `${head}^{tree}`));
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /INVALID_COMMIT_ID: --run-base/);
  });

  it("--base-sha is validated the same way and accepts a commit or a tree", (t) => {
    const { dir, head } = makeFixture(t);
    const blob = git(dir, "rev-parse", `${head}:${SPEC}`);
    for (const bad of ["--output=x", "abc1234", "f".repeat(40), blob]) {
      const r = run(dir, ...IDS, "--pass", "final", "--base-sha", bad);
      assert.equal(r.status, 1, `${bad}: ${r.stderr}`);
      assert.match(r.stderr, /INVALID_COMMIT_ID: --base-sha/, bad);
    }
    assert.equal(existsSync(join(dir, LOG)), false, "no lifecycle event is written");
    for (const good of [head, git(dir, "rev-parse", `${head}^{tree}`)]) {
      assert.equal(okJson(run(dir, ...IDS, "--pass", "final", "--base-sha", good)).depth, "quick");
    }
  });

  it("--parallel grants no lite: lite_denied parallel", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs" });
    const out = okJson(run(dir, ...IDS, "--lite", "--parallel"));
    assert.equal(out.depth, "quick");
    assert.equal(out.source, "policy-baseline");
    assert.equal(out.lite_denied, "parallel");
    assert.equal(out.lite_source, "flag");
  });

  it("a routing sidecar not committed at run_base denies lite with no-routing-entry and warns, but still resolves quick", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs" });
    rmSync(join(dir, "p.routing.json"));
    const head = commitAll(dir);
    write(dir, "p.routing.json", sidecar());
    const out = okJson(run(dir, ...IDS, "--lite", "--run-base", head));
    assert.equal(out.depth, "quick");
    assert.equal(out.source, "policy-baseline");
    assert.equal(out.lite_denied, "no-routing-entry");
    assert.equal(out.lite_source, "flag");
    assert.equal(out.floor_cap, null);
    const missing = out.warnings.filter((w) => w.code === "ROUTING_SIDECAR_MISSING");
    assert.equal(missing.length, 1, JSON.stringify(out.warnings));
    assert.equal(missing[0].run_base, head);

    const unauthorized = okJson(run(dir, ...IDS, "--run-base", head));
    assert.equal(unauthorized.lite_denied, "not-authorized");
  });

  it("a sidecar missing at run_base reports no-routing-entry ahead of a high-risk spec or a floor leg", (t) => {
    const { dir } = makeFixture(t, { declared: "src/auth/session.ts" });
    rmSync(join(dir, "p.routing.json"));
    const floorHead = commitAll(dir);
    write(dir, "p.routing.json", sidecar());
    const floor = okJson(run(dir, ...IDS, "--lite", "--run-base", floorHead));
    assert.equal(floor.depth, "quick", "authorized lite on a medium spec caps the sensitive-path floor");
    assert.deepEqual(floor.floor_legs, ["sensitive-path"]);
    assert.equal(floor.floor_cap, "quick");
    assert.equal(floor.lite_denied, "no-routing-entry");

    write(dir, PLAN,
      "> **Spec:** x.spec.md\n\n### Task 1: Example [specialist: none]\n\n" +
      "**Files:**\n- Create: `lib/a.mjs`\n\n**Tests:** `new.test.mjs`\n");
    write(dir, SPEC, "---\nrisk_level: high\n---\n# x\n");
    rmSync(join(dir, "p.routing.json"));
    const highHead = commitAll(dir);
    write(dir, "p.routing.json", sidecar());
    const high = okJson(run(dir, ...IDS, "--lite", "--run-base", highHead));
    assert.equal(high.depth, "quick");
    assert.deepEqual(high.floor_legs, []);
    assert.equal(high.lite_denied, "no-routing-entry");
    assert.deepEqual(
      high.warnings.map((w) => w.code),
      ["ROUTING_SIDECAR_MISSING"],
      "the working-tree entry adds no warning for a grant it cannot make",
    );
  });

  it("--pass accepts only provisional or final", (t) => {
    const { dir } = makeFixture(t);
    for (const bad of ["bogus", "Final", ""]) {
      const r = run(dir, ...IDS, "--pass", bad);
      assert.equal(r.status, 1, `${JSON.stringify(bad)}: ${r.stderr}`);
      assert.match(r.stderr, /--pass/, bad);
      assert.match(r.stderr, /provisional\|final/, bad);
      assert.equal(r.stdout, "");
    }
    assert.equal(existsSync(join(dir, LOG)), false, "no lifecycle event is written");
  });

  it("final pass matches the in_progress event across task-id spellings", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs" });
    write(dir, ".gitignore", ".env\n");
    const base = commitAll(dir);
    startRun(dir);
    okJson(run(dir, ...IDS, "--lite", "--run-base", base));
    const ts = new Date().toISOString();
    appendEvent(dir, SPEC, { event: "plan_task", plan: PLAN, task_id: "task-1", status: "in_progress", notes: null, ts });
    const inProgressAt = Date.parse(ts);
    const snap = snapshot(dir);
    write(dir, ".env", "TOKEN=1\n");
    utimesSync(join(dir, ".env"), inProgressAt / 1000 - 60, inProgressAt / 1000 - 60);
    for (const id of ["1", "t1"]) {
      const out = okJson(run(dir, "--spec", SPEC, "--plan", PLAN, "--task-id", id,
        "--pass", "final", "--run-base", base, "--base-sha", snap));
      assert.equal(out.depth, "lite", `--task-id ${id}: an old ignored .env is outside the window only if in_progress was read`);
    }
    utimesSync(join(dir, ".env"), inProgressAt / 1000 + 5, inProgressAt / 1000 + 5);
    assert.equal(okJson(run(dir, ...IDS, "--pass", "final", "--run-base", base, "--base-sha", snap)).depth, "quick");
  });

  it("final pass: a lite task that touched only its declared file stays lite", (t) => {
    const { dir, head } = makeFixture(t, { declared: "lib/a.mjs" });
    const { snap } = dispatchTask(dir, head, ["--lite"]);
    write(dir, "lib/a.mjs", "export const a = 1;\n");
    const out = okJson(run(dir, ...IDS, "--pass", "final", "--run-base", head, "--base-sha", snap, "--lite"));
    assert.equal(out.depth, "lite");
    assert.equal(out.source, "lite-grant");
    assert.equal(out.escalated_from, null);
    assert.equal(out.lite_denied, null);
  });

  it("final pass escalation reports LITE_TRIPWIRE_ESCALATED in warnings and records source lite-tripwire", (t) => {
    const { dir, head } = makeFixture(t, { declared: "lib/a.mjs" });
    const { snap } = dispatchTask(dir, head, ["--lite"]);
    write(dir, "lib/x.mjs", "export {};\n");
    const out = okJson(run(dir, ...IDS, "--pass", "final", "--run-base", head, "--base-sha", snap, "--lite"));
    assert.equal(out.depth, "quick");
    assert.equal(out.source, "lite-tripwire");
    assert.equal(out.escalated_from, "lite");
    assert.deepEqual(out.floor_legs, ["scope-mismatch"]);
    const tripped = out.warnings.filter((w) => w.code === "LITE_TRIPWIRE_ESCALATED");
    assert.equal(tripped.length, 1, JSON.stringify(out.warnings));
    assert.equal(tripped[0].task_id, "t1");

    const finals = readLog(dir).filter((e) => e.event === "review_depth_resolved" && e.pass === "final");
    assert.equal(finals.length, 1);
    assert.equal(finals[0].depth, "quick");
    assert.equal(finals[0].source, "lite-tripwire");
    assert.deepEqual(finals[0].floor_legs, ["scope-mismatch"]);
  });

  it("flag-sourced lite: a final pass WITHOUT --lite still runs the tripwire and escalates", (t) => {
    const { dir, head } = makeFixture(t, { declared: "lib/a.mjs" });
    const { provisional, snap } = dispatchTask(dir, head, ["--lite"]);
    assert.equal(provisional.depth, "lite");
    write(dir, "lib/x.mjs", "export {};\n");
    const out = okJson(run(dir, ...IDS, "--pass", "final", "--run-base", head, "--base-sha", snap));
    assert.equal(out.depth, "quick");
    assert.equal(out.source, "lite-tripwire");
    assert.equal(out.escalated_from, "lite");
  });

  it("final pass with --lite after a quick provisional never resolves lite", (t) => {
    const { dir, head } = makeFixture(t, { declared: "lib/a.mjs" });
    const { provisional, snap } = dispatchTask(dir, head);
    assert.equal(provisional.depth, "quick");
    write(dir, "lib/a.mjs", "export const a = 1;\n");
    const out = okJson(run(dir, ...IDS, "--pass", "final", "--run-base", head, "--base-sha", snap, "--lite"));
    assert.equal(out.depth, "quick");
    assert.equal(out.source, "policy-baseline");
    assert.equal(out.escalated_from, null);
  });

  it("final pass ignores a lite provisional event from an earlier implement run", (t) => {
    const { dir, head } = makeFixture(t, { declared: "lib/a.mjs" });
    dispatchTask(dir, head, ["--lite"]);
    startRun(dir);
    const snap = snapshot(dir);
    write(dir, "lib/a.mjs", "export const a = 1;\n");
    const out = okJson(run(dir, ...IDS, "--pass", "final", "--run-base", head, "--base-sha", snap, "--lite"));
    assert.equal(out.depth, "quick");
    assert.equal(out.source, "policy-baseline");
  });

  it("final pass reads the task's in_progress timestamp as the ignored-path lower bound", (t) => {
    const { dir } = makeFixture(t, { declared: "lib/a.mjs" });
    write(dir, ".gitignore", ".env\n");
    const base = commitAll(dir);
    const { inProgressAt, snap } = dispatchTask(dir, base, ["--lite"]);
    write(dir, ".env", "TOKEN=1\n");
    const final = () => okJson(run(dir, ...IDS, "--pass", "final", "--run-base", base, "--base-sha", snap));

    const sec = (ms) => ms / 1000;
    utimesSync(join(dir, ".env"), sec(inProgressAt) - 60, sec(inProgressAt) - 60);
    const before = final();
    assert.equal(before.depth, "lite", "an ignored .env older than the in_progress event is outside the tripwire");

    utimesSync(join(dir, ".env"), sec(inProgressAt) + 5, sec(inProgressAt) + 5);
    const after = final();
    assert.equal(after.depth, "quick", "a lite task's tripwire runs under the lite cap");
    assert.equal(after.source, "lite-tripwire");
    assert.equal(after.escalated_from, "lite");
    assert.equal(after.floor_cap, "quick");
    assert.deepEqual(after.floor_legs, ["sensitive-path"]);
  });

  it("usage banner lists full|quick|lite and --run-base", (t) => {
    const { dir } = makeFixture(t);
    const r = runRaw(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage: adev implement resolve-depth .*--run-base <sha>/);
    assert.match(r.stderr, /--tier full\|quick\|lite/);
  });

  it("adev implement --help documents the resolve-depth ladder flags and INVALID_COMMIT_ID", (t) => {
    const { dir } = makeFixture(t);
    const r = spawnSync("node", [CLI, "implement", "--help"], { cwd: dir, encoding: "utf8", env: ENV });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha>/);
    assert.match(r.stdout, /\[--lite\] \[--tier full\|quick\|lite\] \[--parallel\]/);
    assert.match(r.stdout, /INVALID_COMMIT_ID/);
    assert.doesNotMatch(r.stdout, /scope-mismatch leg/);
    assert.doesNotMatch(r.stdout, /depth \(full\|quick\)/);
  });
});
