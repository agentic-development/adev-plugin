// lib/cli/cost.mjs
//
// `adev cost summary` — CLI surface for the cost-summary aggregator
// (.context-index/specs/features/session-awareness/cost-ticker.spec.md).
//
// Wraps `aggregate()` from lib/cost-summary.mjs with `formatText` /
// `formatJson` from lib/cost-formatters.mjs. Handles arg parsing
// (Behaviors 1, 5, 6, 7, 11, 12), ADEV_BUILD_TICKER stderr routing
// (Behavior 7), and the optional `build.cost_warn_usd` threshold check
// (Behavior 11).
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP. The cost summary is a read-only
//     observational helper invoked from /adev:build prose; it is not
//     itself a lifecycle-step entry/exit.
//
// Exit codes:
//   0  success (including no-data paths)
//   1  argument error — CONFLICTING_FILTERS, INVALID_FORMAT,
//      INVALID_SINCE, INVALID_SPEC_PATH, unknown flag
//
// CLI surface:
//   adev cost summary --spec <path>           [--format text|json]
//                                              [--include-checkpoints]
//                                              [--quiet]
//                                              [--since <iso8601>]
//   adev cost summary --epic <id>             [<other flags...>]
//   adev cost summary --help

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { resolveContained } from "../path-safety.mjs";

import { aggregate } from "../cost-summary.mjs";
import { formatText, formatJson } from "../cost-formatters.mjs";
import { loadManifest } from "../manifest.mjs";

const USAGE =
  "usage: adev cost summary [--spec <path> | --epic <id>] " +
  "[--format text|json] [--include-checkpoints] [--quiet] [--since <iso8601>]";

/**
 * Read `build.cost_warn_usd` from manifest. Returns:
 *   - { threshold: number, valid: true } when finite & positive
 *   - { threshold: null, valid: false } when present but invalid (non-numeric
 *     or non-positive) — caller emits the "ignored" advisory line
 *   - { threshold: null, valid: true } when absent — caller skips the check
 *
 * @param {object|null} manifest
 * @returns {{ threshold: number|null, valid: boolean, present: boolean }}
 */
function resolveCostWarn(manifest) {
  const raw = manifest?.build?.cost_warn_usd;
  if (raw === undefined || raw === null) {
    return { threshold: null, valid: true, present: false };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { threshold: null, valid: false, present: true };
  }
  return { threshold: n, valid: true, present: true };
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub !== "summary") {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub} (expected 'summary')`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: "string" },
        epic: { type: "string" },
        format: { type: "string", default: "text" },
        "include-checkpoints": { type: "boolean", default: false },
        quiet: { type: "boolean", default: false },
        since: { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  // Mutual exclusion: --spec and --epic.
  if (v.spec && v.epic) {
    console.error("error: --spec and --epic are mutually exclusive (CONFLICTING_FILTERS)");
    process.exit(1);
  }

  // --format validation.
  if (v.format !== "text" && v.format !== "json") {
    console.error(`error: --format must be 'text' or 'json' (INVALID_FORMAT)`);
    process.exit(1);
  }

  // --since validation (only when explicitly passed).
  if (v.since !== undefined) {
    const t = Date.parse(v.since);
    if (Number.isNaN(t)) {
      console.error(`error: --since '${v.since}' is not a valid ISO-8601 timestamp (INVALID_SINCE)`);
      process.exit(1);
    }
  }

  const absRoot = resolve(projectRoot);

  // --spec containment + existence check.
  let specArg = null;
  if (v.spec) {
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`error: spec path outside project root (INVALID_SPEC_PATH)`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`error: spec not found at '${v.spec}' (INVALID_SPEC_PATH)`);
      process.exit(1);
    }
    // Normalize to project-relative for the aggregator (slugFromSpec
    // expects a path that ends with .spec.md; relative is fine).
    specArg = isAbsolute(v.spec)
      ? absSpec.startsWith(absRoot + sep)
        ? absSpec.slice(absRoot.length + 1)
        : v.spec
      : v.spec;
  }

  // Resolve manifest (the dispatcher passes one but it may be null when
  // manifest.yaml is missing). For the cost-warn check we need a fresh
  // read so test fixtures that overwrite manifest.yaml inside the temp
  // root see their values.
  let resolvedManifest = manifest;
  try {
    resolvedManifest = loadManifest(absRoot);
  } catch {
    // manifest may legitimately not exist
    if (resolvedManifest === undefined) resolvedManifest = null;
  }

  // Resolve `since`:
  //   - explicit string → forward to aggregator (which re-parses)
  //   - undefined → let aggregator apply the default review:started cutoff
  //     (Behavior 6). Caller does not see `null` semantics from the CLI.
  const sinceArg = v.since === undefined ? undefined : v.since;

  let agg;
  try {
    agg = await aggregate({
      projectRoot: absRoot,
      specPath: specArg,
      epicId: v.epic ?? null,
      since: sinceArg,
    });
  } catch (err) {
    console.error(`error: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  // Build output channel routing per Behavior 7.
  const tickerMode = process.env.ADEV_BUILD_TICKER === "1";
  const writeMain = (s) => {
    if (tickerMode) process.stderr.write(`[cost] ${s}\n`);
    else process.stdout.write(`${s}\n`);
  };
  const writeStderr = (s) => process.stderr.write(`${s}\n`);

  // Cost-warn advisory check (Behavior 11) — runs only with a spec filter.
  const warn = resolveCostWarn(resolvedManifest);
  if (warn.present && !warn.valid) {
    writeStderr("[cost warn] manifest build.cost_warn_usd is invalid, ignored");
  }

  // --quiet with no data → exit silently.
  const noData = agg?.totals == null;
  if (v.quiet && noData) {
    process.exit(0);
  }

  // Emit primary output unless --quiet (which suppresses informational
  // text but still allows the cost-warn line to surface).
  if (!v.quiet) {
    if (v.format === "json") {
      writeMain(formatJson(agg));
    } else {
      writeMain(formatText(agg, { includeCheckpoints: v["include-checkpoints"] }));
    }
  }

  // Skipped-lines stderr note (text only; JSON includes the field).
  if (v.format === "text" && agg && Number(agg.skipped_lines) > 0) {
    writeStderr(`(note: skipped ${agg.skipped_lines} malformed lines)`);
  }

  // Cost-warn threshold crossing (Behavior 11). Sticky-per-build dedup
  // lives in /adev:build prose per SA-1 resolution — the verb itself
  // emits the line on every crossing.
  if (warn.valid && warn.threshold !== null && agg?.totals?.cost_usd >= warn.threshold) {
    const costStr = (Number(agg.totals.cost_usd) || 0).toFixed(2);
    const thrStr = Number(warn.threshold).toString();
    writeStderr(`[cost warn] spec cost $${costStr} exceeds threshold $${thrStr}`);
  }

  process.exit(0);
}

export function help() {
  console.log("Usage: adev cost summary [--spec <path> | --epic <id>] [options]");
  console.log("");
  console.log("Aggregate per-spec / per-step token + USD totals from");
  console.log(".context-index/.session-tracking.jsonl and emit a one-line");
  console.log("summary (text) or JSON object (Behavior 3 schema).");
  console.log("");
  console.log("Options:");
  console.log("  --spec <path>            Filter by spec_ref (mutually exclusive with --epic)");
  console.log("  --epic <id>              Filter by epic membership (mutually exclusive with --spec)");
  console.log("  --format text|json       Output format (default: text)");
  console.log("  --include-checkpoints    Append per-step table (text format only)");
  console.log("  --quiet                  Suppress output when totals are null");
  console.log("  --since <iso8601>        Filter entries to timestamp >= since");
  console.log("                           (default: most recent review:started for the spec)");
  console.log("");
  console.log("Environment:");
  console.log("  ADEV_BUILD_TICKER=1      Route output to stderr with '[cost] ' prefix");
  console.log("");
  console.log("Manifest integration:");
  console.log("  build.cost_warn_usd: <N> Emit '[cost warn]' stderr line when total");
  console.log("                           cost_usd >= N (non-blocking advisory)");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success (including no-data paths)");
  console.log("  1  CONFLICTING_FILTERS, INVALID_FORMAT, INVALID_SINCE, INVALID_SPEC_PATH");
}

export default { run, help };
