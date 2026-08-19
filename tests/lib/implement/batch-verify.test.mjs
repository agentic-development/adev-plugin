// Tests for lib/implement/batch-verify.mjs
//
// Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
// AC4 verifyHandoffBlocks, AC6 verifyNoReadAhead, AC5 verifyPerTaskReviewRounds

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  verifyHandoffBlocks,
  verifyNoReadAhead,
  verifyPerTaskReviewRounds,
} from "../../../lib/implement/batch-verify.mjs";

// --- verifyHandoffBlocks (AC4) ---

test("verifyHandoffBlocks: N task slugs produce N handoff-block files — AC4", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-handoff-"));
  try {
    writeFileSync(join(dir, "task-1-tests.md"), "# handoff 1\n");
    writeFileSync(join(dir, "task-2-tests.md"), "# handoff 2\n");
    const result = verifyHandoffBlocks({ packetsDir: dir, taskSlugs: ["task-1", "task-2"] });
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.deepEqual(result.missing, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verifyHandoffBlocks: a missing handoff file is reported by slug, not silently short-counted", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-handoff-"));
  try {
    writeFileSync(join(dir, "task-1-tests.md"), "# handoff 1\n");
    const result = verifyHandoffBlocks({ packetsDir: dir, taskSlugs: ["task-1", "task-2"] });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["task-2"]);
    assert.equal(result.count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verifyHandoffBlocks: all missing reports every slug and count 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-handoff-"));
  try {
    const result = verifyHandoffBlocks({ packetsDir: dir, taskSlugs: ["task-1", "task-2", "task-3"] });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["task-1", "task-2", "task-3"]);
    assert.equal(result.count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verifyHandoffBlocks: empty taskSlugs is vacuously ok", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-handoff-"));
  try {
    const result = verifyHandoffBlocks({ packetsDir: dir, taskSlugs: [] });
    assert.equal(result.ok, true);
    assert.equal(result.count, 0);
    assert.deepEqual(result.missing, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- verifyNoReadAhead (AC6) ---

test("verifyNoReadAhead: passes when each packet read precedes the prior task's commit", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2", "3"],
    packetReadTimes: { "1": 100, "2": 250, "3": 400 },
    commitTimes: { "1": 200, "2": 350 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("verifyNoReadAhead: fails when task N+1's packet was read before task N's commit — AC6", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2"],
    packetReadTimes: { "1": 100, "2": 150 },
    commitTimes: { "1": 200 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { taskId: "2", precedingTaskId: "1", packetReadAt: 150, commitAt: 200 },
  ]);
});

test("verifyNoReadAhead: the first task in order has no preceding commit to violate", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1"],
    packetReadTimes: { "1": 0 },
    commitTimes: {},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("verifyNoReadAhead: an unknown/undefined commit time for the preceding task is not asserted as a violation (no data to check against)", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2"],
    packetReadTimes: { "2": 50 },
    commitTimes: {},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("verifyNoReadAhead: a packet read at exactly the preceding commit's timestamp is not a violation (boundary is inclusive of 'at', not 'before')", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2"],
    packetReadTimes: { "1": 0, "2": 200 },
    commitTimes: { "1": 200 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("verifyNoReadAhead: multiple violations across a longer chain are all reported", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2", "3"],
    packetReadTimes: { "1": 0, "2": 10, "3": 20 },
    commitTimes: { "1": 100, "2": 200 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [
    { taskId: "2", precedingTaskId: "1", packetReadAt: 10, commitAt: 100 },
    { taskId: "3", precedingTaskId: "2", packetReadAt: 20, commitAt: 200 },
  ]);
});

// --- verifyPerTaskReviewRounds (AC5) ---

test("verifyPerTaskReviewRounds: passes when every batched task has both review stages recorded — AC5", () => {
  const result = verifyPerTaskReviewRounds({
    reviewRounds: {
      "p.plan.md::1::spec-compliance": { cycles: 1 },
      "p.plan.md::1::code-quality": { cycles: 2 },
      "p.plan.md::2::spec-compliance": { cycles: 1 },
      "p.plan.md::2::code-quality": { cycles: 1 },
    },
    plan: "p.plan.md",
    taskIds: ["1", "2"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("verifyPerTaskReviewRounds: fails and names the missing (task, stage) when a stage never ran — AC5", () => {
  const result = verifyPerTaskReviewRounds({
    reviewRounds: { "p.plan.md::1::spec-compliance": { cycles: 1 } },
    plan: "p.plan.md",
    taskIds: ["1", "2"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [
    { taskId: "1", stage: "code-quality" },
    { taskId: "2", stage: "spec-compliance" },
    { taskId: "2", stage: "code-quality" },
  ]);
});

test("verifyPerTaskReviewRounds: a reviewRounds entry from a different plan does not satisfy the check (key is plan-scoped)", () => {
  const result = verifyPerTaskReviewRounds({
    reviewRounds: {
      "other.plan.md::1::spec-compliance": { cycles: 1 },
      "other.plan.md::1::code-quality": { cycles: 1 },
    },
    plan: "p.plan.md",
    taskIds: ["1"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [
    { taskId: "1", stage: "spec-compliance" },
    { taskId: "1", stage: "code-quality" },
  ]);
});

test("verifyPerTaskReviewRounds: empty taskIds is vacuously ok", () => {
  const result = verifyPerTaskReviewRounds({ reviewRounds: {}, plan: "p.plan.md", taskIds: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});
