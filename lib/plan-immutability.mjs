/**
 * Plan-file immutability detector.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
 *       § Acceptance Criteria bullet 5
 *
 * Once `/adev:plan` has emitted a `plan_task` event with `status: "pending"`
 * for a given plan file, that plan file MUST NOT be subsequently modified.
 * Authoritative status lives in the lifecycle event log; the plan markdown is
 * a read-only input.
 *
 * `detectMutatedPlans(projectRoot)` walks every `.plan.md` under
 * `<projectRoot>/.context-index/specs/`, finds the earliest `plan_task`
 * `pending` event for that plan in the sibling spec's lifecycle log, and
 * reports a violation when the plan file's last-modified time (preferring
 * git history when available) is later than that `pending` event timestamp.
 *
 * Zero external deps — `node:fs`, `node:path`, `node:child_process` only.
 *
 * @module lib/plan-immutability
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Walk a directory recursively and collect every file matching a predicate.
 */
function collectFiles(rootDir, predicate) {
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(full);
      }
    }
  }
  walk(rootDir);
  return out;
}

/**
 * Parse a JSONL lifecycle log file into events. Malformed lines are skipped
 * silently (matches the foundation spec tolerance contract).
 */
function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const events = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      /* skip malformed line */
    }
  }
  return events;
}

/**
 * Resolve the lifecycle log path for a plan file by deriving the sibling
 * spec's slug. Per the foundation spec, the slug is the spec filename stem
 * (e.g. `foo.spec.md` → `foo`). Plan files are sibling to their specs and
 * share the same stem (e.g. `foo.plan.md`).
 */
function lifecycleLogPathForPlan(projectRoot, planPath) {
  const base = basename(planPath, ".plan.md");
  return join(projectRoot, ".context-index", "lifecycle-state", `${base}.jsonl`);
}

/**
 * Get the last-modified timestamp for a plan file. Prefers `git log` for the
 * most-recent commit touching the file; falls back to file mtime if git is
 * unavailable, the file is untracked, or the path is outside a git repo.
 *
 * Returns an ISO-8601 string or null if neither source is available.
 */
function lastModifiedTs(projectRoot, planPath) {
  // Try git first.
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", planPath],
      {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      },
    ).trim();
    if (out) return out;
  } catch {
    /* fall through to mtime */
  }

  // Fall back to file mtime.
  try {
    const st = statSync(planPath);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Detect plan files that were modified after their first `plan_task` `pending`
 * event landed in the lifecycle log.
 *
 * @param {string} projectRoot - absolute path to the project root
 * @returns {Promise<Array<{ path: string, firstPendingTs: string, lastModifiedTs: string }>>}
 */
export async function detectMutatedPlans(projectRoot) {
  const violations = [];

  const resolvedRoot = resolve(projectRoot);
  const specsRoot = join(resolvedRoot, ".context-index", "specs");
  if (!existsSync(specsRoot)) return violations;

  const planFiles = collectFiles(specsRoot, (name) => name.endsWith(".plan.md"));

  for (const planPath of planFiles) {
    const logPath = lifecycleLogPathForPlan(resolvedRoot, planPath);
    const events = readJsonl(logPath);

    // Find the earliest `plan_task` `pending` event whose `plan` field
    // matches this plan. Accept either an absolute or relative `plan` field
    // — match on the basename for portability.
    const planBase = basename(planPath);
    const pendingEvents = events.filter(
      (e) =>
        e &&
        e.event === "plan_task" &&
        e.status === "pending" &&
        typeof e.plan === "string" &&
        e.plan.endsWith(planBase),
    );
    if (pendingEvents.length === 0) continue;

    // Earliest pending event by timestamp.
    pendingEvents.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const firstPending = pendingEvents[0];
    const firstPendingTs = firstPending.ts;
    if (!firstPendingTs) continue;

    const modTs = lastModifiedTs(resolvedRoot, planPath);
    if (!modTs) continue;

    if (modTs > firstPendingTs) {
      violations.push({
        path: planPath,
        firstPendingTs,
        lastModifiedTs: modTs,
      });
    }
  }

  return violations;
}

export default { detectMutatedPlans };
