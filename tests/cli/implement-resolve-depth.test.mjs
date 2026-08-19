import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveImplementReviewDepth } from "../../lib/implement/review-depth.mjs";
import { loadRigorPolicies } from "../../lib/governance/rigor-mode.mjs";
import { lookupRoutingEntry } from "../../lib/plan-routing-sidecar.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

function run(cwd, ...args) {
  return spawnSync("node", [CLI, "implement", "resolve-depth", ...args], { encoding: "utf8", env: ENV, cwd });
}

function makeFixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-resolve-depth-")));
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), 'project:\n  name: t\n');
  writeFileSync(join(dir, ".context-index", "governance", "risk-policies.yaml"),
    "policies:\n  low:\n    implement_mode: quick\n");
  const specPath = join(dir, "x.spec.md");
  writeFileSync(specPath, "---\nrisk_level: low\n---\n# x\n");
  const planPath = join(dir, "p.plan.md");
  writeFileSync(planPath,
    "> **Spec:** x.spec.md\n\n" +
    "### Task 1: Example [specialist: none]\n\n" +
    "**Files:**\n- Create: `new.txt`\n\n" +
    "**Tests:** `new.test.mjs`\n");
  writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
    version: 1, entries: [{ task_id: "t1", selected_agent: "auto-agent",
      scores: { spec_completeness: 1, pattern_coverage: 1, blast_radius: 1, novelty: 1 }, rationale: "" }],
  }));
  return { dir, specPath, planPath };
}

describe("adev implement resolve-depth", () => {
  it("provisional pass prints JSON with depth/source", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    const printed = JSON.parse(r.stdout);
    assert.ok(["full", "quick"].includes(printed.depth));
  });

  it("final pass without --base-sha exits non-zero with MISSING_DIFF_RANGE", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--pass", "final");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /MISSING_DIFF_RANGE/);
  });

  it("unknown task-id in the sidecar exits non-zero with ROUTING_ENTRY_MISSING", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "does-not-exist");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ROUTING_ENTRY_MISSING/);
  });

  it("--review-cycles 0 exits non-zero with INVALID_REVIEW_CYCLES (distinct from the manifest's INVALID_MAX_REVIEW_CYCLES)", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--review-cycles", "0");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /INVALID_REVIEW_CYCLES/);
  });

  it("--review-cycles 5 overrides implement.max_review_cycles and echoes the resolved value", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--review-cycles", "5");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).review_cycles, 5);
  });

  it("JSON output matches a direct resolveImplementReviewDepth() call for identical inputs", () => {
    const { dir, specPath, planPath } = makeFixture();
    const direct = resolveImplementReviewDepth({
      spec: { risk_level: "low", specPath },
      task: { id: "t1", additive_only: true, declared_files: ["new.txt"], in_batch: false, had_critical_finding: false },
      routingEntry: lookupRoutingEntry(planPath, "t1"), tierFlag: null,
      policies: loadRigorPolicies(dir), pass: "provisional",
    });
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    const viaCli = JSON.parse(r.stdout);
    assert.equal(viaCli.depth, direct.depth);
    assert.equal(viaCli.source, direct.source);
    assert.deepEqual(viaCli.floor_legs, direct.floor_legs);
  });

  it("a task whose Files: block declares a Modify: entry is NOT additive-only, and resolves full even with perfect scores", () => {
    const { dir, specPath, planPath } = makeFixture();
    writeFileSync(planPath,
      "> **Spec:** x.spec.md\n\n### Task 1: Example [specialist: none]\n\n" +
      "**Files:**\n- Modify: `existing.txt`\n\n**Tests:** `new.test.mjs`\n");
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).depth, "full");
  });

  it("--in-batch forces full via the batched-task floor leg", () => {
    const { dir, specPath, planPath } = makeFixture();
    const r = run(dir, "--spec", specPath, "--plan", planPath, "--task-id", "t1", "--in-batch");
    assert.equal(r.status, 0, r.stderr);
    const printed = JSON.parse(r.stdout);
    assert.equal(printed.depth, "full");
    assert.ok(printed.floor_legs.includes("batched-task"));
  });
});
