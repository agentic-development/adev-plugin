// tests/cli/route-emit-sidecar.test.mjs
//
// Tests for `adev route emit-sidecar` (lib/cli/route.mjs).
// Wraps lib/plan-routing-sidecar.mjs::writeRoutingSidecar.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
//       Behavior 1, Error Cases: SIDECAR_WRITE_FAILED
// Plan-task: t2
//
// Contract:
//   - Reads a JSON array of entries from stdin
//   - --plan <path> required
//   - Exit 0 on success; non-zero with code on stderr on failure

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makePlan(label) {
  const dir = mkdtempSync(join(tmpdir(), `route-cli-${label}-`));
  const planPath = join(dir, "x.plan.md");
  writeFileSync(planPath, "# Plan\n");
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

test("adev route emit-sidecar writes <plan-stem>.routing.md and leaves plan body untouched", () => {
  const { dir, planPath } = makePlan("happy");
  try {
    const planBefore = readFileSync(planPath, "utf8");
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      {
        input: JSON.stringify([ENTRY]),
        encoding: "utf8",
      },
    );
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);

    const sidecarPath = planPath.replace(/\.plan\.md$/, ".routing.md");
    assert.ok(existsSync(sidecarPath), "sidecar must be written");
    assert.equal(
      readFileSync(planPath, "utf8"),
      planBefore,
      "plan body must be byte-identical",
    );

    const body = readFileSync(sidecarPath, "utf8");
    assert.match(body, /task_id: t1/);
    assert.match(body, /selected_agent: auto-agent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar writes JSON status report on success", () => {
  const { dir, planPath } = makePlan("status");
  try {
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      { input: JSON.stringify([ENTRY]), encoding: "utf8" },
    );
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.entries, 1);
    assert.match(out.sidecar, /\.routing\.md$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar errors when --plan is missing", () => {
  const res = spawnSync("node", [CLI, "route", "emit-sidecar"], {
    input: JSON.stringify([ENTRY]),
    encoding: "utf8",
  });
  assert.notEqual(res.status, 0, "must exit non-zero without --plan");
  assert.match(res.stderr, /--plan/);
});

test("adev route emit-sidecar errors when --plan does not end with .plan.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "route-cli-badpath-"));
  try {
    const planPath = join(dir, "x.md");
    writeFileSync(planPath, "# Plan\n");
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      { input: JSON.stringify([ENTRY]), encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /INVALID_PLAN_PATH|\.plan\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar errors on invalid entry payload", () => {
  const { dir, planPath } = makePlan("invalid");
  try {
    // Missing task_id
    const bad = { selected_agent: "auto-agent",
      scores: { spec_completeness: 0.5, pattern_coverage: 0.5, blast_radius: 0.5, novelty: 0.5 },
      rationale: "x" };
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      { input: JSON.stringify([bad]), encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /INVALID_ROUTING_ENTRY/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar errors when stdin is not valid JSON", () => {
  const { dir, planPath } = makePlan("badjson");
  try {
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      { input: "not json", encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /JSON|stdin/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar errors when stdin payload is not an array", () => {
  const { dir, planPath } = makePlan("notarray");
  try {
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      { input: JSON.stringify(ENTRY), encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /array|INVALID_ROUTING_ENTRY/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar surfaces SIDECAR_WRITE_FAILED with non-zero exit when rename blocked", () => {
  const { dir, planPath } = makePlan("rename-blocked");
  try {
    // Plant a directory at the destination so renameSync fails.
    mkdirSync(planPath.replace(/\.plan\.md$/, ".routing.md"));
    const res = spawnSync(
      "node",
      [CLI, "route", "emit-sidecar", "--plan", planPath],
      { input: JSON.stringify([ENTRY]), encoding: "utf8" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /SIDECAR_WRITE_FAILED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("adev route emit-sidecar --help prints usage", () => {
  const res = spawnSync("node", [CLI, "route", "--help"], { encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /emit-sidecar/);
});
