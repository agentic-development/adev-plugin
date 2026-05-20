// tests/cli/implement-read-routing.test.mjs
//
// Tests for `adev implement read-routing` (lib/cli/implement.mjs).
// Wraps lib/plan-routing-sidecar.mjs::lookupRoutingEntry.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       Behaviors 4-5; Error Cases: ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING,
//       ROUTING_AGENT_INVALID
// Plan-task: t3

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writeRoutingSidecar } from "../../lib/plan-routing-sidecar.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makePlanWithSidecar(label, entries) {
  const dir = mkdtempSync(join(tmpdir(), `imp-cli-${label}-`));
  const planPath = join(dir, "x.plan.md");
  writeFileSync(planPath, "# Plan\n");
  if (entries) writeRoutingSidecar(planPath, entries);
  return { dir, planPath };
}

const ENTRY = {
  task_id: "t1",
  selected_agent: "auto-agent",
  scores: {
    spec_completeness: 0.9,
    pattern_coverage: 0.8,
    blast_radius: 0.2,
    novelty: 0.3,
  },
  rationale: "ok",
};

const ENTRY_SPECIALIST = {
  task_id: "t2",
  selected_agent: "frontend-design",
  scores: {
    spec_completeness: 0.6,
    pattern_coverage: 0.7,
    blast_radius: 0.3,
    novelty: 0.5,
  },
  rationale: "ui task",
};

test("adev implement read-routing returns JSON entry for matching task_id", () => {
  const { dir, planPath } = makePlanWithSidecar("hit", [ENTRY, ENTRY_SPECIALIST]);
  try {
    const res = spawnSync(
      "node",
      [CLI, "implement", "read-routing", "--plan", planPath, "--task-id", "t2"],
      { encoding: "utf8" },
    );
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.task_id, "t2");
    assert.equal(out.selected_agent, "frontend-design");
    assert.equal(out.scores.spec_completeness, 0.6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement read-routing exits 2 with ROUTING_SIDECAR_MISSING when sidecar absent", () => {
  const { dir, planPath } = makePlanWithSidecar("nosidecar", null);
  try {
    const res = spawnSync(
      "node",
      [CLI, "implement", "read-routing", "--plan", planPath, "--task-id", "t1"],
      { encoding: "utf8" },
    );
    assert.notEqual(res.status, 0, "must exit non-zero");
    assert.match(res.stderr, /ROUTING_SIDECAR_MISSING/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement read-routing exits non-zero with ROUTING_ENTRY_MISSING when task_id not found", () => {
  const { dir, planPath } = makePlanWithSidecar("nomatch", [ENTRY]);
  try {
    const res = spawnSync(
      "node",
      [CLI, "implement", "read-routing", "--plan", planPath, "--task-id", "tZ"],
      { encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /ROUTING_ENTRY_MISSING/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement read-routing without --agents-allowlist accepts any selected_agent", () => {
  // No allowlist supplied → ROUTING_AGENT_INVALID is not triggered; entries pass through.
  const customAgent = { ...ENTRY, task_id: "tX", selected_agent: "weird-specialist" };
  const { dir, planPath } = makePlanWithSidecar("no-allowlist", [customAgent]);
  try {
    const res = spawnSync(
      "node",
      [CLI, "implement", "read-routing", "--plan", planPath, "--task-id", "tX"],
      { encoding: "utf8" },
    );
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.selected_agent, "weird-specialist");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement read-routing surfaces ROUTING_AGENT_INVALID when entry's selected_agent is not in --agents-allowlist", () => {
  const bogus = { ...ENTRY, task_id: "tX", selected_agent: "not-real" };
  const { dir, planPath } = makePlanWithSidecar("agent-invalid", [bogus]);
  try {
    const res = spawnSync(
      "node",
      [
        CLI,
        "implement",
        "read-routing",
        "--plan",
        planPath,
        "--task-id",
        "tX",
        "--agents-allowlist",
        "auto-agent,assisted-agent,human-only,frontend-design",
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /ROUTING_AGENT_INVALID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement read-routing accepts --agents-allowlist when selected_agent matches", () => {
  const { dir, planPath } = makePlanWithSidecar("agent-ok", [ENTRY]);
  try {
    const res = spawnSync(
      "node",
      [
        CLI,
        "implement",
        "read-routing",
        "--plan",
        planPath,
        "--task-id",
        "t1",
        "--agents-allowlist",
        "auto-agent,assisted-agent,human-only",
      ],
      { encoding: "utf8" },
    );
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.selected_agent, "auto-agent");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement read-routing errors when --plan or --task-id missing", () => {
  const res = spawnSync("node", [CLI, "implement", "read-routing"], {
    encoding: "utf8",
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /--plan|--task-id/);
});

test("adev implement read-routing errors when --plan does not end with .plan.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "imp-cli-badpath-"));
  try {
    const planPath = join(dir, "x.md");
    writeFileSync(planPath, "# Plan\n");
    const res = spawnSync(
      "node",
      [CLI, "implement", "read-routing", "--plan", planPath, "--task-id", "t1"],
      { encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /INVALID_PLAN_PATH|\.plan\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev implement --help prints usage including read-routing", () => {
  const res = spawnSync("node", [CLI, "implement", "--help"], { encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /read-routing/);
});
