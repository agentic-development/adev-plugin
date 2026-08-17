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

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { safeRealpath as realpathSafe } from "./path-safety.mjs";

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
 * Get the last-modification timestamp for a plan file. Prefers `git log` with
 * `--diff-filter=M` so that the addition commit (which we don't consider a
 * "modification" — the file was *authored*, not mutated post-pending) is
 * ignored. Returns null when no modification commit exists in git history;
 * the caller treats null as "no modification → no violation possible". Falls
 * back to file mtime only when git is unavailable or the file is untracked
 * (e.g. inside a test fixture that isn't a git repo) so fixture-based
 * violation detection still works.
 *
 * Returns an ISO-8601 string or null when no modification timestamp applies.
 */
function lastModifiedTs(
  projectRoot,
  planPath,
  exemptCommits,
  exemptPatchIds,
  patchIdCache,
  gitHistoryApplies,
) {
  // When `projectRoot` is not itself the root of a git working tree, the
  // enclosing repository's history describes the *fixture*, not the project
  // under inspection. Reading it leaks unrelated commits: a checked-in test
  // fixture picks up every commit that ever touched it in the parent repo,
  // and a plan whose mtime was deliberately backdated is reported as modified
  // at the parent's commit date instead. Fall back to mtime in that case.
  if (!gitHistoryApplies) {
    try {
      return statSync(planPath).mtime.toISOString();
    } catch {
      return null;
    }
  }

  // First check if the file is tracked by git at all. `git ls-files --error-unmatch`
  // exits 0 when tracked, non-zero otherwise. If untracked (e.g. test fixture
  // outside any tracked path), fall back to mtime so fixture-based violation
  // detection still works.
  let tracked = false;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", planPath], {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 5000,
    });
    tracked = true;
  } catch {
    /* file is untracked or git unavailable */
  }

  if (tracked) {
    // Only count commits that actually MODIFIED the file. Added-only files
    // (typical for freshly-authored plans) return empty here, signalling
    // "never modified post-creation" → null → no violation possible.
    // Walk the M-commit history newest-first and return the first commit
    // whose hash is not in `exemptCommits`. Exempt commits cover one-time
    // batch modifications (e.g. the 0.26.0 advisory-header stamping) that
    // are structural rather than content-altering.
    try {
      const out = execFileSync(
        "git",
        ["log", "--diff-filter=M", "--format=%H %aI", "--", planPath],
        {
          cwd: projectRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        },
      ).trim();
      if (!out) return null;
      for (const line of out.split("\n")) {
        const [hash, ts] = line.split(" ");
        if (!hash || !ts) continue;
        if (exemptCommits.has(hash)) continue;
        // Commit SHAs do not survive history rewrites. `git filter-branch`,
        // a rebase, or a squash-merge re-hashes every commit it touches, and
        // an `exempt_commits` entry recorded before such a rewrite silently
        // stops matching — the exemption evaporates and the plan re-flags.
        // Patch ids are invariant under rewriting (they hash the diff, not
        // the commit), so an exemption keyed on one survives.
        if (exemptPatchIds.size > 0 && exemptPatchIds.has(patchIdOf(projectRoot, hash, patchIdCache))) {
          continue;
        }
        return ts;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Untracked or git unavailable: use file mtime.
  try {
    const st = statSync(planPath);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Compute the stable patch id for a commit — `git show <sha> | git patch-id
 * --stable`, run without a shell. The patch id hashes the diff hunks, so it
 * is identical for a commit and any rewritten copy of it (rebase, cherry-pick,
 * filter-branch), which is precisely the property `exempt_commits` lacks.
 *
 * Results are memoised per detector run: a single batch commit typically
 * touches many plan files, and recomputing its patch id per plan is the
 * dominant cost of the exemption check.
 *
 * @param {string} projectRoot
 * @param {string} sha
 * @param {Map<string, string|null>} cache
 * @returns {string|null} the patch id, or null when it cannot be computed
 */
function patchIdOf(projectRoot, sha, cache) {
  if (cache.has(sha)) return cache.get(sha);
  let id = null;
  try {
    const patch = execFileSync("git", ["show", sha, "--format=", "--patch"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
      maxBuffer: 64 * 1024 * 1024,
    });
    // An empty diff (a merge commit, or a commit with no textual change) has
    // no patch id; `git patch-id` prints nothing rather than erroring.
    if (patch.trim()) {
      const out = execFileSync("git", ["patch-id", "--stable"], {
        cwd: projectRoot,
        input: patch,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 10000,
        maxBuffer: 64 * 1024 * 1024,
      }).trim();
      if (out) id = out.split(" ")[0] || null;
    }
  } catch {
    id = null;
  }
  cache.set(sha, id);
  return id;
}

/**
 * Read the exempt-commit list from `.context-index/manifest.yaml`.
 *
 * Two sibling lists are read, both under `hygiene.plan_immutability`:
 *
 *   - `exempt_commits[]`  — full 40-char git SHAs, matched against
 *     `git log --format=%H`. Short hashes are not accepted. These break
 *     whenever history is rewritten, since the SHA changes.
 *   - `exempt_patch_ids[]` — full 40-char `git patch-id --stable` values.
 *     Invariant under rebase/cherry-pick/filter-branch, so an exemption
 *     recorded here keeps matching after a rewrite. Prefer these.
 *
 * An invalid/missing list silently yields an empty Set (the detector still
 * works; just no exemptions).
 *
 * @param {string} projectRoot
 * @returns {{ commits: Set<string>, patchIds: Set<string> }}
 */
function readExemptCommits(projectRoot) {
  const exempt = new Set();
  const exemptPatchIds = new Set();
  const empty = { commits: exempt, patchIds: exemptPatchIds };
  const manifestPath = join(projectRoot, ".context-index", "manifest.yaml");
  if (!existsSync(manifestPath)) return empty;
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return empty;
  }
  // Locate the `hygiene:` block, then the nested `plan_immutability:` block,
  // then its `exempt_commits:` list. Zero-dep, line-by-line — no YAML parser.
  const lines = raw.split("\n");
  let inHygiene = false;
  let hygieneIndent = -1;
  let inPlanImm = false;
  let planImmIndent = -1;
  let inExempt = false;
  let exemptIndent = -1;
  // Which of the two sibling lists we are currently inside.
  let exemptTarget = null;
  for (const line of lines) {
    const stripped = line.replace(/\s+$/, "");
    const indent = stripped.length - stripped.trimStart().length;
    if (!stripped.trim() || stripped.trim().startsWith("#")) continue;

    if (!inHygiene) {
      if (/^hygiene:\s*$/.test(stripped)) {
        inHygiene = true;
        hygieneIndent = indent;
      }
      continue;
    }
    if (indent <= hygieneIndent) {
      // Exited the hygiene block.
      break;
    }
    if (!inPlanImm) {
      if (/plan_immutability:\s*$/.test(stripped) && indent > hygieneIndent) {
        inPlanImm = true;
        planImmIndent = indent;
      }
      continue;
    }
    if (indent <= planImmIndent) {
      // Exited the plan_immutability block.
      inPlanImm = false;
      continue;
    }
    if (!inExempt) {
      if (indent > planImmIndent) {
        if (/exempt_commits:\s*$/.test(stripped)) {
          inExempt = true;
          exemptIndent = indent;
          exemptTarget = exempt;
        } else if (/exempt_patch_ids:\s*$/.test(stripped)) {
          inExempt = true;
          exemptIndent = indent;
          exemptTarget = exemptPatchIds;
        }
      }
      continue;
    }
    if (indent <= exemptIndent) {
      // Left this list. The line may itself open the sibling list, so
      // re-dispatch it rather than consuming it.
      inExempt = false;
      exemptTarget = null;
      if (indent > planImmIndent) {
        if (/exempt_commits:\s*$/.test(stripped)) {
          inExempt = true;
          exemptIndent = indent;
          exemptTarget = exempt;
        } else if (/exempt_patch_ids:\s*$/.test(stripped)) {
          inExempt = true;
          exemptIndent = indent;
          exemptTarget = exemptPatchIds;
        }
      }
      continue;
    }
    const m = stripped.match(/^\s*-\s+["']?([0-9a-f]{40})["']?\s*$/);
    if (m && exemptTarget) exemptTarget.add(m[1]);
  }
  return empty;
}

/**
 * Working-tree check (independent of git history): a plan body that contains
 * inline `**Routing:**`, `**Scores:**`, or `**Rationale:**` blocks AND has
 * no sibling `<plan-stem>.routing.json` is flagged as
 * `PLAN_MUTATED_WITHOUT_SIDECAR`. When the sibling sidecar exists, the inline
 * blocks are tolerated as legacy migration noise — the per-task M-commit
 * history check below still applies.
 *
 * Spec: plan-routing-sidecar.spec.md Behaviors 6-7; Error Cases.
 *
 * @param {string} planPath - absolute path to a `.plan.md`
 * @returns {{ code: 'PLAN_MUTATED_WITHOUT_SIDECAR', path: string } | null}
 */
function checkInlineRoutingWithoutSidecar(planPath) {
  let body;
  try {
    body = readFileSync(planPath, "utf8");
  } catch {
    return null;
  }
  const hasInline = /\*\*Routing:\*\*|\*\*Scores:\*\*|\*\*Rationale:\*\*/.test(body);
  if (!hasInline) return null;
  const sidecarPath = planPath.replace(/\.plan\.md$/, ".routing.json");
  if (existsSync(sidecarPath)) return null;
  return { code: "PLAN_MUTATED_WITHOUT_SIDECAR", path: planPath };
}

/**
 * Detect plan files that violate the plan-immutability contract.
 *
 * Two independent checks compose:
 *   1. Working-tree branch — `PLAN_MUTATED_WITHOUT_SIDECAR` when the plan
 *      body contains inline `**Routing:**`/`**Scores:**`/`**Rationale:**`
 *      blocks AND no sibling `<plan-stem>.routing.json` exists. Runs
 *      regardless of git history shape (catches the mutate-then-single-add
 *      pattern the M-commit check misses).
 *   2. Per-task M-commit history branch — plan was modified after its
 *      first `plan_task` `pending` event landed in the lifecycle log
 *      (existing legacy check; uses `git log --diff-filter=M` and falls
 *      back to mtime for untracked fixtures).
 *
 * Violations from both checks accumulate; the legacy violation shape is
 * preserved for backwards compatibility, while the new working-tree
 * violation carries a `code` field.
 *
 * @param {string} projectRoot - absolute path to the project root
 * @returns {Promise<Array<
 *   { path: string, firstPendingTs: string, lastModifiedTs: string }
 *   | { code: 'PLAN_MUTATED_WITHOUT_SIDECAR', path: string }
 * >>}
 */
export async function detectMutatedPlans(projectRoot) {
  const violations = [];

  const resolvedRoot = resolve(projectRoot);
  const specsRoot = join(resolvedRoot, ".context-index", "specs");
  if (!existsSync(specsRoot)) return violations;

  const { commits: exemptCommits, patchIds: exemptPatchIds } =
    readExemptCommits(resolvedRoot);
  const patchIdCache = new Map();

  // Git history is only authoritative when `projectRoot` IS the working-tree
  // root. Pointed at a nested directory — every checked-in test fixture — git
  // resolves upward and answers about the enclosing repository instead.
  let gitHistoryApplies = false;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: resolvedRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    // Compare real paths: `git rev-parse` reports the canonical path, while
    // `resolve()` leaves symlinks intact. On macOS a temp dir is `/var/...`
    // to the caller and `/private/var/...` to git, so a plain string compare
    // would call every real repo under /tmp a nested fixture.
    gitHistoryApplies = top !== "" && realpathSafe(top) === realpathSafe(resolvedRoot);
  } catch {
    /* not a git repo, or git unavailable → mtime fallback */
  }

  const planFiles = collectFiles(specsRoot, (name) => name.endsWith(".plan.md"));

  for (const planPath of planFiles) {
    // 1. Working-tree branch — independent of git history.
    const inlineViolation = checkInlineRoutingWithoutSidecar(planPath);
    if (inlineViolation) violations.push(inlineViolation);

    // 2. Per-task M-commit history branch (legacy).
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

    const modTs = lastModifiedTs(
      resolvedRoot,
      planPath,
      exemptCommits,
      exemptPatchIds,
      patchIdCache,
      gitHistoryApplies,
    );
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
