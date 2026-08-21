/**
 * `BugfixLoopRun` state persistence for `/adev:bugfix-loop`.
 *
 * Owns one gitignored single-JSON-snapshot file per run at
 * `.context-index/lifecycle-state/bugfix-loop-runs-<run_id>.json`, following
 * the exact atomic-write pattern established by `lib/build-state.mjs`
 * (`atomicWriteJson`: temp-file + rename). Unlike `lib/bugfix-loop-attempts.mjs`
 * (append-only JSONL, one writer per line), a run-state file is a single
 * mutable snapshot with one writer per turn — so this module mirrors
 * `build-state.mjs`'s shape, not the attempts log's.
 *
 * Registered in ADR-0015's Decision-section table.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/bugfix-loop-run
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, isAbsolute, dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { codedError as mkErr } from './errors.mjs';

const RUN_STATE_DIR = '.context-index/lifecycle-state';

// Matches crypto.randomUUID()'s output shape exactly (BD-1: reject anything
// else before it is ever spliced into a filesystem path).
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RUN_FILE_PATTERN = /^bugfix-loop-runs-(.+)\.json$/;

/** The charter's Domain Model `status` enum for `BugfixLoopRun`. */
const VALID_STATUSES = new Set(['running', 'complete', 'budget_exhausted', 'blocked']);

/**
 * Validate that `runId` is shaped exactly like `crypto.randomUUID()`'s
 * output. Throws `INVALID_RUN_ID` otherwise — called before the id is ever
 * spliced into a filesystem path (BD-1).
 *
 * @param {string} runId
 */
export function assertValidRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw mkErr('INVALID_RUN_ID', `INVALID_RUN_ID: run_id must be a crypto.randomUUID()-shaped string, got "${runId}"`);
  }
}

/**
 * Resolve the absolute path to a run-state file.
 *
 * @param {string} projectRoot - absolute path to the project root
 * @param {string} runId - must be `crypto.randomUUID()`-shaped (BD-1)
 * @returns {string}
 */
export function resolveRunStatePath(projectRoot, runId) {
  if (!isAbsolute(projectRoot)) throw mkErr('INVALID_PROJECT_ROOT', 'projectRoot must be an absolute path');
  assertValidRunId(runId);
  return join(projectRoot, RUN_STATE_DIR, `bugfix-loop-runs-${runId}.json`);
}

/**
 * Atomic JSON write via temp-file-then-rename.
 *
 * @param {string} filePath
 * @param {object} data
 */
function atomicWriteJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* swallow cleanup errors */ }
    throw err;
  }
}

/**
 * Create a fresh `BugfixLoopRun` and persist it.
 *
 * @param {string} projectRoot
 * @param {object} [options]
 * @param {number|null} [options.maxBugs] - default null (unbounded)
 * @param {number} [options.maxTurns] - default 20
 * @param {string|null} [options.startingBranch] - default null. The loop's
 *   starting branch, used as the worktree base-ref fallback for the first
 *   bug of a `--worktree-per-bug` run (spec Migration Path Step 2).
 * @returns {object} the created run state
 */
export function createRun(projectRoot, { maxBugs = null, maxTurns = 20, startingBranch = null } = {}) {
  const runId = randomUUID();
  const state = {
    run_id: runId,
    started_at: new Date().toISOString(),
    max_bugs: maxBugs,
    max_turns: maxTurns,
    bugs_attempted: [],
    turns_completed: 0,
    status: 'running',
    degraded_sync_note: null,
    sync_retry_counts: { unreachable_consecutive_turns: 0, oversized_consecutive_turns: {} },
    stale_link_notices_surfaced: [],
    starting_branch: startingBranch,
    last_worktree_branch: null,
    summary_rows: [],
  };
  atomicWriteJson(resolveRunStatePath(projectRoot, runId), state);
  return state;
}

/**
 * Append one row to the run's running progress-visibility table (spec
 * BEH-6). Called by `record-attempt` after each turn's attempt outcome is
 * known.
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {object} row
 * @param {string} row.issueId
 * @param {string} row.verdict - `FIXED`|`PARKED`|`UNREPRODUCIBLE`
 * @param {number} row.filesTouched
 * @param {number} row.testsAdded
 * @param {string} row.priorityBound - the resolved `--max-priority` value for this turn
 * @param {number} row.turn
 * @returns {object} the updated state
 */
export function appendSummaryRow(projectRoot, runId, row) {
  const state = readRunState(projectRoot, runId);
  state.summary_rows.push(row);
  return writeRunState(projectRoot, state);
}

/** Column order for {@link formatSummaryTable}'s markdown table. */
const SUMMARY_COLUMNS = [
  ['issueId', 'Issue'],
  ['verdict', 'Verdict'],
  ['filesTouched', 'Files Touched'],
  ['testsAdded', 'Tests Added'],
  ['priorityBound', 'Priority Bound'],
  ['turn', 'Turn'],
];

/**
 * Render `state.summary_rows[]` as a markdown table — the running progress
 * summary printed after Step 4's `record-attempt` and reprinted before
 * Step 5's terminal token (spec BEH-6). Always includes the header row,
 * even when no attempts have been recorded yet.
 *
 * @param {object} state
 * @returns {string} a markdown table
 */
export function formatSummaryTable(state) {
  const header = `| ${SUMMARY_COLUMNS.map(([, label]) => label).join(' | ')} |`;
  const divider = `| ${SUMMARY_COLUMNS.map(() => '---').join(' | ')} |`;
  const rows = (state.summary_rows ?? []).map(
    (row) => `| ${SUMMARY_COLUMNS.map(([key]) => row[key] ?? '').join(' | ')} |`,
  );
  return [header, divider, ...rows].join('\n');
}

/**
 * Resolve the base ref a per-bug worktree should branch from (spec Migration
 * Path Step 2): the previous bug's completed branch when one has been
 * recorded this run, otherwise the run's starting branch.
 *
 * @param {object} state
 * @returns {string|null}
 */
export function resolveWorktreeBaseRef(state) {
  return state.last_worktree_branch ?? state.starting_branch ?? null;
}

/**
 * Record the branch a just-completed bug's worktree produced, so the next
 * bug's worktree stacks on top of it (spec BEH-3/BEH-4 stacked-base
 * resolution). Called by `commit-pr` on a successful commit/push.
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {string} branch
 * @returns {object} the updated state
 */
export function recordWorktreeBranch(projectRoot, runId, branch) {
  const state = readRunState(projectRoot, runId);
  state.last_worktree_branch = branch;
  return writeRunState(projectRoot, state);
}

/**
 * Read a run's state from disk.
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @returns {object}
 */
export function readRunState(projectRoot, runId) {
  const path = resolveRunStatePath(projectRoot, runId);
  if (!existsSync(path)) throw mkErr('RUN_NOT_FOUND', `no run-state file for run_id "${runId}"`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Write (overwrite) a run's state to disk.
 *
 * @param {string} projectRoot
 * @param {object} state - must carry `run_id`
 * @returns {object} the written state
 */
export function writeRunState(projectRoot, state) {
  atomicWriteJson(resolveRunStatePath(projectRoot, state.run_id), state);
  return state;
}

/**
 * Refuse to proceed unless the run's persisted `status` is `running` — the
 * only non-terminal value in the charter's enum. Called at the start of
 * every turn, before the budget check.
 *
 * @param {object} state
 * @returns {{ ok: true }|{ ok: false, status: string }}
 */
export function checkStatusGuard(state) {
  if (state.status !== 'running') return { ok: false, status: state.status };
  return { ok: true };
}

/**
 * Evaluate both budgets: `max_bugs` (checked against `bugs_attempted.length`)
 * and `max_turns` (checked against `turns_completed`). Either cap tripping
 * ends the run.
 *
 * @param {object} state
 * @returns {{ exhausted: boolean, reason: 'max_bugs'|'max_turns'|null }}
 */
export function checkBudget(state) {
  if (state.max_bugs != null && state.bugs_attempted.length >= state.max_bugs) {
    return { exhausted: true, reason: 'max_bugs' };
  }
  if (state.max_turns != null && state.turns_completed >= state.max_turns) {
    return { exhausted: true, reason: 'max_turns' };
  }
  return { exhausted: false, reason: null };
}

/**
 * Append a completed attempt to `bugs_attempted[]`. Does not touch
 * `turns_completed` — the two counters are bumped independently because a
 * claim-failure-exhausted turn increments `turns_completed` without ever
 * reaching an attempt.
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {string} issueId
 * @returns {object} the updated state
 */
export function appendAttempt(projectRoot, runId, issueId) {
  const state = readRunState(projectRoot, runId);
  state.bugs_attempted.push({ issue_id: issueId, at: new Date().toISOString() });
  return writeRunState(projectRoot, state);
}

/**
 * Increment `turns_completed` by exactly 1. Called at the end of every
 * turn, whether or not that turn reached an actual attempt.
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @returns {object} the updated state
 */
export function completeTurn(projectRoot, runId) {
  const state = readRunState(projectRoot, runId);
  state.turns_completed += 1;
  return writeRunState(projectRoot, state);
}

/**
 * Increment a sync-retry counter (Error Propagation: "GitHub API
 * unreachable or rate-limited during inbound sync" / "oversized title/body")
 * and persist it back to the SAME run-state file this bridge already
 * writes every turn — not an in-process/adapter-local variable, which
 * cannot survive the skill's fresh-context-per-turn self-re-invocation.
 *
 * `kind: 'unreachable'` increments `sync_retry_counts.unreachable_consecutive_turns`
 * and, on the increment that brings it to 5, writes the one-time
 * `degraded_sync_note` (revision 6, round-5 review TR-2).
 *
 * `kind: 'oversized'` increments `sync_retry_counts.oversized_consecutive_turns[issueNumber]`
 * (creating the entry at 1 if absent) — a per-external-issue-number counter,
 * independent of the whole-adapter `unreachable_consecutive_turns` counter
 * (revision 6, round-5 review TR-1).
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 6
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {{ kind: 'unreachable'|'oversized', issueNumber?: number|string }} params
 * @returns {object} the updated state
 */
export function recordSyncRetry(projectRoot, runId, { kind, issueNumber } = {}) {
  const state = readRunState(projectRoot, runId);
  if (kind === 'unreachable') {
    state.sync_retry_counts.unreachable_consecutive_turns += 1;
    if (state.sync_retry_counts.unreachable_consecutive_turns >= 5 && !state.degraded_sync_note) {
      state.degraded_sync_note =
        'GitHub sync unreachable for 5 consecutive turns; sync disabled for the remainder of this run.';
    }
  } else if (kind === 'oversized' && issueNumber != null) {
    const map = state.sync_retry_counts.oversized_consecutive_turns;
    map[issueNumber] = (map[issueNumber] ?? 0) + 1;
  }
  return writeRunState(projectRoot, state);
}

/**
 * Reset a sync-retry counter to 0 (unreachable) or delete a per-issue-number
 * entry (oversized) — called when the underlying condition no longer holds
 * (a successful `gateCheck()`, or an issue no longer refused as oversized).
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 6
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {{ kind: 'unreachable'|'oversized', issueNumber?: number|string }} params
 * @returns {object} the updated state
 */
export function resetSyncRetry(projectRoot, runId, { kind, issueNumber } = {}) {
  const state = readRunState(projectRoot, runId);
  if (kind === 'unreachable') {
    state.sync_retry_counts.unreachable_consecutive_turns = 0;
  } else if (kind === 'oversized' && issueNumber != null) {
    delete state.sync_retry_counts.oversized_consecutive_turns[issueNumber];
  }
  return writeRunState(projectRoot, state);
}

/**
 * Record that the stale-tracker-link notice has fired for `externalRef`
 * this run — a fires-once-per-run dedup set (revision 8, round-7 review
 * TR-4), not a numeric retry cap: the underlying condition (link age vs.
 * threshold, no AttemptRecord) has no degrade-and-continue action to take
 * on repetition, so a plain "already surfaced" set is the right shape.
 * No-ops (no write) if `externalRef` is already present.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 6
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {string} externalRef
 * @returns {object} the (possibly unchanged) state
 */
export function recordStaleLinkNotice(projectRoot, runId, externalRef) {
  const state = readRunState(projectRoot, runId);
  if (!state.stale_link_notices_surfaced.includes(externalRef)) {
    state.stale_link_notices_surfaced.push(externalRef);
    return writeRunState(projectRoot, state);
  }
  return state;
}

/**
 * @param {string} projectRoot
 * @param {string} runId
 * @param {string} externalRef
 * @returns {boolean} whether the stale-link notice already fired for `externalRef` this run
 */
export function hasStaleLinkNoticeFired(projectRoot, runId, externalRef) {
  return readRunState(projectRoot, runId).stale_link_notices_surfaced.includes(externalRef);
}

/** Terminal `status` value → completion-token mapping (charter enum, minus `running`). */
const STATUS_TOKEN = { complete: 'COMPLETE', budget_exhausted: 'BUDGET_EXHAUSTED', blocked: 'BLOCKED' };

/**
 * Map a terminal `status` value onto its `ADEV-BUGFIXLOOP:` completion token.
 *
 * @param {string} status - one of `complete`|`budget_exhausted`|`blocked`
 * @returns {string} the token
 */
export function tokenForStatus(status) {
  const token = STATUS_TOKEN[status];
  if (!token) throw mkErr('INVALID_TERMINAL_STATUS', `INVALID_TERMINAL_STATUS: "${status}" is not one of complete|budget_exhausted|blocked`);
  return token;
}

/**
 * Persist a run's terminal status and return the matching completion token.
 * Validates `status` before any write occurs.
 *
 * @param {string} projectRoot
 * @param {string} runId
 * @param {object} params
 * @param {string} params.status - one of `complete`|`budget_exhausted`|`blocked`
 * @param {string} [params.note]
 * @returns {{ state: object, token: string }}
 */
export function finishRun(projectRoot, runId, { status, note } = {}) {
  const token = tokenForStatus(status); // throws INVALID_TERMINAL_STATUS for bad input, before any write
  const state = readRunState(projectRoot, runId);
  state.status = status;
  if (note) state.terminal_note = note;
  writeRunState(projectRoot, state);
  return { state, token };
}

/**
 * Find the most-recently-modified valid run-state file, for the
 * `--resume`-without-`--resume-run-id` fallback (BD-2). A candidate is
 * trusted only when: its filename is UUID-shaped, its own `run_id` field
 * matches the filename, and its `status` is one of the charter's four enum
 * values. A corrupted, forged, or foreign-shaped file is skipped in favor
 * of the next-most-recent candidate rather than silently used.
 *
 * @param {string} projectRoot
 * @returns {object|null} the most recent valid run state, or null when none exists
 */
export function findLatestRunState(projectRoot) {
  const dir = join(projectRoot, RUN_STATE_DIR);
  if (!existsSync(dir)) return null;

  const candidates = readdirSync(dir)
    .map((f) => ({ f, m: f.match(RUN_FILE_PATTERN) }))
    .filter(({ m }) => m)
    .map(({ f, m }) => ({ f, runId: m[1], mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const { f, runId } of candidates) {
    if (!RUN_ID_PATTERN.test(runId)) continue; // BD-2: filename itself must be UUID-shaped
    let state;
    try {
      state = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue; // corrupted JSON — skip, try the next-most-recent candidate
    }
    // BD-2: the file's own run_id must match its filename, and status must
    // be one of the charter's four enum values — reject any foreign-shaped
    // or forged file rather than trusting mtime + glob-match alone.
    if (!state || state.run_id !== runId || !VALID_STATUSES.has(state.status)) continue;
    return state;
  }
  return null;
}
