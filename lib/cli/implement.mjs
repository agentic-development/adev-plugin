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
// /adev:implement can resolve a single task's review depth on the
// full | quick | lite ladder without inlining the baseline, lite grant, floor
// pass and lite tripwire into skill prose. Its governance inputs (risk
// policies, boundaries, sensitive paths, routing sidecar) are read from the
// `--run-base` commit, never the working tree; `--base-sha` is only the final
// pass's diff range.
//
// `adev implement check-flags` — /adev:implement's first action. Rejects
// conflicting tier flags and malformed risk policies before any lifecycle
// event exists, captures the run's single `run_base` commit (HEAD), and
// reports whether `lite` is authorized and by what. It writes no lifecycle
// event on any path.
//
// `adev implement lite-report` — the /adev:validate advisory. Reads the raw
// `review_depth_resolved` events of the latest implement run and lists the
// tasks that shipped without per-task review, and the tasks the lite cap held
// to one reviewer.
//
// `adev implement task-begin` — the start of a task in a run where `lite` is
// authorized: the provisional `resolve-depth` pass, plus, for a `lite` result,
// `plan_task` `in_progress`, execution state and the dispatch-time snapshot,
// so an inline task's bookkeeping is one call.
//
// Subverbs:
//   adev implement check-flags --spec <spec-path> [--lite] [--tier full|quick|lite] [--parallel]
//   adev implement lite-report --spec <spec-path> [--json]
//   adev implement read-routing --plan <plan-path> --task-id <id>
//                               [--agents-allowlist <csv>]
//   adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch] [--parallel]
//                          [--lite] [--tier full|quick|lite] [--run-base <sha>]
//   adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha>
//                               [--lite] [--tier full|quick|lite] [--parallel]
//                               [--pass provisional|final] [--base-sha <sha>]
//                               [--review-cycles <n>] [--had-critical-finding]
//   adev implement task-begin --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha>
//                             [--lite] [--tier full|quick|lite] [--parallel] [--review-cycles <n>]
//   adev implement snapshot-base
//
// Exit codes (check-flags):
//   0 success — { lite_authorized, lite_source, tier, run_base, warnings } printed as JSON on stdout
//   1 argument error, CONFLICTING_TIER_FLAGS, INVALID_TIER, LITE_NOT_ALLOWED_FOR_HIGH,
//     INVALID_TEST_DEPTH, INVALID_SPEC_PATH, RUN_BASE_UNAVAILABLE, RUN_BASE_READ_FAILED
//
// Exit codes (lite-report):
//   0 success — { count, task_ids, since, capped } JSON with --json; otherwise the
//     advisory lines, or nothing when count is 0 and capped is empty
//   1 argument error, INVALID_SPEC_PATH, or an unreadable lifecycle log
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
//   1 argument error (including lite authorized without --run-base), CONFLICTING_BATCH_FLAGS,
//     CONFLICTING_TIER_FLAGS, INVALID_MAX_BATCH_SIZE, INVALID_COMMIT_ID, INVALID_TIER,
//     LITE_NOT_ALLOWED_FOR_HIGH, RUN_BASE_READ_FAILED
//   2 ROUTING_SIDECAR_MISSING
//
// Exit codes (task-begin):
//   0 success — the resolve-depth provisional JSON; for a lite result plus
//     snapshot and execution_state (written | conflict | failed)
//   1 every resolve-depth argument and input error above, and TASK_BEGIN_FAILED
//     (the plan_task emit or the snapshot failed after the provisional event)
//   3 ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING
//
// Exit codes (snapshot-base):
//   0 success — tree id of the current worktree (index + non-ignored files) on stdout
//   1 SNAPSHOT_FAILED (not a git repository, or git failed)
//
// Exit codes (resolve-depth):
//   0 success — resolveImplementReviewDepth() result + review_cycles printed as JSON on stdout
//   1 argument error (including a missing --run-base), INVALID_COMMIT_ID, INVALID_REVIEW_CYCLES,
//     INVALID_SPEC_PATH, INVALID_PLAN_PATH, INVALID_TIER, LITE_NOT_ALLOWED_FOR_HIGH,
//     RUN_BASE_READ_FAILED, INVALID_SIDECAR_JSON
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
import { join, resolve as resolvePath } from "node:path";
import { execFileSync } from "node:child_process";

import { lookupRoutingEntry, readRoutingSidecar } from "../plan-routing-sidecar.mjs";
import { validateMaxBatchSize, validateMaxReviewCycles } from "../manifest.mjs";
import {
  currentState,
  filterEvents,
  readEvents,
  reportPlanTask,
  reportReviewDepthResolved,
} from "../lifecycle-state.mjs";
import { writeExecutionState } from "../execution-state.mjs";
import { resolveBatches } from "../implement/batching.mjs";
import { resolveImplementReviewDepth, snapshotWorkingTree } from "../implement/review-depth.mjs";
import { parseParallelizationSection } from "../parallel/groups.mjs";
import {
  InvalidTierError,
  isValidTier,
  loadRigorPolicies,
  resolveRigorMode,
} from "../governance/rigor-mode.mjs";
import { loadGovernanceAtRunBase, loadPoliciesAtRunBase, validateCommitId } from "../implement/run-base.mjs";
import {
  provisionalResolverInputs,
  readSpecRiskLevel,
  riskLevelFromSpecText,
} from "../implement/provisional-inputs.mjs";
import { sameTaskId, taskIdKey } from "../plan-task-id.mjs";
import { parseFrontmatterFields } from "../amendment-graph.mjs";

const USAGE =
  "usage: adev implement <check-flags|lite-report|read-routing|batches|resolve-depth|task-begin|snapshot-base> [flags]";

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  switch (sub) {
    case "check-flags":
      return cmdCheckFlags(argv.slice(1), { projectRoot });
    case "lite-report":
      return cmdLiteReport(argv.slice(1), { projectRoot });
    case "read-routing":
      return cmdReadRouting(argv.slice(1));
    case "batches":
      return cmdBatches(argv.slice(1), { projectRoot, manifest });
    case "resolve-depth":
      return cmdResolveDepth(argv.slice(1), { projectRoot, manifest });
    case "task-begin":
      return cmdTaskBegin(argv.slice(1), { projectRoot, manifest });
    case "snapshot-base":
      return cmdSnapshotBase({ projectRoot });
    default:
      console.error(`unknown subverb: ${sub}\n${USAGE}`);
      process.exit(1);
  }
}

const CHECK_FLAGS_USAGE =
  "usage: adev implement check-flags --spec <spec-path> [--lite] [--tier full|quick|lite] [--parallel]";

function cmdCheckFlags(argv, { projectRoot }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        lite: { type: "boolean", default: false },
        tier: { type: "string" },
        parallel: { type: "boolean", default: false },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(`argument error: ${err.message}\n${CHECK_FLAGS_USAGE}`);
    process.exit(1);
  }

  const specPath = values.spec;
  if (!specPath) {
    console.error(`--spec <spec-path> is required\n${CHECK_FLAGS_USAGE}`);
    process.exit(1);
  }
  const tierArg = values.tier;
  if (values.lite && (tierArg === "full" || tierArg === "quick")) {
    console.error(
      `CONFLICTING_TIER_FLAGS: --lite cannot be combined with --tier ${tierArg}; drop one of them`,
    );
    process.exit(1);
  }
  if (tierArg !== undefined && !isValidTier(tierArg)) {
    console.error(new InvalidTierError(tierArg, { field: "--tier" }).message);
    process.exit(1);
  }

  let runBase;
  try {
    runBase = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const detail = String(err?.stderr || err?.message || err).trim().split("\n")[0];
    console.error(`RUN_BASE_UNAVAILABLE: cannot capture run_base from HEAD (${detail})`);
    process.exit(1);
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

  // Authorization uses the policies committed at run_base, which every later
  // resolve-depth and batches call reads. The working-tree file is validated
  // too, because `adev test-policy resolve` reads it from disk: a malformed
  // uncommitted edit must stop the run here, before any lifecycle event.
  let policies;
  let committedText;
  let policiesRel;
  let workingText = null;
  try {
    ({ policies, text: committedText, path: policiesRel } = loadPoliciesAtRunBase({ projectRoot, runBase }));
    loadRigorPolicies(projectRoot);
    try {
      workingText = readFileSync(join(projectRoot, policiesRel), "utf8");
    } catch {
      workingText = null;
    }
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  const warnings = [];
  // A checkout with core.autocrlf rewrites line endings without changing the
  // policy, so only a content difference counts as an uncommitted edit.
  const normalizeEol = (text) => (text === null ? null : text.replace(/\r\n/g, "\n"));
  if (normalizeEol(workingText) !== normalizeEol(committedText)) {
    warnings.push({
      code: "POLICY_UNCOMMITTED_CHANGES",
      message:
        `POLICY_UNCOMMITTED_CHANGES: ${policiesRel} in the working tree differs from run_base ${runBase}; ` +
        "this run uses the committed policies",
    });
  }

  // resolveRigorMode owns the precedence: an explicit --tier outranks the
  // policy, so `--tier quick|full` is the per-run opt-out from a policy `lite`.
  const tier = values.lite ? "lite" : (tierArg ?? null);
  const effective = resolveRigorMode({ skill: "implement", riskLevel, policies, tierOverride: tier });
  const liteAuthorized = effective === "lite";
  const liteSource = !liteAuthorized ? null : tier === "lite" ? "flag" : "policy";

  if (liteAuthorized && values.parallel) {
    warnings.push({
      code: "LITE_SUPPRESSED_PARALLEL",
      message:
        "LITE_SUPPRESSED_PARALLEL: lite is authorized but the run is --parallel; no task is granted lite",
    });
  }

  console.log(
    JSON.stringify({
      lite_authorized: liteAuthorized,
      lite_source: liteSource,
      tier,
      run_base: runBase,
      warnings,
    }),
  );
  process.exit(0);
}

const LITE_REPORT_USAGE = "usage: adev implement lite-report --spec <spec-path> [--json]";

function cmdLiteReport(argv, { projectRoot }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(`argument error: ${err.message}\n${LITE_REPORT_USAGE}`);
    process.exit(1);
  }
  if (!values.spec) {
    console.error(`--spec <spec-path> is required\n${LITE_REPORT_USAGE}`);
    process.exit(1);
  }

  let events;
  try {
    events = readEvents(projectRoot, values.spec);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(err && err.code ? `${err.code}: ${message}` : message);
    process.exit(1);
  }

  // The window is read from raw events, never from the reviewDepthResolutions
  // projection: that projection keeps the latest event per (plan, task, pass)
  // across every run, so a lite task from an earlier run would be counted.
  // task_ids is deduplicated because one implement run executes a single plan;
  // count stays the number of lite (plan, task_id) pairs.
  let windowStart = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev?.event === "lifecycle_step" && ev.step === "implement" && ev.status === "started") {
      windowStart = i;
      break;
    }
  }

  const latestFinal = new Map();
  if (windowStart >= 0) {
    for (const ev of events.slice(windowStart + 1)) {
      if (ev?.event !== "review_depth_resolved" || ev.pass !== "final") continue;
      if (typeof ev.plan !== "string" || typeof ev.task_id !== "string") continue;
      latestFinal.set(JSON.stringify([ev.plan, ev.task_id]), ev);
    }
  }
  const finals = [...latestFinal.values()];
  const lite = finals.filter((ev) => ev.depth === "lite");
  const count = lite.length;
  const taskIds = [...new Set(lite.map((ev) => ev.task_id))];
  // Without the lite cap a sensitive-path or boundary leg gives full, so a
  // quick resolution carrying one is a capped resolution.
  const cappedEvents = finals.filter(
    (ev) =>
      ev.depth === "quick" &&
      Array.isArray(ev.floor_legs) &&
      ev.floor_legs.some((leg) => leg === "sensitive-path" || leg === "boundary"),
  );
  const capped = [...new Set(cappedEvents.map((ev) => ev.task_id))];
  const since = windowStart >= 0 ? (events[windowStart].ts ?? null) : null;

  if (values.json) {
    console.log(JSON.stringify({ count, task_ids: taskIds, since, capped }));
  } else {
    if (count > 0) {
      console.log(`implemented without per-task review: ${count} task(s) (${taskIds.join(", ")})`);
    }
    if (capped.length > 0) {
      console.log(`one reviewer under the lite cap: ${capped.length} task(s) (${capped.join(", ")})`);
    }
  }
  process.exit(0);
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
  "usage: adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch] [--parallel] " +
  "[--lite] [--tier full|quick|lite] [--run-base <sha>]";

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
  if (!match) return null;
  // A plan may fence the path as `` `path` `` rather than the bare form; strip
  // the fence so both conventions resolve to the same spec path.
  return match[1].replace(/^`+/, "").replace(/`+$/, "");
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
        lite: { type: "boolean", default: false },
        tier: { type: "string" },
        "run-base": { type: "string" },
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

  const tierArg = values.tier;
  if (values.lite && (tierArg === "full" || tierArg === "quick")) {
    console.error(
      `CONFLICTING_TIER_FLAGS: --lite cannot be combined with --tier ${tierArg}; drop one of them`,
    );
    process.exit(1);
  }
  if (tierArg !== undefined && !isValidTier(tierArg)) {
    console.error(new InvalidTierError(tierArg, { field: "--tier" }).message);
    process.exit(1);
  }
  // `--tier lite` is `--lite`; `--tier quick|full` is the per-run opt-out and
  // authorizes nothing, outranking a policy `lite` as in resolveRigorMode.
  const tierFlag = values.lite ? "lite" : (tierArg ?? null);
  const optedOut = tierFlag === "full" || tierFlag === "quick";

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

  const runBase = values["run-base"];
  if (runBase !== undefined) {
    try {
      validateCommitId("--run-base", runBase, { projectRoot, kinds: ["commit"] });
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
      process.exit(1);
    }
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

  // The lite grant reads its governance inputs from the run-base commit, so a
  // run that may authorize lite, when no --tier opts out, must name one:
  // without it a lite task could be batched. Runs that cannot authorize lite
  // keep working without --run-base.
  if (runBase === undefined && !optedOut) {
    let liteAuthorizable;
    try {
      liteAuthorizable = liteAuthorizableWithoutRunBase({ projectRoot, planContent, tierFlag });
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
      process.exit(1);
    }
    if (liteAuthorizable) {
      console.error(
        `--run-base <sha> is required when lite is authorized (--lite, --tier lite, or a policy implement_mode: lite)\n${BATCHES_USAGE}`,
      );
      process.exit(1);
    }
  }

  // The eligibility gate reads the working-tree sidecar on purpose, as it did
  // before lite existed, so non-lite runs do not regress when the sidecar is
  // not yet committed. Lite decisions read the sidecar committed at run_base
  // (liteGrantedAtRunBase), which no task in the run can change.
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

  let liteGranted = new Set();
  let liteAssumed = new Set();
  let liteAdvisories = [];
  if (runBase !== undefined) {
    try {
      ({ granted: liteGranted, assumed: liteAssumed, advisories: liteAdvisories } = await liteGrantedAtRunBase({
        projectRoot,
        planPath,
        planContent,
        specPath,
        runBase,
        tierFlag,
        parallel: values.parallel,
      }));
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
      process.exit(1);
    }
  }

  const result = resolveBatches({
    planContent,
    manifest,
    routingEntries: entries,
    boundaryVerdicts,
    priorPlanTasks,
    noBatch: values["no-batch"],
    maxBatchOverride,
    liteGranted,
    liteAssumed,
  });
  result.advisories.push(...liteAdvisories);

  console.log(JSON.stringify(result));
  process.exit(0);
}

/**
 * Whether a `batches` call with no --run-base and no opt-out tier could
 * authorize lite: `--lite`/`--tier lite`, or a policy `implement_mode: lite`
 * in the working tree or committed at HEAD. HEAD is checked as well because
 * check-flags captures run_base from HEAD: a lite committed there but removed
 * in the working tree is still the run's policy. Only the spec's own risk
 * level counts when the plan's spec resolves; otherwise any level does. With
 * no HEAD (not a repository, or no commit yet) only the working tree is
 * checked. A malformed policy file throws.
 *
 * @returns {boolean}
 */
function liteAuthorizableWithoutRunBase({ projectRoot, planContent, tierFlag }) {
  if (tierFlag === "lite") return true;
  const riskLevel = readSpecRiskLevel(projectRoot, extractSpecPathFromPlan(planContent));
  const authorizes = (policies) =>
    riskLevel !== null
      ? policies?.[riskLevel]?.implement_mode === "lite"
      : Object.values(policies ?? {}).some((level) => level?.implement_mode === "lite");

  if (authorizes(loadRigorPolicies(projectRoot))) return true;

  let head;
  try {
    head = execFileSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return false;
  }
  return authorizes(loadPoliciesAtRunBase({ projectRoot, runBase: head }).policies);
}

/**
 * The plan tasks that resolve-depth's provisional pass would grant `lite`,
 * evaluated with the same resolver on the same provisionalResolverInputs()
 * against governance read at `runBase` (policies, sensitive paths,
 * boundaries, routing sidecar).
 *
 * Authorization is `tierFlag: "lite"` (from --lite or --tier lite), or, with
 * no --tier, the policy `implement_mode: lite` at the spec's risk level;
 * `--tier quick|full` authorizes nothing. A spec that cannot be resolved from
 * the plan header leaves both the policy and the risk level unknown, so with
 * no --tier authorization is assumed and the spec is not treated as
 * high-risk: an eligible task is then kept out of every batch (returned in
 * `assumed`, never in `granted`, with a LITE_AUTHORIZATION_ASSUMED advisory),
 * and resolve-depth still decides its real depth when it runs solo.
 * Over-exclusion costs a batch; under-exclusion would put an inline task in a
 * subagent batch.
 *
 * @returns {Promise<{ granted: Set<string>, assumed: Set<string>, advisories: object[] }>}
 */
async function liteGrantedAtRunBase({ projectRoot, planPath, planContent, specPath, runBase, tierFlag, parallel }) {
  const governance = loadGovernanceAtRunBase({ projectRoot, runBase, planPath });
  const advisories = governance.warnings.map(({ code, ...rest }) => ({ type: code, ...rest }));

  const riskLevel = readSpecRiskLevel(projectRoot, specPath);
  const assumeAuthorization = riskLevel === null && tierFlag === null;
  if (assumeAuthorization) {
    advisories.push({
      type: "LITE_AUTHORIZATION_ASSUMED",
      message:
        "LITE_AUTHORIZATION_ASSUMED: the plan's spec could not be resolved, so its lite policy is unknown; " +
        "lite-eligible tasks are kept out of batches (solo reason lite-assumed) and resolve-depth decides their depth",
    });
  }

  const granted = new Set();
  const assumed = new Set();
  const seen = new Set();
  for (const group of parseParallelizationSection(planContent).groups) {
    for (const member of group.members) {
      const key = taskIdKey(member);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const result = resolveImplementReviewDepth(
        await provisionalResolverInputs({
          projectRoot,
          specPath,
          riskLevel,
          planPath,
          taskId: member,
          governance,
          liteFlag: assumeAuthorization,
          tierFlag,
          parallel,
        }),
      );
      if (result.depth === "lite") (assumeAuthorization ? assumed : granted).add(member);
    }
  }
  return { granted, assumed, advisories };
}

const RESOLVE_DEPTH_USAGE =
  "usage: adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha> " +
  "[--lite] [--tier full|quick|lite] [--parallel] [--pass provisional|final] [--base-sha <sha>] " +
  "[--review-cycles <n>] [--had-critical-finding]";

const COMMIT_ID_FLAGS = ["--run-base", "--base-sha"];

// The task's latest `plan_task` in_progress time (ms epoch) and latest
// provisional `review_depth_resolved` depth, each read only from events after
// the latest implement `lifecycle_step` started event, so a resolution left by
// an earlier run never decides this run's final pass. Both are null when
// absent, and with no started event the window is empty: a null
// provisionalDepth takes the quick/full path, which never resolves lite, and
// a null inProgressAt counts every ignored file, so a missing window can only
// raise the depth.
function priorTaskState(projectRoot, specPath, planPath, taskId) {
  const planAbs = resolvePath(projectRoot, planPath);
  const isTaskEvent = (ev) =>
    typeof ev?.plan === "string" &&
    resolvePath(projectRoot, ev.plan) === planAbs &&
    (ev.task_id === taskId || sameTaskId(ev.task_id, taskId));
  const events = filterEvents(
    projectRoot,
    specPath,
    (ev) =>
      (ev?.event === "lifecycle_step" && ev.step === "implement" && ev.status === "started") ||
      ((ev?.event === "plan_task" || ev?.event === "review_depth_resolved") && isTaskEvent(ev)),
  );
  const start = events.findLastIndex((ev) => ev.event === "lifecycle_step");

  let inProgressAt = null;
  let provisionalDepth = null;
  if (start >= 0) {
    for (const ev of events.slice(start + 1)) {
      if (ev.event === "plan_task" && ev.status === "in_progress") {
        const ms = Date.parse(ev.ts);
        inProgressAt = Number.isFinite(ms) ? ms : null;
      } else if (ev.event === "review_depth_resolved" && ev.pass === "provisional") {
        provisionalDepth = typeof ev.depth === "string" ? ev.depth : null;
      }
    }
  }
  return { inProgressAt, provisionalDepth };
}

const PROVISIONAL_PASS_OPTIONS = {
  spec: { type: "string" },
  plan: { type: "string" },
  "task-id": { type: "string" },
  "run-base": { type: "string" },
  lite: { type: "boolean", default: false },
  tier: { type: "string" },
  parallel: { type: "boolean", default: false },
  "review-cycles": { type: "string" },
};

const FINAL_PASS_OPTIONS = {
  "base-sha": { type: "string" },
  pass: { type: "string", default: "provisional" },
  // Accepted for compatibility with older skill text; the batched-task
  // floor leg it fed no longer exists, so its value is never read.
  "in-batch": { type: "boolean", default: false },
  "had-critical-finding": { type: "boolean", default: false },
};

async function cmdResolveDepth(argv, { projectRoot, manifest }) {
  const { output } = await resolveDepthPass(argv, {
    projectRoot,
    manifest,
    usage: RESOLVE_DEPTH_USAGE,
    acceptsFinalPass: true,
  });
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * The single resolution path behind `resolve-depth` and `task-begin`: parses
 * and validates the flags, resolves the task's depth from governance read at
 * `--run-base`, records its `review_depth_resolved` event, and returns the
 * JSON both verbs print. Every argument or input error exits the process.
 * Without `acceptsFinalPass` the final-pass flags are unknown options and the
 * pass is always provisional.
 */
async function resolveDepthPass(argv, { projectRoot, manifest, usage, acceptsFinalPass }) {
  // parseArgs refuses `--run-base --output=x` as an ambiguous option before
  // the value reaches validation; a dash-led commit id is an invalid commit
  // id and is reported as one.
  const commitIdFlags = acceptsFinalPass ? COMMIT_ID_FLAGS : ["--run-base"];
  for (let i = 0; i < argv.length - 1; i++) {
    if (commitIdFlags.includes(argv[i]) && argv[i + 1].startsWith("-")) {
      console.error(
        `INVALID_COMMIT_ID: ${argv[i]} must be a full hex object id; got ${JSON.stringify(argv[i + 1])}`,
      );
      process.exit(1);
    }
  }

  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: acceptsFinalPass ? { ...PROVISIONAL_PASS_OPTIONS, ...FINAL_PASS_OPTIONS } : PROVISIONAL_PASS_OPTIONS,
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(`argument error: ${err.message}\n${usage}`);
    process.exit(1);
  }

  if (values["run-base"] === undefined) {
    console.error(`--run-base <sha> is required on both passes\n${usage}`);
    process.exit(1);
  }
  let runBase;
  let baseSha;
  try {
    runBase = validateCommitId("--run-base", values["run-base"], { projectRoot, kinds: ["commit"] });
    if (values["base-sha"] !== undefined) {
      baseSha = validateCommitId("--base-sha", values["base-sha"], { projectRoot, kinds: ["commit", "tree"] });
    }
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  const specPath = values.spec;
  const planPath = values.plan;
  const taskId = values["task-id"];
  const pass = values.pass ?? "provisional";

  if (!specPath) {
    console.error(`--spec <spec-path> is required\n${usage}`);
    process.exit(1);
  }
  if (!planPath) {
    console.error(`--plan <plan-path> is required\n${usage}`);
    process.exit(1);
  }
  if (!taskId) {
    console.error(`--task-id <id> is required\n${usage}`);
    process.exit(1);
  }
  if (pass !== "provisional" && pass !== "final") {
    console.error(`--pass must be provisional|final; got ${JSON.stringify(pass)}\n${usage}`);
    process.exit(1);
  }

  if (pass === "final" && !baseSha) {
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

  let specText;
  try {
    specText = readFileSync(specPath, "utf8");
  } catch (err) {
    console.error(
      `INVALID_SPEC_PATH: ${specPath} could not be read (${err && err.message ? err.message : err})`,
    );
    process.exit(1);
  }
  const riskLevel = riskLevelFromSpecText(specText);

  let planContent;
  try {
    planContent = readFileSync(planPath, "utf8");
  } catch (err) {
    console.error(
      `INVALID_PLAN_PATH: ${planPath} could not be read (${err && err.message ? err.message : err})`,
    );
    process.exit(1);
  }

  let governance;
  try {
    governance = loadGovernanceAtRunBase({ projectRoot, runBase, planPath });
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  // The final pass resolves from the same inputs as the provisional pass,
  // plus the final-pass-only ones below.
  let sharedInputs;
  try {
    sharedInputs = await provisionalResolverInputs({
      projectRoot,
      specPath,
      riskLevel,
      planPath,
      taskId,
      governance,
      liteFlag: values.lite === true,
      tierFlag: values.tier ?? null,
      parallel: values.parallel === true,
      requireRoutingEntry: true,
    });
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    const code = err && err.code;
    process.exit(code === "ROUTING_SIDECAR_MISSING" || code === "ROUTING_ENTRY_MISSING" ? 3 : 1);
  }

  let prior = { inProgressAt: null, provisionalDepth: null };
  if (pass === "final") {
    try {
      prior = priorTaskState(projectRoot, specPath, planPath, taskId);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      console.error(err && err.code ? `${err.code}: ${message}` : message);
      process.exit(1);
    }
  }

  let result;
  try {
    result = resolveImplementReviewDepth({
      ...sharedInputs,
      task: { ...sharedInputs.task, had_critical_finding: values["had-critical-finding"] === true },
      pass,
      baseSha,
      provisionalDepth: prior.provisionalDepth,
      inProgressAt: prior.inProgressAt,
    });
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(err && err.code === "MISSING_DIFF_RANGE" ? 2 : 1);
  }

  result = { ...result, warnings: [...governance.warnings, ...result.warnings] };

  reportReviewDepthResolved(projectRoot, specPath, {
    plan: planPath,
    task_id: taskId,
    pass,
    depth: result.depth,
    source: result.source,
    floor_applied: result.floor_applied,
    floor_legs: result.floor_legs,
  });

  return { output: { ...result, review_cycles: reviewCycles }, specPath, planPath, taskId, planContent };
}

const TASK_BEGIN_USAGE =
  "usage: adev implement task-begin --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha> " +
  "[--lite] [--tier full|quick|lite] [--parallel] [--review-cycles <n>]";

/**
 * The provisional pass, plus for a `lite` result the bookkeeping an inline
 * task needs before it is implemented, in the order the inline loop needs it:
 * `plan_task` `in_progress` first, because the final pass reads that event's
 * time as the lower bound for gitignored writes, then execution state, then
 * the dispatch-time snapshot. Execution state is advisory and never fails the
 * verb; the event and the snapshot are what the tripwire depends on.
 */
async function cmdTaskBegin(argv, { projectRoot, manifest }) {
  const { output, specPath, planPath, taskId, planContent } = await resolveDepthPass(argv, {
    projectRoot,
    manifest,
    usage: TASK_BEGIN_USAGE,
    acceptsFinalPass: false,
  });
  if (output.depth !== "lite") {
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  const failed = (step, err) => {
    const detail = String(err?.stderr || err?.message || err).trim().split("\n")[0];
    console.error(
      `TASK_BEGIN_FAILED: ${step} failed for task ${taskId} after its provisional review_depth_resolved ` +
        `event was written (${detail})`,
    );
    process.exit(1);
  };

  try {
    reportPlanTask(projectRoot, specPath, { plan: planPath, task_id: taskId, status: "in_progress", notes: null });
  } catch (err) {
    failed("plan_task in_progress", err);
  }

  const executionState = writeTaskExecutionState(projectRoot, { specPath, planPath, planContent, taskId });

  let snapshot;
  try {
    snapshot = snapshotWorkingTree(projectRoot);
  } catch (err) {
    failed("snapshot", err);
  }

  console.log(JSON.stringify({ ...output, snapshot, execution_state: executionState }));
  process.exit(0);
}

/** `### Task <n>: <title>` headings in plan order, with trailing `[...]` tags dropped from the title. */
function planTaskHeadings(planContent) {
  const tasks = [];
  for (const m of planContent.matchAll(/^### Task (\d+[A-Za-z0-9.]*)\s*:\s*(.*)$/gm)) {
    tasks.push({ id: m[1], title: m[2].replace(/(\s*\[[^\]]*\])+\s*$/, "").trim() });
  }
  return tasks;
}

/** taskIdKey()s of this plan's tasks whose latest `plan_task` event is `done`. */
function doneTaskKeys(projectRoot, specPath, planPath) {
  const planAbs = resolvePath(projectRoot, planPath);
  const latest = new Map();
  const events = filterEvents(
    projectRoot,
    specPath,
    (ev) => ev?.event === "plan_task" && typeof ev.plan === "string" && resolvePath(projectRoot, ev.plan) === planAbs,
  );
  for (const ev of events) latest.set(taskIdKey(ev.task_id), ev.status);
  return new Set([...latest].filter(([, status]) => status === "done").map(([key]) => key));
}

/**
 * Writes `status: active` execution state naming this task, and reports the
 * outcome as `written`, `conflict` (another build owns the live state, which
 * is left untouched) or `failed`. Neither failure stops the task, matching
 * `adev execution-state write`'s contract; the reason goes to stderr so the
 * orchestrator can surface a conflicting owner.
 */
function writeTaskExecutionState(projectRoot, { specPath, planPath, planContent, taskId }) {
  try {
    const tasks = planTaskHeadings(planContent);
    const done = doneTaskKeys(projectRoot, specPath, planPath);
    const current = tasks.find((t) => sameTaskId(t.id, taskId));
    writeExecutionState(projectRoot, {
      status: "active",
      planRef: planPath,
      currentTask: /^\d+$/.test(taskId) ? Number(taskId) : taskId,
      nextAction: current?.title || `Task ${taskId}`,
      progress: tasks.map((t) => ({ task: `Task ${t.id}: ${t.title}`, done: done.has(taskIdKey(t.id)) })),
    });
    return "written";
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(err && err.code ? `${err.code}: ${message}` : message);
    return err && err.code === "EXECUTION_STATE_CONFLICT" ? "conflict" : "failed";
  }
}

function cmdSnapshotBase({ projectRoot }) {
  let tree;
  try {
    tree = snapshotWorkingTree(projectRoot);
  } catch (err) {
    const detail = String(err?.stderr || err?.message || err).trim().split("\n")[0];
    console.error(`SNAPSHOT_FAILED: ${detail}`);
    process.exit(1);
  }
  console.log(tree);
  process.exit(0);
}

export function help() {
  console.log("Usage: adev implement <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  check-flags --spec <spec-path> [--lite] [--tier full|quick|lite] [--parallel]");
  console.log("");
  console.log("    /adev:implement's first action. Rejects conflicting tier flags and");
  console.log("    malformed risk policies before any lifecycle event, captures run_base");
  console.log("    (the full sha of HEAD, passed as --run-base to every later call), and");
  console.log("    prints { lite_authorized, lite_source, tier, run_base, warnings } as JSON.");
  console.log("    `tier` is the run's explicit tier (--lite reads as lite), or null.");
  console.log("    Authorization uses the risk policies committed at run_base. The");
  console.log("    working-tree file is validated too, and an uncommitted change to it");
  console.log("    adds a POLICY_UNCOMMITTED_CHANGES warning.");
  console.log("");
  console.log("  lite-report --spec <spec-path> [--json]");
  console.log("");
  console.log("    Lists the tasks of the latest implement run (events after the most");
  console.log("    recent implement lifecycle_step started event) whose latest final-pass");
  console.log("    review_depth_resolved has depth lite, and as capped those whose latest");
  console.log("    final-pass event is quick with a sensitive-path or boundary floor leg");
  console.log("    (the lite cap). --json prints { count, task_ids, since, capped }; text");
  console.log("    mode prints \"implemented without per-task review: <n> task(s) (<ids>)\"");
  console.log("    and \"one reviewer under the lite cap: <n> task(s) (<ids>)\", each only");
  console.log("    when it lists a task.");
  console.log("");
  console.log("  read-routing --plan <plan-path> --task-id <id> [--agents-allowlist <csv>]");
  console.log("");
  console.log("    Resolves the routing entry for a single task and prints it as JSON.");
  console.log("");
  console.log("  batches --plan <plan-path> [--max-batch <n>] [--no-batch] [--parallel]");
  console.log("          [--lite] [--tier full|quick|lite] [--run-base <sha>]");
  console.log("");
  console.log("    Resolves the plan's `## Parallelization` groups into eligible batches");
  console.log("    vs. solo tasks (batched-task-dispatch.spec.md) and prints");
  console.log("    { batches, solo, advisories } as JSON.");
  console.log("    With --run-base (the run_base printed by check-flags), each task is");
  console.log("    checked for the lite grant against governance committed at that commit.");
  console.log("    A granted task never joins a batch and is listed in solo with reason");
  console.log("    \"lite\"; it splits its group, and each run of non-lite tasks around it");
  console.log("    is gated and sized on its own (batches carry a 1-based `segment`).");
  console.log("    Authorization is --lite (or --tier lite), or, with no --tier, the policy");
  console.log("    implement_mode: lite; --tier quick|full opts out. When the plan's spec");
  console.log("    cannot be resolved, authorization is assumed: eligible tasks go solo with");
  console.log("    reason \"lite-assumed\" and a LITE_AUTHORIZATION_ASSUMED advisory.");
  console.log("    --run-base is required whenever lite may be authorized: --lite, --tier");
  console.log("    lite, or, with no --tier, a policy implement_mode: lite at the spec's risk");
  console.log("    level (any level when the spec cannot be resolved) in the working tree or");
  console.log("    committed at HEAD.");
  console.log("");
  console.log("  resolve-depth --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha>");
  console.log("                [--lite] [--tier full|quick|lite] [--parallel] [--pass provisional|final]");
  console.log("                [--base-sha <commit-or-tree>] [--review-cycles <n>] [--had-critical-finding]");
  console.log("");
  console.log("    Resolves one task's review depth (full, quick or lite), records a");
  console.log("    review_depth_resolved lifecycle event, and prints the result plus");
  console.log("    lite_denied, lite_source, escalated_from, floor_cap and review_cycles");
  console.log("    as JSON.");
  console.log("    --run-base is required on both passes: the risk policies, boundaries,");
  console.log("    sensitive paths and routing sidecar are read from that commit (the");
  console.log("    run_base check-flags printed). --base-sha is the final pass's diff range");
  console.log("    only. --lite or --tier lite authorizes the lite grant; --parallel denies");
  console.log("    it. A final pass whose task resolved lite provisionally runs the lite");
  console.log("    tripwire and reports LITE_TRIPWIRE_ESCALATED in warnings on escalation.");
  console.log("    --in-batch is accepted and ignored.");
  console.log("");
  console.log("  task-begin --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <sha>");
  console.log("             [--lite] [--tier full|quick|lite] [--parallel] [--review-cycles <n>]");
  console.log("");
  console.log("    Starts a task in a run where lite is authorized. Runs resolve-depth's");
  console.log("    provisional pass (same flag validation, event and JSON). For a lite");
  console.log("    result it also emits plan_task in_progress, writes execution state and");
  console.log("    captures the snapshot-base tree, adding snapshot and execution_state");
  console.log("    (written, conflict or failed; never fatal) to the JSON. Any other");
  console.log("    result prints exactly what resolve-depth --pass provisional prints.");
  console.log("");
  console.log("  snapshot-base");
  console.log("");
  console.log("    Prints a git tree id recording the worktree as it stands now (index plus");
  console.log("    every non-ignored file, untracked included), without touching the index.");
  console.log("    Capture it at task dispatch and pass it as resolve-depth's --base-sha, so");
  console.log("    the final pass sees only what the task changed.");
  console.log("");
  console.log("Exit codes (check-flags):");
  console.log("  0  success — { lite_authorized, lite_source, tier, run_base, warnings } JSON on stdout");
  console.log("  1  argument error, CONFLICTING_TIER_FLAGS, INVALID_TIER, LITE_NOT_ALLOWED_FOR_HIGH,");
  console.log("     INVALID_TEST_DEPTH, INVALID_SPEC_PATH, RUN_BASE_UNAVAILABLE, RUN_BASE_READ_FAILED");
  console.log("");
  console.log("Exit codes (lite-report):");
  console.log("  0  success — { count, task_ids, since, capped } JSON with --json, else the advisory lines or nothing");
  console.log("  1  argument error, INVALID_SPEC_PATH, unreadable lifecycle log");
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
  console.log("  1  argument error (including lite authorized without --run-base), CONFLICTING_BATCH_FLAGS,");
  console.log("     CONFLICTING_TIER_FLAGS, INVALID_MAX_BATCH_SIZE, INVALID_COMMIT_ID, INVALID_TIER,");
  console.log("     LITE_NOT_ALLOWED_FOR_HIGH, RUN_BASE_READ_FAILED");
  console.log("  2  ROUTING_SIDECAR_MISSING");
  console.log("");
  console.log("Exit codes (resolve-depth):");
  console.log("  0  success — resolveImplementReviewDepth() result + review_cycles JSON on stdout");
  console.log("  1  argument error (including a missing --run-base), INVALID_COMMIT_ID, INVALID_REVIEW_CYCLES,");
  console.log("     INVALID_SPEC_PATH, INVALID_PLAN_PATH, INVALID_TIER, LITE_NOT_ALLOWED_FOR_HIGH,");
  console.log("     RUN_BASE_READ_FAILED, INVALID_SIDECAR_JSON");
  console.log("  2  MISSING_DIFF_RANGE (final pass without --base-sha)");
  console.log("  3  ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING");
  console.log("");
  console.log("Exit codes (task-begin):");
  console.log("  0  success — resolve-depth provisional JSON, plus snapshot and execution_state for lite");
  console.log("  1  argument error (including a missing --run-base), INVALID_COMMIT_ID, INVALID_REVIEW_CYCLES,");
  console.log("     INVALID_SPEC_PATH, INVALID_PLAN_PATH, INVALID_TIER, LITE_NOT_ALLOWED_FOR_HIGH,");
  console.log("     RUN_BASE_READ_FAILED, INVALID_SIDECAR_JSON, TASK_BEGIN_FAILED");
  console.log("  3  ROUTING_SIDECAR_MISSING, ROUTING_ENTRY_MISSING");
  console.log("");
  console.log("Exit codes (snapshot-base):");
  console.log("  0  success — tree id on stdout");
  console.log("  1  SNAPSHOT_FAILED");
}
