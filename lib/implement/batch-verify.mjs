// lib/implement/batch-verify.mjs
//
// Artifact-level postconditions for batched task dispatch — "check the
// artifact, don't trust the report" (mirrors lib/parallel/verify.mjs's stance).
// Three pure checks against already-loaded state; only verifyHandoffBlocks
// touches the filesystem.

import { existsSync } from "node:fs";
import { join } from "node:path";

const REVIEW_STAGES = ["spec-compliance", "code-quality"];

/**
 * AC4: N task slugs must produce N handoff-block files at
 * `<packetsDir>/<slug>-tests.md` (naming convention from
 * skills/write-test/write-handoff.sh: `${packets_dir}/${slug}-tests.md`).
 *
 * @param {object} opts
 * @param {string} opts.packetsDir
 * @param {string[]} opts.taskSlugs
 * @returns {{ok: boolean, count: number, missing: string[]}}
 */
export function verifyHandoffBlocks({ packetsDir, taskSlugs = [] }) {
  const missing = [];
  let count = 0;
  for (const slug of taskSlugs) {
    const filePath = join(packetsDir, `${slug}-tests.md`);
    if (existsSync(filePath)) {
      count += 1;
    } else {
      missing.push(slug);
    }
  }
  return { ok: missing.length === 0, count, missing };
}

/**
 * AC6: no task's context packet was read before the PRECEDING task's commit
 * landed. Only pairs where both timestamps are known are checked — an
 * undefined commit time means "no data to verify against", not a violation.
 *
 * @param {object} opts
 * @param {string[]} opts.orderedTaskIds
 * @param {object} opts.packetReadTimes  taskId -> timestamp
 * @param {object} opts.commitTimes      taskId -> timestamp
 * @returns {{ok: boolean, violations: Array<{taskId, precedingTaskId, packetReadAt, commitAt}>}}
 */
export function verifyNoReadAhead({ orderedTaskIds = [], packetReadTimes = {}, commitTimes = {} }) {
  const violations = [];
  for (let i = 1; i < orderedTaskIds.length; i += 1) {
    const taskId = orderedTaskIds[i];
    const precedingTaskId = orderedTaskIds[i - 1];
    const packetReadAt = packetReadTimes[taskId];
    const commitAt = commitTimes[precedingTaskId];
    if (packetReadAt === undefined || commitAt === undefined) continue;
    if (packetReadAt < commitAt) {
      violations.push({ taskId, precedingTaskId, packetReadAt, commitAt });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * AC5: every batched task has BOTH review stages ("spec-compliance" and
 * "code-quality") recorded in the reviewRounds projection
 * (lib/lifecycle-state.mjs currentState().reviewRounds, keyed
 * `${plan}::${taskId}::${stage}`).
 *
 * @param {object} opts
 * @param {object} opts.reviewRounds
 * @param {string} opts.plan
 * @param {string[]} opts.taskIds
 * @returns {{ok: boolean, missing: Array<{taskId, stage}>}}
 */
export function verifyPerTaskReviewRounds({ reviewRounds = {}, plan, taskIds = [] }) {
  const missing = [];
  for (const taskId of taskIds) {
    for (const stage of REVIEW_STAGES) {
      const key = `${plan}::${taskId}::${stage}`;
      if (!(key in reviewRounds)) {
        missing.push({ taskId, stage });
      }
    }
  }
  return { ok: missing.length === 0, missing };
}
