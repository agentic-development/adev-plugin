/**
 * `adev issues update` / `close` / `dep` — the three board mutations.
 *
 * Why these verbs exist: the `/adev:issues` §Update, §Close and §Add Dependency
 * steps were prose lib directives. §Update was the worst of them — it told the
 * agent to decide whether `<id>` names an issue or an epic BY PREFIX
 * (`issue-*` vs `epic-*`) and then to call `update()` or `updateEpic()` itself.
 * That branch is wrong for any backend that does not mint prefixed ids (beads
 * ids carry no such prefix), it had no test behind it, and an agent handed a
 * lib call with no CLI surface has nowhere to go but the backend binary — a raw
 * `br` invocation resolves `.beads/` from CWD, so inside a linked worktree it
 * dies with SYNC_CONFLICT. The branch lives here now and is resolved BY LOOKUP:
 * ask the issue store first, then the epic store. Storage is reached through
 * `getIssueManager()`, which resolves the root from the git common dir.
 *
 * Exit codes (the load-bearing part):
 *   0  the mutation landed
 *   1  usage error or adapter failure — an unknown id is a 1, never a 2
 *   2  refused by a guard: the close guard (BLOCKED_BY_DEPENDENCIES), the
 *      cascade guard (CASCADE_BLOCKED), or cycle detection
 *      (CIRCULAR_DEPENDENCY)
 *
 * A refused mutation leaves the board untouched — the guards are evaluated by
 * the adapter inside its CAS operation, before any write is committed.
 *
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";
import { VALID_STATUSES } from "../issues/interface.mjs";

const UPDATE_USAGE =
  "usage: adev issues update <id> [--status <s>] [--milestone <name>] " +
  "[--title <text>] [--priority <0-4>] [--notes <text>]";
const CLOSE_USAGE = "usage: adev issues close <id> --reason <text>";
const DEP_USAGE = "usage: adev issues dep <id> <depends-on-id>";

/** Codes that mean "a guard refused this mutation" — exit 2, never 1. */
const GUARD_CODES = new Set(["BLOCKED_BY_DEPENDENCIES", "CASCADE_BLOCKED", "CIRCULAR_DEPENDENCY"]);

const UPDATE_OPTIONS = {
  status: { type: "string" },
  milestone: { type: "string" },
  title: { type: "string" },
  priority: { type: "string" },
  notes: { type: "string" },
};

const CLOSE_OPTIONS = {
  reason: { type: "string" },
};

const DEP_OPTIONS = {};

/**
 * Print an adapter failure and pick its exit code.
 *
 * Guard refusals are exit 2 and everything else — NOT_FOUND above all — is
 * exit 1. Keeping the mapping in one place is what stops a new adapter error
 * code from silently acquiring exit-2 semantics it was never granted.
 *
 * @param {Error & { code?: string, blockers?: string[] }} err
 * @param {string} id
 * @returns {number} exit code
 */
function reportFailure(err, id) {
  const code = err && err.code;

  if (code && GUARD_CODES.has(code)) {
    if (Array.isArray(err.blockers) && err.blockers.length > 0) {
      console.error(`Cannot close ${id}: blocked by ${err.blockers.join(", ")}. Close those first.`);
      for (const blocker of err.blockers) console.error(`  blocked by: ${blocker}`);
    } else {
      console.error(err.message);
    }
    return 2;
  }

  console.error(code ? `${code}: ${err.message}` : err.message);
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

/**
 * `adev issues update <id>` — edit an issue OR an epic from the id alone.
 *
 * The caller never says which store the id lives in: we look it up. `get()`
 * first, `listEpics()` second. No id prefix is inspected anywhere in here.
 */
async function runUpdate({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, UPDATE_OPTIONS, UPDATE_USAGE, 1);
  if (!parsed) return 1;

  const [id] = parsed.positionals;
  const { status, milestone, title, priority, notes } = parsed.values;

  if (
    status === undefined &&
    milestone === undefined &&
    title === undefined &&
    priority === undefined &&
    notes === undefined
  ) {
    console.error("nothing to update: pass at least one of --status, --milestone, --title, --priority, --notes");
    console.error(UPDATE_USAGE);
    return 1;
  }

  // The close guard is an invariant of the board, not of one code path: an
  // issue must never reach `closed` through an edit that skips the dependency
  // check. Refuse here and name the verb that does enforce it.
  if (status === "closed") {
    console.error(
      `Refusing to set ${id} to closed through update — it would skip the dependency guard.`
    );
    console.error(`Run \`adev issues close ${id} --reason <text>\` instead.`);
    return 1;
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    console.error(`invalid --status: ${status}. Valid: ${VALID_STATUSES.join(", ")}`);
    console.error(UPDATE_USAGE);
    return 1;
  }

  let priorityValue;
  if (priority !== undefined) {
    priorityValue = Number(priority);
    if (!Number.isInteger(priorityValue) || priorityValue < 0 || priorityValue > 4) {
      console.error(`invalid --priority: ${priority}. Valid: 0-4`);
      console.error(UPDATE_USAGE);
      return 1;
    }
  }

  const changes = {};
  if (status !== undefined) changes.status = status;
  if (title !== undefined) changes.title = title;
  if (notes !== undefined) changes.notes = notes;
  if (priorityValue !== undefined) changes.priority = priorityValue;

  let manager;
  let issue;
  let epic;
  try {
    manager = getIssueManager(manifest, projectRoot);
    issue = await manager.get(id);
    if (!issue) {
      const epics = await manager.listEpics();
      epic = epics.find((e) => e.id === id) || null;
    }
  } catch (err) {
    return reportFailure(err, id);
  }

  if (!issue && !epic) {
    console.error(`NOT_FOUND: ${id} not found on the board (neither an issue nor an epic)`);
    return 1;
  }

  if (issue && milestone !== undefined) {
    console.error(
      `milestone is an epic-level field: ${id} is an issue, and issues do not carry a milestone.`
    );
    console.error("Set the milestone on the epic that owns it instead.");
    return 1;
  }

  if (epic && milestone !== undefined) changes.milestone = milestone;
  if (epic && priorityValue !== undefined) {
    console.error(`priority is an issue-level field: ${id} is an epic and carries no priority.`);
    return 1;
  }

  try {
    if (issue) {
      await manager.update(id, changes);
      console.log(`Updated ${id}: ${Object.keys(changes).join(", ")}`);
    } else {
      await manager.updateEpic(id, changes);
      console.log(`Updated epic ${id}: ${Object.keys(changes).join(", ")}`);
    }
  } catch (err) {
    return reportFailure(err, id);
  }
  return 0;
}

/**
 * `adev issues close <id> --reason <text>` — close through the guards.
 *
 * Both the dependency guard and the cascade guard refuse with exit 2 and name
 * every blocker they found; the board is left exactly as it was.
 */
async function runClose({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, CLOSE_OPTIONS, CLOSE_USAGE, 1);
  if (!parsed) return 1;

  const [id] = parsed.positionals;
  const { reason } = parsed.values;

  if (reason === undefined || reason === "") {
    console.error("--reason is required: a close with no recorded reason is unreviewable");
    console.error(CLOSE_USAGE);
    return 1;
  }

  try {
    const manager = getIssueManager(manifest, projectRoot);
    await manager.close(id, reason);
  } catch (err) {
    return reportFailure(err, id);
  }

  console.log(`Closed ${id}: ${reason}`);
  return 0;
}

/**
 * `adev issues dep <id> <depends-on-id>` — record a blocking dependency.
 *
 * Cycle detection lives in the adapter and refuses with exit 2, naming the
 * cycle it found.
 */
async function runDep({ projectRoot, argv, manifest }) {
  const parsed = parseFor(argv, DEP_OPTIONS, DEP_USAGE, 2);
  if (!parsed) return 1;

  const [id, dependsOnId] = parsed.positionals;

  try {
    const manager = getIssueManager(manifest, projectRoot);
    await manager.addDependency(id, dependsOnId);
  } catch (err) {
    return reportFailure(err, id);
  }

  console.log(`${id} now depends on ${dependsOnId}`);
  return 0;
}

/**
 * @param {"update"|"close"|"dep"} sub
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run(sub, ctx) {
  if (sub === "close") return runClose(ctx);
  if (sub === "dep") return runDep(ctx);
  return runUpdate(ctx);
}

export function help(sub) {
  if (sub === "close") {
    console.log(CLOSE_USAGE);
    console.log("");
    console.log("Close one board item, through the guards the board enforces.");
    console.log("");
    console.log("--reason <text>   required; recorded on the item's notes");
    console.log("");
    console.log("Exit 2 means a guard refused the close and the board is unchanged:");
    console.log("an open dependency, or an unclosed child of a tiered id. Every");
    console.log("blocker is named on stderr. Exit 1 is a usage error or an adapter");
    console.log("failure — an unknown id is a 1, not a 2.");
    return;
  }

  if (sub === "dep") {
    console.log(DEP_USAGE);
    console.log("");
    console.log("Record that <id> is blocked by <depends-on-id>. Both ids must exist.");
    console.log("");
    console.log("Exit 2 means the dependency would close a cycle (direct or transitive);");
    console.log("the cycle is reported and nothing is written. Adding a dependency that");
    console.log("is already recorded is a no-op success.");
    return;
  }

  console.log(UPDATE_USAGE);
  console.log("");
  console.log("Edit one board item. Pass ONLY the id — this verb resolves whether it");
  console.log("names an issue or an epic by looking it up, so no caller needs to read");
  console.log("an id prefix (and no caller breaks on a backend that mints ids without");
  console.log("one).");
  console.log("");
  console.log("--status <s>      one of: " + VALID_STATUSES.join(", "));
  console.log("--milestone <n>   epics only; issues carry no milestone");
  console.log("--title <text>    new title");
  console.log("--priority <0-4>  issues only");
  console.log("--notes <text>    replace the item's body");
  console.log("");
  console.log("`--status closed` is refused (exit 1): closing goes through");
  console.log("`adev issues close <id> --reason <text>`, which enforces the");
  console.log("dependency guard.");
}

export default { run, help };
