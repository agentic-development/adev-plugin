// Tests for lib/implement/batching.mjs::resolveBatches
//
// Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md

import test from "node:test";
import assert from "node:assert/strict";
import { resolveBatches } from "../../../lib/implement/batching.mjs";

const PLAN = `## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared files)
- Group B (independent): Task 3

## Task Summary
`;

function scores(overrides = {}) {
  return {
    spec_completeness: 0.9,
    pattern_coverage: 0.8,
    blast_radius: 0.2,
    novelty: 0.3,
    ...overrides,
  };
}

function autoEntry(taskId, overrides = {}) {
  return { task_id: taskId, selected_agent: "auto-agent", scores: scores(), ...overrides };
}

test("a 2-task sequential group within the cap batches together", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].taskIds, ["1", "2"]);
  assert.equal(result.batches[0].group, "A");
  assert.equal(result.solo.length, 1);
  assert.equal(result.solo[0].taskId, "3");
  assert.equal(result.solo[0].reason, null);
  const dispatched = result.advisories.find((a) => a.type === "BATCH_DISPATCHED");
  assert.ok(dispatched);
  assert.deepEqual(dispatched.taskIds, ["1", "2"]);
  assert.equal(dispatched.size, 2);
});

test("independent group members are always solo with reason null and no advisory", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const soloThree = result.solo.find((s) => s.taskId === "3");
  assert.ok(soloThree);
  assert.equal(soloThree.reason, null);
  assert.equal(
    result.advisories.some((a) => a.type === "BATCH_SOLO_FORCED" && a.taskId === "3"),
    false,
  );
});

// --- Eligibility row 1: size ---

test("eligibility row 'size': a group exceeding max_batch_size forces all members solo", () => {
  const plan = `## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

## Task Summary
`;
  const result = resolveBatches({
    planContent: plan,
    manifest: { implement: { batch_mode: "on", max_batch_size: 2 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 0);
  assert.equal(result.solo.length, 3);
  for (const s of result.solo) assert.equal(s.reason, "size");
  const forced = result.advisories.filter((a) => a.type === "BATCH_SOLO_FORCED");
  assert.equal(forced.length, 3);
  for (const a of forced) assert.equal(a.reason, "size");
});

test("eligibility row 'size': after removing ineligible members, a leftover single member goes solo with reason size", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1", { selected_agent: "human-only" }), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 0);
  const soloTwo = result.solo.find((s) => s.taskId === "2");
  assert.ok(soloTwo);
  assert.equal(soloTwo.reason, "size");
  const soloOne = result.solo.find((s) => s.taskId === "1");
  assert.equal(soloOne.reason, "human-only");
});

// --- Eligibility row 2: human-only ---

test("eligibility row 'human-only': a task routed to human-only is forced solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1", { selected_agent: "human-only" }), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "human-only");
  assert.ok(
    result.advisories.some(
      (a) => a.type === "BATCH_SOLO_FORCED" && a.taskId === "1" && a.reason === "human-only",
    ),
  );
});

// --- Eligibility row 3: human-checkpoint ---

test("eligibility row 'human-checkpoint': a task routed to assisted-agent is forced solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1", { selected_agent: "assisted-agent" }), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "human-checkpoint");
});

// --- Eligibility row 4: boundary ---

test("eligibility row 'boundary': a FAIL boundary verdict forces the task solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "FAIL", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "boundary");
});

// --- Eligibility row 5: routing-unusable ---

test("eligibility row 'routing-unusable': a task with no routing entry is forced solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "routing-unusable");
});

test("eligibility row 'routing-unusable': a non-finite or out-of-range score forces the task solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [
      autoEntry("1", { scores: scores({ novelty: 1.5 }) }),
      autoEntry("2"),
      autoEntry("3"),
    ],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "routing-unusable");
});

test("eligibility row 'routing-unusable': a NaN score forces the task solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [
      autoEntry("1", { scores: scores({ novelty: NaN }) }),
      autoEntry("2"),
      autoEntry("3"),
    ],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "routing-unusable");
});

test("eligibility row 'routing-unusable': a routing entry with no scores field at all forces the task solo (not silently eligible)", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [
      { task_id: "1", selected_agent: "auto-agent" }, // no `scores` key
      autoEntry("2"),
      autoEntry("3"),
    ],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "routing-unusable");
  assert.ok(
    result.advisories.some(
      (a) => a.type === "BATCH_SOLO_FORCED" && a.taskId === "1" && a.reason === "routing-unusable",
    ),
  );
});

test("eligibility row 'routing-unusable': a scores object missing a required dimension forces the task solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [
      autoEntry("1", {
        // missing `novelty` entirely — the other three dimensions are valid,
        // so a naive Object.values() scan sees nothing wrong.
        scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2 },
      }),
      autoEntry("2"),
      autoEntry("3"),
    ],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  const solo1 = result.solo.find((s) => s.taskId === "1");
  assert.equal(solo1.reason, "routing-unusable");
});

// --- Eligibility row 6 / Behavior E: prior-failure abort carry-forward ---

test("Behavior E: a group with one previously-blocked member falls back to solo for ALL members, not just the blocked one", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: { "1": { status: "blocked" } },
  });
  assert.equal(result.batches.length, 0);
  const solo1 = result.solo.find((s) => s.taskId === "1");
  const solo2 = result.solo.find((s) => s.taskId === "2");
  assert.equal(solo1.reason, "prior-failure");
  assert.equal(solo2.reason, "prior-failure");
  const advisories = result.advisories.filter(
    (a) => a.type === "BATCH_SOLO_FORCED" && a.reason === "prior-failure",
  );
  assert.equal(advisories.length, 2);
  for (const a of advisories) assert.deepEqual(a.triggeredBy, ["1"]);
});

test("Behavior E: a non-blocked status (e.g. done) on a prior member does not trigger abort carry-forward", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: { "1": { status: "done" } },
  });
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].taskIds, ["1", "2"]);
});

// --- --no-batch / batch_mode: off ---

test("--no-batch short-circuits the gate: every task in the section goes solo with one BATCH_DISABLED advisory", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
    noBatch: true,
  });
  assert.equal(result.batches.length, 0);
  assert.equal(result.solo.length, 3);
  for (const s of result.solo) assert.equal(s.reason, null);
  assert.equal(result.advisories.length, 1);
  assert.deepEqual(result.advisories[0], { type: "BATCH_DISABLED", reason: "--no-batch" });
  assert.equal(result.advisories.some((a) => a.type === "BATCH_SOLO_FORCED"), false);
});

test("manifest.implement.batch_mode 'off' short-circuits the gate the same way", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "off", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 0);
  assert.equal(result.solo.length, 3);
  assert.deepEqual(result.advisories[0], {
    type: "BATCH_DISABLED",
    reason: "implement.batch_mode: off",
  });
});

test("--no-batch wins over batch_mode: off when both are true", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "off", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: {},
    priorPlanTasks: {},
    noBatch: true,
  });
  assert.deepEqual(result.advisories[0], { type: "BATCH_DISABLED", reason: "--no-batch" });
});

// --- Malformed / absent Parallelization section ---

test("a plan with no ## Parallelization section returns solo: [] with one fallback advisory", () => {
  const result = resolveBatches({
    planContent: "# Plan\n\nNo parallelization section here.\n",
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [],
    boundaryVerdicts: {},
    priorPlanTasks: {},
  });
  assert.deepEqual(result.batches, []);
  assert.deepEqual(result.solo, []);
  assert.equal(result.advisories.length, 1);
  assert.equal(result.advisories[0].type, "BATCH_SOLO_FORCED");
  assert.match(result.advisories[0].reason, /no\/malformed parallelization section/);
});

test("a malformed ## Parallelization section (heading present, no parseable group lines) fails closed to solo", () => {
  const malformedPlan = `## Parallelization

Some free-form prose that isn't a group line at all.

## Task Summary
`;
  const result = resolveBatches({
    planContent: malformedPlan,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [],
    boundaryVerdicts: {},
    priorPlanTasks: {},
  });
  assert.deepEqual(result.batches, []);
  assert.deepEqual(result.solo, []);
  assert.equal(result.advisories.length, 1);
  assert.equal(result.advisories[0].type, "BATCH_SOLO_FORCED");
});

// --- max-batch override ---

test("maxBatchOverride (--max-batch) takes precedence over manifest.implement.max_batch_size", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
    maxBatchOverride: 1,
  });
  assert.equal(result.batches.length, 0);
  const solo1 = result.solo.find((s) => s.taskId === "1");
  const solo2 = result.solo.find((s) => s.taskId === "2");
  assert.equal(solo1.reason, "size");
  assert.equal(solo2.reason, "size");
});

test("a 3-member sequential group within a raised max_batch_size batches all three", () => {
  const plan = `## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

## Task Summary
`;
  const result = resolveBatches({
    planContent: plan,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].taskIds, ["1", "2", "3"]);
  assert.equal(result.solo.length, 0);
});

test("eligibility row 'size' is upper-bound inclusive: a group exactly at max_batch_size still batches", () => {
  const plan = `## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4

## Task Summary
`;
  const result = resolveBatches({
    planContent: plan,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("3"), autoEntry("4")],
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS", "4": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].taskIds, ["1", "2", "3", "4"]);
  assert.equal(result.solo.length, 0);
  assert.equal(result.advisories.some((a) => a.type === "BATCH_SOLO_FORCED"), false);
});

// --- Task-id spelling: /adev:route emits `t<n>`, the plan's Parallelization says `Task <n>` ---

test("route-emitted t<n> sidecar ids pair with the plan's Task <n> parallelization ids and form a batch", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("t1"), autoEntry("t2"), autoEntry("t3")],
    boundaryVerdicts: {},
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].taskIds, ["1", "2"]);
  assert.equal(
    result.advisories.some((a) => a.type === "BATCH_SOLO_FORCED" && a.reason === "routing-unusable"),
    false,
  );
});

test("t<n> sidecar ids still apply the per-task gate rows (an assisted-agent t2 goes solo with human-checkpoint)", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [
      autoEntry("t1"),
      autoEntry("t2", { selected_agent: "assisted-agent" }),
      autoEntry("t3"),
    ],
    boundaryVerdicts: {},
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 0);
  assert.equal(result.solo.find((s) => s.taskId === "2").reason, "human-checkpoint");
  assert.equal(result.solo.find((s) => s.taskId === "1").reason, "size");
});

test("Behavior E matches a prior blocked plan_task recorded under t<n> against the plan's Task <n>", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("t1"), autoEntry("t2"), autoEntry("t3")],
    boundaryVerdicts: {},
    priorPlanTasks: { t2: { status: "blocked" } },
  });
  assert.equal(result.batches.length, 0);
  assert.equal(result.solo.find((s) => s.taskId === "1").reason, "prior-failure");
  assert.equal(result.solo.find((s) => s.taskId === "2").reason, "prior-failure");
});

test("a FAIL boundary verdict keyed t<n> forces the plan's Task <n> solo", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: [autoEntry("t1"), autoEntry("t2"), autoEntry("t3")],
    boundaryVerdicts: { t1: "FAIL" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 0);
  assert.equal(result.solo.find((s) => s.taskId === "1").reason, "boundary");
});

// --- Lite exclusion: a task granted `lite` runs inline, so it never batches ---
//
// A batch runs its tasks back to back in one subagent, so a lite task in the
// middle of a sequential group splits the group: each contiguous run of
// non-lite members is gated and sized on its own, and the plan order of the
// whole group is preserved across batches, solo tasks and inline tasks.

const PLAN_GROUP_1_2_3 = `## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

## Task Summary
`;

const PLAN_GROUP_1_TO_5 = `## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5

## Task Summary
`;

const ALL_ELIGIBLE = ["1", "2", "3", "4", "5"].map((id) => autoEntry(id));
const BATCHING_ON = { implement: { batch_mode: "on", max_batch_size: 4 } };

test("a lite task in the middle of a group splits it: 1 and 3 each go solo with reason size", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_2_3,
    manifest: BATCHING_ON,
    routingEntries: ALL_ELIGIBLE,
    liteGranted: new Set(["2"]),
  });
  assert.deepEqual(r.batches, []);
  assert.deepEqual(r.solo, [
    { taskId: "1", reason: "size" },
    { taskId: "2", reason: "lite" },
    { taskId: "3", reason: "size" },
  ]);
  assert.deepEqual(
    r.advisories.filter((a) => a.type === "BATCH_SOLO_FORCED"),
    [
      { type: "BATCH_SOLO_FORCED", taskId: "1", reason: "size" },
      { type: "BATCH_SOLO_FORCED", taskId: "2", reason: "lite" },
      { type: "BATCH_SOLO_FORCED", taskId: "3", reason: "size" },
    ],
  );
});

test("a lite task in the middle of a 5-task group yields two batches with distinct segments", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_TO_5,
    manifest: BATCHING_ON,
    routingEntries: ALL_ELIGIBLE,
    liteGranted: new Set(["3"]),
  });
  assert.deepEqual(r.batches, [
    { group: "A", segment: 1, taskIds: ["1", "2"] },
    { group: "A", segment: 2, taskIds: ["4", "5"] },
  ]);
  assert.deepEqual(r.solo, [{ taskId: "3", reason: "lite" }]);
  assert.deepEqual(
    r.advisories.filter((a) => a.type === "BATCH_DISPATCHED"),
    [
      { type: "BATCH_DISPATCHED", group: "A", segment: 1, taskIds: ["1", "2"], size: 2 },
      { type: "BATCH_DISPATCHED", group: "A", segment: 2, taskIds: ["4", "5"], size: 2 },
    ],
  );
});

test("a group with no lite member is one segment", () => {
  const r = resolveBatches({ planContent: PLAN_GROUP_1_2_3, manifest: BATCHING_ON, routingEntries: ALL_ELIGIBLE });
  assert.deepEqual(r.batches, [{ group: "A", segment: 1, taskIds: ["1", "2", "3"] }]);
  assert.deepEqual(r.solo, []);
});

test("a lite-granted member is excluded before the gate: no gate reason is reported for it", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_TO_5,
    manifest: BATCHING_ON,
    routingEntries: [autoEntry("1"), autoEntry("2"), autoEntry("4"), autoEntry("5")],
    liteGranted: new Set(["3"]),
  });
  assert.deepEqual(r.solo, [{ taskId: "3", reason: "lite" }]);
  assert.deepEqual(r.batches.map((b) => b.taskIds), [["1", "2"], ["4", "5"]]);
});

test("each segment is gated on its own: a gate failure in one segment leaves the other batching", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_TO_5,
    manifest: BATCHING_ON,
    routingEntries: [autoEntry("1", { selected_agent: "human-only" }), autoEntry("2"), autoEntry("4"), autoEntry("5")],
    liteGranted: new Set(["3"]),
  });
  assert.deepEqual(r.batches, [{ group: "A", segment: 2, taskIds: ["4", "5"] }]);
  assert.deepEqual(r.solo, [
    { taskId: "1", reason: "human-only" },
    { taskId: "2", reason: "size" },
    { taskId: "3", reason: "lite" },
  ]);
});

test("each segment is sized on its own against the cap", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_TO_5,
    manifest: { implement: { batch_mode: "on", max_batch_size: 2 } },
    routingEntries: ALL_ELIGIBLE,
    liteGranted: new Set(["4"]),
  });
  assert.deepEqual(r.batches, []);
  assert.deepEqual(r.solo, [
    { taskId: "1", reason: "size" },
    { taskId: "2", reason: "size" },
    { taskId: "3", reason: "size" },
    { taskId: "4", reason: "lite" },
    { taskId: "5", reason: "size" },
  ]);
});

test("a lite task at the edge of a group leaves the rest as one segment", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_2_3,
    manifest: BATCHING_ON,
    routingEntries: ALL_ELIGIBLE,
    liteGranted: new Set(["1"]),
  });
  assert.deepEqual(r.batches, [{ group: "A", segment: 1, taskIds: ["2", "3"] }]);
  assert.deepEqual(r.solo, [{ taskId: "1", reason: "lite" }]);
});

test("liteAssumed members split the group too and are reported with reason lite-assumed", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_TO_5,
    manifest: BATCHING_ON,
    routingEntries: ALL_ELIGIBLE,
    liteAssumed: new Set(["3"]),
  });
  assert.deepEqual(r.batches.map((b) => b.taskIds), [["1", "2"], ["4", "5"]]);
  assert.deepEqual(r.solo, [{ taskId: "3", reason: "lite-assumed" }]);
  assert.ok(
    r.advisories.some((a) => a.type === "BATCH_SOLO_FORCED" && a.taskId === "3" && a.reason === "lite-assumed"),
  );
});

test("liteGranted matches across t<n> and Task <n> spellings", () => {
  const r = resolveBatches({
    planContent: PLAN_GROUP_1_TO_5,
    manifest: BATCHING_ON,
    routingEntries: ALL_ELIGIBLE,
    liteGranted: new Set(["t3"]),
  });
  assert.deepEqual(r.solo, [{ taskId: "3", reason: "lite" }]);
  assert.deepEqual(r.batches.map((b) => b.taskIds), [["1", "2"], ["4", "5"]]);
});
