/**
 * Architectural test: plan files are immutable after the first `plan_task`
 * `pending` event for that plan.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
 *       § Acceptance Criteria bullet 5 (plan files immutable post-authoring)
 *
 * The detector lives in `lib/plan-immutability.mjs`. This test runs the detector
 * against (a) a violation fixture that should yield exactly one violation, and
 * (b) the real repo, which should be clean.
 */

import { existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("plan-immutability: violation is detected (dynamic untracked fixture)", async () => {
  // Build the violation scenario in a temp dir so the plan file is genuinely
  // untracked by git → the detector falls back to mtime, which we control.
  // (The static checked-in fixture would be tracked by the parent repo and
  // appear "added-only" under --diff-filter=M, masking the violation.)
  const tmp = createTempDir();
  try {
    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "# Plan: foo\n\n### Task 1: Stub\n",
    );
    writeFixture(
      tmp,
      ".context-index/lifecycle-state/foo.jsonl",
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: ".context-index/specs/features/x/foo.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    // Force plan mtime well after the pending event ts.
    const planPath = join(tmp, ".context-index/specs/features/x/foo.plan.md");
    const future = new Date("2030-01-01T00:00:00.000Z");
    utimesSync(planPath, future, future);

    const { detectMutatedPlans } = await import(
      "../../lib/plan-immutability.mjs"
    );
    const violations = await detectMutatedPlans(tmp);
    assert.equal(
      violations.length,
      1,
      `expected exactly one violation, got ${violations.length}: ${JSON.stringify(violations)}`,
    );
    assert.match(violations[0].path, /foo\.plan\.md$/);
  } finally {
    cleanupTempDir(tmp);
  }
});

test("plan-immutability: real repo has no violations", async () => {
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(process.cwd());
  assert.deepEqual(
    violations,
    [],
    `unexpected plan-file mutations:\n${JSON.stringify(violations, null, 2)}`,
  );
});

test("plan-immutability: clean fixture returns no violations", async () => {
  const fixtureRoot = "tests/fixtures/plan-immutability/clean";
  if (!existsSync(fixtureRoot)) {
    return; // optional fixture
  }
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(fixtureRoot);
  assert.deepEqual(
    violations,
    [],
    "clean fixture must yield zero violations",
  );
});

test("plan-immutability: detectMutatedPlans handles missing projectRoot gracefully", async () => {
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(
    "/tmp/__does-not-exist-plan-immutability__",
  );
  assert.deepEqual(violations, []);
});

test("plan-immutability: manifest exempt_commits suppresses a real modification violation", async () => {
  // Build a real git repo with a plan file, commit it, then commit a
  // modification — the M commit's hash is then listed under
  // hygiene.plan_immutability.exempt_commits[] and the detector should
  // suppress the violation that would otherwise fire.
  const { execSync } = await import("node:child_process");
  const tmp = createTempDir();
  try {
    execSync("git init -b main", { cwd: tmp, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: tmp, stdio: "ignore" });
    execSync("git config commit.gpgsign false", { cwd: tmp, stdio: "ignore" });

    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "# Plan: foo\n\n### Task 1: Stub\n",
    );
    writeFixture(
      tmp,
      ".context-index/lifecycle-state/foo.jsonl",
      JSON.stringify({
        ts: "2020-01-01T00:00:00.000Z",
        event: "plan_task",
        plan: ".context-index/specs/features/x/foo.plan.md",
        task_id: "t1",
        status: "pending",
        notes: null,
      }) + "\n",
    );
    execSync("git add -A && git commit -m 'init'", { cwd: tmp, stdio: "ignore" });

    // Modify the plan file with a tracked commit — this creates the M event.
    writeFixture(
      tmp,
      ".context-index/specs/features/x/foo.plan.md",
      "<!-- DO NOT EDIT statuses inline -->\n# Plan: foo\n\n### Task 1: Stub\n",
    );
    execSync("git add -A && git commit -m 'stamp header'", { cwd: tmp, stdio: "ignore" });
    const modHash = execSync("git rev-parse HEAD", { cwd: tmp, encoding: "utf8" }).trim();

    // Without exemption: one violation expected.
    const { detectMutatedPlans } = await import(
      "../../lib/plan-immutability.mjs"
    );
    const beforeExempt = await detectMutatedPlans(tmp);
    assert.equal(beforeExempt.length, 1, "expected one violation before exempt-list applied");

    // With exemption recorded in manifest.yaml: violation suppressed.
    writeFixture(
      tmp,
      ".context-index/manifest.yaml",
      `hygiene:\n  plan_immutability:\n    exempt_commits:\n      - "${modHash}"\n`,
    );
    const afterExempt = await detectMutatedPlans(tmp);
    assert.deepEqual(afterExempt, [], "exempt_commits should suppress the violation");
  } finally {
    cleanupTempDir(tmp);
  }
});
