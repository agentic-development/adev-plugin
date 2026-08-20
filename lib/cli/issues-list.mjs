/**
 * `adev issues list` / `adev issues ready` — read-only board queries.
 *
 * Why these verbs exist: the `/adev:issues` §List and §Ready steps were prose
 * lib directives. §Ready was the worse of the two — it spelled out the whole
 * unblocked filter in English ("call list({ status: 'open' }), then filter out
 * issues whose dependencies include any unclosed issues") and asked the agent
 * to re-derive it on every invocation, with no test behind the derivation. An
 * agent handed that has nowhere to go but the backend binary, and a raw `br`
 * call resolves `.beads/` from CWD — inside a linked worktree that dies with
 * SYNC_CONFLICT. Going through the adapter resolves the storage root from the
 * git common dir instead, and the filter lives here where a test can pin it.
 *
 * Read-only by construction: neither sub-verb mutates the board, so neither
 * can be refused by a guard and neither ever returns exit 2.
 *
 * Exit codes:
 *   0  the query ran (an empty result is still a success)
 *   1  usage error or adapter failure
 *
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";
import { VALID_STATUSES } from "../issues/interface.mjs";

const LIST_USAGE =
  "usage: adev issues list [--status <s>] [--epic <id>] [--milestone <name>] [--json]";
const READY_USAGE = "usage: adev issues ready [--json]";

const READY_HEADING = "Actionable issues — open and unblocked.";

const LIST_OPTIONS = {
  status: { type: "string" },
  epic: { type: "string" },
  milestone: { type: "string" },
  json: { type: "boolean" },
};

const READY_OPTIONS = {
  json: { type: "boolean" },
};

/**
 * Priority ascending (0 = most urgent), then oldest first. Applied here rather
 * than trusted from the adapter so every backend renders the same order.
 */
function byPriority(a, b) {
  return (
    (a.priority ?? 2) - (b.priority ?? 2) ||
    (a.created || "").localeCompare(b.created || "")
  );
}

function pad(value, width) {
  const s = String(value ?? "");
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * One row per issue: id, priority, status, type, title. Column widths are
 * measured over the rows being printed so short boards stay compact.
 */
function printTable(issues) {
  const idWidth = Math.max(...issues.map((i) => String(i.id).length));
  const statusWidth = Math.max(...issues.map((i) => String(i.status ?? "").length));
  const typeWidth = Math.max(...issues.map((i) => String(i.type ?? "").length));
  for (const issue of issues) {
    console.log(
      `  ${pad(issue.id, idWidth)}  P${issue.priority ?? 2}  ` +
        `${pad(issue.status, statusWidth)}  ${pad(issue.type, typeWidth)}  ${issue.title}`
    );
  }
}

async function runList({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: LIST_OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(err.message);
    console.error(LIST_USAGE);
    return 1;
  }

  if (parsed.positionals.length > 0) {
    console.error(LIST_USAGE);
    return 1;
  }

  const { status, epic, milestone, json } = parsed.values;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    console.error(`invalid --status: ${status}. Valid: ${VALID_STATUSES.join(", ")}`);
    console.error(LIST_USAGE);
    return 1;
  }

  const filters = {};
  if (status !== undefined) filters.status = status;
  if (epic !== undefined) filters.epicId = epic;

  let manager;
  let issues;
  let epics = null;
  try {
    manager = getIssueManager(manifest, projectRoot);
    issues = await manager.list(filters);
    if (milestone !== undefined) epics = await manager.listEpics({ milestone });
  } catch (err) {
    console.error(err.code ? `${err.code}: ${err.message}` : err.message);
    return 1;
  }

  if (milestone !== undefined) {
    // A milestone lives on the EPIC, not on the issue, so the filter is
    // "epics carrying this milestone, plus their children". No matching epic
    // means no issues can match either — say so instead of printing an empty
    // table the reader would have to interpret.
    if (epics.length === 0) {
      const message = `No epics found for milestone '${milestone}'.`;
      if (json) {
        console.error(message);
        console.log("[]");
      } else {
        console.log(message);
      }
      return 0;
    }
    const epicIds = new Set(epics.map((e) => e.id));
    issues = issues.filter((i) => epicIds.has(i.epicId));
  }

  const sorted = [...issues].sort(byPriority);

  if (json) {
    console.log(JSON.stringify(sorted, null, 2));
    return 0;
  }

  if (sorted.length === 0) {
    console.log("No issues match those filters.");
    return 0;
  }

  console.log(`Issues — ${sorted.length} shown, priority ascending.`);
  printTable(sorted);
  return 0;
}

async function runReady({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: READY_OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(err.message);
    console.error(READY_USAGE);
    return 1;
  }

  if (parsed.positionals.length > 0) {
    console.error(READY_USAGE);
    return 1;
  }

  let open;
  let all;
  try {
    const manager = getIssueManager(manifest, projectRoot);
    open = await manager.list({ status: "open" });
    all = await manager.list();
  } catch (err) {
    console.error(err.code ? `${err.code}: ${err.message}` : err.message);
    return 1;
  }

  const statusById = new Map(all.map((i) => [i.id, i.status]));

  // A dependency id that resolves to nothing cannot be evaluated, and a board
  // with one dangling reference must not hide every issue that touches it.
  // Treat it as non-blocking and say so on stderr, so the operator can repair
  // the board without the report silently lying about what is actionable.
  const dangling = new Set();
  const ready = open.filter((issue) =>
    (issue.dependencies || []).every((depId) => {
      if (!statusById.has(depId)) {
        dangling.add(`${issue.id} -> ${depId}`);
        return true;
      }
      return statusById.get(depId) === "closed";
    })
  );

  for (const ref of dangling) {
    console.error(`warning: dependency does not resolve to an issue on this board: ${ref}`);
  }

  const sorted = [...ready].sort(byPriority);

  if (parsed.values.json) {
    console.log(JSON.stringify(sorted, null, 2));
    return 0;
  }

  console.log(READY_HEADING);
  if (sorted.length === 0) {
    console.log("  (none)");
    return 0;
  }
  printTable(sorted);
  return 0;
}

/**
 * @param {"list"|"ready"} sub
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run(sub, ctx) {
  return sub === "ready" ? runReady(ctx) : runList(ctx);
}

export function help(sub) {
  if (sub === "ready") {
    console.log(READY_USAGE);
    console.log("");
    console.log("List exactly the issues that can be picked up right now: status open,");
    console.log("and every dependency already closed. Printed under the heading");
    console.log(`"${READY_HEADING}", priority ascending.`);
    console.log("");
    console.log("The unblocked filter lives in this verb, not in prose — an issue is");
    console.log("actionable when it is open and each id in dependencies[] resolves to a");
    console.log("closed issue. A dependency id that resolves to nothing is treated as");
    console.log("non-blocking and reported on stderr.");
    console.log("");
    console.log("Read-only, and never refused: exit is 0 even when nothing is ready.");
    console.log("--json emits the array of issues for machine use.");
    return;
  }

  console.log(LIST_USAGE);
  console.log("");
  console.log("List board issues as a table, priority ascending (0 first).");
  console.log("");
  console.log("--status <s>      one of: " + VALID_STATUSES.join(", "));
  console.log("--epic <id>       only issues belonging to that epic");
  console.log("--milestone <n>   only epics carrying that milestone, and their child");
  console.log("                  issues. With no epic on the milestone, prints");
  console.log("                  \"No epics found for milestone '<name>'.\"");
  console.log("--json            emit the array of issues unrendered");
  console.log("");
  console.log("Read-only. Always prefer this over calling the backend binary");
  console.log("(`br list`) directly: the storage root is resolved from the git common");
  console.log("dir, so a list read from a linked worktree reaches the one real board.");
}

export default { run, help };
