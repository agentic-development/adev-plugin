import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

function run(...args) {
  return spawnSync("node", [CLI, "implement", "batches", ...args], { encoding: "utf8", env: ENV });
}

// Variant that lets the caller pick the process cwd — needed for the
// spec-path / lifecycle-state carry-forward tests, since `projectRoot` inside
// the CLI is always `process.cwd()` (per cli/index.mjs's dispatch()).
function runIn(cwd, ...args) {
  return spawnSync("node", [CLI, "implement", "batches", ...args], { encoding: "utf8", env: ENV, cwd });
}

function makeTempProject(manifestBody = 'project:\n  name: t\n  adev_version: "0.22.0"\n') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-batches-project-")));
  mkdirSync(join(dir, ".context-index", "lifecycle-state"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifestBody);
  return dir;
}

const TWO_TASK_ENTRIES = {
  version: 1,
  _generated_by: "test",
  entries: [
    { task_id: "1", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
    { task_id: "2", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
  ],
};

describe("adev implement batches", () => {
  it("exits 1 with CONFLICTING_BATCH_FLAGS when --no-batch and --parallel are both passed", () => {
    const r = run("--no-batch", "--parallel");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CONFLICTING_BATCH_FLAGS/);
  });

  it("resolves an eligible batch from a plan + routing sidecar and prints JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
        version: 1, _generated_by: "test",
        entries: [
          { task_id: "1", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
          { task_id: "2", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
        ],
      }));
      const r = run("--plan", plan);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("exits 2 with ROUTING_SIDECAR_MISSING when the sidecar is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      const r = run("--plan", plan);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /ROUTING_SIDECAR_MISSING/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("exits 1 with INVALID_MAX_BATCH_SIZE on a non-integer --max-batch", () => {
    const r = run("--plan", "irrelevant.plan.md", "--max-batch", "two");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INVALID_MAX_BATCH_SIZE/);
  });

  it("with --no-batch, all tasks go solo and no batches are formed", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
        version: 1, _generated_by: "test",
        entries: [
          { task_id: "1", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
          { task_id: "2", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
        ],
      }));
      const r = run("--plan", plan, "--no-batch");
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 0);
      assert.equal(out.solo.length, 2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("exits 1 with INVALID_PLAN_PATH when --plan points to a nonexistent file", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const missingPlan = join(dir, "nope.plan.md");
      const r = run("--plan", missingPlan);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /INVALID_PLAN_PATH/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("degrades gracefully (no crash, empty priorPlanTasks, advisory on stderr) when the plan has no Spec header", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify(TWO_TASK_ENTRIES));
      const r = run("--plan", plan);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /advisory:.*Spec/i);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 1);
      assert.deepEqual(out.batches[0].taskIds, ["1", "2"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("Behavior E: a task left `blocked` by a prior run forces the WHOLE group to solo, read through a real lifecycle log", () => {
    const dir = makeTempProject();
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(
        plan,
        "> **Spec:** .context-index/specs/features/m/feat.spec.md (revision 1)\n\n" +
          "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n",
      );
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify(TWO_TASK_ENTRIES));
      writeFileSync(
        join(dir, ".context-index", "lifecycle-state", "feat.jsonl"),
        JSON.stringify({ event: "plan_task", plan: "p.plan.md", task_id: "1", status: "blocked", ts: "2026-01-01T00:00:00.000Z" }) + "\n",
      );
      const r = runIn(dir, "--plan", plan);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 0);
      assert.equal(out.solo.length, 2);
      assert.ok(out.solo.every((s) => s.reason === "prior-failure"), JSON.stringify(out.solo));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("--max-batch overrides a lower manifest-configured cap, letting a 3-task group batch", () => {
    const dir = makeTempProject('project:\n  name: t\n  adev_version: "0.22.0"\nimplement:\n  max_batch_size: 2\n');
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2 → Task 3\n\n## Next\n");
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
        version: 1, _generated_by: "test",
        entries: [
          { task_id: "1", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
          { task_id: "2", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
          { task_id: "3", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
        ],
      }));

      // Baseline: manifest's own cap of 2 forces the 3-member group to solo.
      const baseline = runIn(dir, "--plan", plan);
      assert.equal(baseline.status, 0, baseline.stderr);
      const baselineOut = JSON.parse(baseline.stdout);
      assert.equal(baselineOut.batches.length, 0);
      assert.equal(baselineOut.solo.length, 3);

      // Override: --max-batch 5 raises the cap so all three batch together.
      const overridden = runIn(dir, "--plan", plan, "--max-batch", "5");
      assert.equal(overridden.status, 0, overridden.stderr);
      const overriddenOut = JSON.parse(overridden.stdout);
      assert.equal(overriddenOut.batches.length, 1);
      assert.deepEqual(overriddenOut.batches[0].taskIds, ["1", "2", "3"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("pairs /adev:route's t<n> sidecar ids with the plan's `Task <n>` group members and forms a batch", () => {
    const dir = makeTempProject();
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
        ...TWO_TASK_ENTRIES,
        entries: TWO_TASK_ENTRIES.entries.map((e) => ({ ...e, task_id: `t${e.task_id}` })),
      }));
      const r = runIn(dir, "--plan", plan);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 1, JSON.stringify(out));
      assert.deepEqual(out.batches[0].taskIds, ["1", "2"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("Behavior E: a prior `blocked` plan_task recorded as t<n> still forces the group solo", () => {
    const dir = makeTempProject();
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(
        plan,
        "> **Spec:** .context-index/specs/features/m/feat.spec.md (revision 1)\n\n" +
          "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n",
      );
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
        ...TWO_TASK_ENTRIES,
        entries: TWO_TASK_ENTRIES.entries.map((e) => ({ ...e, task_id: `t${e.task_id}` })),
      }));
      writeFileSync(
        join(dir, ".context-index", "lifecycle-state", "feat.jsonl"),
        JSON.stringify({ event: "plan_task", plan: "p.plan.md", task_id: "t2", status: "blocked", ts: "2026-01-01T00:00:00.000Z" }) + "\n",
      );
      const r = runIn(dir, "--plan", plan);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 0);
      assert.ok(out.solo.every((s) => s.reason === "prior-failure"), JSON.stringify(out.solo));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// A task granted `lite` runs inline in the orchestrator, so it can never share
// a batch subagent. The grant is evaluated per task from governance inputs
// committed at --run-base, never from the working tree.
describe("adev implement batches --lite --run-base", () => {
  const SPEC_REL = ".context-index/specs/features/demo/demo.spec.md";
  const PLAN_REL = ".context-index/specs/features/demo/demo.plan.md";
  const SIDECAR_REL = ".context-index/specs/features/demo/demo.routing.json";
  const POLICIES_REL = ".context-index/governance/risk-policies.yaml";

  const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const EASY = { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.7, novelty: 0.6 };
  const HARD = { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 };

  // Task 1: lite-eligible routing, ordinary declared file → granted, though
  //         its scores are low: the grant does not read them.
  // Tasks 2, 3, 4: lite-eligible routing, declared file on a built-in sensitive
  //         path → the provisional sensitive-path floor denies the grant (the
  //         lite cap resolves them quick), so they batch.
  const SIDECAR = JSON.stringify({
    version: 1,
    _generated_by: "test",
    entries: [
      { task_id: "t1", selected_agent: "auto-agent", scores: HARD, rationale: "" },
      { task_id: "t2", selected_agent: "auto-agent", scores: EASY, rationale: "" },
      { task_id: "t3", selected_agent: "auto-agent", scores: HARD, rationale: "" },
      { task_id: "t4", selected_agent: "auto-agent", scores: HARD, rationale: "" },
    ],
  });

  function planBody({ specHeader = true } = {}) {
    const task = (n, file) => `### Task ${n}: t${n}\n\n**Files:**\n- Create: \`${file}\`\n\n`;
    return (
      (specHeader ? `> **Spec:** \`${SPEC_REL}\` (revision 1)\n\n` : "") +
      "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4\n\n" +
      "## Tasks\n\n" +
      task(1, "src/a.mjs") + task(2, "src/auth/login.mjs") + task(3, "src/auth/c.mjs") + task(4, "src/auth/d.mjs")
    );
  }

  function write(dir, rel, text) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }

  // `gitMode`: "commit" (a repo with one commit), "no-head" (an initialized
  // repo with no commit), or "none" (not a repository).
  function fixtureRepo(t, { riskLevel = "medium", policies, specHeader = true, commitSidecar = true, gitMode = "commit" } = {}) {
    const dir = makeTempProject();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    if (gitMode !== "none") {
      git(dir, "init", "-q");
      git(dir, "config", "user.email", "t@t.com");
      git(dir, "config", "user.name", "t");
      git(dir, "config", "commit.gpgsign", "false");
    }
    write(dir, SPEC_REL, `---\nrisk_level: ${riskLevel}\n---\n# Demo\n`);
    write(dir, PLAN_REL, planBody({ specHeader }));
    if (policies !== undefined) write(dir, POLICIES_REL, policies);
    if (commitSidecar || gitMode !== "commit") write(dir, SIDECAR_REL, SIDECAR);
    if (gitMode !== "commit") return { dir, head: null };
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    if (!commitSidecar) write(dir, SIDECAR_REL, SIDECAR);
    return { dir, head: git(dir, "rev-parse", "HEAD") };
  }

  function okJson(r) {
    assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    return JSON.parse(r.stdout);
  }

  function failsWith(r, re) {
    assert.equal(r.status, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, re);
    assert.equal(r.stdout, "");
  }

  const ALL_FOUR = [{ group: "A", segment: 1, taskIds: ["1", "2", "3", "4"] }];
  const WITHOUT_ONE = [{ group: "A", segment: 1, taskIds: ["2", "3", "4"] }];
  const LITE_POLICY = "policies:\n  medium:\n    implement_mode: lite\n";

  it("batches --lite --run-base excludes granted tasks", (t) => {
    const { dir, head } = fixtureRepo(t);
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--lite", "--run-base", head));
    assert.deepEqual(out.batches, WITHOUT_ONE);
    assert.deepEqual(out.solo, [{ taskId: "1", reason: "lite" }]);
  });

  it("--tier lite reads the same as --lite", (t) => {
    const { dir, head } = fixtureRepo(t);
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--tier", "lite", "--run-base", head));
    assert.deepEqual(out.batches, WITHOUT_ONE);
    assert.deepEqual(out.solo, [{ taskId: "1", reason: "lite" }]);
  });

  it("--lite with --tier full or --tier quick exits 1 with CONFLICTING_TIER_FLAGS", (t) => {
    const { dir, head } = fixtureRepo(t);
    for (const tier of ["full", "quick"]) {
      failsWith(runIn(dir, "--plan", PLAN_REL, "--lite", "--tier", tier, "--run-base", head), /CONFLICTING_TIER_FLAGS/);
    }
  });

  it("an unknown --tier exits 1 with INVALID_TIER", (t) => {
    const { dir, head } = fixtureRepo(t);
    failsWith(runIn(dir, "--plan", PLAN_REL, "--tier", "Lite", "--run-base", head), /INVALID_TIER/);
  });

  it("--tier quick or --tier full opts out of a policy lite at run_base, and the tasks batch normally", (t) => {
    const { dir, head } = fixtureRepo(t, { policies: LITE_POLICY });
    for (const tier of ["quick", "full"]) {
      const out = okJson(runIn(dir, "--plan", PLAN_REL, "--tier", tier, "--run-base", head));
      assert.deepEqual(out.batches, ALL_FOUR, tier);
      assert.deepEqual(out.solo, [], tier);
    }
  });

  it("without --lite, --run-base or a lite policy, every task stays batchable", (t) => {
    const { dir, head } = fixtureRepo(t);
    assert.deepEqual(okJson(runIn(dir, "--plan", PLAN_REL)).batches, ALL_FOUR);
    assert.deepEqual(okJson(runIn(dir, "--plan", PLAN_REL, "--run-base", head)).batches, ALL_FOUR);
  });

  it("--lite or --tier lite without --run-base exits 1", (t) => {
    const { dir } = fixtureRepo(t);
    failsWith(runIn(dir, "--plan", PLAN_REL, "--lite"), /--run-base <sha> is required when lite is authorized/);
    failsWith(runIn(dir, "--plan", PLAN_REL, "--tier", "lite"), /--run-base <sha> is required when lite is authorized/);
  });

  it("a working-tree lite policy without --run-base exits 1 unless --tier opts out", (t) => {
    const { dir } = fixtureRepo(t, { policies: LITE_POLICY });
    failsWith(runIn(dir, "--plan", PLAN_REL), /--run-base <sha> is required when lite is authorized/);
    for (const tier of ["quick", "full"]) {
      assert.deepEqual(okJson(runIn(dir, "--plan", PLAN_REL, "--tier", tier)).batches, ALL_FOUR, tier);
    }
  });

  it("without --run-base, a lite policy at another risk level than the spec's is not blocked", (t) => {
    const { dir } = fixtureRepo(t, { policies: "policies:\n  low:\n    implement_mode: lite\n" });
    const out = okJson(runIn(dir, "--plan", PLAN_REL));
    assert.deepEqual(out.batches, ALL_FOUR);
    assert.deepEqual(out.solo, []);
  });

  it("without --run-base and with an unresolvable spec, a lite policy at any level blocks", (t) => {
    const { dir } = fixtureRepo(t, { specHeader: false, policies: "policies:\n  low:\n    implement_mode: lite\n" });
    failsWith(runIn(dir, "--plan", PLAN_REL), /--run-base <sha> is required when lite is authorized/);
  });

  it("without --run-base, lite committed at HEAD but removed in the working tree still exits 1", (t) => {
    const { dir } = fixtureRepo(t, { policies: LITE_POLICY });
    write(dir, POLICIES_REL, "policies:\n  medium:\n    implement_mode: quick\n");
    failsWith(runIn(dir, "--plan", PLAN_REL), /--run-base <sha> is required when lite is authorized/);
    assert.deepEqual(okJson(runIn(dir, "--plan", PLAN_REL, "--tier", "quick")).batches, ALL_FOUR);
  });

  for (const gitMode of ["none", "no-head"]) {
    it(`with no HEAD to read (${gitMode}), only the working-tree policy is checked`, (t) => {
      const lite = fixtureRepo(t, { gitMode, policies: LITE_POLICY });
      failsWith(runIn(lite.dir, "--plan", PLAN_REL), /--run-base <sha> is required when lite is authorized/);
      const quick = fixtureRepo(t, { gitMode, policies: "policies:\n  medium:\n    implement_mode: quick\n" });
      assert.deepEqual(okJson(runIn(quick.dir, "--plan", PLAN_REL)).batches, ALL_FOUR);
    });
  }

  it("policy authorization at run_base excludes granted tasks without --lite", (t) => {
    const { dir, head } = fixtureRepo(t, { policies: LITE_POLICY });
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--run-base", head));
    assert.deepEqual(out.batches, WITHOUT_ONE);
    assert.deepEqual(out.solo, [{ taskId: "1", reason: "lite" }]);
  });

  it("a lite policy edited into the working tree after run_base grants nothing", (t) => {
    const { dir, head } = fixtureRepo(t, { policies: "policies:\n  medium:\n    implement_mode: quick\n" });
    write(dir, POLICIES_REL, LITE_POLICY);
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--run-base", head));
    assert.deepEqual(out.batches, ALL_FOUR);
  });

  it("--lite on a high-risk spec grants nothing", (t) => {
    const { dir, head } = fixtureRepo(t, { riskLevel: "high" });
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--lite", "--run-base", head));
    assert.deepEqual(out.batches, ALL_FOUR);
  });

  it("--lite with --parallel grants nothing", (t) => {
    const { dir, head } = fixtureRepo(t);
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--lite", "--parallel", "--run-base", head));
    assert.deepEqual(out.batches, ALL_FOUR);
  });

  it("unresolvable spec header fails closed toward exclusion of eligible tasks", (t) => {
    const { dir, head } = fixtureRepo(t, { specHeader: false });
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--run-base", head));
    assert.deepEqual(out.batches, WITHOUT_ONE);
    assert.deepEqual(out.solo, [{ taskId: "1", reason: "lite-assumed" }]);
    assert.equal(out.advisories.filter((a) => a.type === "LITE_AUTHORIZATION_ASSUMED").length, 1, JSON.stringify(out.advisories));
  });

  it("a spec header naming an unreadable spec also fails closed toward exclusion", (t) => {
    const { dir, head } = fixtureRepo(t);
    rmSync(join(dir, SPEC_REL));
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--run-base", head));
    assert.deepEqual(out.solo, [{ taskId: "1", reason: "lite-assumed" }]);
    assert.equal(out.advisories.filter((a) => a.type === "LITE_AUTHORIZATION_ASSUMED").length, 1, JSON.stringify(out.advisories));
  });

  it("an explicit --lite on an unresolvable spec is a real grant, not an assumed one", (t) => {
    const { dir, head } = fixtureRepo(t, { specHeader: false });
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--lite", "--run-base", head));
    assert.deepEqual(out.solo, [{ taskId: "1", reason: "lite" }]);
    assert.equal(out.advisories.some((a) => a.type === "LITE_AUTHORIZATION_ASSUMED"), false, JSON.stringify(out.advisories));
  });

  it("--tier quick on an unresolvable spec assumes no authorization", (t) => {
    const { dir, head } = fixtureRepo(t, { specHeader: false });
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--tier", "quick", "--run-base", head));
    assert.deepEqual(out.batches, ALL_FOUR);
    assert.equal(out.advisories.some((a) => a.type === "LITE_AUTHORIZATION_ASSUMED"), false, JSON.stringify(out.advisories));
  });

  it("a routing sidecar absent at run_base grants nothing and is reported as an advisory", (t) => {
    const { dir, head } = fixtureRepo(t, { commitSidecar: false });
    const out = okJson(runIn(dir, "--plan", PLAN_REL, "--lite", "--run-base", head));
    assert.deepEqual(out.batches, ALL_FOUR);
    const missing = out.advisories.filter((a) => a.type === "ROUTING_SIDECAR_MISSING");
    assert.equal(missing.length, 1, JSON.stringify(out.advisories));
    assert.equal(missing[0].run_base, head);
  });

  it("a malformed risk-policies.yaml committed at run_base exits 1", (t) => {
    const cases = [
      ["policies:\n  medium:\n    implement_mode: bogus\n", /INVALID_TIER/],
      ["policies:\n  high:\n    implement_mode: lite\n", /LITE_NOT_ALLOWED_FOR_HIGH/],
    ];
    for (const [policies, code] of cases) {
      const { dir, head } = fixtureRepo(t, { policies });
      failsWith(runIn(dir, "--plan", PLAN_REL, "--run-base", head), code);
    }
  });

  it("batches writes no lifecycle event", (t) => {
    const { dir, head } = fixtureRepo(t, { policies: LITE_POLICY });
    const log = join(dir, ".context-index", "lifecycle-state", "demo.jsonl");
    okJson(runIn(dir, "--plan", PLAN_REL, "--lite", "--run-base", head));
    okJson(runIn(dir, "--plan", PLAN_REL, "--run-base", head));
    assert.equal(existsSync(log), false);
    assert.deepEqual(readdirSync(join(dir, ".context-index", "lifecycle-state")), []);
  });

  it("INVALID_COMMIT_ID on a bad --run-base", (t) => {
    const { dir, head } = fixtureRepo(t);
    const unresolvable = head.replace(/^./, (c) => (c === "0" ? "1" : "0"));
    for (const bad of ["--run-base=--output=x", "--run-base=abc123", `--run-base=${head.toUpperCase()}`, `--run-base=${unresolvable}`]) {
      const r = runIn(dir, "--plan", PLAN_REL, "--lite", bad);
      assert.equal(r.status, 1, `${bad}: ${r.stderr}`);
      assert.match(r.stderr, /INVALID_COMMIT_ID: --run-base/, bad);
      assert.equal(r.stdout, "", bad);
    }
    const tree = git(dir, "rev-parse", "HEAD^{tree}");
    failsWith(runIn(dir, "--plan", PLAN_REL, "--run-base", tree), /INVALID_COMMIT_ID: --run-base/);
  });
});
