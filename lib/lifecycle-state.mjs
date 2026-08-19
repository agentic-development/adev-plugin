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
import { fileURLToPath } from 'node:url';

// Relative project import — used only on convenience write paths.
import { loadDomainConfig } from './domains/domain-config.mjs';
import { codedError as mkErr } from './errors.mjs';

// Plugin installation root, derived from this file's own location. `lib/` and
// `templates/` are siblings under the plugin root, so the bundled domain config
// at `<root>/templates/domains/<domain>/` is always reachable from here —
// regardless of which repo the CLI was invoked in. Mirrors the
// `resolve(__dirname, '..', '..')` pattern in lib/extensions/content-install.mjs
// (that file sits one level deeper, under lib/extensions/). Used as the
// severity-resolution plugin-root fallback when a caller omits pluginRoot
// (e.g. the `adev report` CLI), which otherwise degraded every severity to
// "warning" in any consumer repo.
const DERIVED_PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Free-text escape helper shared with the issue-board renderer. Pure
// function; introduces no domain-config coupling.
import { escapeField, generatedHeader, FIELD_CAPS } from './issues/render-markdown.mjs';
// Manifest read for the event-diagnostics knob (write-time-diagnostic-hook
// spec rev 2 Behaviors 2-4, 9). Falls back gracefully when the manifest
// cannot be loaded so append never crashes on config drift.
import { loadManifest } from './manifest.mjs';

// ── Module-level constants ──────────────────────────────────────────────────

// `CANONICAL_EVENTS` lives in a leaf module (`lib/lifecycle-events.mjs`) so
// the write-time-diagnostic-hook runner chain
// (`lib/diagnostics/tier1/* → event-schemas.mjs → lifecycle-events.mjs`)
// can resolve without forming a cycle back through this module. We re-export
// it for back-compat with the many call sites that import the constant
// from `lib/lifecycle-state.mjs`.
import { CANONICAL_EVENTS } from './lifecycle-events.mjs';
export { CANONICAL_EVENTS };

const LIFECYCLE_STATE_DIR = '.context-index/lifecycle-state';
const SLUG_ALLOWLIST = /^[a-z0-9._-]+$/;
const MAX_EVENT_BYTES = 1_000_000;          // 1 MB — per AC line 87
const MAX_LOG_BYTES   = 50 * 1024 * 1024;   // 50 MB — defensive cap until compaction lands
const MAX_NOTES_BYTES = 4096;               // 4 KB — `notes` truncation threshold

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
 * `event`.
 *
 * **Discriminator stance (closed at diagnostic time, mode-dependent at write
 * time):** Per `diagnostic-registry.spec.md` rev 2 amendment 8, the
 * canonical discriminator set is closed and enforced by the
 * `adev/event-schema-valid` Tier-1 producer at diagnostic time. This
 * helper itself remains *permissive* on the discriminator value (it only
 * checks that `event.event` is a non-empty string). Whether unknown
 * discriminators reach disk depends on `manifest.yaml::lifecycle.event_diagnostics`:
 *
 *   - `strict` — the producer's error firing causes `appendEvent` to reject
 *                the write before it persists.
 *   - `tag`    — the event is written and tagged with `diagnostic_warnings`
 *                (default in v1).
 *   - `off`    — the producer does not run; legacy behavior.
 *
 * The closed list of canonical discriminators lives in `CANONICAL_EVENTS`
 * above; `lib/diagnostics/event-schemas.mjs` mirrors it. If the two ever
 * drift, the spec contract makes the lib win.
 *
 * **Deprecated:** `StateProjection.unknownEvents[]` is kept for back-compat
 * against pre-rev-2 lifecycle logs; in `strict` mode no event ever lands
 * there. Consumers building on top of the projection should treat the
 * field as deprecated and prefer the closed discriminator set.
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
 * Return value (per write-time-diagnostic-hook.spec.md rev 2 Behaviors 2-4):
 *   - `tag` / `strict` (write succeeded): `{ written: true, event, diagnostics }`
 *     where `diagnostics` is the engine's `{ fired, errors }` result.
 *   - `off`: returns `undefined` (pre-spec baseline behavior preserved).
 *
 * @returns {undefined | { written: true, event: object, diagnostics: { fired: Array, errors: Array } }}
 * @throws {Error} EVENT_SCHEMA_INVALID, INVALID_SPEC_PATH, INVALID_PROJECT_ROOT, FS_ERROR
 * @throws {GateError} in strict mode when an error-severity Tier-1 firing
 *   blocks the write, or when the engine itself crashes.
 */
export function appendEvent(projectRoot, specPath, event) {
  normaliseEventInPlace(event);
  const logPath = resolveLogPath(projectRoot, specPath);

  // ── Write-time event-diagnostics hook (spec rev 2) ───────────────────────
  // Run BEFORE the file write so `strict` mode can reject without persisting.
  // Resolve the absolute project root here so the registry cache key and any
  // forwarded `ctx.projectRoot` to runners match the canonical path used by
  // the rest of this module.
  const resolvedRoot = validateProjectRoot(projectRoot);
  const manifest = loadManifestForEventDiagnostics(resolvedRoot);
  const mode = resolveEventDiagnosticsMode(manifest);

  let diagnosticsForReturn = null;
  if (mode !== 'off') {
    let diagResult = null;
    try {
      diagResult = runTier1EventDiagnosticsSync(resolvedRoot, specPath, event);
    } catch (err) {
      // Engine wrapper itself crashed despite per-runner try/catch — log and
      // either propagate (strict) or proceed without tags (tag).
      // eslint-disable-next-line no-console
      console.error(`[event-diagnostics] engine error: ${err?.message ?? err}`);
      if (mode === 'strict') {
        throw new GateError(
          `event blocked by Tier-1 diagnostics engine error: ${err?.message ?? err}`,
          { requiredStep: null, currentStatus: { status: 'engine-error', verdict: null }, mode: 'strict' },
        );
      }
      diagResult = null;
    }

    if (diagResult) {
      // Registry-level errors (missing registry, parse failure, runner crash)
      // → stderr only, NEVER onto the event itself. Behavior 8.
      for (const e of diagResult.errors) {
        // eslint-disable-next-line no-console
        console.error(`[event-diagnostics:registry-error] ${e.id}: ${e.message}`);
      }

      const errorFirings = diagResult.fired.filter((f) => f.severity === 'error');
      if (mode === 'strict' && errorFirings.length > 0) {
        // Reject BEFORE the file write — disk state unchanged. Behavior 3.
        const msg = errorFirings.map((f) => `${f.id}: ${f.message}`).join('; ');
        throw new GateError(
          `event blocked by Tier-1 diagnostics: ${msg}`,
          { requiredStep: null, currentStatus: { status: 'diagnostic-block', verdict: null }, mode: 'strict' },
        );
      }
      // `tag` mode (always) and `strict` mode (non-error firings only):
      // merge firings into event.diagnostic_warnings. Behaviors 2, 3, 6, 7.
      mergeDiagnosticWarnings(event, diagResult.fired);
      diagnosticsForReturn = diagResult;
    } else {
      // Engine crash + `tag`/`off`: still return a stable shape so callers
      // can inspect — fired:[], errors:[engine-error?]. Per Behavior 5.
      diagnosticsForReturn = { fired: [], errors: [] };
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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

  // Return shape per spec Behaviors 2-4. `off` mode returns undefined to
  // preserve pre-spec baseline (Behavior 4); non-off modes return a
  // structured result so callers can inspect what fired.
  if (mode === 'off') return undefined;
  return { written: true, event, diagnostics: diagnosticsForReturn ?? { fired: [], errors: [] } };
}

function wrapFsError(err) {
  if (err && err.code === 'EVENT_SCHEMA_INVALID') return err;
  const wrapped = mkErr('FS_ERROR', err?.message ?? String(err));
  wrapped.cause = err;
  return wrapped;
}

// ── Write-time event-diagnostics hook ───────────────────────────────────────
//
// Per write-time-diagnostic-hook.spec.md rev 2 the engine fires Tier-1 /
// event-impact diagnostics on every event before persistence, with three
// behaviors selected by `manifest.lifecycle.event_diagnostics`:
//
//   strict — error-severity firings throw GateError BEFORE the file write.
//   tag    — (default) firings are merged into event.diagnostic_warnings.
//   off    — engine is not invoked; pre-spec baseline behavior.
//
// Why a custom synchronous runner (rather than `runDiagnostics` from
// `lib/diagnostics/index.mjs`):
//   - `appendEvent` is synchronous and called from broadly-used
//     `reportReviewer` / `reportValidator` / `reportStep` / `reportPlanTask`
//     / `reportIntervention` helpers across cli, skills, and hook entry
//     points. Promoting it to async would cascade through every caller.
//   - Tier-1 producers are pure synchronous functions per
//     `diagnostic-registry.spec.md`; the engine's async wrapper exists
//     solely for `Promise.race` timeout containment, which is unnecessary
//     for our three small in-tree Tier-1 runners.
//   - The runners are statically imported below so we never pay an `import()`
//     cost per write. The cycle (lifecycle-state → tier1 runner →
//     event-schemas → lifecycle-state::CANONICAL_EVENTS) is safe because
//     CANONICAL_EVENTS is a top-level `export const` and is fully evaluated
//     before any runner `run()` is invoked.
//
// We deliberately do NOT reuse the engine's path-containment / message
// redaction machinery here — the write-time hook only runs producers we
// ship in-tree (the three Tier-1 .mjs files under lib/diagnostics/tier1/);
// there is no third-party runner surface to defend against at write time.

// Static imports of the three v1 Tier-1 runners. New tier-1 producers
// added to `governance/diagnostics.yaml` will appear in the on-demand
// `adev diagnose --tier 1` path but won't run write-time unless added to
// `TIER1_WRITE_TIME_RUNNERS` below. This is deliberate: the write-time
// budget (<50 ms) is small and growth must be controlled.
import { run as runEventSchemaValid } from './diagnostics/tier1/event-schema-valid.mjs';
import { run as runFrontmatterPresent } from './diagnostics/tier1/frontmatter-present.mjs';
import { run as runStatusEnumLegal } from './diagnostics/tier1/status-enum-legal.mjs';

const TIER1_WRITE_TIME_RUNNERS = Object.freeze({
  'adev/event-schema-valid': runEventSchemaValid,
  'adev/frontmatter-present': runFrontmatterPresent,
  'adev/status-enum-legal': runStatusEnumLegal,
});

const VALID_EVENT_DIAGNOSTICS_MODES = new Set(['strict', 'tag', 'off']);

// One-time warning guards keyed by category so per-process noise stays bounded.
const _invalidEventDiagnosticsModeWarned = new Set();
const _manifestLoadErrorWarned = new Set();

/**
 * Resolve the event-diagnostics mode from a parsed manifest.
 *
 * Reads `manifest?.lifecycle?.event_diagnostics`. Validates against the
 * closed set `{strict, tag, off}`; defaults to `tag` when missing or unknown.
 * An unknown value triggers a one-time `[event-diagnostics] unknown mode`
 * stderr warning so a typo'd manifest is loud-but-non-fatal.
 *
 * @param {object|null|undefined} manifest - Parsed manifest.yaml object
 * @returns {"strict"|"tag"|"off"}
 */
export function resolveEventDiagnosticsMode(manifest) {
  const raw = manifest?.lifecycle?.event_diagnostics;
  if (raw == null) return 'tag';
  if (VALID_EVENT_DIAGNOSTICS_MODES.has(raw)) return raw;
  if (!_invalidEventDiagnosticsModeWarned.has(raw)) {
    _invalidEventDiagnosticsModeWarned.add(raw);
    // eslint-disable-next-line no-console
    console.error(`[event-diagnostics] unknown mode '${raw}'; defaulting to tag`);
  }
  return 'tag';
}

const VALID_STEP_PAIRING_MODES = new Set(['strict', 'off']);
const _invalidStepPairingModeWarned = new Set();

/**
 * Resolve the step-pairing mode from a parsed manifest.
 *
 * Reads `manifest?.lifecycle?.step_pairing`. Validates against the closed
 * set `{strict, off}`; defaults to `off` when missing or unknown. An
 * unknown value triggers a one-time `[step-pairing] unknown mode` stderr
 * warning so a typo'd manifest is loud-but-non-fatal.
 *
 * **Why this defaults to `off` (unlike `resolveGateMode`, which defaults to
 * `strict`):** `reportStep` is used throughout this repo's own test suite —
 * and, by the same reasoning, throughout any consumer's fixtures or tooling
 * — as a bare low-level primitive to seed a specific `steps.<step>` shape
 * for projection tests, independent of whether a real skill invocation ever
 * emitted the matching `started` event (see e.g.
 * `tests/lib/lifecycle-state.test.mjs`'s byRevision tests and
 * `tests/lib/lifecycle-state-step-cost.test.mjs`, both of which call
 * `reportStep(..., { status: 'completed'|'failed' })` with no preceding
 * `started` at all). A default of `strict` would silently break that
 * legitimate usage pattern for every consumer on upgrade. Projects that
 * want the orphan-event guard (recommended for anything gating on
 * `adev gate require`) opt in explicitly.
 *
 * @param {object|null|undefined} manifest - Parsed manifest.yaml object
 * @returns {"strict"|"off"}
 */
export function resolveStepPairingMode(manifest) {
  const raw = manifest?.lifecycle?.step_pairing;
  if (raw == null) return 'off';
  if (VALID_STEP_PAIRING_MODES.has(raw)) return raw;
  if (!_invalidStepPairingModeWarned.has(raw)) {
    _invalidStepPairingModeWarned.add(raw);
    // eslint-disable-next-line no-console
    console.error(`[step-pairing] unknown mode '${raw}'; defaulting to off`);
  }
  return 'off';
}

/**
 * Best-effort manifest read for `appendEvent`. Returns the parsed manifest
 * or `null` if loading fails. Logs one warning per (projectRoot, errCode)
 * combination so config drift is observable but never crashes the write.
 *
 * @param {string} projectRoot
 * @returns {object|null}
 */
function loadManifestForEventDiagnostics(projectRoot) {
  try {
    return loadManifest(projectRoot);
  } catch (err) {
    const key = `${projectRoot}:${err?.code ?? 'unknown'}`;
    if (!_manifestLoadErrorWarned.has(key)) {
      _manifestLoadErrorWarned.add(key);
      // eslint-disable-next-line no-console
      console.error(`[event-diagnostics] manifest load failed: ${err?.message ?? err}`);
    }
    return null;
  }
}

// Registry-cache: per-projectRoot list of active Tier-1 / event-impact
// diagnostic IDs (resolved from `governance/diagnostics.yaml`). Memoized
// across `appendEvent` calls — the budget is set per process; cache is
// only invalidated by restart. Spec Behavior 1 ("load registry once").
//
// Cache values are `{ ids: Array<{id, severity}>, errors: Array, missing: boolean }`.
const _registryCache = new Map();

/**
 * Test-only hook to clear the registry cache between cases. Exported with
 * a `_`-prefix to mark it as internal. Do not call from production code.
 */
export function _clearEventDiagnosticsRegistryCache() {
  _registryCache.clear();
}

/**
 * Synchronously load the Tier-1 / event-impact diagnostic ID list for the
 * project. Reads `<projectRoot>/.context-index/governance/diagnostics.yaml`
 * with `parseYaml`; if the file is missing or malformed the cache stores
 * an empty list plus a registry-level error so callers can log it once.
 *
 * Defensive: never throws. Engine errors per spec Behavior 5 do not block
 * writes.
 *
 * @param {string} projectRoot
 * @returns {{ ids: Array<{id: string, severity: string}>, errors: Array<{id: string, message: string}>, missing: boolean }}
 */
function getEventDiagnosticsRegistry(projectRoot) {
  if (_registryCache.has(projectRoot)) return _registryCache.get(projectRoot);

  const result = { ids: [], errors: [], missing: false };
  const registryPath = join(projectRoot, '.context-index', 'governance', 'diagnostics.yaml');

  // ── DELIBERATE, NAMED EXEMPTION from the materialization guard ────────────
  //
  // `diagnostics.yaml` is a MARKED registry, and every other loader of it calls
  // `assertMaterialized` and fails closed. This one does NOT, on purpose:
  //
  //   - It is on the `appendEvent` hot path. `assertMaterialized` throws, and a
  //     throw here would block EVERY lifecycle event write on a project whose
  //     diagnostics registry is unmarked — turning an advisory write-time check
  //     into a total outage of the lifecycle log. Durability of the log outranks
  //     strictness of this read (spec Behavior 5: engine errors never block
  //     writes).
  //   - What it can dispatch is bounded to the three in-tree bundled runners in
  //     `TIER1_WRITE_TIME_RUNNERS`, filtered further to `tier: 1` +
  //     `scope: event-impact`. It cannot run a project-supplied runner, so an
  //     unmarked registry here cannot smuggle execution past the guard — which
  //     is the thing the guard exists to stop.
  //
  // If either of those two facts stops being true — in particular if this ever
  // dispatches something not in `TIER1_WRITE_TIME_RUNNERS` — the exemption must
  // be revisited, because the second bullet is what makes the first one safe.

  if (!existsSync(registryPath)) {
    result.missing = true;
    _registryCache.set(projectRoot, result);
    return result;
  }

  let raw;
  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (err) {
    result.errors.push({
      id: 'adev/registry-load-error',
      message: `read failed: ${err?.message ?? err}`,
    });
    _registryCache.set(projectRoot, result);
    return result;
  }

  // Use the same YAML parser as lib/manifest.mjs / lib/diagnostics/index.mjs.
  // Dynamic import keeps the parser dependency lazy — it is only paid on
  // the first appendEvent per project.
  let parsed;
  try {
    // Synchronous parser — `parseYaml` is a pure function; we read it via
    // a same-file static import to keep `appendEvent` synchronous.
    parsed = _parseYamlSync(raw);
  } catch (err) {
    result.errors.push({
      id: 'adev/registry-parse-error',
      message: `parse failed: ${err?.message ?? err}`,
    });
    _registryCache.set(projectRoot, result);
    return result;
  }

  const entries = Array.isArray(parsed?.diagnostics) ? parsed.diagnostics : [];
  const seenIds = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue;
    if (entry.tier !== 1) continue;
    if (entry.scope !== 'event-impact') continue;
    if (!TIER1_WRITE_TIME_RUNNERS[entry.id]) {
      // Unknown id — engine handles registry errors; write-time silently
      // skips. The on-demand `adev diagnose` path surfaces these.
      continue;
    }
    if (seenIds.has(entry.id)) continue;  // first-wins (matches engine)
    seenIds.add(entry.id);
    result.ids.push({
      id: entry.id,
      severity: typeof entry.severity === 'string' ? entry.severity : 'error',
    });
  }

  _registryCache.set(projectRoot, result);
  return result;
}

// Wire in the YAML parser lazily so the static-import graph stays clean.
// `parseYaml` lives under `lib/profiles/yaml.mjs`; importing it directly at
// the top of this file would force every consumer of lifecycle-state to
// pull in the YAML parser even when event-diagnostics are off.
//
// We materialise the static import here under a `_` alias so the parser
// loads at module-init time (synchronous w.r.t. appendEvent calls) but the
// dependency surface is documented in one place.
import { parseYaml as _parseYamlSync } from './profiles/yaml.mjs';

/**
 * Run write-time Tier-1 / event-impact diagnostics synchronously.
 *
 * Walks the active registry IDs (resolved from `governance/diagnostics.yaml`
 * via `getEventDiagnosticsRegistry`) and invokes each runner's `run({ event })`.
 * Returns the shape `{ fired, errors }` consumed by `appendEvent`'s mode
 * dispatch. Errors caught here include runner crashes — they NEVER propagate.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} event - The event payload to validate
 * @returns {{ fired: Array<{id: string, severity: string, message: string}>, errors: Array<{id: string, message: string}> }}
 */
function runTier1EventDiagnosticsSync(projectRoot, specPath, event) {
  const fired = [];
  const errors = [];

  const registry = getEventDiagnosticsRegistry(projectRoot);
  // Registry-level errors → propagate to caller as `errors[]`, NOT tagged
  // onto the event (Behavior 8).
  for (const e of registry.errors) errors.push(e);

  // No active Tier-1 producers (e.g., registry missing) → no-op.
  if (registry.ids.length === 0) {
    return { fired, errors };
  }

  const ctx = { projectRoot, spec: specPath, event };
  for (const { id, severity } of registry.ids) {
    const runner = TIER1_WRITE_TIME_RUNNERS[id];
    if (typeof runner !== 'function') continue;  // defensive
    let verdict;
    try {
      verdict = runner(ctx);
    } catch (err) {
      // Runner crash — log as a runner-level error (NOT a firing on the event).
      errors.push({
        id: `${id}/runner-error`,
        message: err?.message ?? String(err),
      });
      continue;
    }
    if (verdict && verdict.fired === true) {
      fired.push({
        id: verdict.id ?? id,
        severity: verdict.severity ?? severity,
        message: typeof verdict.message === 'string' ? verdict.message : '',
      });
    }
  }

  return { fired, errors };
}

/**
 * Merge engine firings into an event's `diagnostic_warnings` field.
 *
 * Behavior 7: existing caller-provided tags are preserved.
 * Behavior 10: `info`-severity firings (slow-runner observability) are NOT
 *   tagged onto the event — they belong on stderr only.
 *
 * Mutates `event` in place.
 *
 * @param {object} event
 * @param {Array<{id: string, severity: string}>} fired
 * @returns {void}
 */
function mergeDiagnosticWarnings(event, fired) {
  const existing = Array.isArray(event.diagnostic_warnings) ? event.diagnostic_warnings : [];
  const newIds = [];
  for (const f of fired) {
    if (!f || typeof f.id !== 'string') continue;
    if (f.severity === 'info') continue;          // observability-only severity
    if (f.id === 'adev/diagnostic-slow') continue; // explicit guard for slow finding
    newIds.push(f.id);
  }
  if (existing.length === 0 && newIds.length === 0) return;
  event.diagnostic_warnings = Array.from(new Set([...existing, ...newIds]));
}

// ── Severity-resolution (internal; exported only for testing) ──────────────

// One-time warning guards keyed by category × actor name (or file path) so
// per-process noise stays bounded.
const _degradedDomainConfigWarned = new Set();
const _unknownReviewerWarned = new Set();
const _unknownValidatorWarned = new Set();

// Validator severities live in `validate.yaml::checks[]` (each check declares
// its own `severity`), aligned with the single-source-model spec
// (validate-config-single-source.spec.md). Reviewer severities remain in
// `reviewers.yaml::reviewers[].severity_cap`. Previously, validator lookups
// targeted `gates.yaml::gates[]` — but `gates.yaml` only carries command
// gates and never declared validator IDs, so every validator event surfaced
// an `UNKNOWN_VALIDATOR_DEFAULTED` warning (issue-507 follow-up).
const ACTOR_CONFIG_TYPE = { reviewer: 'reviewers', validator: 'validate' };
const ACTOR_CONFIG_LIST_KEY = { reviewer: 'reviewers', validator: 'checks' };
const ACTOR_CONFIG_SEVERITY_FIELD = { reviewer: 'severity_cap', validator: 'severity' };
const ACTOR_UNKNOWN_WARN_KEY = { reviewer: 'UNKNOWN_REVIEWER_DEFAULTED', validator: 'UNKNOWN_VALIDATOR_DEFAULTED' };
const ACTOR_UNKNOWN_GUARD = { reviewer: _unknownReviewerWarned, validator: _unknownValidatorWarned };

/** Project registry FILE that declares each actor kind's severity. */
const ACTOR_PROJECT_REGISTRY = { reviewer: 'review.yaml', validator: 'validate.yaml' };

/**
 * Per-path cache of the project registries this resolver reads, invalidated on
 * `mtimeMs`. `_resolveActorSeverity` is on the hot path for EVERY lifecycle
 * event write, so an uncached parse per event would be paid thousands of times
 * in a single run.
 * @type {Map<string, {mtimeMs: number, bySeverity: Map<string, string>}>}
 */
const _projectRegistryCache = new Map();

/**
 * The severity the PROJECT's own materialized registry declares for one actor,
 * or `null` when the project does not answer (no file, unreadable, unparseable,
 * actor absent, or severity not a string).
 *
 * Never throws and never warns: this runs inside the event writer, whose
 * contract is that the log is never lost to a config failure. `null` simply
 * means "ask the next source", which is exactly the pre-existing overlay path.
 *
 * @param {string} repoRoot
 * @param {"reviewer"|"validator"} actorKind
 * @param {string} actorName
 * @returns {string|null}
 */
function _projectActorSeverity(repoRoot, actorKind, actorName) {
  const file = ACTOR_PROJECT_REGISTRY[actorKind];
  if (!file || typeof repoRoot !== 'string' || repoRoot === '') return null;

  const path = join(repoRoot, '.context-index', 'governance', file);
  let mtimeMs;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }

  const cached = _projectRegistryCache.get(path);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.bySeverity.get(actorName) ?? null;
  }

  const bySeverity = new Map();
  try {
    const parsed = _parseYamlSync(readFileSync(path, 'utf8'));
    const listKey = ACTOR_CONFIG_LIST_KEY[actorKind];
    const sevField = ACTOR_CONFIG_SEVERITY_FIELD[actorKind];
    const list = Array.isArray(parsed?.[listKey]) ? parsed[listKey] : [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.id !== 'string' || entry.id === '') continue;
      if (typeof entry[sevField] !== 'string') continue;
      bySeverity.set(entry.id, entry[sevField]);
    }
  } catch {
    // A malformed project registry degrades to the overlay, exactly as a
    // malformed overlay degrades to `warning`. Nothing here may throw.
  }

  _projectRegistryCache.set(path, { mtimeMs, bySeverity });
  return bySeverity.get(actorName) ?? null;
}

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

  // The project's MATERIALIZED registry answers first. `governance/review.yaml`
  // and `governance/validate.yaml` are what actually dispatch; consulting the
  // domain overlay before them was a surviving run-time composition path — it
  // resolved severity from a template the project may never have adopted, and
  // for a project that HAS materialized (its reviewers now live in its own
  // file, not the overlay) it reported `UNKNOWN_..._DEFAULTED` and stamped
  // `warning` over the declared severity of an actor that plainly exists.
  //
  // The overlay is kept only as a fallback, for a project that has not
  // materialized yet, so no existing project loses its severities on upgrade.
  const declared = _projectActorSeverity(repoRoot, actorKind, actorName);
  if (declared !== null) return declared;

  const effectiveDomain = domain || 'software';
  // Fall back to the plugin's own location, NOT the repo root. The bundled
  // domain config lives under the plugin tree's templates/, which a consumer
  // repo does not contain — using repoRoot here silently degraded every
  // severity to "warning". An explicit pluginRoot (tests, programmatic callers)
  // still wins.
  const effectivePluginRoot = pluginRoot ?? DERIVED_PLUGIN_ROOT;

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
 * @param {"PASS"|"PASS_WITH_NOTES"|"FAIL"|"BLOCK"} args.verdict
 * @param {string|null} [args.notes]
 * @param {string} [args.domain] - Override resolved domain
 * @param {string} [args.pluginRoot] - Override plugin root for domain-config lookup
 * @returns {void}
 */
export function reportReviewer(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportReviewer requires an args object');
  }
  const { step, reviewer, verdict, notes = null, domain, pluginRoot, revision } = args;
  const resolvedDomain = domain ?? bestEffortDomain(projectRoot);
  const severity = _resolveActorSeverity({
    domain: resolvedDomain,
    actorKind: 'reviewer',
    actorName: reviewer,
    repoRoot: projectRoot,
    pluginRoot: pluginRoot ?? null,
  });
  const payload = {
    event: 'reviewer_report',
    step,
    reviewer,
    severity,
    verdict,
    notes: truncateNotes(notes),
  };
  // Optional `revision:` field per review-block-auto-retry.spec.md Behavior 4.
  // Legacy events without `revision:` continue to round-trip; fold-time treats
  // them as revision 1.
  if (revision !== undefined && revision !== null) {
    if (!Number.isInteger(revision) || revision < 1) {
      throw mkErr('EVENT_SCHEMA_INVALID', `reportReviewer revision must be an integer >= 1 when provided; got ${JSON.stringify(revision)}`);
    }
    payload.revision = revision;
  }
  appendEvent(projectRoot, specPath, payload);
}

/**
 * Closed set of legal per-gate verdicts on a `gate_outcomes[]` element.
 * Distinct from the `validator_report`-level verdict (PASS/FAIL/…): this is
 * the individual gate's own result.
 */
const GATE_OUTCOME_VERDICTS = new Set(['pass', 'fail', 'skip']);

/**
 * Exact accepted key set on a `gate_outcomes[]` element. Stated explicitly
 * (never inferred) so an unknown key is a hard refusal rather than a silent
 * pass-through — a forged or misspelled field must not reach the log.
 */
const GATE_OUTCOME_KEYS = new Set(['id', 'verdict', 'tier', 'command_sha']);

/**
 * Validate a `gate_outcomes` array for `reportValidator`.
 *
 * Each element must be a plain object with:
 *   - `id`          — non-empty string; the gate's registry id
 *   - `verdict`     — one of `pass` | `fail` | `skip` (closed set)
 *   - `tier`        — non-empty string; the gate's tier
 *   - `command_sha` — OPTIONAL; when present, a non-empty string. It is
 *                     ACCEPTED and NEVER STRIPPED: Check 1 always emits it and
 *                     the attestation rule reads it back.
 *
 * Any key outside `GATE_OUTCOME_KEYS` throws `EVENT_SCHEMA_INVALID` naming the
 * offending array index and key.
 *
 * **Upgrade path (fail-soft on history, never on verdicts).** Records written
 * before this landed carry neither `gate_outcomes` nor `manifest_sha`. A
 * missing `manifest_sha` falls back to the `ts >= computed-at` comparison
 * alone; a missing per-outcome `command_sha` skips the command-hash comparison
 * and relies on the gate-id membership check alone. Neither absence is an
 * error, and neither may turn an otherwise-fresh outcome into a pass it did
 * not earn.
 *
 * @param {unknown} outcomes
 * @returns {Array<{id: string, verdict: string, tier: string, command_sha?: string}>}
 */
function validateGateOutcomes(outcomes) {
  if (!Array.isArray(outcomes)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportValidator gate_outcomes must be an array when provided (got ${JSON.stringify(outcomes)})`,
    );
  }
  return outcomes.map((outcome, i) => {
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportValidator gate_outcomes[${i}] must be an object (got ${JSON.stringify(outcome)})`,
      );
    }
    for (const key of Object.keys(outcome)) {
      if (!GATE_OUTCOME_KEYS.has(key)) {
        throw mkErr(
          'EVENT_SCHEMA_INVALID',
          `reportValidator gate_outcomes[${i}] has unknown key ${JSON.stringify(key)} `
          + `(accepted: ${[...GATE_OUTCOME_KEYS].join(', ')})`,
        );
      }
    }
    const { id, verdict, tier, command_sha } = outcome;
    if (typeof id !== 'string' || id.length === 0) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportValidator gate_outcomes[${i}].id must be a non-empty string (got ${JSON.stringify(id)})`,
      );
    }
    if (!GATE_OUTCOME_VERDICTS.has(verdict)) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportValidator gate_outcomes[${i}].verdict must be one of: `
        + `${[...GATE_OUTCOME_VERDICTS].join(', ')} (got ${JSON.stringify(verdict)})`,
      );
    }
    if (typeof tier !== 'string' || tier.length === 0) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportValidator gate_outcomes[${i}].tier must be a non-empty string (got ${JSON.stringify(tier)})`,
      );
    }
    const normalised = { id, verdict, tier };
    if (command_sha !== undefined) {
      if (typeof command_sha !== 'string' || command_sha.length === 0) {
        throw mkErr(
          'EVENT_SCHEMA_INVALID',
          `reportValidator gate_outcomes[${i}].command_sha must be a non-empty string when present `
          + `(got ${JSON.stringify(command_sha)})`,
        );
      }
      normalised.command_sha = command_sha;
    }
    return normalised;
  });
}

/**
 * Append a `validator_report` event with stamped severity.
 *
 * `gate_outcomes` and `manifest_sha` are OPTIONAL payload fields on the
 * EXISTING `validator_report` variant — no new canonical event is introduced
 * (the ADR-0009 `[BOUNDARY: human-approved]` line stays uncrossed). Both are
 * absent on records written before they landed; see `validateGateOutcomes`
 * for the fail-soft upgrade path that absence implies.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.step
 * @param {string} args.validator - Gate id (matches gates.yaml::id)
 * @param {"PASS"|"PASS_WITH_NOTES"|"FAIL"|"BLOCK"} args.verdict
 * @param {string} [args.error]
 * @param {number} [args.score]
 * @param {number} [args.duration_ms]
 * @param {string} [args.domain]
 * @param {string} [args.pluginRoot]
 * @param {Array<{id: string, verdict: "pass"|"fail"|"skip", tier: string, command_sha?: string}>} [args.gate_outcomes]
 *   Per-gate outcomes for this check run. An empty array round-trips as `[]`
 *   ("the check ran and produced no outcomes") and is NOT collapsed to absent
 *   ("pre-upgrade record, no data").
 * @param {string} [args.manifest_sha] - The spec's source-manifest `sha` at emission time.
 *   Must be a non-empty string when provided; any other value (including `null`)
 *   throws `EVENT_SCHEMA_INVALID` rather than being coerced.
 * @returns {void}
 */
export function reportValidator(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportValidator requires an args object');
  }
  const {
    step, validator, verdict, error, score, duration_ms, notes, domain, pluginRoot,
    gate_outcomes, manifest_sha,
  } = args;
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
  if (gate_outcomes !== undefined) payload.gate_outcomes = validateGateOutcomes(gate_outcomes);
  // Refuse rather than coerce. Task 7's freshness rule equality-checks this
  // against the spec's real source-manifest sha, so a stringified `null`/`0`/
  // `{}` would degrade to a permanent, undiagnosable stale-record SKIP. `null`
  // is an error here (not "absent" as in reportReviewer's legacy-tolerant
  // `revision`): this field has no pre-existing caller, so a `null` is always a
  // failed sha lookup. An empty string is refused for the same reason — a
  // truthiness check downstream would misread it as absent.
  if (manifest_sha !== undefined) {
    if (typeof manifest_sha !== 'string' || manifest_sha.length === 0) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportValidator manifest_sha must be a non-empty string when provided; got ${typeof manifest_sha} ${JSON.stringify(manifest_sha)}`,
      );
    }
    payload.manifest_sha = manifest_sha;
  }
  appendEvent(projectRoot, specPath, payload);
}

/**
 * Fold a `reportStep`-call-site `revision` argument the same way
 * `effectiveRevision` folds an already-written event's `revision` field
 * (missing/non-integer/<1 → 1). Kept as a tiny standalone helper rather than
 * reusing `effectiveRevision` (which takes a full event object) so this can
 * be called both on the incoming args and on each candidate prior event
 * without constructing throwaway wrapper objects.
 */
function foldRevision(revision) {
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}

/**
 * Guard against the fabricated-event class of incident
 * (adev-plugin-implement-destructive-checkout-fabricated-proven-2s9i Defect
 * 2): a `step_completed`/`step_failed` written with no corresponding
 * `lifecycle_step … started` anywhere in the log is indistinguishable, once
 * on disk, from a legitimate terminal event — and `requireGate` trusts it.
 *
 * Only active when `manifest.lifecycle.step_pairing` resolves to `strict`
 * (see `resolveStepPairingMode` for why the default is `off`). Matching is
 * scoped to `(step, effective revision)` — a retry that legitimately
 * re-invokes a skill from its own Step 0 (e.g. `/adev:review-specs` on
 * `--revise`d spec revisions, per review-block-auto-retry.spec.md) emits a
 * fresh `started` per revision, so this never penalizes that pattern.
 *
 * Never runs for `status: 'started'` — the started event is the anchor
 * being checked *for*, not a terminal event that needs one.
 *
 * Manifest loading and path resolution failures here are swallowed (return,
 * i.e. treat as non-strict) rather than thrown: this guard's own config
 * lookup must never be the reason a legitimate write fails with a
 * misleading error — `appendEvent`'s own path/manifest handling remains the
 * authoritative source of those failures.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {string} step
 * @param {number} effRev - already-folded effective revision (see `foldRevision`)
 * @throws {Error} `ORPHAN_STEP_EVENT` when strict and no matching started event exists
 */
function assertStepNotOrphaned(projectRoot, specPath, step, effRev) {
  if (typeof step !== 'string' || step.length === 0) return;

  let resolvedRoot;
  try {
    resolvedRoot = validateProjectRoot(projectRoot);
  } catch {
    return; // let appendEvent's own resolveLogPath raise the authoritative error
  }
  const manifest = loadManifestForEventDiagnostics(resolvedRoot);
  if (resolveStepPairingMode(manifest) !== 'strict') return;

  const events = readEvents(projectRoot, specPath);
  const hasStarted = events.some((ev) => (
    ev?.event === 'lifecycle_step'
    && ev.step === step
    && ev.status === 'started'
    && foldRevision(ev.revision) === effRev
  ));
  if (!hasStarted) {
    throw mkErr(
      'ORPHAN_STEP_EVENT',
      `reportStep refuses to record step "${step}" (revision ${effRev}) as completed/failed: `
      + `no matching "lifecycle_step" started event for this step and revision exists in the log. `
      + `Emit reportStep(projectRoot, specPath, { step: ${JSON.stringify(step)}, status: 'started'`
      + `${effRev > 1 ? `, revision: ${effRev}` : ''} }) before reporting its terminal status.`,
    );
  }
}

/**
 * Append a step transition event. Discriminator is chosen from `status`:
 *   started   → "lifecycle_step"
 *   completed → "step_completed"
 *   failed    → "step_failed"
 *
 * Non-actor event — no severity stamp.
 *
 * When `manifest.lifecycle.step_pairing` is `strict` (default `off` — see
 * `resolveStepPairingMode`), a `completed`/`failed` status is refused with
 * `ORPHAN_STEP_EVENT` unless a matching `started` event for the same step
 * and effective revision already exists in the log (`assertStepNotOrphaned`).
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.step - Step name
 * @param {"started"|"completed"|"failed"} args.status
 * @param {string} [args.verdict] - Optional verdict for terminal transitions
 * @returns {void}
 * @throws {Error} `ORPHAN_STEP_EVENT` in strict step-pairing mode when a
 *   `completed`/`failed` status has no matching prior `started` event.
 */
export function reportStep(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportStep requires an args object');
  }
  const { step, status, verdict, revision, totals, model_breakdown, skipped_lines } = args;
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
  // Optional `revision:` field per review-block-auto-retry.spec.md Behavior 4.
  // Used by `step_completed` (and conceptually any step discriminator) when
  // the emitting skill knows the spec revision at write time. Legacy events
  // without `revision:` fold as revision 1.
  if (revision !== undefined && revision !== null) {
    if (!Number.isInteger(revision) || revision < 1) {
      throw mkErr('EVENT_SCHEMA_INVALID', `reportStep revision must be an integer >= 1 when provided; got ${JSON.stringify(revision)}`);
    }
    payload.revision = revision;
  }
  // Optional cost fields (only meaningful on step_completed; ignored on started/failed).
  if (status === 'completed' && totals != null) {
    payload.totals = totals;
    if (model_breakdown !== undefined) payload.model_breakdown = model_breakdown;
    if (skipped_lines !== undefined) payload.skipped_lines = skipped_lines;
  }
  if (status === 'completed' || status === 'failed') {
    assertStepNotOrphaned(projectRoot, specPath, step, foldRevision(revision));
  }
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

/** Closed enum of legal `review_round.stage` values (review-provenance.spec.md Contract B). */
export const REVIEW_ROUND_STAGES = Object.freeze(
  new Set(['spec-compliance', 'code-quality', 'synthesized']),
);

/**
 * Exact accepted key set on a `reportReviewRound` args object. Stated explicitly
 * (never inferred) so an unknown key is a hard refusal rather than a silent
 * pass-through, mirroring `GATE_OUTCOME_KEYS`.
 */
const REVIEW_ROUND_KEYS = new Set(['plan', 'task_id', 'stage', 'cycles', 'findings']);

/**
 * Stages for which `findings` is countable. `spec-compliance` is excluded because
 * step 2f of skills/implement/SKILL.md mandates no stable finding-id convention,
 * so "distinct findings" is undefined there (omit-rather-than-guess).
 */
const REVIEW_ROUND_FINDINGS_STAGES = new Set(['code-quality', 'synthesized']);

/**
 * Append a `review_round` event.
 *
 * Records the per-stage review provenance of one `/adev:implement` task so
 * round-yield analysis can distinguish "one clean pass" from "three cycles to
 * convergence". Follows the one-helper-per-variant discipline of
 * `reportPartialRecovery` / `reportValidator`.
 *
 * **Validation lives here, not only in `lib/cli/report.mjs`.** The lifecycle log
 * is append-only, so a malformed event is permanent; failing the write is
 * deliberate and keeps a forged or misspelled field out of the log via ANY
 * caller — a test, a future skill, or a later CLI surface. (The trailer channel
 * differs: a malformed trailer is amendable.)
 *
 * `cycles` is positively encoded: a first-pass stage records `cycles: 1`, never
 * absence. `findings` is OMITTED from the payload when not supplied — absence
 * reads as "not recorded", never as zero — and is never written as `null`.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.plan - Project-relative plan path the task belongs to.
 * @param {string} args.task_id - Plan-task identifier.
 * @param {"spec-compliance"|"code-quality"|"synthesized"} args.stage
 * @param {number} args.cycles - Integer >= 1; review cycles this stage consumed.
 * @param {number} [args.findings] - Integer >= 0; distinct findings raised.
 *   Accepted for `code-quality` and `synthesized` only.
 * @returns {void}
 * @throws {Error} `EVENT_SCHEMA_INVALID` on any validation failure.
 */
export function reportReviewRound(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportReviewRound requires an args object');
  }
  for (const key of Object.keys(args)) {
    if (!REVIEW_ROUND_KEYS.has(key)) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportReviewRound has unknown key ${JSON.stringify(key)} `
        + `(accepted: ${[...REVIEW_ROUND_KEYS].join(', ')})`,
      );
    }
  }
  const { plan, task_id, stage, cycles, findings } = args;
  if (typeof plan !== 'string' || plan.length === 0) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportReviewRound requires plan as a non-empty string; got ${JSON.stringify(plan)}`,
    );
  }
  if (typeof task_id !== 'string' || task_id.length === 0) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportReviewRound requires task_id as a non-empty string; got ${JSON.stringify(task_id)}`,
    );
  }
  if (!REVIEW_ROUND_STAGES.has(stage)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportReviewRound stage must be one of ${[...REVIEW_ROUND_STAGES].join('|')}; `
      + `got ${JSON.stringify(stage)}`,
    );
  }
  // Refuse rather than coerce: a float, a numeric string, NaN or Infinity would
  // otherwise land in the log as a permanent, undiagnosable cycle count.
  if (!Number.isInteger(cycles) || cycles < 1) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportReviewRound cycles must be an integer >= 1 (first pass is 1, never absence); `
      + `got ${typeof cycles} ${JSON.stringify(cycles)}`,
    );
  }
  if (findings !== undefined) {
    if (!Number.isInteger(findings) || findings < 0) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportReviewRound findings must be an integer >= 0 when provided; `
        + `got ${typeof findings} ${JSON.stringify(findings)}`,
      );
    }
    if (!REVIEW_ROUND_FINDINGS_STAGES.has(stage)) {
      throw mkErr(
        'EVENT_SCHEMA_INVALID',
        `reportReviewRound rejects findings for stage ${JSON.stringify(stage)} `
        + `(accepted for: ${[...REVIEW_ROUND_FINDINGS_STAGES].join(', ')}) — step 2f mandates `
        + 'no stable finding-id convention, so distinct findings is undefined there',
      );
    }
  }
  appendEvent(projectRoot, specPath, {
    event: 'review_round',
    plan,
    task_id,
    stage,
    cycles,
    ...(findings === undefined ? {} : { findings }),
  });
}

/**
 * Hard cap on the emitted `<stage>=<cycles>` payload, in codepoints.
 *
 * Deliberately small: the longest legal payload is `spec-compliance=` (16) plus
 * at most {@link MAX_REVIEW_ROUND_CYCLES_DIGITS} digits, i.e. 22. 32 leaves
 * headroom for a future enum member without ever admitting a smuggled blob.
 * Named as a module constant in the style of `FIELD_CAPS`
 * (`lib/issues/render-markdown.mjs`), but this cap REFUSES rather than truncates.
 */
const MAX_REVIEW_ROUND_TRAILER_VALUE_LENGTH = 32;

/**
 * Hard cap on the rendered decimal-digit count of `cycles`.
 *
 * The integer guard alone is insufficient: `Number.isInteger(1e40)` is `true`
 * and `1e40 >= 1`, so an absurd count passes it and is caught only by a length
 * bound. Capping the digits directly (rather than inferring overflow from the
 * composed string) is what lets the refusal message name `cycles` unambiguously.
 * Six digits (999999 review cycles) is far past any plausible task.
 */
const MAX_REVIEW_ROUND_CYCLES_DIGITS = 6;

/**
 * Control and ANSI escape characters that must never reach a commit message.
 *
 * Covers C0 (`\u0000`-`\u001f`), DEL (`\u007f`), and C1 (`\u0080`-`\u009f`).
 * ESC (`\u001b`) lives inside C0, so every ESC-introduced ANSI sequence — CSI
 * (`ESC [`), OSC (`ESC ]`), and the rest — is caught by its introducer rather
 * than by matching the sequence bodies; stating that explicitly so the coverage
 * is not left implicit. The C1 half additionally catches the 8-bit CSI/OSC forms
 * (`\u009b`, `\u009d`) that need no ESC introducer. CR and LF are inside C0 too,
 * but they get their own earlier check so their refusal message can name the
 * forged-trailer-line risk specifically.
 */
const REVIEW_ROUND_CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Allow-list for a `stage` label: lowercase letters and interior hyphens only. */
const REVIEW_ROUND_STAGE_SHAPE = /^[a-z]+(?:-[a-z]+)*$/;

/**
 * Allow-list for the rendered `cycles` digits, bounded by
 * {@link MAX_REVIEW_ROUND_CYCLES_DIGITS}. Hoisted to module scope beside the two
 * sibling patterns rather than rebuilt per call.
 */
const REVIEW_ROUND_CYCLES_SHAPE = new RegExp(`^[0-9]{1,${MAX_REVIEW_ROUND_CYCLES_DIGITS}}$`);

/**
 * Build the single sanctioned `Review-round: <stage>=<cycles>` trailer line.
 *
 * The ONLY producer of this trailer (review-provenance.spec.md Output Contract A).
 * skills/implement/SKILL.md step 2h names this helper instead of composing the
 * text as orchestrator prose, because the trailer is authored by an LLM whose
 * inputs (task reports, reviewer output, code under review) are treated as
 * prompt-injectable, and a merged commit is materially harder to correct than an
 * append-only JSONL row is to supersede (CWE-93 / CWE-113 / CWE-150).
 *
 * REJECTS rather than sanitizes — it does NOT delegate to `escapeField`, which
 * normalizes CR/LF and truncates instead of refusing:
 *   - embedded CR/LF (would forge an additional trailer line on the commit)
 *   - control characters and ANSI escape sequences (would be echoed verbatim into
 *     terminal-facing advisories and raw-trailer renderers)
 *   - a `<stage>=<cycles>` string over the hard cap
 *   - a stage outside REVIEW_ROUND_STAGES
 *   - any `cycles` failing Number.isInteger(cycles) && cycles >= 1
 * Nothing is coerced: a refusal raises, it never emits a quietly altered line.
 *
 * @param {"spec-compliance"|"code-quality"|"synthesized"} stage
 * @param {number} cycles - Integer >= 1; first pass is 1, never absence.
 * @returns {string} exactly `Review-round: <stage>=<cycles>`, single line.
 * @throws {Error} `EVENT_SCHEMA_INVALID` on any validation failure. Same code as
 *   `reportReviewRound`, so callers catch one code across both channels.
 */
export function buildReviewRoundTrailer(stage, cycles) {
  // Type gates first, so no message is ever built from a coerced value.
  if (typeof stage !== 'string') {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `buildReviewRoundTrailer requires stage as a string; got ${typeof stage}`,
    );
  }
  if (typeof cycles !== 'number') {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `buildReviewRoundTrailer requires cycles as a number; got ${typeof cycles}`,
    );
  }
  // Enum membership first: for in-enum values every later stage check is
  // redundant, which is the point — the closed enum is the primary defence.
  //
  // ECHO POLICY — do NOT "normalize" this message against `reportReviewRound`'s.
  // That sibling interpolates the rejected value (`got ${JSON.stringify(stage)}`)
  // because its message is log-bound. THIS message can surface in a
  // terminal-facing advisory or a raw-trailer renderer, which is precisely the
  // sink this helper exists to protect, so it reports only the value's LENGTH and
  // never its bytes. Echoing `stage` here would reintroduce the escape-sequence
  // injection the control/ANSI sweep below is written to stop, and no test would
  // catch it because the refusal itself would still be correct.
  if (!REVIEW_ROUND_STAGES.has(stage)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `buildReviewRoundTrailer stage must be one of ${[...REVIEW_ROUND_STAGES].join('|')}; `
      + `got a ${stage.length}-char value`,
    );
  }
  // Defence in depth from here on: kept so a future widening of
  // REVIEW_ROUND_STAGES cannot bypass the syntax guarantees (spec's stated
  // reason for retaining the sweep). Unreachable while the enum holds its three
  // legal members, so the tests reach them by temporarily inserting a hostile
  // stage into the exported Set — see tests/lifecycle/review-round-trailer.test.mjs.
  //
  // SUBSUMPTION: the three checks are NOT three coverage layers. The
  // REVIEW_ROUND_STAGE_SHAPE allow-list at the end already rejects everything the
  // CR/LF and control/ANSI sweeps reject (and more — any byte outside [a-z-]).
  // The two sweeps exist for MESSAGE GRANULARITY: a widened enum carrying CR/LF
  // should say "would forge an additional trailer line", not "fails a shape
  // regex", because those are different failures for whoever widened it. Four
  // guards for one payload is deliberate on that basis, not accumulated by
  // accident; deleting a sweep loses a diagnostic, not a protection.
  if (/[\r\n]/.test(stage)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      'buildReviewRoundTrailer refuses a stage containing CR or LF; it would forge '
      + 'an additional trailer line on a permanent commit',
    );
  }
  if (REVIEW_ROUND_CONTROL_CHARS.test(stage)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      'buildReviewRoundTrailer refuses a stage containing control or ANSI escape '
      + 'characters; they would be echoed verbatim into terminal-facing advisories',
    );
  }
  if (!REVIEW_ROUND_STAGE_SHAPE.test(stage)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      'buildReviewRoundTrailer requires stage to match lowercase-hyphen shape '
      + `${REVIEW_ROUND_STAGE_SHAPE.source}`,
    );
  }
  // Refuse rather than coerce: a float, NaN or Infinity is rejected outright.
  if (!Number.isInteger(cycles) || cycles < 1) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      'buildReviewRoundTrailer requires cycles as an integer >= 1 '
      + `(first pass is 1, never absence); got ${JSON.stringify(cycles)}`,
    );
  }
  // The integer guard passes for giants like 1e40, so cap the rendered digits.
  // A non-digit rendering (exponent notation, e.g. String(1e21) === '1e+21') is
  // itself proof of overflow and refused by the same shape check.
  const renderedCycles = String(cycles);
  if (!REVIEW_ROUND_CYCLES_SHAPE.test(renderedCycles)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `buildReviewRoundTrailer cycles exceeds the hard cap of `
      + `${MAX_REVIEW_ROUND_CYCLES_DIGITS} decimal digits; got ${renderedCycles}`,
    );
  }
  const value = `${stage}=${renderedCycles}`;
  // Unreachable given the enum plus the digit cap; retained as defence in depth
  // against a future enum widening, and attributed to the overflowing half so
  // the message always names the offending input.
  if (value.length > MAX_REVIEW_ROUND_TRAILER_VALUE_LENGTH) {
    const half = renderedCycles.length > stage.length ? 'cycles' : 'stage';
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `buildReviewRoundTrailer <stage>=<cycles> exceeds the hard length cap of `
      + `${MAX_REVIEW_ROUND_TRAILER_VALUE_LENGTH}; the ${half} half overflowed`,
    );
  }
  return `Review-round: ${value}`;
}

/** Closed enum of valid `partial_recovery.action` values per the spec. */
const PARTIAL_RECOVERY_ACTIONS = new Set(['resumed', 'discarded', 'stolen', 'aborted']);
/** Closed enum of valid `partial_recovery.dispatch_mode` values per the spec. */
const PARTIAL_RECOVERY_DISPATCH_MODES = new Set(['foreground', 'subagent']);

/**
 * Append a `partial_recovery` event.
 *
 * Records every `.partial` artifact resolution (resumed, discarded, stolen,
 * aborted) so `/adev:retro` can quantify the upstream Claude API streaming
 * failure rate that motivated the pattern (issue-504).
 *
 * Owned by `lifecycle-event-log.spec.md` per the cross-spec contract with
 * `incremental-artifact-writes.spec.md`; the helper follows the
 * one-helper-per-variant discipline of `reportReviewer` / `reportValidator` /
 * `reportPlanTask` (NOT a widening of `reportIntervention`).
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.artifact_path - Project-root-relative path to the
 *                                       artifact (absolute paths rejected
 *                                       per SEC-3 data-exposure boundary).
 * @param {string} args.prior_partial_ts - ISO-8601 mtime of the prior
 *                                         `.partial` file before resolution.
 * @param {"resumed"|"discarded"|"stolen"|"aborted"} args.action
 * @param {"foreground"|"subagent"} args.dispatch_mode
 * @returns {void}
 * @throws {Error} `EVENT_SCHEMA_INVALID` on any validation failure.
 */
export function reportPartialRecovery(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportPartialRecovery requires an args object');
  }
  const { artifact_path, prior_partial_ts, action, dispatch_mode } = args;
  if (typeof artifact_path !== 'string' || artifact_path.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportPartialRecovery requires artifact_path as a non-empty string');
  }
  // SEC-3 data-exposure boundary: project-root-relative only.
  if (artifact_path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(artifact_path)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportPartialRecovery rejects absolute artifact_path (project-root-relative required per SEC-3): ${artifact_path}`,
    );
  }
  if (typeof prior_partial_ts !== 'string' || prior_partial_ts.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportPartialRecovery requires prior_partial_ts as a non-empty string');
  }
  if (!PARTIAL_RECOVERY_ACTIONS.has(action)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportPartialRecovery action must be one of ${[...PARTIAL_RECOVERY_ACTIONS].join('|')}; got ${JSON.stringify(action)}`,
    );
  }
  if (!PARTIAL_RECOVERY_DISPATCH_MODES.has(dispatch_mode)) {
    throw mkErr(
      'EVENT_SCHEMA_INVALID',
      `reportPartialRecovery dispatch_mode must be one of ${[...PARTIAL_RECOVERY_DISPATCH_MODES].join('|')}; got ${JSON.stringify(dispatch_mode)}`,
    );
  }
  appendEvent(projectRoot, specPath, {
    event: 'partial_recovery',
    artifact_path,
    prior_partial_ts,
    action,
    dispatch_mode,
  });
}

/**
 * Append a `spec_revised` event.
 *
 * Emitted by `/adev:specify --revise` after a BLOCKED spec is bumped from
 * revision N → N+1 by a targeted patch. Carries the canonical
 * `blocker_id` sets so downstream consumers (loop convergence detector,
 * `/adev:status` revision history) can partition `addressed` / `persistent`
 * / `new` across revisions.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {number} args.from_revision           - rev N (pre-revise)
 * @param {number} args.to_revision             - rev N+1 (post-revise)
 * @param {string[]} args.addressed_blocker_ids - IDs in rev N absent from rev N+1
 * @param {string[]} args.unresolved_blocker_ids - IDs still present after revise
 * @returns {void}
 * @throws {Error} `EVENT_SCHEMA_INVALID` on any validation failure.
 */
export function reportSpecRevised(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportSpecRevised requires an args object');
  }
  const { from_revision, to_revision, addressed_blocker_ids, unresolved_blocker_ids } = args;
  if (!Number.isInteger(from_revision) || from_revision < 1) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportSpecRevised from_revision must be an integer >= 1; got ${JSON.stringify(from_revision)}`);
  }
  if (!Number.isInteger(to_revision) || to_revision < 2) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportSpecRevised to_revision must be an integer >= 2; got ${JSON.stringify(to_revision)}`);
  }
  if (to_revision !== from_revision + 1) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportSpecRevised to_revision must equal from_revision + 1 (revision-monotonic guard); got from=${from_revision} to=${to_revision}`);
  }
  if (!Array.isArray(addressed_blocker_ids) || !addressed_blocker_ids.every(s => typeof s === 'string')) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportSpecRevised addressed_blocker_ids must be a string[]');
  }
  if (!Array.isArray(unresolved_blocker_ids) || !unresolved_blocker_ids.every(s => typeof s === 'string')) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportSpecRevised unresolved_blocker_ids must be a string[]');
  }
  appendEvent(projectRoot, specPath, {
    event: 'spec_revised',
    from_revision,
    to_revision,
    addressed_blocker_ids,
    unresolved_blocker_ids,
  });
}

/**
 * Append a `spec_amended` event to the BASE spec's log.
 *
 * Emitted by `/adev:specify --amend` (via `adev specify amend`) after an
 * amendment artifact is atomically written. The event records the amendment's
 * slug, its project-root-relative path, and the base revision it targets, so
 * `/adev:status` and `/adev:hygiene` can traverse base↔amendment.
 *
 * `specPath` is the BASE spec path (the amendment receives its own log through
 * the standard `.spec.md` slug derivation — no change to `slugFromSpec`).
 *
 * Field strictness (SA-1) mirrors `reportSpecRevised`: each field's primitive
 * type is validated; any failure throws `EVENT_SCHEMA_INVALID` before append.
 *
 * @param {string} projectRoot
 * @param {string} specPath - the BASE spec path (project-root-relative)
 * @param {object} args
 * @param {string} args.amendment_slug  - kebab-case slug of the amendment file
 * @param {string} args.amendment_path  - project-root-relative path to the amendment
 * @param {number} args.target_revision - integer ≥ 2; base revision the amendment targets
 * @returns {void}
 * @throws {Error} `EVENT_SCHEMA_INVALID` on any validation failure.
 */
export function reportSpecAmended(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportSpecAmended requires an args object');
  }
  const { amendment_slug, amendment_path, target_revision } = args;
  if (typeof amendment_slug !== 'string' || amendment_slug.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportSpecAmended amendment_slug must be a non-empty string; got ${JSON.stringify(amendment_slug)}`);
  }
  if (typeof amendment_path !== 'string' || amendment_path.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportSpecAmended amendment_path must be a non-empty string; got ${JSON.stringify(amendment_path)}`);
  }
  if (!Number.isInteger(target_revision) || target_revision < 2) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportSpecAmended target_revision must be an integer >= 2; got ${JSON.stringify(target_revision)}`);
  }
  appendEvent(projectRoot, specPath, {
    event: 'spec_amended',
    amendment_slug,
    amendment_path,
    target_revision,
  });
}

/**
 * Append a `human_approval_required` event.
 *
 * Emitted by `/adev:build --full --require-human-final-pass` when the
 * BLOCK→revise auto-retry loop converges on PASS at revision N+1 and the
 * human-final-pass gate is active. The build halts and the operator runs
 * `/adev:build --resume <spec>` to acknowledge before proceeding.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string} args.spec     - spec path (project-root-relative)
 * @param {number} args.revision - revision at which PASS was reached
 * @param {string} args.reason   - human-readable explanation
 * @returns {void}
 * @throws {Error} `EVENT_SCHEMA_INVALID` on any validation failure.
 */
export function reportHumanApprovalRequired(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportHumanApprovalRequired requires an args object');
  }
  const { spec, revision, reason } = args;
  if (typeof spec !== 'string' || spec.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportHumanApprovalRequired requires spec as a non-empty string');
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw mkErr('EVENT_SCHEMA_INVALID', `reportHumanApprovalRequired revision must be an integer >= 1; got ${JSON.stringify(revision)}`);
  }
  if (typeof reason !== 'string' || reason.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportHumanApprovalRequired requires reason as a non-empty string');
  }
  appendEvent(projectRoot, specPath, {
    event: 'human_approval_required',
    spec,
    revision,
    reason,
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
 * @property {object}        testDepthAssignments Map of `${plan}::${task_id}` → the most recent
 *   `test_depth_assigned` event payload (append-order "last wins" per
 *   test-depth-policy.spec.md Behavior 13)
 * @property {object}        reviewRounds  Map of `${plan}::${task_id}::${stage}` → the most recent
 *   `review_round` event payload (append-order "last wins" per
 *   review-provenance.spec.md Output Contract B). Absence of a key means "not recorded" — never
 *   a synthesized `cycles: 0`. Carries no verdict and no lifecycle position.
 * @property {object[]}      interventions debug_intervention events, in order
 * @property {object[]}      partialRecoveries `partial_recovery` events, in order (incremental-artifact-writes.spec.md / SA-12/CON-11)
 * @property {object|null}   drift         The latest UNRESOLVED `code_drift_detected` event, projected as
 *   `{ source, at, ts }` (camelCase per CON-2 — the raw event's `drift_source`/`drift_at` keys are
 *   snake_case only inside the payload). `null` when no detection has been recorded or when the latest
 *   detection was superseded by a later `code_drift_cleared`. See jsonl-drift-events.spec.md Behavior 5.
 *   NOT authoritative for "is this spec drifted?" — the spec's frontmatter `drift_detected` boolean is
 *   (Behavior 5 legacy fallback: pre-migration specs can be drifted with zero JSONL drift events). Use
 *   `adev verify check-drift` for the drifted verdict; this field only carries the source/timestamp.
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
    testDepthAssignments: {},
    reviewRounds: {},
    interventions: [],
    partialRecoveries: [],
    // Latest unresolved code drift (jsonl-drift-events.spec.md Behavior 5).
    // Always present, `null` until a `code_drift_detected` event is folded;
    // reset to `null` by a later `code_drift_cleared`.
    drift: null,
    unknownEvents: [],
    startedAt: null,
    updatedAt: null,
    // Per-revision history surfaces (review-block-auto-retry.spec.md).
    // Populated lazily by the fold so the field is `undefined` on specs
    // that never received a spec_revised / human_approval_required event.
    // `specAmendments` (spec-amendment-artifacts.spec.md) follows the same
    // lazy convention.
  };
}

function ensureStep(projection, stepName) {
  if (!projection.steps[stepName]) {
    projection.steps[stepName] = {
      name: stepName,
      status: 'pending',
      reports: [],
      // Per-revision projection (review-block-auto-retry.spec.md Behavior 5).
      // Keys are revision integers (1, 2, …). Values: { verdict, score?,
      // blockers, completed_at, reports[] }. Legacy events without
      // `revision:` are folded into byRevision[1] at projection time.
      byRevision: {},
    };
  }
  return projection.steps[stepName];
}

/**
 * Resolve the effective revision number for an event.
 *
 * - Numeric `revision: N` (N ≥ 1) → returned as-is.
 * - Missing/null/non-integer → 1 (legacy-fold-as-rev-1 per Behavior 4).
 *
 * @param {object} ev
 * @returns {number}
 */
function effectiveRevision(ev) {
  const r = ev?.revision;
  if (Number.isInteger(r) && r >= 1) return r;
  return 1;
}

function ensureByRevision(step, revision) {
  if (!step.byRevision[revision]) {
    step.byRevision[revision] = {
      revision,
      verdict: null,
      blockers: [],
      reports: [],
      completed_at: null,
    };
  }
  return step.byRevision[revision];
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
 *   >= 1 BLOCK report (no blocker/error FAIL) -> { verdict: BLOCK, status: completed }
 *   warning/advisory FAIL                    -> { verdict: PASS_WITH_NOTES, status: completed }
 *   no FAILs, >= 1 PASS_WITH_NOTES report    -> { verdict: PASS_WITH_NOTES, status: completed }
 *   all PASS                                 -> { verdict: PASS, status: completed }
 *
 * BLOCK is the consolidated review verdict (see skills/review-specs
 * SKILL.md § Verdict Logic and `computeVerdict` in
 * lib/governance/review-config.mjs). It is NOT a pass: it is deliberately
 * absent from `PASSING_VERDICTS`, so `requireGate` blocks downstream steps
 * on it. Before issue-584 a BLOCK report matched no branch here and fell
 * through to `{verdict: PASS}` — a blocked review projected as a pass
 * whenever the explicit `step_completed` event was missing (e.g. the run
 * died after emitting reviewer reports).
 *
 * Precedence note: a blocker/error-severity FAIL still outranks BLOCK.
 * FAIL means an actor errored out; BLOCK means the actor ran and returned
 * blocking findings. Both stop the gate, so the ordering only affects which
 * label the operator sees, and the harder failure is reported first. The
 * status is `completed` (not `failed`) because that matches what
 * /adev:review-specs emits for a BLOCK verdict
 * (`--status completed --verdict BLOCK`); using `failed` would raise a
 * spurious `aggregated_discrepancy` on every legitimate BLOCK review.
 *
 * Returns null if there are no actor reports (the step's status/verdict
 * comes from an explicit lifecycle_step or step_completed/failed event).
 */
function aggregateReports(reports) {
  if (!Array.isArray(reports) || reports.length === 0) return null;

  let worstFailRank = 0;
  let sawBlock = false;
  let sawPassWithNotes = false;
  for (const r of reports) {
    if (r.verdict === 'FAIL') {
      const rank = SEVERITY_RANK[r.severity] ?? 2; // unknown severity treated as warning
      if (rank > worstFailRank) worstFailRank = rank;
    } else if (r.verdict === 'BLOCK') {
      sawBlock = true;
    } else if (r.verdict === 'PASS_WITH_NOTES') {
      sawPassWithNotes = true;
    }
  }

  if (worstFailRank >= SEVERITY_RANK.error) {
    return { verdict: 'FAIL', status: 'failed' };
  }
  if (sawBlock) {
    // A blocking review outcome outranks any warning/advisory FAIL and any
    // PASS_WITH_NOTES; it must never be softened into a passing verdict.
    return { verdict: 'BLOCK', status: 'completed' };
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
        // Touch the byRevision bucket so a started-only step still appears.
        ensureByRevision(step, effectiveRevision(ev));
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
        const bucket = ensureByRevision(step, effectiveRevision(ev));
        if (ev.verdict) bucket.verdict = ev.verdict;
        bucket.completed_at = ev.ts ?? bucket.completed_at;
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
        const bucket = ensureByRevision(step, effectiveRevision(ev));
        if (ev.verdict) bucket.verdict = ev.verdict;
        bucket.completed_at = ev.ts ?? bucket.completed_at;
        break;
      }
      case 'reviewer_report':
      case 'validator_report': {
        if (typeof ev.step !== 'string') break;
        const step = ensureStep(projection, ev.step);
        step.reports.push(ev);
        const bucket = ensureByRevision(step, effectiveRevision(ev));
        bucket.reports.push(ev);
        // Collect any blocker_ids surfaced inline on reviewer reports so
        // downstream consumers (loop-convergence, .blockers.md writer) can
        // partition across revisions without re-reading sidecars.
        if (Array.isArray(ev.blocker_ids)) {
          for (const id of ev.blocker_ids) {
            if (typeof id === 'string' && !bucket.blockers.includes(id)) {
              bucket.blockers.push(id);
            }
          }
        }
        break;
      }
      case 'spec_revised': {
        // Track per-spec revisions so `/adev:status` and `/adev:retro` can
        // render the revision history. Stored at projection top level since
        // it crosses steps.
        if (!projection.specRevisions) projection.specRevisions = [];
        projection.specRevisions.push(ev);
        break;
      }
      case 'spec_amended': {
        // spec-amendment-artifacts.spec.md Behavior 4: written to the BASE
        // spec's log when an amendment artifact is scaffolded against an
        // already-shipped base. Amendment is a relationship overlay, not a
        // lifecycle position — it must not move `status` or `currentStep`.
        // Kept as an ordered list of raw events (mirroring `specRevisions`)
        // because a base spec may accumulate several amendments and status /
        // hygiene traversal needs all of them, not just the latest.
        if (!projection.specAmendments) projection.specAmendments = [];
        projection.specAmendments.push(ev);
        break;
      }
      case 'code_drift_detected': {
        // jsonl-drift-events.spec.md Behavior 5: consumers read only the
        // LATEST detection that has not been superseded by a later
        // `code_drift_cleared`. Rev 3 of that spec explicitly rescinded the
        // multi-source history capability ("no consumer reads it"), so this
        // is a last-wins single slot rather than an accumulating array.
        // Advisory metadata only — deliberately does NOT touch `status` or
        // `currentStep`, so `requireGate` is unaffected by drift.
        // Field guards mirror lib/cli/verify.mjs so the two readers of these
        // events cannot diverge on malformed payloads.
        projection.drift = {
          source: typeof ev.drift_source === 'string' ? ev.drift_source : null,
          at: typeof ev.drift_at === 'string' ? ev.drift_at : null,
          ts: typeof ev.ts === 'string' ? ev.ts : null,
        };
        break;
      }
      case 'code_drift_cleared': {
        // Cancels any prior unresolved detection (jsonl-drift-events.spec.md
        // Behavior 3 / Behavior 5 "superseded by a later code_drift_cleared").
        // A clear with no prior detection is a no-op, not an error — legacy
        // pre-migration specs can carry one.
        projection.drift = null;
        break;
      }
      case 'human_approval_required': {
        if (!projection.humanApprovalsRequired) projection.humanApprovalsRequired = [];
        projection.humanApprovalsRequired.push(ev);
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
      case 'test_depth_assigned': {
        // test-depth-policy.spec.md Behavior 13: a task may accumulate more
        // than one assignment event across re-routes/recovery re-invocations;
        // where a single value is required, the most recent event for that
        // `plan` + `task_id` wins ("most recent" = last in append order).
        // Keyed on plan+task_id (not task_id alone) since assignments are
        // scoped per-plan, mirroring `plan_task`'s own last-wins fold.
        if (typeof ev.task_id !== 'string' || typeof ev.plan !== 'string') break;
        const key = `${ev.plan}::${ev.task_id}`;
        projection.testDepthAssignments[key] = { ...ev };
        break;
      }
      case 'review_round': {
        // review-provenance.spec.md Output Contract B: keyed on (plan, task_id, stage) with
        // last-wins, mirroring testDepthAssignments. Deliberately NOT unknownEvents[] (that
        // field is deprecated / back-compat-only) and deliberately not a lifecycle position:
        // status, currentStep and currentTask are untouched.
        if (typeof ev.task_id !== 'string' || typeof ev.plan !== 'string'
            || typeof ev.stage !== 'string') break;
        projection.reviewRounds[`${ev.plan}::${ev.task_id}::${ev.stage}`] = { ...ev };
        break;
      }
      case 'debug_intervention':
      case 'recovery_record':
      case 'manual_override': {
        projection.interventions.push(ev);
        break;
      }
      case 'partial_recovery': {
        // SA-12/CON-11: dedicated projection field, NOT folded into
        // interventions[]. Owned by lifecycle-event-log.spec.md per the
        // cross-spec contract with incremental-artifact-writes.spec.md.
        projection.partialRecoveries.push(ev);
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
    if (synthesized !== null) {
      const hadExplicitVerdict = typeof step.verdict === 'string' && (step.status === 'completed' || step.status === 'failed');
      if (!hadExplicitVerdict) {
        step.verdict = synthesized.verdict;
        step.status = synthesized.status;
      } else if (step.verdict !== synthesized.verdict || step.status !== synthesized.status) {
        step.aggregated_discrepancy = true;
        step.aggregated_synthesized = synthesized;
      }
    }

    // Per-revision aggregation — synthesize a verdict for each revision
    // bucket from its own reports if no explicit step terminal set one.
    for (const bucket of Object.values(step.byRevision)) {
      if (bucket.verdict !== null) continue;
      const bucketSynth = aggregateReports(bucket.reports);
      if (bucketSynth !== null) bucket.verdict = bucketSynth.verdict;
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
// Steps that are optional/observational and must be skipped when computing the
// gate predecessor. Per skills/build/SKILL.md the `route` step is advisory:
// "implement → gate on 'plan'  // route is optional/observational". Without
// this set, `requireGate` would block `implement` whenever `route` was never
// run (the common case), which contradicts the documented pipeline.
const OPTIONAL_GATE_STEPS = new Set(['route']);
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
/**
 * True when `stepName` participates in the gate chain (i.e. appears in
 * `STEP_ORDER`).
 *
 * Callers that map an external name (a skill, a CLI flag) onto a lifecycle
 * step MUST check this before calling `requireGate`. `priorStepOf` cannot
 * distinguish "first step" from "not a step at all" — `indexOf` returns 0 for
 * `specify` and -1 for an unknown name, and both satisfy `idx <= 0`, so an
 * unknown step yields a null predecessor and the gate passes unconditionally.
 * That is how `brainstorm` and `retro` sat in the CLI's skill→step map as
 * silent no-op gates.
 *
 * @param {string} stepName
 * @returns {boolean}
 */
export function isGatedStep(stepName) {
  return STEP_ORDER.includes(stepName);
}

function priorStepOf(stepName) {
  const idx = STEP_ORDER.indexOf(stepName);
  // NOTE: idx === -1 (unknown step) also lands here and returns null. That is
  // intentional for backward compatibility with callers that pass
  // non-lifecycle steps, but it means an unknown step does NOT gate. Callers
  // must use `isGatedStep` to reject unknown names before this point.
  if (idx <= 0) return null;
  let i = idx - 1;
  while (i > 0 && OPTIONAL_GATE_STEPS.has(STEP_ORDER[i])) i--;
  return STEP_ORDER[i];
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
