/**
 * `adev issues next --type bug --max-priority <p> --json` — the read-only
 * bug-selection verb for the autonomous bugfix loop.
 *
 * Wraps `IssueManager.list()` and the eligibility filter
 * (`lib/issues/eligibility.mjs`) to return the single highest-priority
 * eligible bug, or `{"bug": null}` if none qualify. Never claims, closes,
 * or mutates the board or any AttemptRecord — read-only, like
 * `lib/cli/issues-stale.mjs`.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";
import { readAllAttemptRecords } from "../bugfix-loop-attempts.mjs";
import {
  resolvePriorityBound,
  validateBugType,
  selectNextEligibleBug,
} from "../issues/eligibility.mjs";
import { resolveClaimTtlMinutes } from "../issues/interface.mjs";

const USAGE = "usage: adev issues next [--type bug] [--max-priority P0-P4] [--json]";

const OPTIONS = {
  type: { type: "string" },
  "max-priority": { type: "string" },
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

  const { type: bugType, error: typeError } = validateBugType(parsed.values.type);
  if (typeError) {
    console.error(`${typeError.code}: ${typeError.message}`);
    return 1;
  }

  const { bound, error: boundError } = resolvePriorityBound(parsed.values["max-priority"]);
  if (boundError) {
    console.error(`${boundError.code}: ${boundError.message}`);
    return 1;
  }

  if (!manifest?.tasks?.backend) {
    console.error("ISSUE_BOARD_NOT_CONFIGURED: tasks.backend is not configured in manifest.yaml.");
    return 1;
  }

  let manager;
  let issues;
  try {
    manager = getIssueManager(manifest, projectRoot);
    // Fetch the FULL board (no type filter) — selectNextEligibleBug's
    // dependency check (BEH-4) must resolve blockers of ANY type, not just
    // bugs. Narrowing to `type: "bug"` candidates happens inside
    // selectNextEligibleBug itself, over the same full array used to build
    // its issuesById map. A bug-only fetch here would silently treat
    // non-bug blockers as "not found" = non-blocking.
    issues = await manager.list();
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const ttlMinutes = resolveClaimTtlMinutes(manager, manifest);

  // One JSONL read for every issue's AttemptRecord, not one read per issue
  // (readAttemptRecord re-parses the whole log on every call). Wrapped like
  // every other fallible call in this verb: a real I/O failure (e.g.
  // EACCES) must exit 1 cleanly, not crash uncaught — readAllAttemptRecords
  // already tolerates a missing file or corrupted JSONL lines internally,
  // this only guards against failures it does not (round-5 review cq-2).
  let attemptRecords;
  try {
    attemptRecords = readAllAttemptRecords(projectRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const { bug } = selectNextEligibleBug({
    issues,
    manifest,
    maxPriorityBound: bound,
    ttlMinutes,
    attemptRecords,
  });

  if (parsed.values.json) {
    console.log(JSON.stringify({ bug: bug ?? null }, null, 2));
    return 0;
  }

  console.log(bug ? `${bug.id}: ${bug.title} (P${bug.priority ?? 2})` : "No eligible bug.");
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Read-only: returns the next eligible bug (or {\"bug\": null}). Never");
  console.log("claims, closes, or mutates the board or any AttemptRecord.");
  console.log("");
  console.log("--type currently only accepts \"bug\" (default). --max-priority defaults");
  console.log("to P3 and rejects P0/P1 — those are outside the eligibility filter's");
  console.log("safety boundary and can never be selected via this verb.");
}

export default { run, help };
