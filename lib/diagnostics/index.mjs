/**
 * Diagnostic registry engine — `runDiagnostics` + `loadRegistry`.
 *
 * Loads `governance/diagnostics.yaml`, validates each entry against the
 * registry schema, resolves runner paths under a strict four-step
 * containment guard, and dispatches the surviving runners with a hard
 * `Promise.race` timeout and message-redaction normalisation.
 *
 * Authoritative behavior contract lives in
 * `.context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md`
 * rev 2. The four behaviors that justify the structure of this module:
 *
 *   - Behavior 2 (rev 2 strengthened): runner-path containment — `..`
 *     rejection on raw input → prefix-scoped allowlist roots → realpath
 *     resolution → per-root containment with cross-root deputy rejection.
 *     Pure string-prefix containment is explicitly forbidden by the spec.
 *   - Behavior 3 (rev 2): message redaction — every surfaced string is
 *     normalised so absolute paths become `project:` / `plugin:` / `~/...`
 *     / `<external-path-redacted>`. Stack traces never reach `errors[].message`.
 *   - Behavior 5 (rev 2): two-stage timing — soft `adev/diagnostic-slow`
 *     at 200 ms, hard `Promise.race` timeout at 500 ms emitting
 *     `adev/diagnostic-timeout`.
 *   - Error case (rev 2 amendment 13): duplicate IDs are first-wins, not
 *     last-wins, so bundled `plugin:` entries cannot be silently shadowed.
 *
 * Zero external dependencies. Uses only `node:fs`, `node:path`, `node:os`,
 * and the in-tree `parseYaml` helper.
 *
 * @module lib/diagnostics
 */

import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, sep, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveEnablement } from '../governance/enablement.mjs';
import { assertMaterialized } from '../governance/registry-marker.mjs';
import { parseYaml } from '../profiles/yaml.mjs';

// ── Module-level constants ──────────────────────────────────────────────────

/** Soft observability threshold — runners exceeding this emit `adev/diagnostic-slow`. */
const SOFT_TIMING_BUDGET_MS = 200;
/** Hard timeout — runner is abandoned and `adev/diagnostic-timeout` fires. */
const HARD_TIMEOUT_MS = 500;

/** Legal `severity` values for a registry entry. */
const VALID_SEVERITIES = new Set(['info', 'warning', 'error']);
/** Legal `tier` values for a registry entry. */
const VALID_TIERS = new Set([1, 2, 3]);
/** Legal `scope` values for a registry entry. */
const VALID_SCOPES = new Set(['event-impact', 'spec', 'workspace']);

/**
 * The plugin root containing this file — used to resolve `plugin:<rel>`
 * runner prefixes. Derived from `import.meta.url` so the engine works
 * regardless of how the package is installed (linked, hoisted, etc).
 *
 * `<thisFile>/../../` → `<thisFile>` is `lib/diagnostics/index.mjs`, so
 * two `..` steps gives the plugin root.
 */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Path containment guard (Behavior 2, rev 2 strengthened) ─────────────────

/**
 * Step A: reject any raw runner string containing a `..` path component.
 *
 * Pure string check — runs BEFORE any path resolution, so `../../etc/passwd`
 * and `plugin:../../etc/passwd` are both rejected before they touch the
 * filesystem. The check splits on both forward slash AND `path.sep` because
 * a Windows-style runner string on a POSIX host should still trip it.
 */
function containsDotDot(raw) {
  return raw.split(/[/\\]/).some((seg) => seg === '..');
}

/**
 * Step B–D combined: resolve a runner spec to a real absolute path under
 * one of the two allowlist roots, or throw a SCHEMA_INVALID-coded error.
 *
 * Returns `{ realRunner }` on success.
 *
 * @param {string} raw - The runner spec from `governance/diagnostics.yaml`.
 * @param {object} roots - `{ realPluginDiagRoot, realProjectDiagRoot }`.
 * @returns {{ realRunner: string }}
 * @throws Error with `code === 'SCHEMA_INVALID'`.
 */
export function resolveRunnerContained(raw, roots) {
  // Step A: raw `..` rejection.
  if (typeof raw !== 'string' || raw.length === 0) {
    throw mkSchemaErr(`runner must be a non-empty string (got ${JSON.stringify(raw)})`);
  }
  if (containsDotDot(raw)) {
    throw mkSchemaErr(`runner contains "..": ${raw}`);
  }

  // Step B: per-root allowlist via explicit prefix.
  let candidate;
  if (raw.startsWith('plugin:')) {
    const rel = raw.slice('plugin:'.length);
    if (rel.length === 0 || rel.startsWith('/')) {
      throw mkSchemaErr(`plugin: prefix requires a relative path (got ${JSON.stringify(raw)})`);
    }
    candidate = resolve(roots.realPluginDiagRoot, rel);
  } else if (raw.startsWith('project:')) {
    const rel = raw.slice('project:'.length);
    if (rel.length === 0 || rel.startsWith('/')) {
      throw mkSchemaErr(`project: prefix requires a relative path (got ${JSON.stringify(raw)})`);
    }
    candidate = resolve(roots.realProjectDiagRoot, rel);
  } else {
    // Absolute paths and unprefixed relative paths both rejected per
    // spec Behavior 2 Step B. The narrow allowlist prefixes are the
    // only way in.
    throw mkSchemaErr(`runner must start with "plugin:" or "project:" prefix (got ${JSON.stringify(raw)})`);
  }

  // Step C: realpathSync on the candidate.
  let realRunner;
  try {
    realRunner = realpathSync(candidate);
  } catch (err) {
    throw mkSchemaErr(`runner path failed containment: ${raw}`);
  }

  // Step D: per-root containment check. The runner must be contained in
  // EXACTLY ONE allowlist root. The "both" case is the cross-root
  // confused-deputy scenario (one realpath descends from the other) and
  // is explicitly forbidden.
  const inPlugin = isUnder(realRunner, roots.realPluginDiagRoot);
  const inProject = isUnder(realRunner, roots.realProjectDiagRoot);
  if (inPlugin && inProject) {
    throw mkSchemaErr(`runner path failed containment: ${raw}`);
  }
  if (!inPlugin && !inProject) {
    throw mkSchemaErr(`runner path failed containment: ${raw}`);
  }
  return { realRunner };
}

/**
 * Containment predicate. Uses `path.sep` rather than a bare string-prefix
 * comparison so that `/a/foo` is NOT considered under `/a/foobar`.
 */
function isUnder(realRunner, realRoot) {
  // An ABSENT root ('' — what `loadRegistry` passes when the directory does not
  // exist) contains nothing. Without this guard `''+sep` is `/`, so every
  // absolute path read as "under" the missing root: the Step D cross-root
  // refusal then fired on every bundled `plugin:` runner in any project with no
  // `.context-index/diagnostics/` directory, and the registry loaded as zero
  // entries with one self-diagnostic per row.
  if (typeof realRoot !== 'string' || realRoot === '') return false;
  return realRunner === realRoot || realRunner.startsWith(realRoot + sep);
}

function mkSchemaErr(message) {
  const err = new Error(message);
  err.code = 'SCHEMA_INVALID';
  return err;
}

// ── Message redaction (Behavior 3) ──────────────────────────────────────────

/**
 * Normalise a free-text message so absolute paths and stack frames never
 * leak. Per Behavior 3 (rev 2 SEC-3):
 *   - paths under realProjectRoot → `project:<rel>`
 *   - paths under realPluginRoot  → `plugin:<rel>`
 *   - paths under $HOME (but outside both roots) → `~/<rel>`
 *   - any other absolute path → `<external-path-redacted>`
 *   - `at <file>:<line>:<col>` stack frame markers are stripped entirely
 *
 * The function is conservative: if redaction would lose meaning, it leaves
 * the substring alone. The goal is *no leakage*, not *no information*.
 *
 * @param {unknown} message
 * @param {object} ctx - Resolved roots.
 * @returns {string}
 */
export function normaliseMessage(message, ctx) {
  const { realProjectRoot, realPluginRoot, home } = ctx;
  if (message == null) return '';
  let s = String(message);

  // Drop stack-frame markers entirely — these are the path-leak vector.
  // V8 stack frames look like:  "    at fn (/abs/path/to/file.mjs:12:5)"
  // We collapse the whole "at ..." span up to the next newline.
  s = s.replace(/\n\s*at [^\n]*/g, '');
  // A bare "at " on its own line (no leading newline) caught here.
  s = s.replace(/^\s*at [^\n]*/gm, '');

  // Replace absolute paths in priority order: longer roots first so that a
  // pluginRoot nested inside projectRoot (rare but possible in dev setups)
  // still resolves correctly. The order here doesn't depend on string length
  // — project comes first because in the canonical install layout, the
  // plugin lives OUTSIDE projectRoot (under node_modules of some other repo).
  const roots = [
    { abs: realProjectRoot, label: 'project:' },
    { abs: realPluginRoot, label: 'plugin:' },
  ];
  for (const { abs, label } of roots) {
    if (!abs) continue;
    // Rewrite both "/abs/path" and "/abs/path/rel" forms.
    s = s.replaceAll(abs, label);
  }

  // Rewrite $HOME paths that survived the project/plugin pass.
  if (home) {
    s = s.replaceAll(home, '~');
  }

  // Anything still resembling an absolute path is external (not under the
  // project, plugin, or home). Redact to a literal sentinel so the message
  // stays human-readable.
  //
  // Path regex: a `/`-rooted run of non-whitespace, non-quote characters,
  // matching the common shapes that show up in fs errors and stack traces.
  // Conservative — we only redact when the path is clearly absolute.
  s = s.replace(/(?<![~A-Za-z:])(\/(?:[^\s"'`]+))/g, '<external-path-redacted>');

  return s;
}

// ── Timeout wrapper (Behavior 5 Stage 2) ────────────────────────────────────

/**
 * Race `promise` against a `ms`-millisecond timer. On timeout, rejects with
 * a `TimeoutError` sentinel. The original promise continues to run in the
 * event loop (JavaScript cannot truly abort a runaway without worker
 * threads, per Behavior 5's accepted-limitation clause), but the engine
 * resolves on the sentinel and moves on.
 */
function runWithTimeout(promise, ms) {
  let timerHandle;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timerHandle = setTimeout(() => {
      const err = new Error(`runner exceeded ${ms} ms hard timeout`);
      err.code = 'DIAGNOSTIC_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timerHandle)),
    timeoutPromise,
  ]);
}

// ── Schema validation for registry entries ──────────────────────────────────

/**
 * Validate a single registry entry's shape. Returns `null` on success or
 * an Error with `code === 'SCHEMA_INVALID'` describing the failure.
 *
 * Returns rather than throws so the caller can aggregate every malformed
 * entry into one `errors` array (Behavior 2: "engine does not crash on
 * registry malformation").
 */
function validateEntryShape(entry) {
  if (!entry || typeof entry !== 'object') {
    return mkSchemaErr('entry must be an object');
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    return mkSchemaErr('entry.id must be a non-empty string');
  }
  if (typeof entry.runner !== 'string' || entry.runner.length === 0) {
    return mkSchemaErr('entry.runner must be a non-empty string');
  }
  if (!VALID_SEVERITIES.has(entry.severity)) {
    return mkSchemaErr(`entry.severity must be one of ${[...VALID_SEVERITIES].join(', ')} (got ${JSON.stringify(entry.severity)})`);
  }
  if (!VALID_TIERS.has(entry.tier)) {
    return mkSchemaErr(`entry.tier must be one of ${[...VALID_TIERS].join(', ')} (got ${JSON.stringify(entry.tier)})`);
  }
  if (!VALID_SCOPES.has(entry.scope)) {
    return mkSchemaErr(`entry.scope must be one of ${[...VALID_SCOPES].join(', ')} (got ${JSON.stringify(entry.scope)})`);
  }
  return null;
}

// ── loadRegistry ────────────────────────────────────────────────────────────

/**
 * Load and validate `governance/diagnostics.yaml`.
 *
 * Returns `{ entries, disabled, warnings, errors, missing }`:
 *   - `entries`: the surviving validated entries, each annotated with
 *     `runner_path` (the resolved absolute path under one allowlist root).
 *     Entries carrying `enabled: false` are INCLUDED, without a `runner_path`,
 *     so a disabled diagnostic stays distinguishable from an absent one
 *     (Invariant 5); `runDiagnostics` skips them.
 *   - `disabled`: the same objects, filtered — the direct handle for a report.
 *   - `warnings`: `{ code, message }` schema warnings that cost nothing that
 *     runs (`DISABLED_WITHOUT_REASON`, `INVALID_ENABLED_VALUE`). Distinct from
 *     `errors`, whose members are self-DIAGNOSTICS in the surfaced vocabulary.
 *   - `errors`: self-diagnostics for malformed entries, duplicate IDs, and
 *     a missing-registry case (`adev/registry-missing`).
 *   - `missing`: `true` if `governance/diagnostics.yaml` does not exist,
 *     `false` otherwise (lets `runDiagnostics` skip the runner loop without
 *     re-checking the filesystem).
 *
 * Per Behavior 2 (rev 2): the engine NEVER crashes on registry MALFORMATION —
 * a malformed entry becomes a self-diagnostic and the engine keeps going.
 *
 * An UN-MATERIALIZED registry is a different class of state and gets the
 * opposite treatment: `diagnostics.yaml` is a marked registry (DDR-1), and
 * without its marker the rows on disk are not known to be the whole set. There
 * is no honest self-diagnostic for that — degrading to "here are some of your
 * diagnostics" is the silent under-enforcement this spec removes — so the guard
 * THROWS `REGISTRY_NOT_MATERIALIZED` and `lib/cli/diagnose.mjs` turns it into a
 * one-line exit 1 naming the remedy. Absence of the file keeps its existing
 * `adev/registry-missing` warning: nothing has been declared, so nothing can be
 * partial.
 *
 * Per amendment 13: duplicate IDs are first-wins.
 *
 * @param {string} projectRoot - Absolute or relative project root.
 * @param {object} [options]
 * @param {boolean} [options.requireMaterialized=true] - Fail closed unless the
 *   registry carries its marker. The ONLY caller passing `false` is
 *   `adev governance materialize`, which loads the registry in order to WRITE
 *   that marker; the guard would otherwise make its own remedy unreachable.
 * @returns {Promise<{
 *   entries: Array<{id: string, runner: string, severity: string, tier: number, scope: string, runner_path: string}>,
 *   errors: Array<{id: string, severity: string, message: string}>,
 *   missing: boolean
 * }>}
 */
export async function loadRegistry(projectRoot, options = {}) {
  const realProjectRoot = realpathSync(resolve(projectRoot));
  const realPluginRoot = realpathSync(PLUGIN_ROOT);
  const home = (() => {
    try { return realpathSync(homedir()); } catch { return homedir(); }
  })();
  const redactionCtx = { realProjectRoot, realPluginRoot, home };

  const registryPath = join(realProjectRoot, '.context-index', 'governance', 'diagnostics.yaml');
  if (!existsSync(registryPath)) {
    return {
      entries: [],
      disabled: [],
      warnings: [],
      errors: [{
        id: 'adev/registry-missing',
        severity: 'warning',
        message: normaliseMessage(
          `governance/diagnostics.yaml not found at ${registryPath}`,
          redactionCtx,
        ),
      }],
      missing: true,
    };
  }

  // The registry exists — so it must be able to say that what it lists is all
  // there is. Fail closed, after the absent-file branch above.
  if (options.requireMaterialized !== false) {
    assertMaterialized(registryPath, 'diagnostics');
  }

  // Parse YAML; a parse failure is itself a non-crashing registry-level
  // diagnostic (the registry exists but is unreadable).
  let parsed;
  try {
    parsed = parseYaml(readFileSync(registryPath, 'utf8'));
  } catch (err) {
    return {
      entries: [],
      disabled: [],
      warnings: [],
      errors: [{
        id: 'adev/registry-missing', // intentional reuse — caller treats this as "registry unavailable"
        severity: 'warning',
        message: normaliseMessage(`governance/diagnostics.yaml parse error: ${err.message}`, redactionCtx),
      }],
      missing: false,
    };
  }

  const rawEntries = Array.isArray(parsed?.diagnostics) ? parsed.diagnostics : [];

  // Resolve the two allowlist roots once. If realpath fails (e.g. the dir
  // doesn't exist yet) we still want the engine to function — we surface
  // every entry as containment-failure rather than crashing.
  const realPluginDiagRoot = (() => {
    try { return realpathSync(join(realPluginRoot, 'lib', 'diagnostics')); }
    catch { return null; }
  })();
  const realProjectDiagRoot = (() => {
    try { return realpathSync(join(realProjectRoot, '.context-index', 'diagnostics')); }
    catch { return null; }
  })();

  const seenIds = new Set();
  const entries = [];
  const disabled = [];
  const warnings = [];
  const errors = [];

  for (const raw of rawEntries) {
    // First-wins duplicate handling (amendment 13). Note: we still validate
    // the duplicate's shape so a malformed second-occurrence doesn't slip
    // through silently — but we emit one diagnostic per duplicate ID, not
    // both a duplicate AND a malformed warning.
    if (raw && typeof raw === 'object' && typeof raw.id === 'string' && seenIds.has(raw.id)) {
      errors.push({
        id: 'adev/diagnostic-duplicate-id',
        severity: 'warning',
        message: normaliseMessage(
          `duplicate id "${raw.id}" — first entry wins, dropped runner: ${raw.runner ?? '<unspecified>'}`,
          redactionCtx,
        ),
      });
      continue;
    }

    // Enablement, read before shape validation and before runner containment.
    // Both orderings are deliberate: a diagnostic is most often switched off
    // BECAUSE its runner no longer resolves, and validating a row that will
    // never run would make `enabled: false` unusable in exactly that case.
    //
    // The disabled row STAYS in `entries` rather than being filtered out of it.
    // It is part of the materialized effective set — `lib/governance/materialize.mjs`
    // refuses to stamp a set that dropped a declared id — and it is what makes
    // "disabled" distinguishable from "absent". `runDiagnostics` skips it.
    //
    // Note the asymmetry: an ENABLED entry is NOT annotated with `enabled: true`.
    // `materialize.mjs::projectEntry` writes every allowlisted field an entry
    // carries, so annotating would start emitting `enabled: true` into rows the
    // project never wrote. A disabled row is by definition already on disk, so
    // it is never re-emitted.
    if (raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id.length > 0) {
      const enablement = resolveEnablement(raw, { registryFile: 'diagnostics.yaml', id: raw.id });
      warnings.push(...enablement.warnings);
      if (!enablement.enabled) {
        seenIds.add(raw.id);
        const row = { id: raw.id };
        for (const field of ['runner', 'severity', 'tier', 'scope']) {
          if (raw[field] !== undefined) row[field] = raw[field];
        }
        row.enabled = false;
        row.disabled_reason = enablement.disabled_reason;
        row.disabledNote = enablement.disabledNote;
        entries.push(row);
        disabled.push(row);
        continue;
      }
    }

    const shapeErr = validateEntryShape(raw);
    if (shapeErr) {
      errors.push({
        id: raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id : 'adev/registry-entry-invalid',
        severity: 'error',
        message: normaliseMessage(`SCHEMA_INVALID: ${shapeErr.message}`, redactionCtx),
      });
      if (raw && typeof raw === 'object' && typeof raw.id === 'string') seenIds.add(raw.id);
      continue;
    }

    seenIds.add(raw.id);

    // Resolve and containment-check the runner.
    let realRunner;
    try {
      const result = resolveRunnerContained(raw.runner, {
        realPluginDiagRoot: realPluginDiagRoot ?? '',
        realProjectDiagRoot: realProjectDiagRoot ?? '',
      });
      realRunner = result.realRunner;
    } catch (err) {
      // Self-diagnostic per rev 2 SEC-1: emit adev/diagnostic-runner-invalid
      // with the RAW input (never the resolved real path) so symlink targets
      // are not leaked.
      errors.push({
        id: 'adev/diagnostic-runner-invalid',
        severity: 'error',
        message: normaliseMessage(`runner path failed containment: ${raw.runner}`, redactionCtx),
      });
      continue;
    }

    entries.push({
      id: raw.id,
      runner: raw.runner,
      severity: raw.severity,
      tier: raw.tier,
      scope: raw.scope,
      runner_path: realRunner,
    });
  }

  return { entries, disabled, warnings, errors, missing: false };
}

// ── runDiagnostics ──────────────────────────────────────────────────────────

/**
 * Run every diagnostic in the registry that matches the supplied filters.
 *
 * Filters:
 *   - `tier`: required; `1`, `2`, or `3`. Skips entries with other tiers.
 *   - `scope`: optional. When set, skips entries whose scope is broader
 *     (only `scope === <provided>` matches; spec Behavior 6).
 *   - `only`: optional array of diagnostic IDs; runs only entries with
 *     `id` in the allowlist.
 *
 * The `spec` argument is forwarded to runners. If supplied and the file
 * does not exist, the engine fires `adev/spec-not-found` and runners are
 * NOT invoked (per Error Cases table).
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} [args.spec] - Path to the spec file (optional for some scopes).
 * @param {1|2|3} args.tier
 * @param {string} [args.scope]
 * @param {string[]} [args.only]
 * @param {object} [args.event] - Event payload (forwarded to event-impact runners).
 * @returns {Promise<{ fired: Array, skipped: Array, errors: Array }>}
 */
export async function runDiagnostics(args) {
  const { projectRoot, spec, tier, scope, only, event } = args ?? {};
  if (!VALID_TIERS.has(tier)) {
    throw new Error(`runDiagnostics: tier must be one of ${[...VALID_TIERS].join(', ')} (got ${JSON.stringify(tier)})`);
  }

  const realProjectRoot = realpathSync(resolve(projectRoot));
  const realPluginRoot = realpathSync(PLUGIN_ROOT);
  const home = (() => {
    try { return realpathSync(homedir()); } catch { return homedir(); }
  })();
  const redactionCtx = { realProjectRoot, realPluginRoot, home };

  const fired = [];
  const skipped = [];
  const errors = [];

  const registry = await loadRegistry(realProjectRoot);
  // Forward registry-level errors (missing registry, malformed entries,
  // containment failures, duplicate IDs) to the caller.
  for (const e of registry.errors) errors.push(e);

  // Resolve / validate spec early if supplied. Per Error Cases, a missing
  // spec is a self-diagnostic, NOT an exception — runners are simply not
  // invoked. We still complete the engine call so the caller gets the
  // stable response shape.
  let resolvedSpec = null;
  if (typeof spec === 'string' && spec.length > 0) {
    resolvedSpec = resolve(realProjectRoot, spec);
    if (!resolvedSpec.startsWith(realProjectRoot + sep) && resolvedSpec !== realProjectRoot) {
      errors.push({
        id: 'adev/spec-not-found',
        severity: 'error',
        message: normaliseMessage(`spec resolves outside projectRoot: ${spec}`, redactionCtx),
      });
      return { fired, skipped, errors };
    }
    if (!existsSync(resolvedSpec)) {
      errors.push({
        id: 'adev/spec-not-found',
        severity: 'error',
        message: normaliseMessage(`spec not found: ${spec}`, redactionCtx),
      });
      return { fired, skipped, errors };
    }
  }

  // Dispatch every matching entry. Filters compose: tier AND (scope OR no
  // scope filter) AND (only OR no allowlist).
  for (const entry of registry.entries) {
    // Deliberately disabled (Behavior 5). Recorded in `skipped` with its stated
    // reason rather than filtered out silently, so the caller's report can say
    // "off, because …" instead of leaving it indistinguishable from a
    // diagnostic that was never declared.
    if (entry.enabled === false) {
      skipped.push({
        id: entry.id,
        reason: `disabled in governance/diagnostics.yaml${entry.disabled_reason ? `: ${entry.disabled_reason}` : " with no stated reason"}`,
      });
      continue;
    }
    if (entry.tier !== tier) {
      skipped.push({ id: entry.id, reason: `tier mismatch (entry=${entry.tier}, requested=${tier})` });
      continue;
    }
    if (typeof scope === 'string' && scope.length > 0 && entry.scope !== scope) {
      // Per Behavior 6: broader-scope skips are silent (not added to errors,
      // but we do record them in `skipped` so the caller can see what was
      // filtered out).
      skipped.push({ id: entry.id, reason: `scope mismatch (entry=${entry.scope}, requested=${scope})` });
      continue;
    }
    if (Array.isArray(only) && !only.includes(entry.id)) {
      skipped.push({ id: entry.id, reason: `not in --only allowlist` });
      continue;
    }

    // Import the runner module. Failure here is non-fatal — emit
    // adev/diagnostic-runner-missing and continue.
    let runnerMod;
    try {
      runnerMod = await import(pathToFileURL(entry.runner_path).href);
    } catch (err) {
      errors.push({
        id: 'adev/diagnostic-runner-missing',
        severity: 'warning',
        message: normaliseMessage(`runner not found: ${entry.runner} (${err.message})`, redactionCtx),
      });
      continue;
    }
    if (typeof runnerMod?.run !== 'function') {
      errors.push({
        id: 'adev/diagnostic-runner-missing',
        severity: 'warning',
        message: normaliseMessage(`runner not found: ${entry.runner} (no exported "run" function)`, redactionCtx),
      });
      continue;
    }

    // Invoke under the two-stage timing enforcement (Behavior 5).
    const ctx = { projectRoot: realProjectRoot, spec: resolvedSpec, event };
    const startedAt = Date.now();
    let verdict;
    try {
      verdict = await runWithTimeout(
        Promise.resolve().then(() => runnerMod.run(ctx)),
        HARD_TIMEOUT_MS,
      );
    } catch (err) {
      if (err && err.code === 'DIAGNOSTIC_TIMEOUT') {
        errors.push({
          id: 'adev/diagnostic-timeout',
          severity: 'error',
          message: normaliseMessage(`runner exceeded ${HARD_TIMEOUT_MS} ms hard timeout: ${entry.id}`, redactionCtx),
        });
      } else {
        // Non-timeout runtime error — surface err.message (NEVER err.stack)
        // through redaction. Stack goes to stderr in a debug-gated channel
        // not implemented here (the engine never writes to stderr).
        errors.push({
          id: entry.id,
          severity: 'warning',
          message: normaliseMessage(err?.message ?? String(err), redactionCtx),
        });
      }
      continue;
    }
    const durationMs = Date.now() - startedAt;
    if (durationMs > SOFT_TIMING_BUDGET_MS) {
      errors.push({
        id: 'adev/diagnostic-slow',
        severity: 'info',
        message: normaliseMessage(`runner exceeded ${SOFT_TIMING_BUDGET_MS} ms soft budget: ${entry.id} (took ${durationMs} ms)`, redactionCtx),
      });
    }

    if (verdict && verdict.fired === true) {
      // Annotate the verdict with the resolved runner path (rev 2 Behavior 4).
      fired.push({
        id: verdict.id ?? entry.id,
        severity: verdict.severity ?? entry.severity,
        message: normaliseMessage(verdict.message ?? '', redactionCtx),
        citation: verdict.citation,
        runner_path: entry.runner_path,
      });
    }
    // verdict.fired === false → producer ran but found nothing; not surfaced.
  }

  return { fired, skipped, errors };
}
