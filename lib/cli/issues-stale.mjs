/**
 * `adev issues stale` — report claims whose lease has expired (issue-610).
 *
 * A claim is a lease: past `tasks.claim_ttl_minutes` the holder no longer
 * blocks a new claimant (`adev issues claim` takes it over). This verb makes
 * that state visible BEFORE someone hits it — `/adev:status` surfaces the list
 * so an abandoned session shows up as a report line rather than as a mystery
 * refusal on the next claim attempt.
 *
 * Read-only: it never mutates the board, so it works on every backend,
 * including ones with no atomic claim primitive.
 *
 * Closed issues are excluded even when they still carry a claim (`close()`
 * never clears `owner`), because nothing about them is actionable.
 *
 * Two buckets, because they need different actions:
 *   stale        — lease expired; `adev issues claim <id> --owner <you>` wins it
 *   unexpirable  — `owner` set with no parseable `claimed_at`; these can NEVER
 *                  go stale on their own (staleness is fail-closed), so they
 *                  are the exact "blocks forever" shape this issue exists to
 *                  kill. Clear with `adev issues release <id> --owner <holder>`
 *                  (or `--force`).
 *
 * Exit code is always 0 on a successful scan — this is a report, not a gate.
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";
import {
  isClaimStale,
  isClaimUnexpirable,
  resolveClaimTtlMinutes,
} from "../issues/interface.mjs";

const USAGE = "usage: adev issues stale [--json]";

const OPTIONS = {
  json: { type: "boolean" },
};

function describe(issue, nowMs) {
  const claimedAtMs = Date.parse(issue.claimed_at ?? "");
  const ageMinutes = Number.isFinite(claimedAtMs)
    ? Math.floor((nowMs - claimedAtMs) / 60_000)
    : null;
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    owner: issue.owner ?? null,
    claimed_at: issue.claimed_at ?? null,
    age_minutes: ageMinutes,
    branch: issue.branch ?? null,
    pr: issue.pr ?? null,
  };
}

function formatAge(minutes) {
  if (minutes === null) return "unknown age";
  if (minutes < 60) return `${minutes}m ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? `${m}m` : ""} ago`;
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

  if (parsed.positionals.length > 0) {
    console.error(USAGE);
    return 1;
  }

  let manager;
  let ttlMinutes;
  let issues;
  try {
    manager = getIssueManager(manifest, projectRoot);
    ttlMinutes = resolveClaimTtlMinutes(manager, manifest);
    issues = await manager.list();
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const nowMs = Date.now();
  const lease = { ttlMs: ttlMinutes * 60_000, now: nowMs };

  const stale = [];
  const unexpirable = [];
  let liveCount = 0;

  for (const issue of issues) {
    if (!issue.owner) continue;
    // `close()` does not clear owner/claimed_at — only `release()` does — so an
    // issue closed while claimed keeps its claim forever. Listing those would
    // fill the report with rows nobody can act on (claiming them returns
    // ISSUE_CLOSED, and there is no work left to recover), and a report that is
    // mostly noise is a report people stop reading. Same principle the gate
    // encodes: expiry frees a claim, it does not reopen work.
    if (issue.status === "closed") continue;
    if (isClaimUnexpirable(issue)) unexpirable.push(describe(issue, nowMs));
    else if (isClaimStale(issue, lease)) stale.push(describe(issue, nowMs));
    else liveCount += 1;
  }

  if (parsed.values.json) {
    console.log(
      JSON.stringify(
        {
          ttl_minutes: ttlMinutes,
          expiry_enabled: ttlMinutes > 0,
          generated_at: new Date(nowMs).toISOString(),
          stale,
          unexpirable,
          live_count: liveCount,
        },
        null,
        2
      )
    );
    return 0;
  }

  const ttlLabel = ttlMinutes > 0 ? `TTL ${ttlMinutes} min` : "expiry disabled";

  if (stale.length === 0 && unexpirable.length === 0) {
    console.log(`No stale claims (${ttlLabel}). Live claims: ${liveCount}.`);
    return 0;
  }

  if (stale.length > 0) {
    console.log(`Stale claims (${ttlLabel}): ${stale.length}`);
    for (const c of stale) {
      const refs = [c.branch && `branch=${c.branch}`, c.pr && `pr=${c.pr}`].filter(Boolean);
      console.log(
        `  ${c.id}  ${c.owner}  claimed ${formatAge(c.age_minutes)}` +
          (refs.length ? `  ${refs.join(" ")}` : "") +
          `  — ${c.title}`
      );
    }
    console.log("  Take one over: adev issues claim <id> --owner <you>");
  }

  if (unexpirable.length > 0) {
    console.log(`Claims that cannot expire — no claimed_at: ${unexpirable.length}`);
    for (const c of unexpirable) {
      console.log(`  ${c.id}  ${c.owner}  — ${c.title}`);
    }
    console.log("  Clear one: adev issues release <id> --owner <holder> [--force]");
  }

  console.log(`Live claims: ${liveCount}.`);
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("List claims whose lease has expired, so an abandoned session shows up");
  console.log("as a report line instead of blocking an issue silently. Read-only.");
  console.log("");
  console.log("A claim goes stale `tasks.claim_ttl_minutes` after claimed_at (default");
  console.log("240; set 0 to disable expiry). A stale claim no longer refuses a new");
  console.log("claimant — `adev issues claim` takes it over and records a fresh");
  console.log("claimed_at.");
  console.log("");
  console.log("Claims with an owner but no parseable claimed_at are listed separately:");
  console.log("staleness is fail-closed, so those never expire on their own.");
  console.log("");
  console.log("--json emits { ttl_minutes, expiry_enabled, generated_at, stale[],");
  console.log("unexpirable[], live_count } for /adev:status.");
}

export default { run, help };
