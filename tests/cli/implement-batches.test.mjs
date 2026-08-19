import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
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
});
