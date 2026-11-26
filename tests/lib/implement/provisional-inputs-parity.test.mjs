// tests/lib/implement/provisional-inputs-parity.test.mjs
//
// `batches` keeps a task out of every batch exactly when resolve-depth's
// provisional pass would grant it `lite`. If the two verbs assembled the
// resolver's inputs differently, a task resolve-depth grants could be
// batched into a subagent, so the solo-`lite` set reported by
// `adev implement batches` must equal the set of tasks for which
// `adev implement resolve-depth --pass provisional` returns `depth: "lite"`.
// Both verbs run through the real CLI against one committed run base.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

const SPEC_REL = ".context-index/specs/features/demo/demo.spec.md";
const PLAN_REL = ".context-index/specs/features/demo/demo.plan.md";
const SIDECAR_REL = ".context-index/specs/features/demo/demo.routing.json";
const POLICIES_REL = ".context-index/governance/risk-policies.yaml";
const BOUNDARIES_REL = ".context-index/governance/boundaries.yaml";
const SENSITIVE_REL = ".context-index/governance/sensitive-paths.yaml";

const EASY = { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.7, novelty: 0.6 };
const HARD = { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 };

// [task number, declared file, routed agent, routing scores]
const TASKS = [
  [1, "src/a.mjs", "auto-agent", EASY],
  [2, "src/auth/login.mjs", "auto-agent", EASY],
  [3, "src/c.mjs", "assisted-agent", EASY],
  [4, "src/d.mjs", "auto-agent", HARD],
  [5, "src/db/query.mjs", "auto-agent", EASY],
  [6, "src/g.mjs", "human-only", EASY],
  [7, "src/payments/charge.mjs", "auto-agent", EASY],
];
const TASK_IDS = TASKS.map(([n]) => String(n));

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

function write(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

function planBody() {
  const task = ([n, file]) => `### Task ${n}: t${n}\n\n**Files:**\n- Create: \`${file}\`\n\n`;
  return (
    `> **Spec:** \`${SPEC_REL}\` (revision 1)\n\n` +
    `## Parallelization\n\n- Group A (sequential): ${TASK_IDS.map((id) => `Task ${id}`).join(" → ")}\n\n` +
    "## Tasks\n\n" +
    TASKS.map(task).join("")
  );
}

const SIDECAR = JSON.stringify({
  version: 1,
  _generated_by: "test",
  entries: TASKS.map(([n, , agent, scores]) => ({ task_id: `t${n}`, selected_agent: agent, scores, rationale: "" })),
});

// With `commitSidecar: false` the sidecar exists only in the working tree, so
// nothing at run_base can grant lite.
function fixtureRepo(t, { riskLevel, policies, commitSidecar = true }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-provisional-parity-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, ".context-index/manifest.yaml", 'project:\n  name: t\n  adev_version: "0.22.0"\n');
  mkdirSync(join(dir, ".context-index", "lifecycle-state"), { recursive: true });
  write(dir, SPEC_REL, `---\nrisk_level: ${riskLevel}\n---\n# Demo\n`);
  write(dir, PLAN_REL, planBody());
  if (commitSidecar) write(dir, SIDECAR_REL, SIDECAR);
  write(dir, POLICIES_REL, policies);
  write(dir, BOUNDARIES_REL,
    "boundaries:\n  - id: no-direct-db\n    severity: error\n    pattern: 'src/db/'\n    exclude: []\n");
  write(dir, SENSITIVE_REL, 'sensitive_paths:\n  - "src/payments/**"\n');
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  const head = git(dir, "rev-parse", "HEAD");
  if (!commitSidecar) write(dir, SIDECAR_REL, SIDECAR);
  return { dir, head };
}

function cli(dir, verb, args) {
  const r = spawnSync("node", [CLI, "implement", verb, ...args], { encoding: "utf8", env: ENV, cwd: dir });
  assert.equal(r.status, 0, `${verb} ${args.join(" ")}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function batchesLiteSet(dir, head, flags) {
  const out = cli(dir, "batches", ["--plan", PLAN_REL, ...flags, "--run-base", head]);
  return out.solo.filter((s) => s.reason === "lite").map((s) => s.taskId).sort();
}

function resolveDepthOutputs(dir, head, flags) {
  return TASK_IDS.map((id) => [id, cli(dir, "resolve-depth", [
    "--spec", SPEC_REL, "--plan", PLAN_REL, "--task-id", id,
    "--pass", "provisional", ...flags, "--run-base", head,
  ])]);
}

const liteSet = (outputs) => outputs.filter(([, out]) => out.depth === "lite").map(([id]) => id).sort();

const QUICK_POLICY = "policies:\n  medium:\n    implement_mode: quick\n  high:\n    implement_mode: full\n";
const LITE_POLICY = "policies:\n  medium:\n    implement_mode: lite\n";

const SCENARIOS = [
  { name: "--lite on a medium-risk spec", riskLevel: "medium", policies: QUICK_POLICY, flags: ["--lite"], expected: ["1"] },
  { name: "--tier lite on a medium-risk spec", riskLevel: "medium", policies: QUICK_POLICY, flags: ["--tier", "lite"], expected: ["1"] },
  { name: "a policy lite with no flag", riskLevel: "medium", policies: LITE_POLICY, flags: [], expected: ["1"] },
  { name: "--lite on a high-risk spec", riskLevel: "high", policies: QUICK_POLICY, flags: ["--lite"], expected: [] },
  { name: "--lite with --parallel", riskLevel: "medium", policies: QUICK_POLICY, flags: ["--lite", "--parallel"], expected: [] },
  { name: "--tier quick over a policy lite", riskLevel: "medium", policies: LITE_POLICY, flags: ["--tier", "quick"], expected: [] },
];

describe("batches and resolve-depth agree on the provisional lite grant", { concurrency: true }, () => {
  for (const { name, riskLevel, policies, flags, expected } of SCENARIOS) {
    it(name, (t) => {
      const { dir, head } = fixtureRepo(t, { riskLevel, policies });
      const fromBatches = batchesLiteSet(dir, head, flags);
      const fromResolveDepth = liteSet(resolveDepthOutputs(dir, head, flags));
      assert.deepEqual(fromBatches, fromResolveDepth);
      assert.deepEqual(fromResolveDepth, expected);
    });
  }

  it("--lite with no sidecar committed at run_base", (t) => {
    const { dir, head } = fixtureRepo(t, { riskLevel: "medium", policies: QUICK_POLICY, commitSidecar: false });
    const fromBatches = batchesLiteSet(dir, head, ["--lite"]);
    const outputs = resolveDepthOutputs(dir, head, ["--lite"]);
    assert.deepEqual(fromBatches, liteSet(outputs));
    assert.deepEqual(fromBatches, []);
    assert.deepEqual(
      outputs.map(([id, out]) => [id, out.lite_denied]),
      TASK_IDS.map((id) => [id, "routing-scores"]),
    );
  });
});
