/**
 * `adev issues create` — create one board-granularity work item (epic, feature,
 * task, bug) through the resolved issue-manager adapter.
 *
 * Why this verb exists: skills used to be told to "call `create()` from
 * `lib/issues/registry.mjs`", which is a lib function with runtime semantics
 * and no CLI surface behind it. An agent reading that step has nowhere to go
 * but the backend binary — and a raw `br` invocation resolves `.beads/` from
 * CWD, so inside a linked worktree it opens the git-tracked `issues.jsonl`
 * with no `beads.db` beside it and dies with `SYNC_CONFLICT`. Routing through
 * the adapter fixes that for free: `getIssueManager()` resolves the storage
 * root via `resolveStorageRoot()` (git common dir), so a create issued from
 * any worktree lands on the one real board.
 *
 * Board granularity only. Plan-task state is tracked by `reportPlanTask` in
 * the lifecycle log, not as issues — so no `--plan-task` flag is exposed here
 * (the json adapter rejects `planTask` at board granularity anyway).
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";

const USAGE =
  "usage: adev issues create <title> [--type <type>] [--priority <0-4>] " +
  "[--epic <id>] [--plan-ref <path>] [--spec-ref <path>] [--parent <id>] " +
  "[--notes <text>] [--next-action <text>] [--id <id>] " +
  "[--affected-modules <slug>[,<slug>...]] [--json]";

const OPTIONS = {
  type: { type: "string" },
  priority: { type: "string" },
  epic: { type: "string" },
  "affected-modules": { type: "string" },
  // Parsed only so it can be REFUSED with a message that names the verb which
  // owns it. Left out of OPTIONS entirely, parseArgs would answer with a bare
  // "Unknown option '--milestone'", which reads as "not supported yet" rather
  // than "supported, on the other verb" — and the value would be lost either
  // way, since `validateIssue` has no `milestone` in its whitelist.
  milestone: { type: "string" },
  "plan-ref": { type: "string" },
  "spec-ref": { type: "string" },
  parent: { type: "string" },
  notes: { type: "string" },
  "next-action": { type: "string" },
  id: { type: "string" },
  json: { type: "boolean" },
};

/**
 * Build the adapter payload from parsed flags.
 *
 * Absent flags are left `undefined` rather than defaulted here — `type` and
 * `priority` have defaults inside `validateIssue`, and duplicating them would
 * create a second place for them to drift.
 *
 * @param {string} title
 * @param {Record<string, string|boolean|undefined>} values
 * @returns {object} payload for `manager.create()`
 */
export function buildPayload(title, values) {
  const payload = { title };
  if (values.type !== undefined) payload.type = values.type;
  if (values.priority !== undefined) payload.priority = Number(values.priority);
  if (values.epic !== undefined) payload.epicId = values.epic;
  if (values["plan-ref"] !== undefined) payload.planRef = values["plan-ref"];
  if (values["spec-ref"] !== undefined) payload.spec_ref = values["spec-ref"];
  if (values.parent !== undefined) payload.parent_id = values.parent;
  if (values.notes !== undefined) payload.notes = values.notes;
  if (values["next-action"] !== undefined) payload.next_action = values["next-action"];
  if (values.id !== undefined) payload.id = values.id;
  return payload;
}

/**
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    return 1;
  }

  // The title is positional so the common case reads like `br create`. Joining
  // extra positionals would silently accept an unquoted multi-word title and
  // swallow a typo'd flag with it, so require exactly one.
  if (parsed.positionals.length !== 1) {
    console.error(
      parsed.positionals.length === 0
        ? "a title is required (quote it if it contains spaces)"
        : `expected exactly one title, got ${parsed.positionals.length} (quote the title)`
    );
    console.error(USAGE);
    return 1;
  }

  // A milestone lives on the EPIC, and only `createEpic()` reaches the epic
  // store that `listEpics()` — and therefore `board`, `list --milestone` and
  // `update --milestone` — reads. Accepting it here would drop it silently.
  if (parsed.values.milestone !== undefined) {
    console.error(
      "milestone is an epic-level field: an issue created here carries none, and " +
        "the value would be dropped."
    );
    console.error(
      `Run \`adev issues epic "${parsed.positionals[0]}" --milestone ${parsed.values.milestone}\` instead.`
    );
    return 1;
  }

  const { priority } = parsed.values;
  if (priority !== undefined && !/^[0-4]$/.test(priority)) {
    console.error(`invalid --priority: ${priority}. Valid: 0-4`);
    return 1;
  }

  // Validated before create() runs: a rejected --affected-modules value must
  // leave nothing on the board, matching --milestone's and --priority's own
  // fail-before-write discipline above.
  let affectedModules;
  if (parsed.values["affected-modules"] !== undefined) {
    affectedModules = parsed.values["affected-modules"]
      .split(",")
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0);
    if (affectedModules.length === 0) {
      console.error("at least one module slug is required for --affected-modules");
      return 1;
    }
  }

  // Required, not merely accepted, for --type bug: this is the one durable
  // chokepoint ad hoc bug filing (this verb, `/adev:issues`, debug/review
  // auto-filing) all route through, and an omitted flag here was the actual
  // mechanism of adev-plugin-di0x — BEH-10's fail-closed default silently
  // excludes every bug filed without this tag, so a human (or caller) must
  // decide it explicitly at file time rather than leave it to a follow-up
  // `set-modules` call that, in practice, doesn't reliably happen. Pass a
  // reserved safety tag (e.g. `bugfix-loop`) to deliberately keep a bug out
  // of the loop while still recording a real decision.
  if (parsed.values.type === "bug" && affectedModules === undefined) {
    console.error(
      "--affected-modules <slug>[,<slug>...] is required for --type bug: an untagged bug is " +
        "invisible to /adev:bugfix-loop (fail-closed default, bug-selection-and-eligibility.spec.md BEH-10). " +
        "Pass a manifest modules[].slug, or a reserved safety tag (review-gate, convergence-detector, " +
        "retry-loop, bugfix-loop) to deliberately exclude this bug from autonomous selection."
    );
    return 1;
  }

  let created;
  try {
    const manager = getIssueManager(manifest, projectRoot);
    created = await manager.create(buildPayload(parsed.positionals[0], parsed.values));
    // create()'s validateIssue whitelist doesn't carry affected_modules (it
    // isn't a create-time concept in the interface today) — a bug filed
    // without this field is invisible to /adev:bugfix-loop (BEH-10's
    // fail-closed default) until a separate `set-modules` call lands.
    // Folding it into this same command closes that gap at the one call
    // site a caller (human or agent) actually has (adev-plugin-j2ev.3).
    if (affectedModules) {
      created = await manager.update(created.id, { affected_modules: affectedModules });
    }
  } catch (err) {
    console.error(err.code ? `${err.code}: ${err.message}` : err.message);
    return 1;
  }

  if (parsed.values.json) {
    console.log(JSON.stringify(created, null, 2));
    return 0;
  }

  console.log(`Created ${created.type} ${created.id}: ${created.title}`);
  if (created.planRef) console.log(`  plan: ${created.planRef}`);
  if (created.spec_ref) console.log(`  spec: ${created.spec_ref}`);
  if (created.parent_id) console.log(`  parent: ${created.parent_id}`);
  if (created.epicId) console.log(`  epic: ${created.epicId}`);
  if (created.affected_modules) console.log(`  affected_modules: [${created.affected_modules.join(", ")}]`);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Create one board-granularity work item (epic, feature, task, bug)");
  console.log("through the configured backend. Prints `Created <type> <id>: <title>`,");
  console.log("or the full record with --json.");
  console.log("");
  console.log("Always prefer this over calling the backend binary (`br create`)");
  console.log("directly: the storage root is resolved from the git common dir, so a");
  console.log("create issued from a linked worktree reaches the one real board. A raw");
  console.log("`br` call in a worktree fails with SYNC_CONFLICT instead, because the");
  console.log("worktree has a git-tracked issues.jsonl and no beads.db beside it.");
  console.log("");
  console.log("--type defaults to `task`; use `epic` for a plan-level container.");
  console.log("--priority defaults to 2 (0 = critical, 4 = backlog).");
  console.log("--epic <id> files the new issue under an existing epic (epicId).");
  console.log("");
  console.log("--milestone is REFUSED here (exit 1): milestones live on epics, in the");
  console.log("epic store this verb does not write to. Use");
  console.log("`adev issues epic \"<title>\" --milestone <name>`.");
  console.log("--id supplies an explicit id instead of minting one (migrations).");
  console.log("");
  console.log("--affected-modules <slug>[,<slug>...] sets the module-safety tag");
  console.log("/adev:bugfix-loop's eligibility filter fail-closes on when absent.");
  console.log("REQUIRED when --type bug (exit 1 otherwise): a bug filed without it is");
  console.log("invisible to the loop, and leaving that to a later `set-modules` call");
  console.log("regresses rather than closes the gap. Pass a reserved safety tag");
  console.log("(review-gate, convergence-detector, retry-loop, bugfix-loop) to");
  console.log("deliberately keep a bug out of autonomous selection. Applied as a");
  console.log("follow-up update() in this same command, after create() succeeds.");
  console.log("");
  console.log("Plan tasks are NOT issues — they live in the lifecycle log via");
  console.log("reportPlanTask — so there is no --plan-task flag.");
}

export default { run, help };
