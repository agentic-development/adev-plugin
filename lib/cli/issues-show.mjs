/**
 * `adev issues show <id> --json` — read-only single-issue JSON printer.
 *
 * The only CLI surface today that reads one `WorkItem`'s fields (including
 * `notes`) as JSON by id. Enabling infrastructure for
 * `tracker-provider-bridge.spec.md`'s Task 12: `skills/debug/SKILL.md`
 * Phase 1's fallback investigation-target read has no other way to get at
 * `WorkItem.notes` from a markdown-only skill surface (`cli-driver-surface`
 * charter — skills name a verb, never inline Node).
 *
 * On the github backend, where titles and bodies are attacker-editable, the
 * human form prints a neutralized one-line title and fences non-empty notes
 * in a fresh-nonce pack fence; `--json` keeps both byte-raw and adds
 * `untrusted_text`. Other backends print exactly as before.
 *
 * Exit codes:
 *   0  issue found, printed
 *   1  usage error, or issue not found
 *
 * Uses only Node.js built-ins.
 */

import { getIssueManager } from "../issues/registry.mjs";
import { fenceNotes, markUntrusted, neutralizeTitle } from "../issues/github/untrusted-text.mjs";

const USAGE = "usage: adev issues show <id> [--json]";

/**
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run({ projectRoot, argv, manifest }) {
  const id = argv && argv[0];
  const json = argv && argv.includes("--json");

  if (!id || id.startsWith("--")) {
    console.error(USAGE);
    return 1;
  }

  const manager = getIssueManager(manifest, projectRoot);
  let issue;
  try {
    issue = await manager.get(id);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  if (!issue) {
    console.error(`Issue "${id}" not found.`);
    return 1;
  }

  if (manager.name !== "github") {
    console.log(json ? JSON.stringify(issue) : `${issue.id}: ${issue.title} [${issue.status}]`);
    return 0;
  }

  if (json) {
    console.log(JSON.stringify(markUntrusted(issue)));
    return 0;
  }

  console.log(`${issue.id}: ${neutralizeTitle(issue.title)} [${issue.status}]`);
  if (typeof issue.notes === "string" && issue.notes !== "") console.log(fenceNotes(issue.notes));
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Read-only: prints one issue's fields as JSON (or a one-line summary).");
  console.log("Exits non-zero with a clear message if the id is not found.");
}

export default { run, help };
