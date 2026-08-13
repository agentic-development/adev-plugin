/**
 * `adev issues claim <id>` / `adev issues release <id>` — cooperative
 * ownership for the issue board.
 *
 * Why this lives on the board rather than in `gh`: the board is the only
 * store shared across every worktree of a repo (`lib/issues/resolve-root.mjs`
 * resolves it to the main checkout), so "is someone already doing this?" is
 * answerable offline, without a network round-trip, from any worktree.
 *
 * The check-and-set itself is the adapter's job — `JsonAdapter.claim` runs
 * the precondition inside its CAS retry loop, so two agents racing for the
 * same issue cannot both win. This module only parses args, dispatches, and
 * maps error codes onto exit codes.
 *
 * Exit codes:
 *   0  claim/release succeeded (or was an idempotent no-op)
 *   1  usage error, unknown issue, or a backend with no atomic claim
 *   2  refused — the issue is held by someone else, or is closed
 *
 * Uses only Node.js built-ins.
 */

import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";

const CLAIM_USAGE =
  "usage: adev issues claim <id> --owner <name> [--branch <branch>] [--pr <ref>] [--json]";
const RELEASE_USAGE =
  "usage: adev issues release <id> --owner <name> [--force] [--json]";

/** Error codes that mean "refused, and the caller must not proceed" (exit 2). */
const REFUSAL_CODES = new Set([
  "ISSUE_ALREADY_CLAIMED",
  "CLAIM_OWNER_MISMATCH",
  "ISSUE_CLOSED",
]);

const OPTIONS = {
  owner: { type: "string" },
  branch: { type: "string" },
  pr: { type: "string" },
  force: { type: "boolean" },
  json: { type: "boolean" },
};

/**
 * Resolve the claimant: `--owner` wins, then `ADEV_ISSUE_OWNER` from the
 * environment (so an agent runner can set it once per session).
 */
function resolveOwner(values) {
  return values.owner || process.env.ADEV_ISSUE_OWNER || "";
}

function summarize(issue) {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    owner: issue.owner ?? null,
    claimed_at: issue.claimed_at ?? null,
    branch: issue.branch ?? null,
    pr: issue.pr ?? null,
    // Present only when this claim took over an expired lease. Ephemeral —
    // the displaced owner is reported, never written to the board.
    takeover: issue.takeover ?? null,
  };
}

/**
 * @param {"claim"|"release"} action
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run(action, { projectRoot, argv, manifest }) {
  const usage = action === "claim" ? CLAIM_USAGE : RELEASE_USAGE;

  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(err.message);
    console.error(usage);
    return 1;
  }

  const [id, ...extra] = parsed.positionals;
  if (!id || extra.length > 0) {
    console.error(usage);
    return 1;
  }

  const owner = resolveOwner(parsed.values);
  if (!owner) {
    console.error("owner is required — pass --owner <name> or set ADEV_ISSUE_OWNER");
    console.error(usage);
    return 1;
  }

  // Adapter construction can legitimately fail (br missing, br below the
  // supported floor). Those are operator-actionable messages, not bugs — the
  // uncaught throw reached the top-level handler and printed a stack trace
  // above the very line the operator needed to read.
  let manager;
  try {
    manager = getIssueManager(manifest, projectRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  if (typeof manager[action] !== "function") {
    console.error(
      `CLAIM_UNSUPPORTED_BACKEND: the "${manager.name}" backend has no atomic ` +
        `${action} operation. Set tasks.backend: json in manifest.yaml ` +
        `(a non-atomic fallback would defeat the purpose of claiming).`
    );
    return 1;
  }

  let issue;
  try {
    issue =
      action === "claim"
        ? await manager.claim(id, owner, {
            branch: parsed.values.branch,
            pr: parsed.values.pr,
          })
        : await manager.release(id, owner, { force: parsed.values.force === true });
  } catch (err) {
    console.error(err.message);
    return REFUSAL_CODES.has(err.code) ? 2 : 1;
  }

  if (parsed.values.json) {
    console.log(JSON.stringify(summarize(issue), null, 2));
    return 0;
  }

  if (action === "claim") {
    if (issue.takeover) {
      // stderr, not stdout: a takeover is a fact about someone else's dead
      // session, and it must be visible even when stdout is being parsed.
      console.error(
        `took over an expired claim on ${issue.id} from "${issue.takeover.previous_owner}" ` +
          `(claimed ${issue.takeover.previous_claimed_at ?? "unknown"}, ` +
          `lease ${issue.takeover.ttl_minutes} min)`
      );
    }
    const parts = [`claimed ${issue.id} for ${issue.owner} at ${issue.claimed_at}`];
    if (issue.branch) parts.push(`branch=${issue.branch}`);
    if (issue.pr) parts.push(`pr=${issue.pr}`);
    console.log(parts.join(" — "));
  } else {
    console.log(`released ${issue.id} (owner cleared)`);
  }
  return 0;
}

export function help() {
  console.log(CLAIM_USAGE);
  console.log(RELEASE_USAGE);
  console.log("");
  console.log("Bind an issue to whoever is working it, plus the branch/PR carrying");
  console.log("the work. The board is shared across worktrees, so a claim is visible");
  console.log("to every agent on the repo without calling `gh`.");
  console.log("");
  console.log("claim is a check-and-set: it refuses (exit 2) when a DIFFERENT owner");
  console.log("already holds the issue. Re-claiming as the same owner is idempotent");
  console.log("and preserves the original claimed_at.");
  console.log("");
  console.log("A claim is a LEASE. It expires `tasks.claim_ttl_minutes` after");
  console.log("claimed_at (default 240; 0 disables expiry), after which any claimant");
  console.log("takes it over with a fresh claimed_at — so a crashed session cannot");
  console.log("hold an issue forever. The displaced owner is reported on the takeover,");
  console.log("not stored. List expired leases with `adev issues stale`.");
  console.log("");
  console.log("release is lease-blind: the holder may always release, stale or not,");
  console.log("and a non-holder still needs --force.");
  console.log("");
  console.log("--owner defaults to $ADEV_ISSUE_OWNER when set.");
}

export default { run, help };
