/**
 * Lifecycle Event Log — append-only per-spec JSONL persistence.
 *
 * Persists every event in a spec's lifecycle as one line in a
 * `.context-index/lifecycle-state/<slug>.jsonl` file. Writes go exclusively
 * through `fs.appendFile` / `fs.appendFileSync` (`O_APPEND` semantics).
 * Reads tolerate truncated final lines and never touch domain config.
 *
 * @module lib/lifecycle-state
 */

// PRINCIPLE: Import ordering — Node.js built-ins first and exclusively.
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, sep, basename, dirname, join } from 'node:path';

// ── Module-level constants ──────────────────────────────────────────────────

/**
 * Closed set of canonical event discriminators recognised by core projections.
 *
 * Events with an `event` value not in this set are still persisted on append
 * and surfaced under `StateProjection.unknownEvents[]` on read. Domains and
 * future skills may define new variants without forking this module.
 */
export const CANONICAL_EVENTS = new Set([
  'lifecycle_step', 'step_completed', 'step_failed',
  'reviewer_report', 'validator_report',
  'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
]);

const LIFECYCLE_STATE_DIR = '.context-index/lifecycle-state';
const SLUG_ALLOWLIST = /^[a-z0-9._-]+$/;
const MAX_EVENT_BYTES = 1_000_000;          // 1 MB — per AC line 87
const MAX_LOG_BYTES   = 50 * 1024 * 1024;   // 50 MB — defensive cap until compaction lands
const MAX_NOTES_BYTES = 4096;               // 4 KB — `notes` truncation threshold
