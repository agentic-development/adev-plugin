// lib/implement/batching.mjs
//
// Batch resolution engine for /adev:implement --batch (batched-task-dispatch.spec.md).
// Reads the plan's `## Parallelization` section and applies a six-row eligibility
// gate per sequential group, folding in prior-run abort state, to decide which
// tasks may be dispatched together as a batch versus solo. Pure function — no
// I/O, no filesystem — the caller supplies every other input already loaded
// (routing sidecar entries, boundary verdicts, prior plan-task projection).
//
// Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md

import { parseParallelizationSection } from "../parallel/groups.mjs";

const DEFAULT_MAX_BATCH_SIZE = 4;

// The four routing dimensions every entry's `scores` must carry (mirrors
// lib/plan-routing-sidecar.mjs's REQUIRED_SCORE_DIMENSIONS) — eligibility row
// 6 requires all four to be present and usable, not merely whichever
// dimensions happen to appear in the object.
const REQUIRED_SCORE_DIMENSIONS = [
  "spec_completeness",
  "pattern_coverage",
  "blast_radius",
  "novelty",
];

/**
 * @param {string} taskId
 * @param {{ routingByTask: Map<string, object>, boundaryVerdicts: object }} ctx
 * @returns {string|null} eligibility-gate failure reason (rows 2-5), or null if eligible
 */
function gateReason(taskId, { routingByTask, boundaryVerdicts }) {
  const entry = routingByTask.get(taskId);
  if (entry?.selected_agent === "human-only") return "human-only";
  if (entry?.selected_agent === "assisted-agent") return "human-checkpoint";
  if (boundaryVerdicts?.[taskId] === "FAIL") return "boundary";
  if (!entry) return "routing-unusable";
  const scores = entry.scores;
  if (!scores || typeof scores !== "object") return "routing-unusable";
  for (const dim of REQUIRED_SCORE_DIMENSIONS) {
    const v = scores[dim];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      return "routing-unusable";
    }
  }
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.planContent
 * @param {object} opts.manifest
 * @param {Array<object>} [opts.routingEntries]
 * @param {object} [opts.boundaryVerdicts]
 * @param {object} [opts.priorPlanTasks]
 * @param {boolean} [opts.noBatch]
 * @param {number} [opts.maxBatchOverride]
 * @returns {{ batches: Array<{group:string, taskIds:string[]}>, solo: Array<{taskId:string, reason:string|null}>, advisories: object[] }}
 */
export function resolveBatches({
  planContent,
  manifest,
  routingEntries = [],
  boundaryVerdicts = {},
  priorPlanTasks = {},
  noBatch = false,
  maxBatchOverride,
} = {}) {
  const batches = [];
  const solo = [];
  const advisories = [];

  const routingByTask = new Map();
  for (const entry of routingEntries) {
    if (entry && entry.task_id != null) routingByTask.set(String(entry.task_id), entry);
  }

  const parsed = parseParallelizationSection(planContent);

  // --no-batch / implement.batch_mode: off short-circuit the eligibility gate
  // entirely — every mentioned task goes solo, no BATCH_SOLO_FORCED advisories
  // (this is the operator's explicit choice, not a gate failure).
  const batchModeOff = manifest?.implement?.batch_mode === "off";
  if (noBatch || batchModeOff) {
    const seen = new Set();
    for (const group of parsed.groups) {
      for (const member of group.members) {
        const id = String(member);
        if (seen.has(id)) continue;
        seen.add(id);
        solo.push({ taskId: id, reason: null });
      }
    }
    advisories.push({
      type: "BATCH_DISABLED",
      reason: noBatch ? "--no-batch" : "implement.batch_mode: off",
    });
    return { batches, solo, advisories };
  }

  // Malformed or absent section: fail closed to solo. Both cases collapse to
  // `groups.length === 0` (parseParallelizationSection's own malformed
  // definition), so there are no tasks to enumerate either way.
  if (parsed.malformed || parsed.groups.length === 0) {
    advisories.push({
      type: "BATCH_SOLO_FORCED",
      reason: "serial: no/malformed parallelization section",
    });
    return { batches, solo, advisories };
  }

  const maxBatchSize =
    typeof maxBatchOverride === "number" && Number.isFinite(maxBatchOverride)
      ? maxBatchOverride
      : manifest?.implement?.max_batch_size ?? DEFAULT_MAX_BATCH_SIZE;

  for (const group of parsed.groups) {
    const memberIds = group.members.map(String);

    // An `independent` group is never a batch candidate — its members always
    // go solo, with no gate applied and no advisory (this isn't a failure).
    if (group.independent) {
      for (const id of memberIds) solo.push({ taskId: id, reason: null });
      continue;
    }

    // Behavior E — abort carry-forward: if ANY member of this sequential group
    // was left `blocked` by a prior run, the WHOLE group falls back to solo for
    // ALL its members (a batch that already failed once should not partially
    // re-form). Every member's advisory names the member(s) that triggered it.
    const blockedMembers = memberIds.filter(
      (id) => priorPlanTasks?.[id]?.status === "blocked",
    );
    if (blockedMembers.length > 0) {
      for (const id of memberIds) {
        solo.push({ taskId: id, reason: "prior-failure" });
        advisories.push({
          type: "BATCH_SOLO_FORCED",
          taskId: id,
          reason: "prior-failure",
          triggeredBy: blockedMembers,
        });
      }
      continue;
    }

    // Rows 2-5 of the eligibility gate, applied per member.
    const eligible = [];
    for (const id of memberIds) {
      const reason = gateReason(id, { routingByTask, boundaryVerdicts });
      if (reason) {
        solo.push({ taskId: id, reason });
        advisories.push({ type: "BATCH_SOLO_FORCED", taskId: id, reason });
      } else {
        eligible.push(id);
      }
    }

    if (eligible.length === 0) continue;

    // Row 1 (size), re-checked on the surviving eligible set: a batch of 1
    // isn't a batch, and a set larger than the cap can't dispatch as one.
    if (eligible.length < 2 || eligible.length > maxBatchSize) {
      for (const id of eligible) {
        solo.push({ taskId: id, reason: "size" });
        advisories.push({ type: "BATCH_SOLO_FORCED", taskId: id, reason: "size" });
      }
      continue;
    }

    batches.push({ group: group.id, taskIds: eligible });
    advisories.push({
      type: "BATCH_DISPATCHED",
      group: group.id,
      taskIds: eligible,
      size: eligible.length,
    });
  }

  return { batches, solo, advisories };
}
