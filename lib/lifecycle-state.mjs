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
// Free-text escape helper shared with the issue-board renderer. Pure
// function; introduces no domain-config coupling.
import { escapeField, generatedHeader, FIELD_CAPS } from './issues/render-markdown.mjs';

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

  // Pre-flight: per-event size cap (AC line 87)
  const lineSize = Buffer.byteLength(line, 'utf8');
  if (lineSize > MAX_EVENT_BYTES) {
    throw mkErr(
      'EVENT_TOO_LARGE',
      `event payload is ${lineSize} bytes, exceeding the ${MAX_EVENT_BYTES} byte limit`,
    );
  }

  // Pre-flight: log file size cap. Stat the file (if it exists) to refuse
  // writes that would exceed the cap. This is advisory — concurrent writers
  // could still each pass the check and collectively cross the cap, but the
  // cap is a defensive guardrail until compaction lands, not a hard limit.
  try {
    const stat = statSync(logPath);
    if (stat.size >= MAX_LOG_BYTES) {
      throw mkErr(
        'LOG_TOO_LARGE',
        `log file is ${stat.size} bytes, at or above the ${MAX_LOG_BYTES} byte cap; awaiting compaction (deferred capability)`,
      );
    }
  } catch (err) {
    if (err?.code === 'LOG_TOO_LARGE') throw err;
    if (err?.code !== 'ENOENT') throw wrapFsError(err);
    // ENOENT → file does not yet exist; proceed.
  }

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

const NOTES_TRUNCATION_MARKER = '…[truncated]';
const _notesTruncationWarned = { count: 0 };

/**
 * Truncate a `notes` string to `MAX_NOTES_BYTES` bytes (Buffer-based, so
 * multi-byte UTF-8 characters aren't split mid-codepoint). Emits a
 * one-time `NOTES_TRUNCATED` warning when truncation occurs.
 *
 * Callers are responsible for not passing secret-bearing text (documented
 * in helper signature per Error Cases line 155).
 */
function truncateNotes(notes) {
  if (notes == null) return notes;
  if (typeof notes !== 'string') return notes;
  const buf = Buffer.from(notes, 'utf8');
  if (buf.length <= MAX_NOTES_BYTES) return notes;
  // Truncate at byte boundary, then re-decode safely with a Decoder.
  const sliced = buf.subarray(0, MAX_NOTES_BYTES).toString('utf8');
  if (_notesTruncationWarned.count === 0) {
    _notesTruncationWarned.count = 1;
    // eslint-disable-next-line no-console
    console.warn(
      `NOTES_TRUNCATED: notes payload exceeded ${MAX_NOTES_BYTES} bytes and was truncated.`,
    );
  }
  return sliced + NOTES_TRUNCATION_MARKER;
}

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
    notes: truncateNotes(notes),
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
  const { step, validator, verdict, error, score, duration_ms, notes, domain, pluginRoot } = args;
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
  if (notes !== undefined) payload.notes = truncateNotes(notes);
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

// ── Projection: currentState fold ──────────────────────────────────────────

/**
 * @typedef {object} StateProjection
 * @property {string}        spec          Spec path (as supplied to currentState)
 * @property {string}        status        Aggregate spec status — "pending" | "in_progress" | "completed" | "failed"
 * @property {string|null}   currentStep   Most recent step touched (started or terminal)
 * @property {string|null}   currentTask   Most recent plan task_id touched
 * @property {object}        steps         Map of step name → { name, status, verdict?, reports[], startedAt?, completedAt? }
 * @property {object}        planTasks     Map of task_id → { plan, status, updatedAt, history[] }
 * @property {object[]}      interventions debug_intervention events, in order
 * @property {object[]}      unknownEvents Events whose discriminator is outside CANONICAL_EVENTS
 * @property {string|null}   startedAt     ts of the first event
 * @property {string|null}   updatedAt     ts of the last event
 */

/**
 * Initial empty projection. All keys are camelCase per the StateProjection
 * convention (CON-2).
 */
function emptyProjection(specPath) {
  return {
    spec: specPath,
    status: 'pending',
    currentStep: null,
    currentTask: null,
    steps: {},
    planTasks: {},
    interventions: [],
    unknownEvents: [],
    startedAt: null,
    updatedAt: null,
  };
}

function ensureStep(projection, stepName) {
  if (!projection.steps[stepName]) {
    projection.steps[stepName] = {
      name: stepName,
      status: 'pending',
      reports: [],
    };
  }
  return projection.steps[stepName];
}

// Severity rank: higher number = worse. Used by the aggregation algorithm
// in Task 9 to find the worst-FAIL severity across multiple actor reports.
const SEVERITY_RANK = { advisory: 1, warning: 2, error: 3, blocker: 4 };

/**
 * Aggregate per-step actor reports into a synthesized `{verdict, status}`
 * pair following the spec's severity x verdict table (Behaviors lines
 * 121-132). Called once per step at the end of the fold.
 *
 *   blocker/error FAIL                       -> { verdict: FAIL, status: failed }
 *   warning/advisory FAIL                    -> { verdict: PASS_WITH_NOTES, status: completed }
 *   no FAILs, >= 1 PASS_WITH_NOTES report    -> { verdict: PASS_WITH_NOTES, status: completed }
 *   all PASS                                 -> { verdict: PASS, status: completed }
 *
 * Returns null if there are no actor reports (the step's status/verdict
 * comes from an explicit lifecycle_step or step_completed/failed event).
 */
function aggregateReports(reports) {
  if (!Array.isArray(reports) || reports.length === 0) return null;

  let worstFailRank = 0;
  let sawPassWithNotes = false;
  for (const r of reports) {
    if (r.verdict === 'FAIL') {
      const rank = SEVERITY_RANK[r.severity] ?? 2; // unknown severity treated as warning
      if (rank > worstFailRank) worstFailRank = rank;
    } else if (r.verdict === 'PASS_WITH_NOTES') {
      sawPassWithNotes = true;
    }
  }

  if (worstFailRank >= SEVERITY_RANK.error) {
    return { verdict: 'FAIL', status: 'failed' };
  }
  if (worstFailRank > 0) {
    // warning or advisory FAIL
    return { verdict: 'PASS_WITH_NOTES', status: 'completed' };
  }
  if (sawPassWithNotes) {
    return { verdict: 'PASS_WITH_NOTES', status: 'completed' };
  }
  return { verdict: 'PASS', status: 'completed' };
}

/**
 * Read events for a spec and fold them into a StateProjection.
 *
 * Pure function of the on-disk events array. Unknown event variants are
 * preserved under `unknownEvents[]` and otherwise ignored by core
 * step / plan-task / intervention projections (open-schema invariant).
 *
 * Step verdict aggregation across multiple actor reports follows the
 * spec's severity x verdict table (Behaviors lines 121-132). Explicit
 * `step_completed` / `step_failed` events override the synthesized
 * verdict; when they do, an `aggregated_discrepancy: true` flag is set
 * on the step so callers can detect manual overrides.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @returns {StateProjection}
 */
export function currentState(projectRoot, specPath) {
  const events = readEvents(projectRoot, specPath);
  const projection = emptyProjection(specPath);
  if (events.length === 0) return projection;

  for (const ev of events) {
    if (typeof ev?.ts === 'string') {
      if (projection.startedAt === null) projection.startedAt = ev.ts;
      projection.updatedAt = ev.ts;
    }

    const kind = ev?.event;
    if (typeof kind !== 'string' || !CANONICAL_EVENTS.has(kind)) {
      projection.unknownEvents.push(ev);
      continue;
    }

    switch (kind) {
      case 'lifecycle_step': {
        if (typeof ev.step !== 'string') break;
        const step = ensureStep(projection, ev.step);
        if (ev.status === 'started') {
          step.status = 'in_progress';
          step.startedAt = ev.ts ?? step.startedAt ?? null;
        }
        projection.currentStep = ev.step;
        if (projection.status === 'pending') projection.status = 'in_progress';
        break;
      }
      case 'step_completed': {
        if (typeof ev.step !== 'string') break;
        const step = ensureStep(projection, ev.step);
        step.status = 'completed';
        if (ev.verdict) step.verdict = ev.verdict;
        if (Array.isArray(ev.aggregated_from)) step.aggregated_from = ev.aggregated_from;
        step.completedAt = ev.ts ?? null;
        projection.currentStep = ev.step;
        break;
      }
      case 'step_failed': {
        if (typeof ev.step !== 'string') break;
        const step = ensureStep(projection, ev.step);
        step.status = 'failed';
        if (ev.verdict) step.verdict = ev.verdict;
        if (Array.isArray(ev.aggregated_from)) step.aggregated_from = ev.aggregated_from;
        step.completedAt = ev.ts ?? null;
        projection.currentStep = ev.step;
        projection.status = 'failed';
        break;
      }
      case 'reviewer_report':
      case 'validator_report': {
        if (typeof ev.step !== 'string') break;
        const step = ensureStep(projection, ev.step);
        step.reports.push(ev);
        break;
      }
      case 'plan_task': {
        if (typeof ev.task_id !== 'string') break;
        const prior = projection.planTasks[ev.task_id] ?? { history: [] };
        const next = {
          plan: ev.plan ?? prior.plan ?? null,
          task_id: ev.task_id,
          status: ev.status ?? prior.status ?? null,
          notes: ev.notes ?? null,
          updatedAt: ev.ts ?? prior.updatedAt ?? null,
          history: [...prior.history, { status: ev.status, ts: ev.ts ?? null }],
        };
        projection.planTasks[ev.task_id] = next;
        projection.currentTask = ev.task_id;
        break;
      }
      case 'debug_intervention':
      case 'recovery_record':
      case 'manual_override': {
        projection.interventions.push(ev);
        break;
      }
      default:
        // Defensive — CANONICAL_EVENTS gate above covers this branch.
        projection.unknownEvents.push(ev);
    }
  }

  // (aggregation pass follows the linear scan, below)
  // ── Aggregation pass: synthesize step verdict/status from accumulated reports
  // Applied after the linear scan so explicit step_completed/step_failed events
  // (which already set `verdict`/`status` during the scan) can be reconciled
  // with the actor-report aggregation.
  for (const step of Object.values(projection.steps)) {
    const synthesized = aggregateReports(step.reports);
    if (synthesized === null) continue;

    const hadExplicitVerdict = typeof step.verdict === 'string' && (step.status === 'completed' || step.status === 'failed');
    if (!hadExplicitVerdict) {
      step.verdict = synthesized.verdict;
      step.status = synthesized.status;
      continue;
    }

    // Explicit step_completed/step_failed event wins, but record discrepancy
    // so callers can detect manual overrides for audit.
    if (step.verdict !== synthesized.verdict || step.status !== synthesized.status) {
      step.aggregated_discrepancy = true;
      step.aggregated_synthesized = synthesized;
    }
  }

  return projection;
}

// ── Gate enforcement ────────────────────────────────────────────────────────

/**
 * Canonical step ordering for `requireGate` prerequisite lookup. New steps
 * can be added by extending this list; the open event schema does not
 * require lib changes for new step *names* but `requireGate` needs the
 * ordering to know which prior step gates a given target step.
 */
const STEP_ORDER = ['specify', 'review', 'plan', 'route', 'implement', 'validate'];
const VALID_GATE_MODES = new Set(['strict', 'advisory']);
const PASSING_VERDICTS = new Set(['PASS', 'PASS_WITH_NOTES']);

/** Error thrown by `requireGate` in strict mode. */
export class GateError extends Error {
  constructor(message, { requiredStep, currentStatus, mode }) {
    super(message);
    this.name = 'GateError';
    this.code = 'GATE_BLOCKED';
    this.requiredStep = requiredStep;
    this.currentStatus = currentStatus;
    this.mode = mode;
  }
}

const _unknownGateModeWarned = new Set();

/**
 * Resolve the gate mode from a parsed manifest object.
 *
 * Reads `manifest?.lifecycle?.gate_mode`. Validates against the closed set
 * `{strict, advisory}`; defaults to `strict` when missing or unknown. An
 * unknown value triggers a one-time `UNKNOWN_GATE_MODE_DEFAULTED` warning.
 *
 * @param {object|null|undefined} manifest - Parsed manifest.yaml
 * @returns {"strict"|"advisory"}
 */
export function resolveGateMode(manifest) {
  const raw = manifest?.lifecycle?.gate_mode;
  if (raw == null) return 'strict';
  if (VALID_GATE_MODES.has(raw)) return raw;
  if (!_unknownGateModeWarned.has(raw)) {
    _unknownGateModeWarned.add(raw);
    // eslint-disable-next-line no-console
    console.warn(
      `UNKNOWN_GATE_MODE_DEFAULTED: manifest lifecycle.gate_mode "${raw}" is not one of ${[...VALID_GATE_MODES].join('|')}; defaulting to "strict".`,
    );
  }
  return 'strict';
}

/**
 * Look up the prior step that must be passing before `stepName` is allowed.
 * Returns null when `stepName` is the first step (no gate to check).
 */
function priorStepOf(stepName) {
  const idx = STEP_ORDER.indexOf(stepName);
  if (idx <= 0) return null;
  return STEP_ORDER[idx - 1];
}

/**
 * Enforce a lifecycle prerequisite gate based on a projected state.
 *
 * Looks up the prior step in `STEP_ORDER` and asserts it is `completed`
 * with a passing verdict (`PASS` or `PASS_WITH_NOTES`). Behaviour on
 * failure is governed by `mode`:
 *
 *   strict   — throw `GateError` with `{requiredStep, currentStatus, mode}`.
 *   advisory — emit `console.warn` with the same payload; return normally.
 *
 * Performs no manifest I/O — callers resolve `mode` themselves (typically
 * once per skill invocation via `resolveGateMode(manifest)`).
 *
 * @param {object} state - StateProjection from `currentState`
 * @param {string} stepName - Target step about to begin (e.g. "plan")
 * @param {object} args
 * @param {"strict"|"advisory"} args.mode
 * @returns {void}
 * @throws {GateError} when `mode === "strict"` and the gate is blocked
 */
export function requireGate(state, stepName, { mode } = {}) {
  if (!VALID_GATE_MODES.has(mode)) {
    throw mkErr('INVALID_GATE_MODE', `requireGate mode must be one of ${[...VALID_GATE_MODES].join('|')} (got ${JSON.stringify(mode)})`);
  }
  const prior = priorStepOf(stepName);
  if (prior === null) return; // first step — no gate

  const priorStep = state?.steps?.[prior];
  const currentStatus = priorStep
    ? { status: priorStep.status, verdict: priorStep.verdict ?? null }
    : { status: 'missing', verdict: null };

  const passing = priorStep
    && priorStep.status === 'completed'
    && PASSING_VERDICTS.has(priorStep.verdict);
  if (passing) return;

  const message = `Lifecycle gate blocked: step "${stepName}" requires prior step "${prior}" to be completed with PASS or PASS_WITH_NOTES (current: ${JSON.stringify(currentStatus)}).`;
  if (mode === 'strict') {
    throw new GateError(message, { requiredStep: prior, currentStatus, mode });
  }
  // advisory
  // eslint-disable-next-line no-console
  console.warn(message);
}

// ── Rendering: renderMarkdown(state) ───────────────────────────────────────

/**
 * Render a `StateProjection` (from `currentState`) as a markdown body
 * suitable for writing to `.context-index/lifecycle-state/<slug>.md`.
 *
 * Pure function. Every free-text field flows through the 6-rule escape
 * pipeline from `lib/issues/render-markdown.mjs::escapeField`. Severity
 * is read from the pre-stamped `severity` field on each event — this
 * function performs NO domain-config lookup (CI architectural test
 * `tests/lib/lifecycle-state.render.test.mjs` asserts this invariant).
 *
 * Output structure:
 *
 *   <DO NOT EDIT generated-header for <slug>.jsonl>
 *
 *   # Lifecycle: <spec-basename>
 *
 *   | Field      | Value      |
 *   | …          | …          |
 *
 *   ## Steps
 *   ### specify  — verdict, aggregated_from, reports
 *   ### review   …
 *
 *   ## Plan Tasks (if non-empty)
 *   | task_id | status | notes |
 *
 *   ## Interventions (if non-empty)
 *   - <ts> [<actor>] note
 *
 *   ## Unknown Events (if non-empty)
 *   <details><summary>N events</summary>
 *   …
 *   </details>
 *
 *   <!-- regenerated from <slug>.jsonl on <ts> -->
 *
 * @param {object} state - StateProjection from `currentState`
 * @returns {string} Markdown string
 */
export function renderMarkdown(state) {
  if (!state || typeof state !== 'object' || typeof state.spec !== 'string') {
    throw mkErr('INVALID_STATE_PROJECTION', 'renderMarkdown requires a StateProjection with `spec`');
  }

  const lines = [];

  // Derive a slug from the spec path so the generated-header source is
  // accurate.
  const specBase = basename(state.spec);
  const sourceLabel = specBase.endsWith('.spec.md')
    ? `${specBase.slice(0, -'.spec.md'.length)}.jsonl`
    : `${specBase}.jsonl`;

  lines.push(generatedHeader(sourceLabel));
  lines.push('');
  lines.push(`# Lifecycle: ${escapeField(specBase, { slot: 'inline', cap: 200 })}`);
  lines.push('');

  // Metadata table. Internal identifiers (status, currentStep, timestamps,
  // spec path) are trusted per spec — they come from allowlisted writes.
  // The renderer trusts them and emits raw values (only pipe + newline
  // protection via `rawIdentifier`).
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| spec | ${rawIdentifier(state.spec)} |`);
  lines.push(`| status | ${rawIdentifier(state.status)} |`);
  lines.push(`| currentStep | ${rawIdentifier(state.currentStep)} |`);
  // currentTask is allowlisted at write time when numeric; non-numeric
  // labels flow through escapeField per spec Path Safety table.
  lines.push(`| currentTask | ${escapeField(state.currentTask, { slot: 'inline', cap: FIELD_CAPS.currentTask })} |`);
  lines.push(`| startedAt | ${rawIdentifier(state.startedAt)} |`);
  lines.push(`| updatedAt | ${rawIdentifier(state.updatedAt)} |`);
  lines.push('');

  // Steps section.
  lines.push('## Steps');
  lines.push('');
  const stepEntries = Object.entries(state.steps ?? {});
  if (stepEntries.length === 0) {
    lines.push('_No steps recorded._');
    lines.push('');
  } else {
    for (const [stepName, step] of stepEntries) {
      lines.push(`### ${rawIdentifier(stepName)}`);
      lines.push('');
      lines.push(`- **Status:** ${rawIdentifier(step.status)}`);
      if (step.verdict) {
        lines.push(`- **Verdict:** ${rawIdentifier(step.verdict)}`);
      }
      if (Array.isArray(step.aggregated_from) && step.aggregated_from.length > 0) {
        lines.push(`- **Aggregated from:** ${step.aggregated_from.map(rawIdentifier).join(', ')}`);
      }
      if (step.startedAt) {
        lines.push(`- **Started:** ${rawIdentifier(step.startedAt)}`);
      }
      if (step.completedAt) {
        lines.push(`- **Completed:** ${rawIdentifier(step.completedAt)}`);
      }
      // Per-reviewer / per-validator reports.
      if (Array.isArray(step.reports) && step.reports.length > 0) {
        lines.push('');
        lines.push('#### Reports');
        lines.push('');
        for (const r of step.reports) {
          const who = r.reviewer ?? r.validator ?? r.actor ?? 'unknown';
          const verdict = r.verdict ?? 'unknown';
          // Severity is read directly from the event — no domain-config lookup.
          const severity = r.severity ?? 'unset';
          lines.push(`- **${rawIdentifier(who)}** — verdict: ${rawIdentifier(verdict)}, severity: ${rawIdentifier(severity)}`);
          if (r.notes) {
            lines.push('');
            lines.push('  ```');
            // Block-context: preserve newlines.
            lines.push('  ' + escapeField(r.notes, { slot: 'block', cap: FIELD_CAPS.notes }).replace(/\n/g, '\n  '));
            lines.push('  ```');
          }
        }
      }
      lines.push('');
    }
  }

  // Plan Tasks section.
  const planTaskEntries = Object.values(state.planTasks ?? {});
  if (planTaskEntries.length > 0) {
    lines.push('## Plan Tasks');
    lines.push('');
    lines.push('| Task | Plan | Status | Notes |');
    lines.push('|------|------|--------|-------|');
    for (const pt of planTaskEntries) {
      lines.push(
        `| ${rawIdentifier(pt.task_id)} | ${rawIdentifier(pt.plan)} | ${rawIdentifier(pt.status)} | ${escapeField(pt.notes ?? '', { slot: 'inline', cap: FIELD_CAPS.notes })} |`,
      );
    }
    lines.push('');
  }

  // Interventions section.
  const interventions = Array.isArray(state.interventions) ? state.interventions : [];
  if (interventions.length > 0) {
    lines.push('## Interventions');
    lines.push('');
    for (const ev of interventions) {
      const ts = rawIdentifier(ev.ts);
      const actor = rawIdentifier(ev.actor);
      const kind = rawIdentifier(ev.event);
      const noteOrReason = ev.note ?? ev.reason ?? '';
      const noteCap = ev.event === 'manual_override' ? FIELD_CAPS.reason : FIELD_CAPS.note;
      const text = escapeField(noteOrReason, { slot: 'inline', cap: noteCap });
      lines.push(`- ${ts} \\[${kind}\\] **${actor}** — ${text}`);
    }
    lines.push('');
  }

  // Unknown events section.
  const unknown = Array.isArray(state.unknownEvents) ? state.unknownEvents : [];
  if (unknown.length > 0) {
    lines.push('## Unknown Events');
    lines.push('');
    lines.push('<details>');
    lines.push(`<summary>${unknown.length} unrecognized event(s)</summary>`);
    lines.push('');
    for (const ev of unknown) {
      // Unknown event names are NOT allowlisted (open-schema invariant), so
      // they flow through escapeField. ts is allowlisted per foundation spec.
      const eventName = escapeField(ev?.event ?? '(unknown)', { slot: 'inline', cap: 80 });
      const ts = rawIdentifier(ev?.ts);
      lines.push(`- ${ts} \\[${eventName}\\]`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Trailing footer with regen timestamp. Use UTC ISO-8601 for determinism.
  const regenTs = new Date().toISOString();
  lines.push(`<!-- regenerated from ${defuseSourceLocal(sourceLabel)} on ${regenTs} -->`);

  return lines.join('\n');
}

// Local copy of defuseSource so this body has no transitive dependency on
// render-markdown.mjs beyond the pure escapeField helper. (Kept inline to
// keep the architectural assertion clean — renderMarkdown imports only
// escapeField + generatedHeader + FIELD_CAPS, all of which are pure and
// free of domain-config.)
function defuseSourceLocal(s) {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(/-->/g, '-- >');
}

// Render an internal identifier (status, step, verdict, severity, actor,
// timestamp, etc.). Per spec, these are allowlisted at write time so the
// renderer trusts them; we only strip newlines and protect table pipes.
function rawIdentifier(value) {
  if (value === null || value === undefined) return '—';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/\|/g, '\\|');
}

// ── Filter ──────────────────────────────────────────────────────────────────

/**
 * Read events for a spec and return only those matching `predicate`.
 *
 * Convenience for custom projections (`/adev:retro`, `/adev:hygiene`).
 * Pure read — never mutates the log.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {(event: object) => boolean} predicate
 * @returns {object[]} Matching events in append order
 */
export function filterEvents(projectRoot, specPath, predicate) {
  if (typeof predicate !== 'function') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'filterEvents requires a predicate function');
  }
  return readEvents(projectRoot, specPath).filter(predicate);
}

// ── Aggregate: listLifecycleStates ──────────────────────────────────────────

const _malformedFileWarned = new Set();
const _invalidSlugWarned = new Set();
const _oversizedWarned = new Set();

/**
 * Glob every `<slug>.jsonl` file in `.context-index/lifecycle-state/` and
 * return a folded summary for each, sorted lexicographically by slug.
 *
 * Returns `[]` when the directory does not exist.
 *
 * Skip categories (file removed from output, sibling files still rendered):
 *   - Filename stem fails `[a-z0-9._-]+` allowlist → `SKIPPED_INVALID_SLUG`
 *     advisory (per spec Path Safety item 5).
 *   - File size > 50 MB → `OVERSIZED_LOG_SKIPPED` advisory naming the slug
 *     (per spec Path Safety item 6). Operator should run compaction.
 *   - Malformed JSONL (parse fault during `currentState`) → `MALFORMED_FILE_SKIPPED`
 *     advisory; the slug is still surfaced as an `unknown`-status record so
 *     callers can detect broken files without re-globbing (foundation-spec
 *     tolerance contract).
 *
 * @param {string} projectRoot
 * @returns {{spec: string, slug: string, status: string, currentStep: string|null, updated: string|null}[]}
 */
export function listLifecycleStates(projectRoot) {
  const root = validateProjectRoot(projectRoot);
  const dir = join(root, '.context-index', 'lifecycle-state');
  if (!existsSync(dir)) return [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw wrapFsError(err);
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.jsonl')) continue;
    const slug = entry.name.slice(0, -'.jsonl'.length);

    // Slug allowlist (SEC-1 / Path Safety 5).
    if (!SLUG_ALLOWLIST.test(slug)) {
      if (!_invalidSlugWarned.has(entry.name)) {
        _invalidSlugWarned.add(entry.name);
        // eslint-disable-next-line no-console
        console.warn(`SKIPPED_INVALID_SLUG: ${entry.name}`);
      }
      continue;
    }

    // Oversized log skip (Path Safety 6).
    const filePath = join(dir, entry.name);
    try {
      const stat = statSync(filePath);
      if (stat.size > MAX_LOG_BYTES) {
        if (!_oversizedWarned.has(entry.name)) {
          _oversizedWarned.add(entry.name);
          // eslint-disable-next-line no-console
          console.warn(`OVERSIZED_LOG_SKIPPED: ${slug} (size=${stat.size} bytes > ${MAX_LOG_BYTES})`);
        }
        continue;
      }
    } catch {
      // statSync failure — surface as malformed below by skipping the size check.
    }

    // Build a synthetic spec path so currentState can resolve the same file.
    // The actual spec path is stored on the first lifecycle_step event when
    // writers include it; we surface that as `spec` if present, else fall
    // back to the slug.
    const syntheticSpecPath = `.context-index/specs/.synthetic/${slug}.spec.md`;
    let projection;
    try {
      projection = currentState(root, syntheticSpecPath);
    } catch {
      if (!_malformedFileWarned.has(slug)) {
        _malformedFileWarned.add(slug);
        // eslint-disable-next-line no-console
        console.warn(`MALFORMED_FILE_SKIPPED: ${entry.name}`);
      }
      results.push({
        spec: slug,
        slug,
        status: 'unknown',
        currentStep: null,
        updated: null,
      });
      continue;
    }

    // Look for a `spec` field on the first event for the back-reference.
    let specRef = slug;
    try {
      const evs = readEvents(root, syntheticSpecPath);
      const withSpec = evs.find((e) => typeof e?.spec === 'string');
      if (withSpec) specRef = withSpec.spec;
    } catch { /* swallow — leave specRef as the slug */ }

    results.push({
      spec: specRef,
      slug,
      status: projection.status,
      currentStep: projection.currentStep,
      updated: projection.updatedAt,
    });
  }

  // Lexicographic sort by slug for deterministic output.
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  return results;
}
