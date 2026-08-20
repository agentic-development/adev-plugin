/**
 * `adev issues set-modules <id> <slug>[,<slug>...]` — v1's producer for
 * `WorkItem.affected_modules` (task-management/charter.md revision 8).
 *
 * Why this exists: bug-selection-and-eligibility.spec.md round-3 review
 * (WR-1) found that no producer for `affected_modules` existed anywhere in
 * that milestone's shipped Task Map — a bare `IssueManager.update(id, {
 * affected_modules })` call was described in spec prose as "invocable by
 * any script or one-off command a human runs," but no such script or
 * command actually existed in the codebase, so BEH-10's fail-closed default
 * was the only reachable outcome for every bug on every backend. This verb
 * closes that gap: it IS the script, named and testable, wired into the
 * `adev issues` dispatcher.
 *
 * Deliberately unpolished — this is not the eventual UX. It does not
 * validate slugs against `manifest.modules[]`, and it has no relationship
 * to GitHub labels. Both a richer `/adev:issues create/update
 * --affected-modules` flag and GitHub-label-based population remain
 * charter Deferred Capabilities. This verb's only job is to make "a human
 * or script can set affected_modules" true today, on both the JSON and
 * beads backends, via the existing `IssueManagerInterface.update()`
 * contract every backend already implements.
 *
 * Exit codes:
 *   0  update succeeded
 *   1  usage error, issue not found, or the backend rejected the update
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";

const USAGE = "usage: adev issues set-modules <id> <slug>[,<slug>...] [--json]";

const OPTIONS = {
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

  const [id, modulesArg, ...extra] = parsed.positionals;
  if (!id || !modulesArg || extra.length > 0) {
    console.error(USAGE);
    return 1;
  }

  const affected_modules = modulesArg
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0);

  if (affected_modules.length === 0) {
    console.error(`at least one module slug is required — ${USAGE}`);
    return 1;
  }

  let manager;
  try {
    manager = getIssueManager(manifest, projectRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  let issue;
  try {
    issue = await manager.update(id, { affected_modules });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const result = { id: issue.id, affected_modules: issue.affected_modules ?? affected_modules };

  if (parsed.values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(`${result.id}: affected_modules = [${result.affected_modules.join(", ")}]`);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Set WorkItem.affected_modules — the module-safety tag");
  console.log("`adev issues next` (bug-selection-and-eligibility.spec.md) consults for");
  console.log("its blast-radius (BEH-6) and reserved-tag safety (BEH-7) checks.");
  console.log("");
  console.log("An unset or empty value fails closed (BEH-10): the bug is never");
  console.log("autonomously selected until this is set. Slugs are manifest");
  console.log("`modules[].slug` values, or one of the reserved safety tags");
  console.log("(review-gate, convergence-detector, retry-loop, bugfix-loop).");
  console.log("");
  console.log("Comma-separate multiple slugs: adev issues set-modules issue-42 cli,hooks");
}

export default { run, help };
