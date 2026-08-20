/**
 * `adev issues epic` — create one epic in the epic store.
 *
 * Why this is a SEPARATE verb from `adev issues create --type epic`, and not a
 * flag on it: the two write to different stores, and only one of them is the
 * store the rest of the board reads.
 *
 *   - `create()` puts every item — `--type epic` included — into
 *     `board.issues`, and `validateIssue` ends in a fixed whitelist that has no
 *     `milestone` key, so a milestone passed there is dropped SILENTLY (the
 *     same failure mode that cost us the issue body in issue-484 and the epic
 *     body in issue-80m9s2).
 *   - `createEpic()` is the only path that reaches `board.epics`, and
 *     `board.epics` is the only store `listEpics()` reads. `adev issues board`,
 *     `adev issues list --milestone` and `adev issues update --milestone` all
 *     go through `listEpics()`, so an "epic" minted through
 *     `create({ type: "epic" })` is invisible to every one of them.
 *
 * So `create --type epic` is not a substitute for this verb, and this verb is
 * not a synonym for it. `adev issues create` refuses `--milestone` outright and
 * points here rather than accepting a value it would lose.
 *
 * Like every issues sub-verb, storage is reached through `getIssueManager()`,
 * which resolves the storage root from the git common dir — so an epic created
 * from a linked worktree lands on the one real board, where a raw `br` call
 * would die with SYNC_CONFLICT.
 *
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";

const USAGE = "usage: adev issues epic <title> [--milestone <name>] [--json]";

const OPTIONS = {
  milestone: { type: "string" },
  json: { type: "boolean" },
};

/**
 * Build the adapter payload from parsed flags.
 *
 * An absent `--milestone` is left `undefined` rather than defaulted here —
 * `validateEpic` owns the defaults, and duplicating them would create a second
 * place for them to drift.
 *
 * @param {string} title
 * @param {Record<string, string|boolean|undefined>} values
 * @returns {object} payload for `manager.createEpic()`
 */
export function buildPayload(title, values) {
  const payload = { title };
  if (values.milestone !== undefined) payload.milestone = values.milestone;
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

  // The title is positional, and exactly one is required: joining extras would
  // silently accept an unquoted multi-word title and swallow a typo'd flag with
  // it. Same rule as `adev issues create`.
  if (parsed.positionals.length !== 1) {
    console.error(
      parsed.positionals.length === 0
        ? "a title is required (quote it if it contains spaces)"
        : `expected exactly one title, got ${parsed.positionals.length} (quote the title)`
    );
    console.error(USAGE);
    return 1;
  }

  let created;
  try {
    const manager = getIssueManager(manifest, projectRoot);
    created = await manager.createEpic(buildPayload(parsed.positionals[0], parsed.values));
  } catch (err) {
    console.error(err.code ? `${err.code}: ${err.message}` : err.message);
    return 1;
  }

  if (parsed.values.json) {
    console.log(JSON.stringify(created, null, 2));
    return 0;
  }

  console.log(`Created epic ${created.id}: ${created.title}`);
  if (created.milestone) console.log(`  milestone: ${created.milestone}`);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Create one epic — a plan-level container — in the EPIC store.");
  console.log("Prints `Created epic <id>: <title>`, or the full record with --json.");
  console.log("");
  console.log("This is not the same as `adev issues create --type epic`. That verb");
  console.log("writes to the issue store; only an epic created here is visible to");
  console.log("`adev issues board`, `adev issues list --milestone` and");
  console.log("`adev issues update --milestone`, all of which read the epic store.");
  console.log("");
  console.log("--milestone <name>  file the epic under a milestone. Omitted means the");
  console.log("                    epic carries none; set one later with");
  console.log("                    `adev issues update <id> --milestone <name>`.");
  console.log("");
  console.log("Always prefer this over calling the backend binary (`br create`)");
  console.log("directly: the storage root is resolved from the git common dir, so an");
  console.log("epic created from a linked worktree reaches the one real board.");
}

export default { run, help };
