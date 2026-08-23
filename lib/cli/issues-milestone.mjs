/**
 * `adev issues milestone create|list|ship|defer` — the milestone lifecycle.
 *
 * Why these verbs exist: the `/adev:issues` §Milestone Create / List / Ship /
 * Defer steps were prose lib directives ("Call `milestoneShip(...)` from
 * `lib/milestones.mjs`"). An agent handed a lib call has no CLI surface to
 * reach for, and on the ship path that is not a cosmetic problem — see below.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ THE LOAD-BEARING LINE: `ship` ALWAYS supplies `confirmFn`.            │
 * │                                                                       │
 * │ `lib/milestones.mjs` guards its manual-confirmation loop with         │
 * │                                                                       │
 * │     if (confirms.length > 0 && options.confirmFn) {                   │
 * │                                                                       │
 * │ so a caller that OMITS the callback does NOT refuse the ship — it     │
 * │ SKIPS EVERY MANUAL CONFIRMATION AND SHIPS. The refusal has to be an   │
 * │ explicit `false` return from a callback that is always present, which │
 * │ is why `confirmFn` is built unconditionally and passed in BOTH        │
 * │ branches (`--yes` and no `--yes`). Do not "simplify" it into a        │
 * │ conditional: `tests/cli/issues-milestone.test.mjs` asserts the call   │
 * │ site directly because the `--yes` branch is observationally identical │
 * │ with and without the callback.                                        │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Exit codes (INV-5):
 *   0  the operation landed
 *   1  usage error or an adapter/lib failure — reported as `<CODE>: <message>`
 *      (MILESTONE_NOT_FOUND, INVALID_NAME, BROKEN_EPIC, UNKNOWN_STRATEGY,
 *      ALREADY_SHIPPED, MISSING_REASON, INVALID_DATE, …)
 *   2  refused by a guard: a failed auto-check, a timed-out quality gate, a
 *      rejected/unanswered manual confirm, or an existing git tag. Nothing is
 *      mutated — `milestoneShip` evaluates every criterion before it writes.
 *
 * Storage is reached only through `getIssueManager()` (INV-2); milestone JSON
 * I/O stays inside `lib/milestones.mjs`, which this module never bypasses.
 *
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";
import {
  milestoneCreate,
  milestoneList,
  milestoneShip,
  milestoneDefer,
  findMilestone,
} from "../milestones.mjs";

const MILESTONE_USAGE = "usage: adev issues milestone <create|list|ship|defer> [args]";
const CREATE_USAGE =
  "usage: adev issues milestone create <name> [--target <YYYY-MM-DD>] " +
  "[--strategy <manual|tag-only|release-please>] [--check <type>]... [--confirm \"<text>\"]...";
const LIST_USAGE = "usage: adev issues milestone list";
const SHIP_USAGE = "usage: adev issues milestone ship <name> [--yes] [--gate-timeout <ms>]";
const DEFER_USAGE = "usage: adev issues milestone defer <name> --reason \"<text>\"";

const SUBS = ["create", "list", "ship", "defer"];

/**
 * Mirrors `GATE_TIMEOUT_MS` in lib/milestones.mjs, which does not export it.
 * Only used to NAME the budget in a refusal message — the lib still owns the
 * value it actually enforces.
 */
const DEFAULT_GATE_TIMEOUT_MS = 5 * 60 * 1000;

const CREATE_OPTIONS = {
  target: { type: "string" },
  strategy: { type: "string" },
  check: { type: "string", multiple: true },
  confirm: { type: "string", multiple: true },
};
const LIST_OPTIONS = {};
const SHIP_OPTIONS = {
  yes: { type: "boolean" },
  "gate-timeout": { type: "string" },
};
const DEFER_OPTIONS = {
  reason: { type: "string" },
};

/**
 * Print a thrown lib/adapter failure as `<CODE>: <message>` and pick exit 1.
 * Guard refusals never arrive here — `milestoneShip` returns them as data.
 *
 * @param {Error & { code?: string }} err
 * @returns {number} exit code
 */
function reportThrow(err) {
  const code = err && err.code;
  console.error(code ? `${code}: ${err.message}` : (err && err.message) || String(err));
  return 1;
}

/**
 * Parse one sub-verb's argv, enforcing the positional arity.
 *
 * @returns {{ values: object, positionals: string[] } | null} null after the
 *   usage error has already been printed.
 */
function parseFor(argv, options, usage, arity) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true });
  } catch (err) {
    console.error(err.message);
    console.error(usage);
    return null;
  }
  if (parsed.positionals.length !== arity) {
    console.error(usage);
    return null;
  }
  return parsed;
}

/** `adev issues milestone create <name>` — create or idempotently update. */
async function runCreate({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, CREATE_OPTIONS, CREATE_USAGE, 1);
  if (!parsed) return 1;

  const [name] = parsed.positionals;
  const { target, strategy, check, confirm } = parsed.values;

  let entry;
  try {
    const issueManager = getIssueManager(manifest, projectRoot);
    entry = await milestoneCreate(projectRoot, name, {
      issueManager,
      targetDate: target,
      strategy,
      checks: check,
      confirms: confirm,
    });
  } catch (err) {
    return reportThrow(err);
  }

  console.log(`Milestone '${entry.name}' (${entry.status})`);
  console.log(`  target: ${entry.target_date ?? "none"}`);
  console.log(`  epic: ${entry.epic_id ?? "none — epic creation failed, link it later"}`);
  console.log(`  strategy: ${entry.release?.strategy ?? "manual (default)"}`);
  for (const criterion of entry.ship_criteria ?? []) {
    if (criterion.check) console.log(`  ship criterion (auto): ${criterion.check}`);
    else if (criterion.confirm) console.log(`  ship criterion (confirm): ${criterion.confirm}`);
  }
  return 0;
}

/** `adev issues milestone list` — the Name/Status/Target/Epic/Progress table. */
async function runList({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, LIST_OPTIONS, LIST_USAGE, 0);
  if (!parsed) return 1;

  try {
    const issueManager = getIssueManager(manifest, projectRoot);
    console.log(await milestoneList(projectRoot, { issueManager }));
  } catch (err) {
    return reportThrow(err);
  }
  return 0;
}

/**
 * `adev issues milestone ship <name>` — evaluate ship criteria, then ship.
 *
 * `confirmFn` is supplied unconditionally (see the header). Without `--yes` it
 * resolves `false`, which makes `milestoneShip` stop at the first manual
 * confirmation and return `confirmRejected` with nothing written; with `--yes`
 * it resolves `true` and every confirmation is treated as answered.
 */
async function runShip({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, SHIP_OPTIONS, SHIP_USAGE, 1);
  if (!parsed) return 1;

  const [name] = parsed.positionals;
  const { yes } = parsed.values;

  let gateTimeoutMs;
  const rawTimeout = parsed.values["gate-timeout"];
  if (rawTimeout !== undefined) {
    gateTimeoutMs = Number(rawTimeout);
    if (!Number.isInteger(gateTimeoutMs) || gateTimeoutMs <= 0) {
      console.error(`invalid --gate-timeout: ${rawTimeout}. Expected a positive integer (milliseconds)`);
      console.error(SHIP_USAGE);
      return 1;
    }
  }

  // ALWAYS a function — never `yes ? fn : undefined`. See the header comment.
  const confirmFn = async () => Boolean(yes);

  let result;
  try {
    const issueManager = getIssueManager(manifest, projectRoot);
    result = await milestoneShip(projectRoot, name, {
      issueManager,
      manifest,
      confirmFn,
      ...(gateTimeoutMs !== undefined ? { gateTimeoutMs } : {}),
    });
  } catch (err) {
    return reportThrow(err);
  }

  if (result.shipped === false) {
    return reportRefusal(name, result, Boolean(yes), gateTimeoutMs ?? DEFAULT_GATE_TIMEOUT_MS);
  }

  const record = safeFindMilestone(projectRoot, name);
  if (result.skipped) {
    console.log(`Milestone '${name}' is already shipped — nothing to do.`);
    return 0;
  }
  console.log(`Shipped milestone '${name}' (strategy: ${result.strategy ?? "manual"})`);
  console.log(`  epic: ${record?.epic_id ?? "none linked"}`);
  if (result.tag) console.log(`  tag: ${result.tag}`);
  return 0;
}

/** Read the milestone record for display only; never fatal. */
function safeFindMilestone(projectRoot, name) {
  try {
    return findMilestone(projectRoot, name);
  } catch {
    return null;
  }
}

/**
 * Translate a `{ shipped: false, … }` result into stderr output + exit 2.
 * Nothing was written — every branch here is a refusal, not a partial ship.
 *
 * `gateBudgetMs` is the per-gate wall-clock budget that was in force. It is
 * reported alongside a timed-out gate because the caller cannot otherwise tell
 * a hung gate from a failing one, and because the timeout detail the lib
 * produces is platform-dependent (`execFileSync` surfaces the kill as
 * `ETIMEDOUT` on current Node, not as the `killed`/`SIGTERM` pair
 * `lib/milestones.mjs` looks for, so its own "timed out after Nms" string may
 * never appear).
 */
function reportRefusal(name, result, yes, gateBudgetMs) {
  if (result.confirmRejected !== undefined) {
    console.error(`Refusing to ship '${name}': a manual confirmation is not answered.`);
    console.error(`  not confirmed: ${result.confirmRejected}`);
    for (const entry of result.results ?? []) {
      if (entry.passed === null && entry.confirm !== result.confirmRejected) {
        console.error(`  also pending: ${entry.confirm}`);
      }
    }
    if (!yes) {
      console.error("Ask the user to confirm each item above, then re-run with --yes.");
    }
    return 2;
  }

  if (result.error === "TAG_EXISTS") {
    console.error(`Refusing to ship '${name}': git tag ${result.tag} already exists.`);
    return 2;
  }

  const failed = (result.results ?? []).filter((r) => r.passed === false);
  console.error(
    `Refusing to ship '${name}': ${failed.length} ship criteri${failed.length === 1 ? "on" : "a"} failed.`
  );
  for (const entry of failed) {
    console.error(`  failed check: ${entry.check}${entry.detail ? ` — ${entry.detail}` : ""}`);
    for (const gate of entry.gates ?? []) {
      if (gate.passed) continue;
      const detail = gate.detail || "no output";
      if (/\bETIMEDOUT\b|timed out|timeout/i.test(detail)) {
        console.error(
          `    gate '${gate.id}' (${gate.severity}) timed out after its ${gateBudgetMs}ms budget: ${detail}`
        );
      } else {
        console.error(`    gate '${gate.id}' (${gate.severity}): ${detail}`);
      }
    }
    for (const warning of entry.warnings ?? []) console.error(`    warning: ${warning}`);
  }
  return 2;
}

/** `adev issues milestone defer <name> --reason "<text>"`. */
async function runDefer({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, DEFER_OPTIONS, DEFER_USAGE, 1);
  if (!parsed) return 1;

  const [name] = parsed.positionals;
  const { reason } = parsed.values;

  if (reason === undefined || reason === "") {
    console.error("--reason is required: a deferral with no recorded reason is unreviewable");
    console.error(DEFER_USAGE);
    return 1;
  }

  let entry;
  try {
    const issueManager = getIssueManager(manifest, projectRoot);
    entry = await milestoneDefer(projectRoot, name, reason, { issueManager });
  } catch (err) {
    return reportThrow(err);
  }

  console.log(`Deferred milestone '${entry.name}': ${entry.defer_reason}`);
  return 0;
}

/**
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run({ projectRoot, argv = [], manifest }) {
  const sub = argv[0];

  if (!sub) {
    help();
    return 1;
  }
  if (sub === "--help" || sub === "-h") {
    help();
    return 0;
  }
  if (!SUBS.includes(sub)) {
    console.error(`unknown milestone subcommand: ${sub}`);
    help();
    return 1;
  }

  const rest = argv.slice(1);
  if (rest.includes("--help") || rest.includes("-h")) {
    help(sub);
    return 0;
  }

  const ctx = { projectRoot, argv: rest, manifest };
  if (sub === "create") return runCreate(ctx);
  if (sub === "list") return runList(ctx);
  if (sub === "ship") return runShip(ctx);
  return runDefer(ctx);
}

export function help(sub) {
  if (sub === "create") {
    console.log(CREATE_USAGE);
    console.log("");
    console.log("Create a milestone in .context-index/milestones.json and link a new epic");
    console.log("to it. Re-running with an existing name updates that milestone in place");
    console.log("and creates no second epic.");
    console.log("");
    console.log("--target <YYYY-MM-DD>   target date");
    console.log("--strategy <s>          manual (default), tag-only, or release-please");
    console.log("--check <type>          auto-checked ship criterion; repeatable");
    console.log("                        (all_issues_closed, gates_pass)");
    console.log("--confirm \"<text>\"      manual ship criterion; repeatable");
    return;
  }

  if (sub === "list") {
    console.log(LIST_USAGE);
    console.log("");
    console.log("Print every milestone as a Name / Status / Target Date / Epic / Progress");
    console.log("table. Progress counts open vs total issues on the linked epic; an epic id");
    console.log("that no longer exists on the board is shown as `<id> (broken)`.");
    return;
  }

  if (sub === "ship") {
    console.log(SHIP_USAGE);
    console.log("");
    console.log("Evaluate the milestone's ship criteria and, if they all pass, mark it");
    console.log("shipped and close its epic (plus the release action its strategy names).");
    console.log("");
    console.log("--yes                   answer every manual confirmation with yes");
    console.log("--gate-timeout <ms>     per-gate wall-clock budget (default 300000)");
    console.log("");
    console.log("Exit 2 means the ship was REFUSED and nothing was written: an auto-check");
    console.log("failed, a quality gate failed or timed out, or a manual confirmation is");
    console.log("unanswered. Without --yes every manual confirmation counts as unanswered,");
    console.log("so the pending items are listed for you to put to the user; re-run with");
    console.log("--yes once they have confirmed. Exit 1 is a usage error or a lib failure");
    console.log("(MILESTONE_NOT_FOUND, BROKEN_EPIC, UNKNOWN_STRATEGY, …).");
    return;
  }

  if (sub === "defer") {
    console.log(DEFER_USAGE);
    console.log("");
    console.log("Mark a milestone deferred, record why, and defer its linked epic.");
    console.log("");
    console.log("--reason <text>   required; stored as the milestone's defer_reason");
    console.log("");
    console.log("A shipped milestone cannot be deferred (ALREADY_SHIPPED, exit 1).");
    return;
  }

  console.log(MILESTONE_USAGE);
  console.log("");
  console.log("Subcommands:");
  console.log("  create   Create or idempotently update a milestone, with a linked epic");
  console.log("  list     Print every milestone with its epic and issue progress");
  console.log("  ship     Evaluate ship criteria, then mark the milestone shipped");
  console.log("  defer    Mark a milestone deferred with a recorded reason");
  console.log("");
  console.log("Run `adev issues milestone <subcommand> --help` for subcommand-specific help.");
}

export default { run, help };
