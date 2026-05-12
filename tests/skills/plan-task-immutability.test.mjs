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

import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { strict as assert } from "node:assert";

test("plan-immutability: violation fixture is detected", async () => {
  const fixtureRoot = "tests/fixtures/plan-immutability/violation";
  if (!existsSync(fixtureRoot)) {
    assert.fail(
      "violation fixture missing — TDD RED state requires the fixture to be in tree",
    );
  }
  const { detectMutatedPlans } = await import(
    "../../lib/plan-immutability.mjs"
  );
  const violations = await detectMutatedPlans(fixtureRoot);
  assert.equal(
    violations.length,
    1,
    `expected exactly one violation in fixture, got ${violations.length}: ${JSON.stringify(violations)}`,
  );
  assert.match(violations[0].path, /foo\.plan\.md$/);
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
