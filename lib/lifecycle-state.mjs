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

// Relative project import — used only on convenience write paths.
import { loadDomainConfig } from './domains/domain-config.mjs';

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

// ── Bootstrap helpers ───────────────────────────────────────────────────────

/**
 * Idempotently create the lifecycle-state directory and an empty log file
 * for the spec. Calling this on an existing file leaves its bytes untouched
 * (the file is opened in append mode and immediately closed).
 *
 * @param {string} projectRoot - Path to the project root
 * @param {string} specPath - Path to the spec file
 * @returns {void}
 */
export function ensureLifecycleState(projectRoot, specPath) {
  const logPath = resolveLogPath(projectRoot, specPath);
  mkdirSync(dirname(logPath), { recursive: true });
  // Touch the file with O_APPEND so existing content is preserved.
  const fd = openSync(logPath, 'a');
  closeSync(fd);
}

/**
 * Check whether a lifecycle log file exists for the spec.
 *
 * @param {string} projectRoot - Path to the project root
 * @param {string} specPath - Path to the spec file
 * @returns {boolean} True if the `<slug>.jsonl` file exists on disk
 */
export function hasLifecycleState(projectRoot, specPath) {
  const logPath = resolveLogPath(projectRoot, specPath);
  return existsSync(logPath);
}

// ── Write primitive: appendEvent ────────────────────────────────────────────

/**
 * Validate a candidate event payload's discriminator. Mutates the payload to
 * stamp `ts` if absent. Throws `EVENT_SCHEMA_INVALID` on missing/invalid
 * `event`. Schema is open: unknown `event` strings are accepted on write and
 * preserved on read (under `StateProjection.unknownEvents[]`).
 */
function normaliseEventInPlace(event) {
  if (!event || typeof event !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'event must be an object');
  }
  if (typeof event.event !== 'string' || event.event.length === 0) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `event.event must be a non-empty string (got ${JSON.stringify(event.event)})`,
    );
  }
  if (event.ts == null) {
    event.ts = new Date().toISOString();
  }
}

/**
 * Append one event to the spec's lifecycle log.
 *
 * Writes a single `\n`-terminated JSON line via `fs.appendFileSync` with
 * `O_APPEND` semantics — the only write primitive used by this module
 * (architectural invariant: Task 16).
 *
 * Parent directory and file are created lazily if missing (via
 * `ensureLifecycleState`). If `event.ts` is absent it is stamped with the
 * current ISO-8601 timestamp.
 *
 * Underlying `fs` errors are wrapped in `FS_ERROR` with the original message
 * and code preserved on `.cause`.
 *
 * @param {string} projectRoot - Path to the project root
 * @param {string} specPath - Path to the spec file
 * @param {object} event - Event payload — must have a string `event` field
 * @returns {void}
 * @throws {Error} EVENT_SCHEMA_INVALID, INVALID_SPEC_PATH, INVALID_PROJECT_ROOT, FS_ERROR
 */
export function appendEvent(projectRoot, specPath, event) {
  normaliseEventInPlace(event);
  const logPath = resolveLogPath(projectRoot, specPath);

  // Bootstrap directory lazily — appendFile would fail without it.
  try {
    mkdirSync(dirname(logPath), { recursive: true });
  } catch (err) {
    throw wrapFsError(err);
  }

  const line = JSON.stringify(event) + '\n';

  try {
    appendFileSync(logPath, line, { flag: 'a' });
  } catch (err) {
    throw wrapFsError(err);
  }
}

function wrapFsError(err) {
  if (err && err.code === 'EVENT_SCHEMA_INVALID') return err;
  const wrapped = mkErr('FS_ERROR', err?.message ?? String(err));
  wrapped.cause = err;
  return wrapped;
}

// ── Severity-resolution (internal; exported only for testing) ──────────────

// One-time warning guards keyed by category × actor name (or file path) so
// per-process noise stays bounded.
const _degradedDomainConfigWarned = new Set();
const _unknownReviewerWarned = new Set();
const _unknownValidatorWarned = new Set();

const ACTOR_CONFIG_TYPE = { reviewer: 'reviewers', validator: 'gates' };
const ACTOR_CONFIG_LIST_KEY = { reviewer: 'reviewers', validator: 'gates' };
const ACTOR_CONFIG_SEVERITY_FIELD = { reviewer: 'severity_cap', validator: 'severity' };
const ACTOR_UNKNOWN_WARN_KEY = { reviewer: 'UNKNOWN_REVIEWER_DEFAULTED', validator: 'UNKNOWN_VALIDATOR_DEFAULTED' };
const ACTOR_UNKNOWN_GUARD = { reviewer: _unknownReviewerWarned, validator: _unknownValidatorWarned };

/**
 * Resolve the severity to stamp on an actor event at write time.
 *
 * Best-effort lookup against `reviewers.yaml` (for reviewers) or `gates.yaml`
 * (for validators) via existing `loadDomainConfig`. Failure modes (broken
 * YAML, missing file, unknown actor, missing plugin root) all degrade
 * gracefully to `severity: warning` and emit at most one console warning per
 * category per process. The log itself is never lost to a domain-config
 * failure — durability over strict severity (AC line 88).
 *
 * Internal helper. Exported under a `_`-prefixed name solely so tests can
 * exercise the fallback paths; production callers go through
 * `reportReviewer` / `reportValidator`.
 *
 * @param {object} args
 * @param {string} args.domain - Resolved domain name (e.g. "software")
 * @param {"reviewer"|"validator"} args.actorKind
 * @param {string} args.actorName - Reviewer id or gate id
 * @param {string} args.repoRoot - Absolute project root
 * @param {string|null} args.pluginRoot - Absolute plugin root, or null
 * @returns {"blocker"|"error"|"warning"|"advisory"} resolved severity
 */
export function _resolveActorSeverity({ domain, actorKind, actorName, repoRoot, pluginRoot }) {
  const configType = ACTOR_CONFIG_TYPE[actorKind];
  if (!configType) return 'warning';

  const effectiveDomain = domain || 'software';
  const effectivePluginRoot = pluginRoot ?? repoRoot;

  let config;
  try {
    config = loadDomainConfig(effectiveDomain, configType, repoRoot, effectivePluginRoot);
  } catch (err) {
    const key = `${effectiveDomain}:${configType}:${err?.code ?? 'unknown'}`;
    if (!_degradedDomainConfigWarned.has(key)) {
      _degradedDomainConfigWarned.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `DOMAIN_CONFIG_DEGRADED: failed to load ${configType} for domain "${effectiveDomain}" — defaulting severity to warning. Cause: ${err?.message ?? err}`,
      );
    }
    return 'warning';
  }

  if (!config) {
    const key = `${effectiveDomain}:${configType}:not-found`;
    if (!_degradedDomainConfigWarned.has(key)) {
      _degradedDomainConfigWarned.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `DOMAIN_CONFIG_DEGRADED: ${configType} not found for domain "${effectiveDomain}" — defaulting severity to warning.`,
      );
    }
    return 'warning';
  }

  const listKey = ACTOR_CONFIG_LIST_KEY[actorKind];
  const sevField = ACTOR_CONFIG_SEVERITY_FIELD[actorKind];
  const list = Array.isArray(config?.[listKey]) ? config[listKey] : [];
  const entry = list.find((a) => a && a.id === actorName);
  if (!entry || typeof entry[sevField] !== 'string') {
    const guard = ACTOR_UNKNOWN_GUARD[actorKind];
    const key = `${effectiveDomain}:${actorName}`;
    if (!guard.has(key)) {
      guard.add(key);
      // eslint-disable-next-line no-console
      console.warn(
        `${ACTOR_UNKNOWN_WARN_KEY[actorKind]}: ${actorKind} "${actorName}" not declared in domain "${effectiveDomain}" — defaulting severity to warning.`,
      );
    }
    return 'warning';
  }
  return entry[sevField];
}

// ── Convenience writers ─────────────────────────────────────────────────────

const VALID_STEP_STATUSES = new Set(['started', 'completed', 'failed']);
const STEP_DISCRIMINATOR_BY_STATUS = {
  started: 'lifecycle_step',
  completed: 'step_completed',
  failed: 'step_failed',
};

/**
 * Read `manifest.yaml::project.domain` (best-effort) for a project root.
 * Returns `'software'` when missing or unreadable — the lifecycle log MUST
 * keep working even when domain config is broken (durability over strict
 * severity, AC line 88).
 */
function bestEffortDomain(projectRoot) {
  try {
    const manifestPath = join(projectRoot, '.context-index', 'manifest.yaml');
    const raw = readFileSync(manifestPath, 'utf8');
    // Cheap inline parser: look for `domain: <value>` anywhere in the file.
    // Avoids pulling a full YAML dependency on the write path.
    const match = raw.match(/^\s*domain:\s*["']?([a-z][a-z0-9-]*)["']?\s*$/mi);
    if (match) return match[1];
  } catch { /* swallow — fall back to default */ }
  return 'software';
}

/**
 * Append a `reviewer_report` event with stamped severity.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.step - Step name being reviewed (e.g. "review")
 * @param {string} args.reviewer - Reviewer id (matches reviewers.yaml::id)
 * @param {"PASS"|"PASS_WITH_NOTES"|"FAIL"} args.verdict
 * @param {string|null} [args.notes]
 * @param {string} [args.domain] - Override resolved domain
 * @param {string} [args.pluginRoot] - Override plugin root for domain-config lookup
 * @returns {void}
 */
export function reportReviewer(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportReviewer requires an args object');
  }
  const { step, reviewer, verdict, notes = null, domain, pluginRoot } = args;
  const resolvedDomain = domain ?? bestEffortDomain(projectRoot);
  const severity = _resolveActorSeverity({
    domain: resolvedDomain,
    actorKind: 'reviewer',
    actorName: reviewer,
    repoRoot: projectRoot,
    pluginRoot: pluginRoot ?? null,
  });
  appendEvent(projectRoot, specPath, {
    event: 'reviewer_report',
    step,
    reviewer,
    severity,
    verdict,
    notes,
  });
}

/**
 * Append a `validator_report` event with stamped severity.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.step
 * @param {string} args.validator - Gate id (matches gates.yaml::id)
 * @param {"PASS"|"PASS_WITH_NOTES"|"FAIL"} args.verdict
 * @param {string} [args.error]
 * @param {number} [args.score]
 * @param {number} [args.duration_ms]
 * @param {string} [args.domain]
 * @param {string} [args.pluginRoot]
 * @returns {void}
 */
export function reportValidator(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportValidator requires an args object');
  }
  const { step, validator, verdict, error, score, duration_ms, domain, pluginRoot } = args;
  const resolvedDomain = domain ?? bestEffortDomain(projectRoot);
  const severity = _resolveActorSeverity({
    domain: resolvedDomain,
    actorKind: 'validator',
    actorName: validator,
    repoRoot: projectRoot,
    pluginRoot: pluginRoot ?? null,
  });
  const payload = {
    event: 'validator_report',
    step,
    validator,
    severity,
    verdict,
  };
  if (error !== undefined) payload.error = error;
  if (score !== undefined) payload.score = score;
  if (duration_ms !== undefined) payload.duration_ms = duration_ms;
  appendEvent(projectRoot, specPath, payload);
}

/**
 * Append a step transition event. Discriminator is chosen from `status`:
 *   started   → "lifecycle_step"
 *   completed → "step_completed"
 *   failed    → "step_failed"
 *
 * Non-actor event — no severity stamp.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.step - Step name
 * @param {"started"|"completed"|"failed"} args.status
 * @param {string} [args.verdict] - Optional verdict for terminal transitions
 * @returns {void}
 */
export function reportStep(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportStep requires an args object');
  }
  const { step, status, verdict } = args;
  if (!VALID_STEP_STATUSES.has(status)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportStep status must be one of: ${[...VALID_STEP_STATUSES].join(', ')} (got ${JSON.stringify(status)})`,
    );
  }
  const payload = { event: STEP_DISCRIMINATOR_BY_STATUS[status], step };
  if (status === 'started') {
    payload.status = 'started';
  }
  if (verdict !== undefined) payload.verdict = verdict;
  appendEvent(projectRoot, specPath, payload);
}

/**
 * Append a `plan_task` event — the canonical home of per-plan-task state.
 *
 * The sibling `json-issue-board-adapter` spec enforces the inverse: `create()`
 * / `update()` calls that would persist `planTask` on an Issue are rejected
 * with `BOARD_GRANULARITY_VIOLATION`. The two specs together form one
 * contract: plan-task state lives exclusively in the lifecycle log.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.plan - Plan file path
 * @param {string} args.task_id - Stable task identifier
 * @param {string} args.status - Free-form status (e.g. "in_progress", "completed")
 * @param {string|null} [args.notes]
 * @returns {void}
 */
export function reportPlanTask(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportPlanTask requires an args object');
  }
  const { plan, task_id, status, notes = null } = args;
  appendEvent(projectRoot, specPath, {
    event: 'plan_task',
    plan,
    task_id,
    status,
    notes,
  });
}

/**
 * Append a `debug_intervention` event.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.kind - Intervention kind (e.g. "debug", "recover")
 * @param {string} args.note - Free-form description
 * @returns {void}
 */
export function reportIntervention(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportIntervention requires an args object');
  }
  const { kind, note } = args;
  appendEvent(projectRoot, specPath, {
    event: 'debug_intervention',
    kind,
    note,
  });
}

// ── Read primitive: readEvents ──────────────────────────────────────────────

// Module-scoped guards: emit the malformed-line warning at most once per file
// per process to keep noise low under partial corruption.
const _malformedWarnedPaths = new Set();

/**
 * Read all events from a spec's lifecycle log.
 *
 * Returns an empty array when the file does not exist (missing log is a
 * normal pre-write state, not an error). Malformed interior lines are
 * skipped silently after a single per-file `MALFORMED_LINE_SKIPPED` warning.
 * A truncated final line (no trailing `\n`) is dropped silently — this
 * tolerates a crash mid-write.
 *
 * @param {string} projectRoot - Path to the project root
 * @param {string} specPath - Path to the spec file
 * @returns {object[]} Parsed events in append order
 */
export function readEvents(projectRoot, specPath) {
  const logPath = resolveLogPath(projectRoot, specPath);
  let raw;
  try {
    raw = readFileSync(logPath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw wrapFsError(err);
  }
  if (raw.length === 0) return [];

  const events = [];
  const lines = raw.split('\n');
  // `String.prototype.split` produces a trailing '' when the input ends with
  // the separator. For append-only logs that's the normal case after a clean
  // write. Tolerance for a truncated tail comes from the parse loop below:
  // the last token, if non-empty, may be partial — we silently drop a parse
  // failure there.
  const lastIndex = lines.length - 1;
  for (let i = 0; i <= lastIndex; i++) {
    const token = lines[i];
    if (token === '') continue;
    try {
      events.push(JSON.parse(token));
    } catch {
      if (i === lastIndex) {
        // Truncated tail (recoverable mid-write crash) — drop silently.
        continue;
      }
      if (!_malformedWarnedPaths.has(logPath)) {
        _malformedWarnedPaths.add(logPath);
        // eslint-disable-next-line no-console
        console.warn(`MALFORMED_LINE_SKIPPED: ${logPath} (line ${i + 1})`);
      }
    }
  }
  return events;
}
