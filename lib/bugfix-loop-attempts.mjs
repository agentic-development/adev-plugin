/**
 * Per-issue attempt cap for `/adev:bugfix-loop`.
 *
 * Owns the append-only JSONL event log at
 * `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl`. Reads fold
 * the log by `issue_id` (last valid line wins). Writes are append-only,
 * mirroring `lib/lifecycle-state.mjs`'s `appendEvent` pattern.
 *
 * This module is a caller of `lib/loop-convergence.mjs`, not a modification
 * of it — `partitionBlockers`/`evaluateStopCondition` are imported and
 * invoked as-is (see per-issue-attempt-cap.spec.md Preconditions).
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/bugfix-loop-attempts
 */

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Default per-issue attempt cap when `tasks.bugfix_loop.attempt_cap` is unset. */
export const DEFAULT_ATTEMPT_CAP = 2;

/**
 * Resolve the path to the attempts JSONL log for a given project root.
 * @param {string} projectRoot
 * @returns {string}
 */
export function resolveAttemptsLogPath(projectRoot) {
  return join(projectRoot, '.context-index', 'lifecycle-state', 'bugfix-loop-attempts.jsonl');
}

/**
 * Fold the JSONL log by `issue_id` (last valid line wins). Corrupted lines
 * are skipped with a logged warning — fail-open per Error Cases row 2.
 * @param {string} projectRoot
 * @returns {Map<string, object>}
 */
function readAllRaw(projectRoot) {
  const logPath = resolveAttemptsLogPath(projectRoot);
  if (!existsSync(logPath)) return new Map();
  const raw = readFileSync(logPath, 'utf8');
  const byIssue = new Map();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[bugfix-loop-attempts] skipping corrupted line in ${logPath}`);
      continue;
    }
    if (!parsed || typeof parsed.issue_id !== 'string') continue;
    byIssue.set(parsed.issue_id, parsed);
  }
  return byIssue;
}

/**
 * Read the latest `AttemptRecord` for an issue, or `null` when none exists
 * (treated as zero attempts — BEH-5).
 * @param {string} projectRoot
 * @param {string} issueId
 * @returns {object|null}
 */
export function readAttemptRecord(projectRoot, issueId) {
  return readAllRaw(projectRoot).get(issueId) ?? null;
}

/**
 * Read the latest `AttemptRecord` for every issue with at least one
 * recorded attempt.
 * @param {string} projectRoot
 * @returns {Map<string, object>}
 */
export function readAllAttemptRecords(projectRoot) {
  return readAllRaw(projectRoot);
}

/**
 * Resolve the per-issue attempt cap from the manifest.
 * Defaults to {@link DEFAULT_ATTEMPT_CAP} when unset, non-integer, or
 * non-positive.
 * @param {object} [manifest]
 * @returns {number}
 */
export function resolveAttemptCap(manifest) {
  const raw = manifest?.tasks?.bugfix_loop?.attempt_cap;
  if (raw == null) return DEFAULT_ATTEMPT_CAP;
  if (Number.isInteger(raw) && raw > 0) return raw;
  // eslint-disable-next-line no-console
  console.warn(
    `[bugfix-loop-attempts] tasks.bugfix_loop.attempt_cap "${raw}" is not a positive integer; defaulting to ${DEFAULT_ATTEMPT_CAP}.`,
  );
  return DEFAULT_ATTEMPT_CAP;
}

/**
 * Degraded-mode fallback (Error Cases row 1, BD-6): when quality-gate
 * output has no stable/comparable check-ID shape, fall back to a bounded
 * hash of the raw output — never the raw output itself is persisted. 8 hex
 * chars mirrors the existing `lib/blocker-id.mjs::buildBlockerId` convention.
 * @param {string|null|undefined} rawOutput
 * @returns {string} 8 lowercase hex characters
 */
export function computeDegradedBlockerHash(rawOutput) {
  const text = rawOutput == null ? '' : String(rawOutput);
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}
