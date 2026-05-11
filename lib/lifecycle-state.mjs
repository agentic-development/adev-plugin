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

// ── Internal error constructor ──────────────────────────────────────────────

function mkErr(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

// ── Path-safety primitives ──────────────────────────────────────────────────

/**
 * Derive a slug from a spec path.
 *
 * The spec path must end with `.spec.md`. The derived slug is the lowercased
 * basename minus the `.spec.md` suffix, and must contain only characters from
 * the `[a-z0-9._-]+` allowlist. Any other character throws `INVALID_SPEC_PATH`
 * (path-traversal defense per OWASP/CWE-22).
 *
 * @param {string} specPath - Path to the spec file (relative or absolute)
 * @returns {string} Slug suitable for the `<slug>.jsonl` filename
 */
export function slugFromSpec(specPath) {
  if (!specPath || typeof specPath !== 'string') {
    throw mkErr('INVALID_SPEC_PATH', 'specPath must be a non-empty string');
  }
  if (!specPath.endsWith('.spec.md')) {
    throw mkErr('INVALID_SPEC_PATH', `spec path must end with .spec.md: ${specPath}`);
  }
  const slug = basename(specPath).slice(0, -'.spec.md'.length).toLowerCase();
  if (!SLUG_ALLOWLIST.test(slug)) {
    throw mkErr(
      'INVALID_SPEC_PATH',
      `slug "${slug}" contains characters outside [a-z0-9._-]+`,
    );
  }
  return slug;
}

/**
 * Validate that `projectRoot` is an existing directory containing
 * `.context-index/manifest.yaml`. Returns the resolved absolute path.
 *
 * @param {string} projectRoot - Path to the project root
 * @returns {string} The resolved absolute project root
 */
export function validateProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw mkErr('INVALID_PROJECT_ROOT', 'projectRoot must be a non-empty string');
  }
  const resolved = resolve(projectRoot);
  if (!existsSync(`${resolved}${sep}.context-index${sep}manifest.yaml`)) {
    throw mkErr(
      'INVALID_PROJECT_ROOT',
      `manifest.yaml missing at ${resolved}/.context-index/`,
    );
  }
  return resolved;
}

/**
 * Resolve the absolute path to a spec's lifecycle log file, with layered
 * containment defenses:
 *   1. `projectRoot` must contain `.context-index/manifest.yaml`.
 *   2. The resolved `specPath` (relative to projectRoot) must stay inside it.
 *   3. The derived slug must satisfy `SLUG_ALLOWLIST`.
 *   4. The derived log path must stay inside `.context-index/lifecycle-state/`.
 *
 * @param {string} projectRoot - Project root (validated)
 * @param {string} specPath - Spec path (validated)
 * @returns {string} Absolute path to `<projectRoot>/.context-index/lifecycle-state/<slug>.jsonl`
 */
function resolveLogPath(projectRoot, specPath) {
  const root = validateProjectRoot(projectRoot);
  const absSpec = resolve(root, specPath);
  if (!absSpec.startsWith(root + sep) && absSpec !== root) {
    throw mkErr(
      'INVALID_SPEC_PATH',
      `spec resolves outside projectRoot: ${absSpec}`,
    );
  }
  const slug = slugFromSpec(specPath);
  const logPath = resolve(root, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  const prefix = `${root}${sep}.context-index${sep}lifecycle-state${sep}`;
  if (!logPath.startsWith(prefix)) {
    throw mkErr(
      'INVALID_SPEC_PATH',
      `log path escapes lifecycle-state/: ${logPath}`,
    );
  }
  return logPath;
}
