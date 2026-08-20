/**
 * `adev issues board` — print the whole issue board as canonical markdown.
 *
 * Why this verb exists: the `/adev:issues` Board Display step used to be a
 * pair of fenced-JS blocks telling the agent to import `getIssueManager` and
 * `renderTasksMd` itself. That is a lib directive with runtime semantics and
 * no CLI surface behind it, so an agent reading the step has nowhere to go but
 * the backend binary — and a raw `br` call resolves `.beads/` from CWD, which
 * inside a linked worktree opens the git-tracked `issues.jsonl` with no
 * `beads.db` beside it and dies with SYNC_CONFLICT. Going through the adapter
 * fixes that for free: `getIssueManager()` resolves the storage root via the
 * git common dir, so a board read from any worktree shows the one real board.
 *
 * Read-only by construction. This verb NEVER writes a file — `writeTasksMd`
 * is deliberately not imported here. `adev status --render` remains the only
 * writer of `.context-index/tasks/tasks.md`; the two are not interchangeable.
 *
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";
import { renderTasksMd } from "../issues/render-markdown.mjs";

const USAGE = "usage: adev issues board [--milestone <name>] [--json]";

const OPTIONS = {
  milestone: { type: "string" },
  json: { type: "boolean" },
};

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

  if (parsed.positionals.length > 0) {
    console.error(USAGE);
    return 1;
  }

  const epicFilters = {};
  if (parsed.values.milestone !== undefined) {
    epicFilters.milestone = parsed.values.milestone;
  }

  let epics;
  let issues;
  try {
    const manager = getIssueManager(manifest, projectRoot);
    epics = await manager.listEpics(epicFilters);
    issues = await manager.list();
  } catch (err) {
    console.error(err.code ? `${err.code}: ${err.message}` : err.message);
    return 1;
  }

  const board = { version: 1, epics, issues };

  if (parsed.values.json) {
    console.log(JSON.stringify(board, null, 2));
    return 0;
  }

  // `renderTasksMd` already terminates its output with a newline, and
  // console.log appends one of its own. Drop the trailing newline so stdout
  // is byte-identical to the renderer's output — the skill displays this
  // verbatim, and `adev status --render` writes the same bytes to tasks.md.
  const markdown = renderTasksMd(board);
  console.log(markdown.endsWith("\n") ? markdown.slice(0, -1) : markdown);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Print the whole issue board as canonical markdown — the same layout");
  console.log("`adev status --render` writes to .context-index/tasks/tasks.md. Epics");
  console.log("first, then open issues grouped by epic, then closed issues collapsed");
  console.log("under a <details> block.");
  console.log("");
  console.log("Read-only: this verb never writes a file. Use `adev status --render`");
  console.log("when you want the rendered board persisted to tasks.md.");
  console.log("");
  console.log("Always prefer this over calling the backend binary (`br list`)");
  console.log("directly: the storage root is resolved from the git common dir, so a");
  console.log("board read from a linked worktree reaches the one real board. A raw");
  console.log("`br` call in a worktree fails with SYNC_CONFLICT instead.");
  console.log("");
  console.log("--milestone restricts the epics section to one milestone.");
  console.log("--json emits { version, epics, issues } unrendered, for machine use.");
}

export default { run, help };
