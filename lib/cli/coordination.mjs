// lib/cli/coordination.mjs
//
// `adev coordination scan` — the pre-flight concurrency scan for
// `/adev:work` Step 1.
//
// Why this exists: Step 1 of `/adev:work` scanned four purely LOCAL signals
// (execution state, plan-task projection, lifecycle states, recent sessions).
// All four are blind to other agents. Measured consequence (issue-606): two
// agents fixed the same p0 vulnerability an hour apart (duplicate PRs #214 /
// #215 for issue-582), and a whole concurrent epic (epic-102) stayed
// invisible to a study pursuing the same goal.
//
// This verb reads the three signals that are SHARED rather than worktree-local:
//   1. open pull requests           (`gh pr list --json …`)
//   2. remote branches              (`git for-each-ref refs/remotes`)
//   3. issues in `in_progress` on the board, held by someone else
//      (the board resolves to the main checkout via lib/issues/resolve-root.mjs,
//      so it is the one store every worktree agrees on)
//
// Source spec: .context-index/specs/features/work/work-triage-and-routing.spec.md
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP. This is an observational scan invoked
//     from inside Step 1 of a skill; it is not a lifecycle step entry/exit,
//     so the cli-driver pattern test will not assert requireGate-first.
//
// Exit codes:
//   0  scan completed — INCLUDING a fully degraded scan (no gh, no git, no
//      board). Findings are data, never a failure: this runs at the top of
//      every `/adev:work` and must never block it.
//   1  usage / argument error only.
//   (2 is deliberately never returned.)
//
// CLI surface:
//   adev coordination scan [--json] [--owner <name>] [--limit <n>]
//
// Stdout:
//   default: a short human-readable digest (token cost matters — this runs on
//            every `/adev:work` invocation).
//   --json:  a single JSON object, and nothing else. Diagnostics from the
//            issue-backend registry go to stderr, so stdout stays parseable.

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { getIssueManager } from "../issues/registry.mjs";

const USAGE =
  "usage: adev coordination scan [--json] [--owner <name>] [--limit <n>] [--branch-age-days <n>]";

/** Per-bucket cap on listed items in both text and JSON output. */
const DEFAULT_LIMIT = 5;

/**
 * Hard timeouts. A hung process must not stall Step 1, but the budgets differ:
 * `git` is local and answers in milliseconds, while `gh` makes a network round
 * trip (measured ~1.2-1.5s warm) that can stretch on a cold auth refresh. Too
 * tight a `gh` budget would report "no open PRs" on a healthy repo — precisely
 * the blindness issue-606 exists to remove.
 */
const GIT_TIMEOUT_MS = 3000;
const GH_TIMEOUT_MS = 8000;

/** Number of open PRs to ask `gh` for before local truncation. */
const PR_FETCH_LIMIT = 30;

/**
 * Remote branches older than this are not concurrent work, they are history.
 * A long-lived repo carries hundreds of them; without a cutoff the branch
 * signal is pure noise.
 */
const DEFAULT_BRANCH_AGE_DAYS = 14;

/**
 * Default command runner. Never throws: a missing binary surfaces as
 * `error.code === "ENOENT"`, a hung one as `error.code === "ETIMEDOUT"`.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, timeout?: number }} [opts]
 * @returns {{ status: number|null, stdout: string, stderr: string, error?: Error }}
 */
function defaultExec(command, args, opts = {}) {
  const res = spawnSync(command, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    timeout: opts.timeout ?? GIT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    status: res.status,
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
    error: res.error,
  };
}

/**
 * Resolve the current operator identity the same way `adev issues claim`
 * does: an explicit `--owner` wins, then `ADEV_ISSUE_OWNER` from the
 * environment. Board `owner` values are written only by `claim()`, which
 * takes its value from exactly that chain — so this is the only namespace
 * a board comparison can be made in.
 *
 * When neither is set, identity is UNRESOLVED. We do not error and we do not
 * return nothing: a duplicate-work detector must over-report, so every
 * `in_progress` issue is treated as potentially someone else's.
 *
 * @param {string|undefined} flagOwner
 * @returns {{ owner: string|null, source: "flag"|"env"|"unresolved" }}
 */
export function resolveOperatorIdentity(flagOwner) {
  const fromFlag = typeof flagOwner === "string" ? flagOwner.trim() : "";
  if (fromFlag) return { owner: fromFlag, source: "flag" };
  const fromEnv =
    typeof process.env.ADEV_ISSUE_OWNER === "string"
      ? process.env.ADEV_ISSUE_OWNER.trim()
      : "";
  if (fromEnv) return { owner: fromEnv, source: "env" };
  return { owner: null, source: "unresolved" };
}

/**
 * Open pull requests via `gh`. Degrades silently and cleanly in every failure
 * mode — `gh` absent, unauthenticated, no GitHub remote, hung, or emitting
 * something that is not JSON.
 */
function scanPullRequests(exec, cwd, currentBranch, limit) {
  const empty = (reason) => ({ available: false, reason, total: 0, truncated: false, items: [] });

  const res = exec(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      String(PR_FETCH_LIMIT),
      "--json",
      "number,title,headRefName,author,updatedAt,isDraft",
    ],
    { cwd, timeout: GH_TIMEOUT_MS },
  );

  if (res.error) {
    return empty(res.error.code === "ENOENT" ? "gh-not-installed" : `gh-exec-failed:${res.error.code || "unknown"}`);
  }
  if (res.status !== 0) {
    // Unauthenticated, no GitHub remote, rate-limited, offline — all the same
    // to us: no signal, no failure.
    return empty("gh-unavailable");
  }

  let parsed;
  try {
    parsed = JSON.parse(res.stdout || "[]");
  } catch {
    return empty("gh-output-unparseable");
  }
  if (!Array.isArray(parsed)) return empty("gh-output-unparseable");

  const items = parsed
    // A PR for the branch we are standing on is our own work, not concurrent work.
    .filter((pr) => !currentBranch || pr?.headRefName !== currentBranch)
    .map((pr) => ({
      number: pr?.number ?? null,
      title: typeof pr?.title === "string" ? pr.title : "",
      branch: typeof pr?.headRefName === "string" ? pr.headRefName : null,
      author: pr?.author?.login ?? null,
      updated: pr?.updatedAt ?? null,
      draft: pr?.isDraft === true,
    }));

  return {
    available: true,
    reason: null,
    total: items.length,
    truncated: items.length > limit,
    items: items.slice(0, limit),
  };
}

/**
 * The remote's default branch (e.g. `origin/main`), so it can be excluded —
 * it is present in every scan forever and carries no concurrency signal.
 */
function resolveDefaultRemoteBranch(exec, cwd) {
  const res = exec("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { cwd });
  if (!res.error && res.status === 0) {
    const name = (res.stdout || "").trim();
    if (name) return name;
  }
  return null;
}

/**
 * Remote branches, newest commit first, excluding any `<remote>/HEAD` ref,
 * the default branch, and the branch we are currently on.
 */
function scanRemoteBranches(exec, cwd, currentBranch, limit, maxAgeDays = DEFAULT_BRANCH_AGE_DAYS) {
  const empty = (reason) => ({ available: false, reason, total: 0, truncated: false, items: [] });

  const res = exec(
    "git",
    [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)%09%(committerdate:iso8601)%09%(authorname)",
      "refs/remotes",
    ],
    { cwd },
  );

  if (res.error) {
    return empty(res.error.code === "ENOENT" ? "git-not-installed" : `git-exec-failed:${res.error.code || "unknown"}`);
  }
  if (res.status !== 0) return empty("git-unavailable");

  const defaultBranch = resolveDefaultRemoteBranch(exec, cwd);
  const fallbackDefaults = new Set(["origin/main", "origin/master"]);

  const cutoff =
    Number.isFinite(maxAgeDays) && maxAgeDays > 0
      ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
      : null;

  const items = [];
  for (const line of (res.stdout || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, updated, author] = trimmed.split("\t");
    if (!name) continue;
    if (name.endsWith("/HEAD")) continue;
    // A bare remote name (`origin`) is not a branch.
    if (!name.includes("/")) continue;
    if (defaultBranch ? name === defaultBranch : fallbackDefaults.has(name)) continue;
    // `origin/<current>` is our own branch's remote counterpart.
    if (currentBranch && name.split("/").slice(1).join("/") === currentBranch) continue;
    if (cutoff !== null && updated) {
      const ts = Date.parse(updated);
      if (Number.isFinite(ts) && ts < cutoff) continue;
    }
    items.push({ name, updated: updated || null, author: author || null });
  }

  return {
    available: true,
    reason: null,
    total: items.length,
    truncated: items.length > limit,
    items: items.slice(0, limit),
  };
}

/** The branch this worktree is on, or null when git cannot tell us. */
function resolveCurrentBranch(exec, cwd) {
  const res = exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  if (res.error || res.status !== 0) return null;
  const name = (res.stdout || "").trim();
  return name && name !== "HEAD" ? name : null;
}

/**
 * Issues sitting at `in_progress` on the shared board, split into
 *   - `claimed_elsewhere` — an `owner` that is not us (or any owner at all,
 *     when our identity is unresolved)
 *   - `unclaimed` — `in_progress` with no owner. Still a duplicate-work
 *     signal: issue-582 was in_progress and unclaimed when the second agent
 *     started on it.
 * Our own claims are excluded — they are not concurrent work.
 */
async function scanBoardIssues(manifest, projectRoot, owner, limit) {
  const empty = (reason) => ({
    available: false,
    reason,
    total: 0,
    truncated: false,
    claimed_elsewhere: [],
    unclaimed: [],
  });

  let issues;
  try {
    const manager = getIssueManager(manifest, projectRoot);
    issues = await manager.list({ status: "in_progress" });
  } catch (err) {
    // UNKNOWN_BACKEND, unreadable board, missing manifest — degrade.
    return empty(`board-unavailable:${(err && err.code) || "error"}`);
  }
  if (!Array.isArray(issues)) return empty("board-unavailable:bad-shape");

  const claimedElsewhere = [];
  const unclaimed = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const issueOwner = typeof issue.owner === "string" && issue.owner.trim() ? issue.owner.trim() : null;
    const summary = {
      id: issue.id ?? null,
      title: typeof issue.title === "string" ? issue.title : "",
      owner: issueOwner,
      claimed_at: issue.claimed_at ?? null,
      branch: issue.branch ?? null,
      pr: issue.pr ?? null,
    };
    if (!issueOwner) {
      unclaimed.push(summary);
    } else if (owner === null || issueOwner !== owner) {
      claimedElsewhere.push(summary);
    }
    // else: claimed by us — our own work, not concurrent work.
  }

  const total = claimedElsewhere.length + unclaimed.length;
  return {
    available: true,
    reason: null,
    total,
    truncated: claimedElsewhere.length > limit || unclaimed.length > limit,
    claimed_elsewhere: claimedElsewhere.slice(0, limit),
    unclaimed: unclaimed.slice(0, limit),
  };
}

/**
 * Run the full scan. Exported for tests and for other verbs that want the
 * structured result without shelling out.
 *
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object|null} [ctx.manifest]
 * @param {string} [ctx.owner] - explicit operator identity (as `--owner`)
 * @param {number} [ctx.limit]
 * @param {number} [ctx.branchAgeDays] - ignore remote branches older than this
 * @param {Function} [ctx.exec] - injectable command runner (tests stub gh/git)
 * @returns {Promise<object>} the report
 */
export async function scanCoordination({
  projectRoot,
  manifest = null,
  owner,
  limit = DEFAULT_LIMIT,
  branchAgeDays = DEFAULT_BRANCH_AGE_DAYS,
  exec = defaultExec,
} = {}) {
  const identity = resolveOperatorIdentity(owner);
  const currentBranch = resolveCurrentBranch(exec, projectRoot);

  const pullRequests = scanPullRequests(exec, projectRoot, currentBranch, limit);
  const remoteBranches = scanRemoteBranches(exec, projectRoot, currentBranch, limit, branchAgeDays);
  const issues = await scanBoardIssues(manifest, projectRoot, identity.owner, limit);

  const signalCount = pullRequests.total + remoteBranches.total + issues.total;

  return {
    scanned_at: new Date().toISOString(),
    current_branch: currentBranch,
    branch_age_days: branchAgeDays,
    owner: identity.owner,
    owner_source: identity.source,
    concurrent_work: signalCount > 0,
    signal_count: signalCount,
    pull_requests: pullRequests,
    remote_branches: remoteBranches,
    issues,
  };
}

function shortTitle(title, max = 60) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function degradedNotes(report) {
  const notes = [];
  if (!report.pull_requests.available) notes.push(`PRs: ${report.pull_requests.reason}`);
  if (!report.remote_branches.available) notes.push(`branches: ${report.remote_branches.reason}`);
  if (!report.issues.available) notes.push(`board: ${report.issues.reason}`);
  return notes;
}

/**
 * Short human-readable digest. Deliberately terse — this prints at the top of
 * every `/adev:work` invocation.
 *
 * @param {object} report
 * @returns {string}
 */
export function formatReport(report) {
  const lines = [];
  const notes = degradedNotes(report);
  const allDegraded = notes.length === 3;

  // A degraded signal is UNKNOWN, never "none" — reporting `0` for a bucket
  // that was never read is the blindness this scan exists to remove.
  const count = (bucket, singular, plural) =>
    bucket.available
      ? `${bucket.total} ${bucket.total === 1 ? singular : plural}`
      : `? ${plural}`;

  if (allDegraded) {
    lines.push("Concurrent work: not scanned — no signal available.");
    lines.push(`  (${notes.join("; ")})`);
    return lines.join("\n");
  }

  if (!report.concurrent_work) {
    lines.push(
      notes.length
        ? "Concurrent work: none in the signals that were available."
        : "Concurrent work: none detected.",
    );
    if (notes.length) lines.push(`  (not scanned — ${notes.join("; ")})`);
    return lines.join("\n");
  }

  const headline = [
    count(report.pull_requests, "open PR", "open PRs"),
    count(report.remote_branches, "remote branch", "remote branches"),
    `${count(report.issues, "in-progress issue", "in-progress issues")} elsewhere`,
  ].join(", ");
  lines.push(`Concurrent work: ${headline}.`);

  const more = (bucket, shown) =>
    bucket.total > shown ? `  … +${bucket.total - shown} more` : null;

  if (report.pull_requests.items.length) {
    lines.push("PRs:");
    for (const pr of report.pull_requests.items) {
      const bits = [pr.author, pr.branch].filter(Boolean).join(" · ");
      lines.push(`  #${pr.number} ${shortTitle(pr.title)}${bits ? ` (${bits})` : ""}`);
    }
    const tail = more(report.pull_requests, report.pull_requests.items.length);
    if (tail) lines.push(tail);
  }

  if (report.remote_branches.items.length) {
    lines.push("Remote branches:");
    for (const b of report.remote_branches.items) {
      lines.push(`  ${b.name}${b.updated ? ` (${b.updated.slice(0, 10)})` : ""}`);
    }
    const tail = more(report.remote_branches, report.remote_branches.items.length);
    if (tail) lines.push(tail);
  }

  const shownIssues = report.issues.claimed_elsewhere.length + report.issues.unclaimed.length;
  if (shownIssues) {
    lines.push("In-progress issues:");
    for (const i of report.issues.claimed_elsewhere) {
      lines.push(`  ${i.id} ${shortTitle(i.title, 50)} — owner: ${i.owner}`);
    }
    for (const i of report.issues.unclaimed) {
      lines.push(`  ${i.id} ${shortTitle(i.title, 50)} — unclaimed`);
    }
    const tail = more(report.issues, shownIssues);
    if (tail) lines.push(tail);
  }

  if (report.owner_source === "unresolved" && report.issues.total > 0) {
    lines.push(
      "  (operator identity unresolved — set ADEV_ISSUE_OWNER or pass --owner; every claimed issue is listed)",
    );
  }
  if (notes.length) lines.push(`  (not scanned — ${notes.join("; ")})`);

  return lines.join("\n");
}

// `exec` is a test seam only: the CLI dispatcher passes exactly
// { projectRoot, argv, manifest }, so it is always undefined in production
// and `scanCoordination` falls back to `defaultExec`.
export async function run({ projectRoot, argv, manifest, exec }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    return sub === undefined ? 1 : 0;
  }
  if (sub !== "scan") {
    console.error(USAGE);
    return 1;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        json: { type: "boolean", default: false },
        owner: { type: "string" },
        limit: { type: "string" },
        "branch-age-days": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    return 1;
  }

  const v = parsed.values;
  if (v.help) {
    help();
    return 0;
  }

  let limit = DEFAULT_LIMIT;
  if (v.limit !== undefined) {
    const n = Number(v.limit);
    if (!Number.isInteger(n) || n <= 0) {
      console.error(`--limit must be a positive integer (got ${JSON.stringify(v.limit)})`);
      return 1;
    }
    limit = n;
  }

  let branchAgeDays = DEFAULT_BRANCH_AGE_DAYS;
  if (v["branch-age-days"] !== undefined) {
    const n = Number(v["branch-age-days"]);
    if (!Number.isInteger(n) || n <= 0) {
      console.error(
        `--branch-age-days must be a positive integer (got ${JSON.stringify(v["branch-age-days"])})`,
      );
      return 1;
    }
    branchAgeDays = n;
  }

  const report = await scanCoordination({
    projectRoot,
    manifest,
    owner: v.owner,
    limit,
    branchAgeDays,
    ...(exec ? { exec } : {}),
  });

  if (v.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Pre-flight concurrency scan: the shared signals that a purely local");
  console.log("state scan cannot see — open PRs, remote branches, and issues held");
  console.log("in_progress by another owner on the shared board.");
  console.log("");
  console.log("Options:");
  console.log("  --json            Emit the structured report on stdout instead of the digest");
  console.log("  --owner <name>    Operator identity to compare board owners against");
  console.log("                    (defaults to $ADEV_ISSUE_OWNER, as `adev issues claim`)");
  console.log(`  --limit <n>       Max items listed per bucket (default ${DEFAULT_LIMIT})`);
  console.log(
    `  --branch-age-days <n>  Ignore remote branches idle longer than this (default ${DEFAULT_BRANCH_AGE_DAYS})`,
  );
  console.log("");
  console.log("Exits 0 whenever the scan completes — including a fully degraded scan");
  console.log("(no gh, no git remote, no board). Exits 1 only on a usage error.");
}
