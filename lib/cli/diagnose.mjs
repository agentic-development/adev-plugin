// lib/cli/diagnose.mjs
//
// `adev diagnose` — on-demand CLI surface over the diagnostic registry.
//
// This helper is the entry point for deterministic artifact verification.
// It iterates `governance/diagnostics.yaml`, optionally filtered by
// `--spec`, `--tier`, `--only`, and emits either human-readable output
// (default) or stable JSON (`--json`) for tool consumption.
//
// Authority: .context-index/specs/features/cli-driver-surface/adev-diagnose-cli.spec.md
//
// Exit codes follow the hook protocol:
//   0  no error-severity diagnostics fired (or only warnings, no --strict-warnings)
//   1  fatal usage error (bad path, unknown tier, no valid IDs after --only filter)
//   2  one or more error-severity diagnostics fired
//       (or warning-severity with --strict-warnings)
//
// NOTE: diagnose.mjs does NOT export LIFECYCLE_STEP — diagnose is a query
// primitive over the registry, not a lifecycle step that mutates state.
//
// ── Stable JSON schema (schema_version: "1") ────────────────────────────────
//
// When invoked with `--json`, stdout is a single JSON object matching:
//
//   {
//     "schema_version": "1",                          // string, locked
//     "fired": [                                      // array of verdicts
//       {
//         "id": "adev/<aspect>",                      // string
//         "severity": "info|warning|error",           // string
//         "message": "redacted human text",           // string
//         "citation": "path:line" | null,             // optional
//         "spec": ".context-index/...spec.md" | null, // optional, present when --spec scoped
//         "runner_path": "/abs/plugin/lib/...mjs"     // string, plugin/project root absolute
//       }
//     ],
//     "skipped": [                                    // array of filter-rejected entries
//       { "id": "adev/<id>", "reason": "tier mismatch (...)" }
//     ],
//     "errors": [                                     // array of registry-level errors
//       { "id": "adev/registry-missing", "message": "..." }
//     ],
//     "summary": {
//       "total_fired": <int>,
//       "by_severity": { "info": <int>, "warning": <int>, "error": <int> },
//       "exit_code": <int>                            // matches process exit
//     }
//   }
//
// Top-level key order is fixed (schema_version → fired → skipped → errors →
// summary). Within each `fired` entry, severities are sorted error → warning
// → info, then by id, then by spec. Changing this schema requires bumping
// schema_version AND regenerating the golden snapshot under
// tests/cli/fixtures/diagnose/expected.json.

import { parseArgs } from "node:util";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

import { runDiagnostics, loadRegistry } from "../diagnostics/index.mjs";
import { parseYaml } from "../profiles/yaml.mjs";

// Stable schema constant — bump when the JSON shape changes.
const SCHEMA_VERSION = "1";

// ANSI escapes — inline per Constitution Principle 1 (no chalk/kleur).
const ANSI = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

const USAGE = "usage: adev diagnose [--spec <path>] [--tier 1|2|3[,...]] [--only <id>[,...]] [--json] [--quiet] [--strict-warnings]";

/**
 * Parse argv into a normalised options object. Returns `{ ok: true, opts }`
 * on success or `{ ok: false, error }` on usage error.
 *
 * @param {string[]} argv
 */
function parseDiagnoseArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        tier: { type: "string" },
        only: { type: "string" },
        json: { type: "boolean", default: false },
        quiet: { type: "boolean", default: false },
        "strict-warnings": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const v = parsed.values;
  const opts = {
    spec: v.spec ?? null,
    tiers: null, // array of ints
    only: null, // array of strings
    json: !!v.json,
    quiet: !!v.quiet,
    strictWarnings: !!v["strict-warnings"],
    help: !!v.help,
  };

  // Tier parse + validation.
  if (typeof v.tier === "string" && v.tier.length > 0) {
    const parts = v.tier.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    const tiers = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 1 || n > 3) {
        return { ok: false, error: `invalid tier value: ${JSON.stringify(p)} (must be 1, 2, or 3)` };
      }
      tiers.push(n);
    }
    if (tiers.length === 0) {
      return { ok: false, error: `--tier requires at least one value` };
    }
    opts.tiers = tiers;
  }

  // --only parse.
  if (typeof v.only === "string" && v.only.length > 0) {
    const ids = v.only.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (ids.length === 0) {
      return { ok: false, error: `--only requires at least one id` };
    }
    opts.only = ids;
  }

  return { ok: true, opts };
}

/**
 * Validate that `spec` (when present) resolves under `projectRoot` and the
 * file exists. Returns the absolute resolved path on success, or null with
 * a written-to-stderr error message on failure.
 */
function resolveSpecOrExit(spec, projectRoot) {
  if (spec == null) return { resolved: null };
  const absRoot = resolve(projectRoot);
  const abs = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!abs.startsWith(absRoot + sep) && abs !== absRoot) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(abs)) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  return { resolved: abs };
}

/**
 * Filter --only IDs against the registry. Unknown IDs emit a warning to
 * stderr; if no valid IDs remain after filtering, exits 1.
 */
async function validateOnlyOrExit(only, projectRoot) {
  if (only == null) return null;
  const registry = await loadRegistry(projectRoot);
  const knownIds = new Set(registry.entries.map((e) => e.id));
  const validIds = [];
  for (const id of only) {
    if (knownIds.has(id)) {
      validIds.push(id);
    } else {
      console.error(`unknown diagnostic id: ${id}`);
    }
  }
  if (validIds.length === 0) {
    process.exit(1);
  }
  return validIds;
}

/**
 * Compute the exit code given a result envelope and --strict-warnings flag.
 * 2 if any fired entry has severity 'error', or if --strict-warnings AND any
 * fired entry has severity 'warning'. 0 otherwise.
 *
 * Registry-level errors live in `result.errors` and use the entry's declared
 * severity. They participate in the exit-code calculation symmetrically.
 */
function computeExitCode(envelope, strictWarnings) {
  const fired = envelope.fired ?? [];
  const errors = envelope.errors ?? [];

  // Combined view: every surfaced finding with severity.
  let hasError = false;
  let hasWarning = false;
  for (const e of fired) {
    if (e.severity === "error") hasError = true;
    else if (e.severity === "warning") hasWarning = true;
  }
  for (const e of errors) {
    if (e.severity === "error") hasError = true;
    else if (e.severity === "warning") hasWarning = true;
  }

  if (hasError) return 2;
  if (hasWarning && strictWarnings) return 2;
  return 0;
}

/**
 * Build the stable JSON envelope. Key order is explicit (not iteration) to
 * keep golden snapshots stable.
 */
function formatJson(envelope, exitCode) {
  const fired = [...(envelope.fired ?? [])];
  fired.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    const specA = a.spec ?? "";
    const specB = b.spec ?? "";
    if (specA !== specB) return specA < specB ? -1 : 1;
    return 0;
  });

  // Compose each fired entry with a stable key order.
  const firedOut = fired.map((f) => ({
    id: f.id,
    severity: f.severity,
    message: f.message ?? "",
    citation: f.citation ?? null,
    spec: f.spec ?? null,
    runner_path: f.runner_path ?? "",
  }));

  const skippedOut = (envelope.skipped ?? []).map((s) => ({
    id: s.id,
    reason: s.reason,
  }));

  const errorsOut = (envelope.errors ?? []).map((e) => ({
    id: e.id,
    severity: e.severity ?? "error",
    message: e.message ?? "",
  }));

  const by_severity = { info: 0, warning: 0, error: 0 };
  for (const f of firedOut) {
    if (f.severity in by_severity) by_severity[f.severity]++;
  }
  const summary = {
    total_fired: firedOut.length,
    by_severity,
    exit_code: exitCode,
  };

  // Top-level key order: schema_version, fired, skipped, errors, summary.
  const out = {
    schema_version: SCHEMA_VERSION,
    fired: firedOut,
    skipped: skippedOut,
    errors: errorsOut,
    summary,
  };
  return JSON.stringify(out, null, 2);
}

/**
 * Format human-readable output. Registry-level errors are printed first
 * (Behavior 11). Within firings, group by spec then by severity order
 * (error → warning → info). Info rows are suppressed under --quiet.
 *
 * Each firing line is colored by severity via inline ANSI escapes:
 *   error   → red
 *   warning → yellow
 *   info    → cyan
 */
export function formatHuman(envelope, { quiet } = {}) {
  const lines = [];

  // Registry entries at `info` severity are OBSERVABILITY, not verdicts —
  // `adev/diagnostic-slow` is the standing example: it reports that a producer
  // exceeded its soft timing budget, which is a property of the machine, not of
  // the artifacts under inspection. `lib/lifecycle-state.mjs` already excludes
  // it from `diagnostic_warnings` for the same reason ("observability-only
  // severity"). They are still printed, but they must not suppress the success
  // line: otherwise a loaded machine silently converts a clean run into one
  // that appears to have findings. Under `--quiet` they are dropped entirely,
  // matching how info-severity firings are treated below.
  const registryEntries = (envelope.errors ?? []).filter(
    (e) => !(quiet && e.severity === "info"),
  );
  const semanticEntries = (envelope.errors ?? []).filter((e) => e.severity !== "info");

  // Registry-level errors at the TOP.
  for (const e of registryEntries) {
    const color = e.severity === "error" ? ANSI.red : e.severity === "warning" ? ANSI.yellow : ANSI.cyan;
    lines.push(`${color}[registry-error]${ANSI.reset} ${e.id}: ${e.message}`);
  }

  // Sort and group firings by spec then severity.
  const fired = (envelope.fired ?? []).filter((f) => !(quiet && f.severity === "info"));
  if (fired.length === 0 && semanticEntries.length === 0) {
    lines.push("All checks passed.");
    return lines.join("\n");
  }

  // Group by spec (null spec → "workspace" bucket).
  const groups = new Map();
  for (const f of fired) {
    const key = f.spec ?? "<workspace>";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  // Stable group iteration: sort spec keys, then within-group sort by
  // severity → id.
  const sortedSpecs = [...groups.keys()].sort();
  for (const specKey of sortedSpecs) {
    if (sortedSpecs.length > 1 || specKey !== "<workspace>") {
      lines.push("");
      lines.push(specKey === "<workspace>" ? "(workspace)" : specKey);
    }
    const entries = groups.get(specKey);
    entries.sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 99;
      const sb = SEVERITY_ORDER[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (const f of entries) {
      const color = f.severity === "error" ? ANSI.red : f.severity === "warning" ? ANSI.yellow : ANSI.cyan;
      const cite = f.citation ? ` (${f.citation})` : "";
      lines.push(`  ${color}${f.severity}${ANSI.reset} ${f.id}: ${f.message}${cite}`);
    }
  }

  // Footer: counts.
  let errCount = 0;
  let warnCount = 0;
  let infoCount = 0;
  for (const f of fired) {
    if (f.severity === "error") errCount++;
    else if (f.severity === "warning") warnCount++;
    else if (f.severity === "info") infoCount++;
  }
  if (fired.length > 0) {
    lines.push("");
    lines.push(`${fired.length} finding(s) total, ${errCount} error(s), ${warnCount} warning(s), ${infoCount} info`);
  }

  return lines.join("\n");
}

/**
 * Recursively walk a directory and return every file whose name ends with
 * `.spec.md`. Used by Behavior 1 — bare `adev diagnose` iterates every
 * spec in `.context-index/specs/features/`. Returns project-root-relative
 * paths to keep the human-output and JSON `spec:` field portable.
 *
 * Returns an empty array if the root doesn't exist (e.g., before /adev:init).
 */
function enumerateSpecs(projectRoot) {
  const root = resolve(projectRoot);
  const specsDir = join(root, ".context-index", "specs", "features");
  const results = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (name.endsWith(".spec.md")) {
        results.push(full.slice(root.length + 1)); // root-relative
      }
    }
  };
  walk(specsDir);
  // Stable order — sort lexically so JSON snapshots and human output are
  // deterministic regardless of filesystem readdir order.
  results.sort();
  return results;
}

/**
 * Iterate over the registry's tier set (and, when `spec` is null, every
 * spec under `.context-index/specs/features/`), calling `runDiagnostics`
 * per (spec, tier) pair and accumulating results.
 *
 * We do NOT pass `scope` to the engine: the spec wants ALL diagnostics
 * matching the tier filter regardless of their declared scope. (The
 * engine's `scope` filter is for the appendEvent hook, which only wants
 * `event-impact`.)
 *
 * Returns a merged envelope `{ fired, skipped, errors }`.
 */
async function runAcrossTiers({ projectRoot, spec, tiers, only }) {
  const merged = { fired: [], skipped: [], errors: [] };
  const effectiveTiers = tiers ?? [1, 2, 3];

  // When --spec is supplied, run once per (spec, tier). When not, iterate
  // every discoverable spec file. Behavior 1 mandates project-wide iteration
  // for the bare invocation.
  const specs = spec ? [spec] : enumerateSpecs(projectRoot);

  // If no specs exist on disk (e.g., uninitialised project), fall back to
  // a single null-spec pass — workspace-scoped producers can still run, and
  // registry-level errors still surface.
  const specIter = specs.length > 0 ? specs : [null];

  // Track errors seen at the registry level — they repeat per (spec, tier)
  // pass. Deduplicate by (id, message) to avoid showing the same
  // registry-missing warning N×M times.
  const seenErrorKeys = new Set();

  for (const s of specIter) {
    for (const tier of effectiveTiers) {
      const r = await runDiagnostics({
        projectRoot,
        spec: s ?? undefined,
        tier,
        only: only ?? undefined,
      });
      for (const f of r.fired) {
        // Annotate the firing with the spec context so human output groups
        // correctly. Engine doesn't currently set this field.
        if (s && f.spec == null) f.spec = s;
        merged.fired.push(f);
      }
      for (const sk of r.skipped) merged.skipped.push(sk);
      for (const e of r.errors) {
        const key = `${e.id}|${e.message}`;
        if (!seenErrorKeys.has(key)) {
          seenErrorKeys.add(key);
          merged.errors.push(e);
        }
      }
    }
  }
  return merged;
}

/**
 * Main verb entry. Exits 0 / 1 / 2 per spec.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string[]} args.argv
 */
export async function run({ projectRoot, argv }) {
  const parsed = parseDiagnoseArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(USAGE);
    process.exit(1);
  }
  const opts = parsed.opts;

  if (opts.help) {
    help({ projectRoot });
    process.exit(0);
  }

  // --json + --quiet conflict: warn on stderr, ignore --quiet, proceed.
  if (opts.json && opts.quiet) {
    console.error("warning: --quiet is ignored in --json mode");
    opts.quiet = false;
  }

  // Path containment + existence for --spec (Behavior 2 / Error Cases row 1).
  // We discard the resolved absolute path — the engine re-resolves on its
  // own — but the side effect (exit 1 on out-of-bounds or missing file) is
  // load-bearing here so the engine never sees an unsafe path.
  resolveSpecOrExit(opts.spec, projectRoot);

  // --only validation (Error Cases row 3).
  // The spec keeps the relative path for downstream context; the engine
  // resolves on its own. We pass the relative form (as supplied) so that
  // human output groups stay readable.
  const specForRun = opts.spec ?? null;

  let filteredOnly;
  let envelope;
  try {
    filteredOnly = await validateOnlyOrExit(opts.only, projectRoot);
    envelope = await runAcrossTiers({
      projectRoot,
      spec: specForRun,
      tiers: opts.tiers,
      only: filteredOnly,
    });
  } catch (err) {
    // `REGISTRY_NOT_MATERIALIZED` is the only throw the engine raises rather
    // than degrading into a self-diagnostic (see `loadRegistry`): it means the
    // set on disk is not known to be the whole set, and running an unknown
    // fraction of the diagnostics would be worse than not running them. Print
    // the one-line remedy, not a stack.
    if (err?.code !== "REGISTRY_NOT_MATERIALIZED") throw err;
    console.error(err.message);
    process.exit(1);
  }

  const exitCode = computeExitCode(envelope, opts.strictWarnings);

  if (opts.json) {
    // stdout JSON-only — stderr is reserved for non-JSON warnings (already
    // emitted above for --only unknowns and --quiet conflict).
    process.stdout.write(formatJson(envelope, exitCode) + "\n");
  } else {
    process.stdout.write(formatHuman(envelope, { quiet: opts.quiet }) + "\n");
  }

  process.exit(exitCode);
}

/**
 * Print usage + flag descriptions + examples + registered diagnostic IDs.
 *
 * SYNCHRONOUS by contract — the dispatcher in cli/index.mjs calls
 * `mod.help()` synchronously then `process.exit(0)` immediately after,
 * so any pending async work would be silently dropped. The registry is
 * read via direct synchronous YAML parse rather than through
 * `loadRegistry()` (which is async by signature).
 *
 * If the registry is missing or unparseable, a fallback notice is printed
 * and help continues. Help never throws — usage info must reach the user
 * even when project context is broken.
 */
export function help({ projectRoot } = {}) {
  const lines = [];
  lines.push(USAGE);
  lines.push("");
  lines.push("Run registered diagnostics over the project's lifecycle artifacts.");
  lines.push("");
  lines.push("Flags:");
  lines.push("  --spec <path>        Scope diagnostics to a single spec file (path must be under project root).");
  lines.push("  --tier <1|2|3[,..]>  Restrict to tier(s). Default: all tiers.");
  lines.push("  --only <id[,..]>     Run only the listed diagnostic IDs.");
  lines.push("  --json               Emit stable JSON envelope on stdout.");
  lines.push("  --quiet              Suppress info-severity firings in human output (ignored in --json).");
  lines.push("  --strict-warnings    Treat warning-severity firings as exit-2 (like errors).");
  lines.push("  --help               Print this message.");
  lines.push("");
  lines.push("Exit codes:");
  lines.push("  0  no error-severity diagnostics fired");
  lines.push("  1  usage error or unresolved spec/--only filter");
  lines.push("  2  one or more error-severity diagnostics fired (or warning with --strict-warnings)");
  lines.push("");
  lines.push("Examples:");
  lines.push("  adev diagnose");
  lines.push("  adev diagnose --tier 1");
  lines.push("  adev diagnose --spec .context-index/specs/features/m/x.spec.md --json");
  lines.push("");
  lines.push("Registered diagnostics:");

  const root = projectRoot ?? process.cwd();
  const registryPath = join(root, ".context-index", "governance", "diagnostics.yaml");

  if (!existsSync(registryPath)) {
    lines.push("  (registry unavailable: governance/diagnostics.yaml not found)");
    console.log(lines.join("\n"));
    return;
  }

  let parsed;
  try {
    parsed = parseYaml(readFileSync(registryPath, "utf8"));
  } catch (err) {
    lines.push(`  (registry unavailable: parse error: ${err.message})`);
    console.log(lines.join("\n"));
    return;
  }

  const entries = Array.isArray(parsed?.diagnostics) ? parsed.diagnostics : [];
  if (entries.length === 0) {
    lines.push("  (no entries registered)");
    console.log(lines.join("\n"));
    return;
  }

  // Group by tier (1, 2, 3); within tier, sort by ID. Entries with
  // unrecognized tier values (out-of-spec) are skipped silently here —
  // the diagnostic engine emits its own SCHEMA_INVALID error at run time.
  const byTier = new Map([[1, []], [2, []], [3, []]]);
  for (const e of entries) {
    if (e && typeof e === "object" && byTier.has(e.tier)) byTier.get(e.tier).push(e);
  }
  for (const [tier, group] of byTier) {
    if (group.length === 0) continue;
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    lines.push(`  Tier ${tier}:`);
    for (const e of group) {
      const severity = e.severity ?? "?";
      const scope = e.scope ?? "?";
      lines.push(`    ${e.id} (${severity}, scope: ${scope})`);
    }
  }
  console.log(lines.join("\n"));
}
