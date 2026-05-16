/**
 * End-to-end integration test for the cli-driver-surface CLI verbs.
 *
 * Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
 *
 * Each per-verb test file (`tests/cli/*.test.mjs`) covers its verb in
 * isolation: argv validation, --help, happy path, edge cases. This file
 * covers the *seams between verbs* — chained sequences that mirror the real
 * `/adev:specify` → `/adev:review-specs` → `/adev:plan` → `/adev:implement`
 * → `/adev:validate` flow. The goal is to prove the CLI verbs co-emit the
 * correct event stream so the projection (`adev state current`) reaches the
 * expected terminal state, AND that gate enforcement blocks out-of-order
 * skill entry.
 *
 * Scenarios:
 *   1. Happy path full lifecycle — every verb fires in order; projection
 *      reaches { status: validated } with all six steps completed.
 *   2. Gate violation — calling `adev gate require --skill validate` before
 *      implement completes exits 2 with GATE_BLOCKED.
 *   3. Drift detection — modifying a source-manifest-tracked file after
 *      stamping flips the spec's drift flag; `adev verify spec
 *      --check-drift` surfaces it.
 *
 * The tests spawn the actual CLI binary (`node cli/index.mjs`) in a temp
 * project so the dispatcher, manifest loader, and write-time diagnostic
 * hook all run end-to-end — no mocks at the verb boundary.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

const SPEC_REL = ".context-index/specs/features/m/sample.spec.md";
const PLAN_REL = ".context-index/specs/features/m/sample.plan.md";

const SPEC_BODY = `---
charter: m
status: implemented
risk_level: medium
revision: 1
charter-revision: 1
created: 2026-05-15
updated: 2026-05-15
---

# Live Spec: Sample

## Behavioral Contract

Sample behavior for lifecycle integration test.

## Acceptance Criteria

- [x] Item one
`;

const PLAN_BODY = `# Implementation Plan: Sample

> Spec: .context-index/specs/features/m/sample.spec.md

## File Structure

**Create:**
- lib/feature.mjs

### Task 1: Implement feature

- [ ] write tests
- [ ] implement
`;

const CHARTER_BODY = `---
status: approved
revision: 1
---

# Feature Charter: m

## Business Intent

Test charter.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|---|---|---|---|---|
| Sample | Test capability | must-have | v1 | implemented |
`;

/**
 * Run a CLI verb in the temp project. Returns { exitCode, stdout, stderr }.
 *
 * Equivalent to invoking `node cli/index.mjs <args>` with cwd=projectDir.
 */
function adev(projectDir, args, opts = {}) {
  const r = spawnSync("node", [CLI, ...args], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 15_000,
    ...opts,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

/**
 * Read all events from a spec's lifecycle log as parsed JSONL.
 */
function readEvents(projectDir, specRel) {
  const slug = "sample"; // basename of <slug>.spec.md
  const logPath = join(
    projectDir,
    ".context-index",
    "lifecycle-state",
    `${slug}.jsonl`,
  );
  try {
    return readFileSync(logPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Create an isolated temp project with manifest, charter, spec, plan, and an
 * initialized git repo. Returns the absolute project root.
 */
function setupProject() {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "adev-cli-lifecycle-")),
  );
  // Layout
  mkdirSync(join(dir, ".context-index/specs/features/m"), {
    recursive: true,
  });
  mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
  mkdirSync(join(dir, "lib"), { recursive: true });

  writeFileSync(
    join(dir, ".context-index/manifest.yaml"),
    [
      "project:",
      '  name: cli-lifecycle-test',
      '  adev_version: "0.22.0"',
      "modules:",
      "  - slug: m",
      "    name: Sample Module",
      "lifecycle:",
      "  gate_mode: strict",
      "  event_diagnostics: off",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, ".context-index/specs/features/m/charter.md"),
    CHARTER_BODY,
  );
  writeFileSync(join(dir, SPEC_REL), SPEC_BODY);
  writeFileSync(join(dir, PLAN_REL), PLAN_BODY);
  writeFileSync(
    join(dir, "lib/feature.mjs"),
    "export function feature() { return 1; }\n",
  );

  // Git init (the regression hook and gate checks expect a repo context)
  execSync("git init -q -b main", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email a@b.c", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name test", { cwd: dir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", {
    cwd: dir,
    stdio: "ignore",
  });
  execSync("git add -A && git commit -q -m initial", {
    cwd: dir,
    stdio: "ignore",
  });

  return dir;
}

function teardown(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe("cli-lifecycle: end-to-end CLI verb composition", () => {
  let projectDir;

  beforeEach(() => {
    projectDir = setupProject();
  });

  afterEach(() => {
    teardown(projectDir);
  });

  test("happy path: specify → review → plan → implement → validate emits the full event sequence and projection reaches validated", () => {
    const SPEC = SPEC_REL;

    // ── specify ─────────────────────────────────────────────────────────
    let r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "specify", "--status", "started",
    ]);
    assert.equal(r.exitCode, 0, `specify started: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "specify", "--status", "completed", "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0, `specify completed: ${r.stderr}`);

    // ── review-specs gate (specify must be completed) ────────────────────
    r = adev(projectDir, [
      "gate", "require", "--skill", "review-specs", "--spec", SPEC,
    ]);
    assert.equal(r.exitCode, 0, `review-specs gate: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "review", "--status", "started",
    ]);
    assert.equal(r.exitCode, 0);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "review", "--status", "completed", "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0);

    // ── plan gate ────────────────────────────────────────────────────────
    r = adev(projectDir, [
      "gate", "require", "--skill", "plan", "--spec", SPEC,
    ]);
    assert.equal(r.exitCode, 0, `plan gate: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "plan", "--status", "started",
    ]);
    assert.equal(r.exitCode, 0);

    // Plan task event — one pending task
    r = adev(projectDir, [
      "report", "--type", "plan-task", "--spec", SPEC,
      "--plan", PLAN_REL, "--task-id", "t1", "--status", "pending",
    ]);
    assert.equal(r.exitCode, 0, `plan-task pending: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "plan", "--status", "completed", "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0);

    // ── implement gate ───────────────────────────────────────────────────
    r = adev(projectDir, [
      "gate", "require", "--skill", "implement", "--spec", SPEC,
    ]);
    assert.equal(r.exitCode, 0, `implement gate: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "implement", "--status", "started",
    ]);
    assert.equal(r.exitCode, 0);

    r = adev(projectDir, [
      "report", "--type", "plan-task", "--spec", SPEC,
      "--plan", PLAN_REL, "--task-id", "t1", "--status", "in_progress",
    ]);
    assert.equal(r.exitCode, 0);

    r = adev(projectDir, [
      "report", "--type", "plan-task", "--spec", SPEC,
      "--plan", PLAN_REL, "--task-id", "t1", "--status", "done",
      "--notes", "test pass",
    ]);
    assert.equal(r.exitCode, 0);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "implement", "--status", "completed", "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0);

    // ── validate gate ────────────────────────────────────────────────────
    r = adev(projectDir, [
      "gate", "require", "--skill", "validate", "--spec", SPEC,
    ]);
    assert.equal(r.exitCode, 0, `validate gate: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "validate", "--status", "started",
    ]);
    assert.equal(r.exitCode, 0);

    r = adev(projectDir, [
      "report", "--type", "validator", "--spec", SPEC,
      "--step", "validate", "--validator", "check-1-quality-gates",
      "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0, `validator report: ${r.stderr}`);

    r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "validate", "--status", "completed", "--verdict", "PASS",
    ]);
    assert.equal(r.exitCode, 0);

    // ── Assert: event log contains the full sequence in order ────────────
    const events = readEvents(projectDir, SPEC);
    const stepStarts = events
      .filter((e) => e.event === "lifecycle_step")
      .map((e) => e.step);
    assert.deepEqual(
      stepStarts,
      ["specify", "review", "plan", "implement", "validate"],
      "lifecycle_step events should appear in lifecycle order",
    );

    const stepCompletions = events
      .filter((e) => e.event === "step_completed")
      .map((e) => ({ step: e.step, verdict: e.verdict }));
    assert.deepEqual(
      stepCompletions,
      [
        { step: "specify", verdict: "PASS" },
        { step: "review", verdict: "PASS" },
        { step: "plan", verdict: "PASS" },
        { step: "implement", verdict: "PASS" },
        { step: "validate", verdict: "PASS" },
      ],
      "step_completed events should all be PASS in lifecycle order",
    );

    const planTasks = events.filter((e) => e.event === "plan_task");
    assert.equal(planTasks.length, 3, "expected 3 plan_task events");
    assert.deepEqual(
      planTasks.map((e) => e.status),
      ["pending", "in_progress", "done"],
      "plan_task should transition pending → in_progress → done",
    );

    const validatorReports = events.filter(
      (e) => e.event === "validator_report",
    );
    assert.equal(validatorReports.length, 1);
    assert.equal(validatorReports[0].verdict, "PASS");
    assert.equal(validatorReports[0].validator, "check-1-quality-gates");

    // ── Assert: projection (adev state current) shows terminal state ─────
    r = adev(projectDir, ["state", "current", "--spec", SPEC]);
    assert.equal(r.exitCode, 0, `state current: ${r.stderr}`);
    const projection = JSON.parse(r.stdout);

    // All 5 lifecycle steps should be marked completed in the projection.
    // The projection's `steps` field is keyed by step name with a per-step
    // record carrying `status` and (for PASS/PASS_WITH_NOTES) `verdict`.
    assert.ok(projection.steps, "projection should expose steps");
    for (const step of ["specify", "review", "plan", "implement", "validate"]) {
      assert.equal(
        projection.steps[step]?.status,
        "completed",
        `step ${step} should be completed; got: ${JSON.stringify(projection.steps[step])}`,
      );
      assert.equal(
        projection.steps[step]?.verdict,
        "PASS",
        `step ${step} should have verdict PASS; got: ${JSON.stringify(projection.steps[step])}`,
      );
    }

    // After validate completes, currentStep should no longer reference an
    // in-flight step. The projection may either set it to null OR keep it
    // pointing at the last completed step — either is consistent with the
    // contract that currentStep only names an *active* step.
    if (projection.currentStep != null) {
      assert.equal(
        projection.steps[projection.currentStep]?.status,
        "completed",
        "if currentStep is non-null after final step, it must reference a completed step",
      );
    }
  });

  test("gate violation: `adev gate require --skill validate` before implement completes exits 2 with GATE_BLOCKED", () => {
    const SPEC = SPEC_REL;

    // Walk through specify → review → plan but skip implement entirely.
    for (const step of ["specify", "review", "plan"]) {
      let r = adev(projectDir, [
        "report", "--type", "step", "--spec", SPEC,
        "--step", step, "--status", "started",
      ]);
      assert.equal(r.exitCode, 0, `${step} started: ${r.stderr}`);
      r = adev(projectDir, [
        "report", "--type", "step", "--spec", SPEC,
        "--step", step, "--status", "completed", "--verdict", "PASS",
      ]);
      assert.equal(r.exitCode, 0, `${step} completed: ${r.stderr}`);
    }

    // Sanity: implement gate WOULD pass at this point (plan completed).
    let r = adev(projectDir, [
      "gate", "require", "--skill", "implement", "--spec", SPEC,
    ]);
    assert.equal(r.exitCode, 0, "implement gate should pass after plan completes");

    // But validate gate must fail — implement hasn't completed yet.
    r = adev(projectDir, [
      "gate", "require", "--skill", "validate", "--spec", SPEC,
    ]);
    assert.equal(r.exitCode, 2, "validate gate should exit 2 (GATE_BLOCKED)");
    assert.match(
      r.stderr,
      /implement|GATE_BLOCKED|prior step/i,
      `stderr should mention the blocking prior step; got: ${r.stderr}`,
    );

    // The failed gate must NOT have emitted any lifecycle event — gates are
    // read-only checks.
    const events = readEvents(projectDir, SPEC);
    const validateEvents = events.filter(
      (e) => e.step === "validate" || e.event === "validate",
    );
    assert.equal(
      validateEvents.length,
      0,
      "failed gate should not append any validate-step event",
    );
  });

  test("drift detection: `adev source-manifest verify` reports WARN with sha-mismatch detail after a tracked file is modified", () => {
    const SPEC = SPEC_REL;
    const TRACKED_FILE = "lib/feature.mjs";

    // Stamp the spec's source-manifest with the current state of the file.
    let r = adev(projectDir, [
      "source-manifest", "compute", "--files", TRACKED_FILE,
    ]);
    assert.equal(r.exitCode, 0, `compute: ${r.stderr}`);
    const manifest = JSON.parse(r.stdout);
    assert.ok(manifest.sha, "compute should emit a sha");
    const originalSha = manifest.sha;

    // Inject the source-manifest block into the spec frontmatter so verify
    // has something to check.
    const specPath = join(projectDir, SPEC);
    const original = readFileSync(specPath, "utf8");
    const stamped = original.replace(
      "---\ncharter: m",
      [
        "---",
        "charter: m",
        "source-manifest:",
        `  sha: "${manifest.sha}"`,
        "  files:",
        `    - ${TRACKED_FILE}`,
        `  computed-at: "${manifest.computedAt}"`,
      ].join("\n"),
    );
    writeFileSync(specPath, stamped);

    // Verify passes (PASS) when nothing has changed.
    r = adev(projectDir, [
      "source-manifest", "verify", "--spec", SPEC,
    ]);
    assert.equal(
      r.exitCode,
      0,
      `verify before drift: ${r.stderr || r.stdout}`,
    );
    assert.match(
      r.stdout,
      /PASS/,
      `pre-drift verify should report PASS; got: ${r.stdout}`,
    );

    // Now modify the tracked file. Append a line so the sha definitely changes.
    appendFileSync(
      join(projectDir, TRACKED_FILE),
      "\nexport const drift = true;\n",
    );

    // verify must now report WARN with a sha-mismatch citation (by design,
    // sha drift is non-blocking — exit 0 + WARN per Check 1.5 prose).
    r = adev(projectDir, [
      "source-manifest", "verify", "--spec", SPEC,
    ]);
    assert.equal(
      r.exitCode,
      0,
      `verify after drift: exit ${r.exitCode}, stderr=${r.stderr}`,
    );
    assert.match(
      r.stdout,
      /WARN/,
      `post-drift verify should report WARN; got: ${r.stdout}`,
    );
    assert.match(
      r.stdout,
      new RegExp(`expected sha ${originalSha.slice(0, 7)}`),
      `post-drift verify should cite the expected (stamped) sha; got: ${r.stdout}`,
    );
    assert.match(
      r.stdout,
      /lib\/feature\.mjs/,
      `post-drift verify should name the drifted file; got: ${r.stdout}`,
    );
  });

  test("validate report commit: write-tmp → `adev artifact commit` produces the canonical .validate.md atomically (issue-496)", () => {
    const SPEC = SPEC_REL;

    // Walk specify → review → plan → implement → validate (started) so the
    // lifecycle reaches the point where /adev:validate would write its
    // report on disk.
    for (const step of ["specify", "review", "plan", "implement"]) {
      let r = adev(projectDir, [
        "report", "--type", "step", "--spec", SPEC,
        "--step", step, "--status", "started",
      ]);
      assert.equal(r.exitCode, 0, `${step} started: ${r.stderr}`);
      r = adev(projectDir, [
        "report", "--type", "step", "--spec", SPEC,
        "--step", step, "--status", "completed", "--verdict", "PASS",
      ]);
      assert.equal(r.exitCode, 0, `${step} completed: ${r.stderr}`);
    }
    let r = adev(projectDir, [
      "report", "--type", "step", "--spec", SPEC,
      "--step", "validate", "--status", "started",
    ]);
    assert.equal(r.exitCode, 0, `validate started: ${r.stderr}`);

    const specAbs = join(projectDir, SPEC);
    const validateMd = specAbs.replace(/\.spec\.md$/, ".validate.md");
    const validateTmp = `${validateMd}.tmp`;

    // Stage 1: the skill writes the report body to <path>.validate.md.tmp.
    // The canonical .validate.md is NOT yet observable.
    const reportBody = "# Validation Report: Sample\n\nFull body.\n";
    writeFileSync(validateTmp, reportBody);
    assert.ok(
      !existsSync(validateMd),
      "before commit: canonical .validate.md must NOT exist",
    );

    // Negative path: a zero-byte tmp must NOT be committed.
    writeFileSync(validateTmp, "");
    r = adev(projectDir, [
      "artifact", "commit",
      "--spec", SPEC, "--kind", "validate",
    ]);
    assert.equal(r.exitCode, 1, "zero-byte tmp must be rejected");
    assert.match(r.stderr, /empty|zero/i);
    assert.ok(existsSync(validateTmp), "tmp must remain for inspection on failure");
    assert.ok(
      !existsSync(validateMd),
      "destination must NOT be created on failure",
    );

    // Stage 2: re-stage a non-empty tmp and commit.
    writeFileSync(validateTmp, reportBody);
    r = adev(projectDir, [
      "artifact", "commit",
      "--spec", SPEC, "--kind", "validate",
    ]);
    assert.equal(r.exitCode, 0, `commit should succeed: ${r.stderr}`);
    assert.equal(r.stdout, "", "commit is silent on success");
    assert.ok(!existsSync(validateTmp), "tmp must be gone after rename");
    assert.ok(existsSync(validateMd), "canonical .validate.md must exist after commit");
    assert.equal(
      readFileSync(validateMd, "utf8"),
      reportBody,
      "committed content must match what was written to tmp",
    );

    // Re-run case: a second validation overwrites the canonical report
    // through the same write-tmp + commit pattern.
    const reportBodyV2 = "# Validation Report: Sample\n\nSecond run.\n";
    writeFileSync(validateTmp, reportBodyV2);
    r = adev(projectDir, [
      "artifact", "commit",
      "--spec", SPEC, "--kind", "validate",
    ]);
    assert.equal(r.exitCode, 0, `re-commit should succeed: ${r.stderr}`);
    assert.equal(
      readFileSync(validateMd, "utf8"),
      reportBodyV2,
      "re-commit must replace prior canonical content",
    );

    // The lifecycle log records the validate step as started — artifact
    // commit is a filesystem operation, not a lifecycle event, so it must
    // NOT have appended any event.
    const eventsBefore = readEvents(projectDir, SPEC);
    const artifactEvents = eventsBefore.filter((e) =>
      JSON.stringify(e).includes("artifact"),
    );
    assert.equal(
      artifactEvents.length,
      0,
      "artifact commit must not emit lifecycle events",
    );
  });
});
