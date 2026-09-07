// lib/cli/implement.mjs
//
// `adev implement read-routing` — CLI surface wrapping
// lib/plan-routing-sidecar.mjs::lookupRoutingEntry so the /adev:implement
// SKILL.md names a verb instead of inlining inline-Routing-block parsing
// against the plan body (cli-driver-surface charter; CON-8 in
// plan-task-events.spec.md). The sidecar lives at <plan-stem>.routing.json
// (machine-primary JSON; rendered to markdown on demand via
// `adev route render-sidecar`).
//
// `adev implement batches` — CLI surface wrapping lib/implement/batching.mjs
// ::resolveBatches() so /adev:implement can resolve which plan tasks are
// eligible to dispatch together as a batch, versus solo, without inlining the
// eligibility gate into skill prose (batched-task-dispatch.spec.md).
//
// `adev implement resolve-depth` — CLI surface wrapping
// lib/implement/review-depth.mjs::resolveImplementReviewDepth() so
// /adev:implement can resolve the effective review depth (full|quick) for a
// single task without inlining the precedence chain + floor pass into skill
// prose (tdd-cycle-simplification plan).
//
// Subverbs:
//   adev implement read-routing --plan <plan-path> --task-id <id>
//                               [--agents-allowlist <csv>]
//   adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch] [--parallel]
//   adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id>
//                               [--tier full|quick] [--base-sha <sha>] [--pass provisional|final]
//                               [--review-cycles <n>] [--in-batch] [--had-critical-finding]
//
// Exit codes (read-routing):
//   0 success — entry printed as JSON on stdout
//   1 argument error, INVALID_PLAN_PATH, INVALID_SIDECAR_JSON
//   2 ROUTING_SIDECAR_MISSING
//   3 ROUTING_ENTRY_MISSING
//   4 ROUTING_AGENT_INVALID
//
// Exit codes (batches):
//   0 success — { batches, solo, advisories } printed as JSON on stdout
//   1 argument error, CONFLICTING_BATCH_FLAGS, INVALID_MAX_BATCH_SIZE
//   2 ROUTING_SIDECAR_MISSING
//
// Exit codes (resolve-depth):
//   0 success — resolveImplementReviewDepth() result + review_cycles printed as JSON on stdout
//   1 argument error, INVALID_REVIEW_CYCLES, INVALID_SPEC_PATH, INVALID_PLAN_PATH, INVALID_TIER
//   2 MISSING_DIFF_RANGE (final pass without --base-sha)
//   3 ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING
//
// The `--agents-allowlist` flag is optional. When supplied (comma-separated
// list of legal agent slugs), the resolved entry's `selected_agent` is
// validated against the list — if absent, ROUTING_AGENT_INVALID is raised
// without dispatching anything. When the flag is omitted, the agent slug is
// passed through unchecked (callers without an allowlist accept whatever the
// sidecar names).

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import { lookupRoutingEntry, readRoutingSidecar } from "../plan-routing-sidecar.mjs";
import { validateMaxBatchSize, validateMaxReviewCycles } from "../manifest.mjs";
import { currentState, reportReviewDepthResolved } from "../lifecycle-state.mjs";
import { resolveBatches } from "../implement/batching.mjs";
import { resolveImplementReviewDepth } from "../implement/review-depth.mjs";
import { loadRigorPolicies } from "../governance/rigor-mode.mjs";
import { readTaskFiles } from "../test-strategies/task-files.mjs";
import { parseFrontmatterFields } from "../amendment-graph.mjs";
// Reused verbatim from the sibling `adev test-policy resolve` verb, which
// already resolves these two governance path-signals for ITS floor pass. The
// review-depth floor pass consumes the same signals, so it shares the same
// readers rather than re-deriving boundary matching / sensitive-path loading.
import { boundaryCrossingFor, loadConfiguredSensitivePaths } from "./test-policy.mjs";

const USAGE =
  "usage: adev implement <read-routing|batches|resolve-depth> --plan <plan-path> [flags]";

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  switch (sub) {
    case "read-routing":
      return cmdReadRouting(argv.slice(1));
    case "batches":
      return cmdBatches(argv.slice(1), { projectRoot, manifest });
    case "resolve-depth":
      return cmdResolveDepth(argv.slice(1), { projectRoot, manifest });
    default:
      console.error(`unknown subverb: ${sub}\n${USAGE}`);
      process.exit(1);
  }
}

function cmdReadRouting(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        plan: { type: "string" },
        "task-id": { type: "string" },
        "agents-allowlist": { type: "string" },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}\n${USAGE}`);
    process.exit(1);
  }

  const planPath = parsed.values.plan;
  const taskId = parsed.values["task-id"];
  const allowlistArg = parsed.values["agents-allowlist"];

  if (!planPath) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }
  if (!taskId) {
    console.error("--task-id <id> is required");
    process.exit(1);
  }

  const allowlist = allowlistArg
    ? new Set(
        allowlistArg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  let entry;
  try {
    entry = lookupRoutingEntry(planPath, taskId);
  } catch (err) {
    const code = err && err.code;
    if (code === "ROUTING_SIDECAR_MISSING") {
      console.error(err.message);
      process.exit(2);
    }
    if (code === "ROUTING_ENTRY_MISSING") {
      console.error(err.message);
      process.exit(3);
    }
    if (code === "INVALID_PLAN_PATH" || code === "INVALID_SIDECAR_JSON") {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  if (allowlist && !allowlist.has(entry.selected_agent)) {
    console.error(
      `ROUTING_AGENT_INVALID: '${entry.selected_agent}' for task ${taskId} is not in allowlist (${[...allowlist].join(", ")}) — re-run /adev:route`,
    );
    process.exit(4);
  }

  console.log(JSON.stringify(entry));
  process.exit(0);
}

const BATCHES_USAGE =
  "usage: adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch] [--parallel]";

/**
 * Extract the spec path from a plan's `> **Spec:** <path> (revision N)`
 * header line, if present. Returns null when the line is absent or
 * unparseable — the caller degrades gracefully rather than treating this as
 * fatal (Behavior E / abort-carry-forward is an optional refinement, not a
 * required input to `resolveBatches()`).
 *
 * @param {string} planContent
 * @returns {string|null}
 */
function extractSpecPathFromPlan(planContent) {
  const match = planContent.match(/^>\s*\*\*Spec:\*\*\s*(\S+)/m);
  return match ? match[1] : null;
}

async function cmdBatches(argv, { projectRoot, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        plan: { type: "string" },
        "max-batch": { type: "string" },
        "no-batch": { type: "boolean", default: false },
        parallel: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}\n${BATCHES_USAGE}`);
    process.exit(1);
  }

  const values = parsed.values;

  // Flag-conflict check runs FIRST, before --plan presence or --max-batch
  // validation: --no-batch and --parallel are mutually exclusive because
  // --parallel's unit of dispatch is already the group.
  if (values["no-batch"] && values.parallel) {
    console.error(
      "CONFLICTING_BATCH_FLAGS: --no-batch and --parallel are mutually exclusive — --parallel's unit of dispatch is already the group. Drop one flag.",
    );
    process.exit(1);
  }

  let maxBatchOverride;
  if (values["max-batch"] !== undefined) {
    // Reuse Task 1's validator verbatim: build a small holder object it
    // mutates in place. Number() coercion turns a valid integer string into
    // a real number while still yielding NaN for anything the validator must
    // reject ("two" → NaN, "3.5" → 3.5 non-integer) — validateMaxBatchSize's
    // own isFinite/isInteger checks catch both.
    const holder = { max_batch_size: Number(values["max-batch"]) };
    try {
      validateMaxBatchSize(holder);
    } catch (err) {
      // validateMaxBatchSize's message body does not itself embed the error
      // code (lib/errors.mjs::codedError only sets `.code`, unlike
      // plan-routing-sidecar.mjs's code-prefixed messages) — prefix it here
      // so INVALID_MAX_BATCH_SIZE is grep-able on stderr like every other
      // coded failure this verb surfaces.
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    maxBatchOverride = holder.max_batch_size;
  }

  const planPath = values.plan;
  if (!planPath) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }

  let planContent;
  try {
    planContent = readFileSync(planPath, "utf8");
  } catch (err) {
    // Coded so a missing/unreadable plan is grep-able like every other
    // fatal path here (CONFLICTING_BATCH_FLAGS, INVALID_MAX_BATCH_SIZE,
    // ROUTING_SIDECAR_MISSING) — a raw ENOENT string was not. Reuses the
    // INVALID_PLAN_PATH code family plan-routing-sidecar.mjs's
    // sidecarPathFor() already uses for a different bad-plan-path case
    // (wrong suffix, rather than missing/unreadable file).
    if (err && err.code === "ENOENT") {
      console.error(`INVALID_PLAN_PATH: ${planPath} not found`);
    } else {
      console.error(`INVALID_PLAN_PATH: ${planPath} could not be read (${err && err.message ? err.message : err})`);
    }
    process.exit(1);
  }

  let entries;
  try {
    entries = readRoutingSidecar(planPath);
  } catch (err) {
    const code = err && err.code;
    if (code === "ROUTING_SIDECAR_MISSING") {
      console.error(err.message);
      process.exit(2);
    }
    if (code === "INVALID_SIDECAR_JSON") {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  // Prior-run plan-task state, for Behavior E (abort carry-forward). This
  // verb only receives --plan, not --spec, so the spec path is recovered
  // from the plan's own `> **Spec:** <path>` header line. When that line is
  // absent or unparseable, or when the resolved path can't be read as
  // lifecycle state for any reason, this degrades to an empty prior-state
  // map with an advisory on stderr — never fatal, since carry-forward is an
  // optional refinement per the spec's own Output Contract.
  let priorPlanTasks = {};
  const specPath = extractSpecPathFromPlan(planContent);
  if (!specPath) {
    console.error(
      "advisory: plan has no '> **Spec:** <path>' header — prior-run state could not be resolved; abort carry-forward skipped for this invocation",
    );
  } else {
    try {
      const state = currentState(projectRoot, specPath);
      priorPlanTasks = state.planTasks ?? {};
    } catch (err) {
      console.error(
        `advisory: could not resolve prior-run state for ${specPath} (${err && err.message ? err.message : err}) — abort carry-forward skipped for this invocation`,
      );
    }
  }

  // Governance boundary verdicts, per task. The routing sidecar carries no
  // per-task file list, so there is no reliable way to attribute a boundary
  // finding to a specific task_id here — there is nothing to call
  // checkBoundaries() WITH that would produce a per-task result, so it is
  // not invoked at all rather than calling it with an empty `changed` set
  // and discarding the result. boundaryVerdicts stays `{}`: batching.mjs's
  // gateReason() treats an absent entry as `undefined`, which is never
  // "FAIL" — and since every rule in this repo's
  // .context-index/governance/boundaries.yaml is `severity: warning` today,
  // an empty map can never mask a real error-severity boundary violation.
  // Revisit this the day a per-task file list becomes available (e.g. by
  // parsing each task's `Files:` list from the plan body) or an
  // error-severity boundary rule is declared.
  const boundaryVerdicts = {};

  const result = resolveBatches({
    planContent,
    manifest,
    routingEntries: entries,
    boundaryVerdicts,
    priorPlanTasks,
    noBatch: values["no-batch"],
    maxBatchOverride,
  });

  console.log(JSON.stringify(result));
  process.exit(0);
}

const RESOLVE_DEPTH_USAGE =
  "usage: adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id> " +
  "[--tier full|quick] [--base-sha <sha>] [--pass provisional|final] [--review-cycles <n>] " +
  "[--in-batch] [--had-critical-finding]";

const TASK_HEADING_ID = /^#{2,4}\s+Task\s+(\d+)\b/;
const MODIFY_BULLET = /^\s*[-*]\s*Modify:/i;

/**
 * Scans just the target task's own H2-H4 heading region (bounded by the next
 * `Task <n>` heading of any other number, mirroring
 * lib/test-strategies/task-files.mjs's own region-extraction approach) for a
 * `- Modify:` bullet. A task with such a bullet is not additive-only,
 * regardless of what else its Files: block declares.
 *
 * @param {string} planContent
 * @param {string} taskId - `t<n>` shaped task id
 * @returns {boolean}
 */
function hasModifyEntry(planContent, taskId) {
  const m = /^t(\d+)$/.exec(taskId);
  if (!m) return false;
  const n = m[1];
  const lines = planContent.split("\n");

  let regionStart = -1;
  let regionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const hm = TASK_HEADING_ID.exec(lines[i]);
    if (!hm) continue;
    if (hm[1] === n && regionStart === -1) {
      regionStart = i + 1;
    } else if (regionStart !== -1 && hm[1] !== n) {
      regionEnd = i;
      break;
    }
  }
  if (regionStart === -1) return false;

  return lines.slice(regionStart, regionEnd).some((l) => MODIFY_BULLET.test(l));
}

async function cmdResolveDepth(argv, { projectRoot, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        plan: { type: "string" },
        "task-id": { type: "string" },
        tier: { type: "string" },
        "base-sha": { type: "string" },
        pass: { type: "string", default: "provisional" },
        "review-cycles": { type: "string" },
        "in-batch": { type: "boolean", default: false },
        "had-critical-finding": { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}\n${RESOLVE_DEPTH_USAGE}`);
    process.exit(1);
  }

  const values = parsed.values;
  const specPath = values.spec;
  const planPath = values.plan;
  const taskId = values["task-id"];
  const pass = values.pass;

  if (!specPath) {
    console.error("--spec <spec-path> is required");
    process.exit(1);
  }
  if (!planPath) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }
  if (!taskId) {
    console.error("--task-id <id> is required");
    process.exit(1);
  }

  if (pass === "final" && !values["base-sha"]) {
    console.error("MISSING_DIFF_RANGE: --base-sha is required for the final pass");
    process.exit(2);
  }

  // Reuses validateMaxReviewCycles's own integer->=1 predicate verbatim
  // (lib/manifest.mjs) rather than re-implementing the numeric check — only
  // the error code/message differ (INVALID_REVIEW_CYCLES vs. that
  // function's own INVALID_MAX_REVIEW_CYCLES), since a CLI-argument
  // override is a distinct failure surface from a malformed manifest value.
  let reviewCycles;
  if (values["review-cycles"] !== undefined) {
    const holder = { max_review_cycles: Number(values["review-cycles"]) };
    try {
      validateMaxReviewCycles(holder);
    } catch {
      console.error(
        `INVALID_REVIEW_CYCLES: --review-cycles must be an integer >= 1; got ${values["review-cycles"]}`,
      );
      process.exit(1);
    }
    reviewCycles = holder.max_review_cycles;
  } else {
    reviewCycles = manifest?.implement?.max_review_cycles ?? 3;
  }

  let routingEntry;
  try {
    routingEntry = lookupRoutingEntry(planPath, taskId);
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(3);
  }

  let specText;
  try {
    specText = readFileSync(specPath, "utf8");
  } catch (err) {
    console.error(
      `INVALID_SPEC_PATH: ${specPath} could not be read (${err && err.message ? err.message : err})`,
    );
    process.exit(1);
  }
  const riskLevel = parseFrontmatterFields(specText).risk_level ?? "medium";

  let planContent;
  try {
    planContent = readFileSync(planPath, "utf8");
  } catch (err) {
    console.error(
      `INVALID_PLAN_PATH: ${planPath} could not be read (${err && err.message ? err.message : err})`,
    );
    process.exit(1);
  }

  const policies = loadRigorPolicies(projectRoot) ?? {};
  const { targetPaths: declaredFiles } = await readTaskFiles(planPath, taskId);
  const additiveOnly = declaredFiles.length > 0 && !hasModifyEntry(planContent, taskId);

  // The floor pass is a safety property, not a convenience: its `boundary` and
  // `sensitive-path` legs are only reachable when the verb actually forwards
  // the task's declared paths and the project's governance registries. Both
  // signals are derived from the task's DECLARED files (not the final diff),
  // because the provisional pass runs before any file is touched and both
  // passes must evaluate the same predicate.
  const targetPaths = declaredFiles;
  const boundaryCrossing = boundaryCrossingFor(projectRoot, targetPaths);
  const sensitivePaths = loadConfiguredSensitivePaths(projectRoot);

  let result;
  try {
    result = resolveImplementReviewDepth({
      spec: { risk_level: riskLevel, specPath },
      task: {
        id: taskId,
        additive_only: additiveOnly,
        declared_files: declaredFiles,
        in_batch: values["in-batch"] === true,
        had_critical_finding: values["had-critical-finding"] === true,
      },
      routingEntry,
      tierFlag: values.tier ?? null,
      policies,
      boundaryCrossing,
      targetPaths,
      sensitivePaths,
      pass,
      baseSha: values["base-sha"],
      projectRoot,
    });
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(err && err.code === "MISSING_DIFF_RANGE" ? 2 : 1);
  }

  reportReviewDepthResolved(projectRoot, specPath, {
    plan: planPath,
    task_id: taskId,
    pass,
    depth: result.depth,
    source: result.source,
    floor_applied: result.floor_applied,
    floor_legs: result.floor_legs,
  });

  console.log(JSON.stringify({ ...result, review_cycles: reviewCycles }));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev implement <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  read-routing --plan <plan-path> --task-id <id> [--agents-allowlist <csv>]");
  console.log("");
  console.log("    Resolves the routing entry for a single task and prints it as JSON.");
  console.log("");
  console.log("  batches --plan <plan-path> [--max-batch <n>] [--no-batch] [--parallel]");
  console.log("");
  console.log("    Resolves the plan's `## Parallelization` groups into eligible batches");
  console.log("    vs. solo tasks (batched-task-dispatch.spec.md) and prints");
  console.log("    { batches, solo, advisories } as JSON.");
  console.log("");
  console.log("Exit codes (read-routing):");
  console.log("  0  success — entry JSON on stdout");
  console.log("  1  argument error, INVALID_PLAN_PATH, INVALID_SIDECAR_JSON");
  console.log("  2  ROUTING_SIDECAR_MISSING");
  console.log("  3  ROUTING_ENTRY_MISSING");
  console.log("  4  ROUTING_AGENT_INVALID");
  console.log("");
  console.log("Exit codes (batches):");
  console.log("  0  success — { batches, solo, advisories } JSON on stdout");
  console.log("  1  argument error, CONFLICTING_BATCH_FLAGS, INVALID_MAX_BATCH_SIZE");
  console.log("  2  ROUTING_SIDECAR_MISSING");
  console.log("");
  console.log("  resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id>");
  console.log("                [--tier full|quick] [--base-sha <sha>] [--pass provisional|final]");
  console.log("                [--review-cycles <n>] [--in-batch] [--had-critical-finding]");
  console.log("");
  console.log("    Resolves the effective review depth (full|quick) for a single task via");
  console.log("    resolveImplementReviewDepth()'s precedence chain + floor pass, records a");
  console.log("    review_depth_resolved lifecycle event, and prints the result (plus the");
  console.log("    resolved review_cycles) as JSON.");
  console.log("");
  console.log("Exit codes (resolve-depth):");
  console.log("  0  success — resolveImplementReviewDepth() result + review_cycles JSON on stdout");
  console.log("  1  argument error, INVALID_REVIEW_CYCLES, INVALID_SPEC_PATH, INVALID_PLAN_PATH, INVALID_TIER");
  console.log("  2  MISSING_DIFF_RANGE (final pass without --base-sha)");
  console.log("  3  ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING");
}
