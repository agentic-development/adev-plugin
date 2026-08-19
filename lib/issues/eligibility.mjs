/**
 * Eligibility filter for `adev issues next` — the read-only bug-selection
 * verb for the autonomous bugfix loop.
 *
 * Pure predicates over `WorkItem` shapes, in the spirit of the boolean
 * predicates (`isClaimStale`, `isClaimUnexpirable`) already established in
 * `lib/issues/interface.mjs`. Where that module's *validators* signal
 * failure by throwing an `Error` with a `.code` (`checkCloseGuard`,
 * `requireClaimable`, `validateIssue`, ...), the resolver-style functions
 * here (`resolvePriorityBound`, `validateBugType`) instead return
 * `{ value, error: {code, message} | null }` — a deliberate divergence, not
 * an oversight: these compose into a filter pipeline where a caller needs to
 * inspect and report a rejection reason without try/catch. This module
 * performs no I/O and no writes — every function here is a pure function of
 * its inputs.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
 *
 * Uses only Node.js built-ins.
 */

import { isClaimStale, isClaimUnexpirable, DEFAULT_CLAIM_TTL_MINUTES } from "./interface.mjs";

// ─── Task 1: Priority bound and type validation (BEH-8, BEH-9) ────────────

/** `--max-priority` CLI vocabulary mapped onto `WorkItem.priority`'s 0-4 scale. */
export const PRIORITY_LABEL_TO_NUMBER = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 });

/** Safety floor (BEH-8): the resolved bound when `--max-priority` is omitted. */
export const DEFAULT_MAX_PRIORITY_BOUND = 3; // P3

/**
 * Resolve `--max-priority` into a numeric bound, or an error.
 *
 * P0/P1 are rejected outright (BEH-8): they are outside the eligibility
 * filter's safety boundary by design, not merely deprioritized by the
 * default. Omitting the flag defaults to P3.
 *
 * @param {string|undefined} raw
 * @returns {{ bound: number|null, error: {code: string, message: string}|null }}
 */
export function resolvePriorityBound(raw) {
  if (raw == null) return { bound: DEFAULT_MAX_PRIORITY_BOUND, error: null };
  const num = PRIORITY_LABEL_TO_NUMBER[raw];
  if (num === undefined) {
    return {
      bound: null,
      error: { code: "INVALID_PRIORITY_BOUND", message: `Invalid --max-priority "${raw}". Valid: P0-P4.` },
    };
  }
  if (raw === "P0" || raw === "P1") {
    return {
      bound: null,
      error: {
        code: "INVALID_PRIORITY_BOUND",
        message: `--max-priority "${raw}" is outside the eligibility filter's safety boundary and cannot be selected.`,
      },
    };
  }
  return { bound: num, error: null };
}

/**
 * Validate `--type` (BEH-9): this milestone supports bug selection only.
 * Omitting the flag defaults to "bug".
 *
 * @param {string|undefined} raw
 * @returns {{ type: string|null, error: {code: string, message: string}|null }}
 */
export function validateBugType(raw) {
  const type = raw ?? "bug";
  if (type !== "bug") {
    return {
      type: null,
      error: { code: "UNSUPPORTED_TYPE", message: `--type "${type}" is not supported this milestone. Only "bug" is selectable.` },
    };
  }
  return { type, error: null };
}

// ─── Task 2: Module-safety eligibility checks (BEH-6, BEH-7, BEH-10, BEH-11) ──

/**
 * Reserved safety tags — never manifest-overridable, always excluded when
 * they are a WorkItem's single `affected_modules` entry (BEH-7).
 */
export const RESERVED_SAFETY_TAGS = Object.freeze(["review-gate", "convergence-detector", "retry-loop", "bugfix-loop"]);

/**
 * Resolve the full excluded-module set: the four reserved safety tags plus
 * any project-configured additions from `tasks.bugfix_loop.excluded_modules`.
 *
 * @param {object|null|undefined} manifest
 * @returns {Set<string>}
 */
export function resolveExcludedModules(manifest) {
  const additive = manifest?.tasks?.bugfix_loop?.excluded_modules;
  const extra = Array.isArray(additive) ? additive.filter((s) => typeof s === "string") : [];
  return new Set([...RESERVED_SAFETY_TAGS, ...extra]);
}

/**
 * Module-safety eligibility check (BEH-6, BEH-7, BEH-10, BEH-11).
 *
 * Evaluation order: BEH-6 (length > 1) first; BEH-10 (empty/absent) is the
 * separate fail-closed default; for a single entry, BEH-7 (reserved/excluded
 * match) is checked next; anything that matches neither BEH-7's excluded set
 * nor a real `manifest.modules[].slug` is excluded by BEH-11 (unrecognized
 * slug, fail-closed). Only a single, real, non-excluded manifest module slug
 * is module-eligible.
 *
 * @param {string[]|null|undefined} affectedModules
 * @param {object|null|undefined} manifest
 * @returns {boolean}
 */
export function isModuleEligible(affectedModules, manifest) {
  if (!Array.isArray(affectedModules) || affectedModules.length === 0) return false; // BEH-10
  if (affectedModules.length > 1) return false; // BEH-6
  const [slug] = affectedModules;
  const excluded = resolveExcludedModules(manifest);
  if (excluded.has(slug)) return false; // BEH-7
  const knownSlugs = new Set((manifest?.modules ?? []).map((m) => m.slug));
  if (!knownSlugs.has(slug)) return false; // BEH-11
  return true;
}

// ─── Task 3: Lease, dependency, and attempt-cap exclusion (BEH-3, BEH-4, BEH-5) ──

/**
 * Lease exclusion (BEH-3): a WorkItem currently claimed with a lease that
 * has not expired is excluded from candidacy. An unexpirable claim
 * (`isClaimUnexpirable`) is treated the same as a live lease — it never
 * expires on its own, so it is always excluded while claimed.
 *
 * `ttlMinutes` defaults to `DEFAULT_CLAIM_TTL_MINUTES` (interface.mjs's own
 * default) when omitted — NOT to 0. `isClaimStale` treats `ttlMs <= 0` as
 * "expiry disabled" (never stale), which would make `isLeaseExcluded`
 * return `true` for every claimed issue forever if it defaulted to 0. That
 * silently inverts the caller's likely intent (a real, finite TTL) into
 * "permanently fail closed" — round-3 code-quality review cq-1.
 *
 * @param {object} issue
 * @param {{ ttlMinutes?: number, now?: number }} [opts]
 * @returns {boolean}
 */
export function isLeaseExcluded(issue, { ttlMinutes = DEFAULT_CLAIM_TTL_MINUTES, now = Date.now() } = {}) {
  if (!issue?.owner) return false;
  const lease = { ttlMs: ttlMinutes * 60_000, now };
  if (isClaimUnexpirable(issue)) return true;
  return !isClaimStale(issue, lease); // excluded only while the lease is still live
}

/**
 * Dependency exclusion (BEH-4): a WorkItem with one or more open
 * (non-closed) blocking dependencies is excluded from candidacy.
 * `issuesById` MUST be built from the full board (every type, not just
 * bugs) — a dependency on a non-bug WorkItem must still block.
 *
 * A dependency id absent from `issuesById` (a dangling reference — the
 * referenced WorkItem was deleted, or `issuesById` was built incompletely)
 * is treated as non-blocking, matching the plan's reference implementation.
 * `issuesById` is contractually the FULL board, so a real, still-open
 * blocker is always resolvable here; a dangling id is a data-integrity
 * problem the eligibility filter deliberately does not diagnose (round-3
 * code-quality review cq-2 — flagged as an untested edge case, not a bug;
 * see the test below for the pinned behavior).
 *
 * @param {object} issue
 * @param {Map<string, object>} issuesById
 * @returns {boolean}
 */
export function hasOpenBlockingDependencies(issue, issuesById) {
  const deps = issue.dependencies ?? [];
  return deps.some((depId) => {
    const dep = issuesById.get(depId);
    return dep && dep.status !== "closed";
  });
}

// Exact three-value set per per-issue-attempt-cap.spec.md BEH-4 — authoritative, do not diverge.
const ATTEMPT_CAP_EXCLUDING_VERDICTS = new Set(["NO_PROGRESS", "REGRESSED", "BUDGET_EXHAUSTED"]);

/**
 * Attempt-cap exclusion (BEH-5): a WorkItem whose latest `AttemptRecord`
 * carries one of the three excluding verdicts is excluded from candidacy.
 * No `AttemptRecord` at all is treated as zero attempts, not excluded.
 *
 * @param {object|null} attemptRecord
 * @returns {boolean}
 */
export function isAttemptCapExcluded(attemptRecord) {
  if (!attemptRecord) return false; // no record = zero attempts (BEH-5)
  return ATTEMPT_CAP_EXCLUDING_VERDICTS.has(attemptRecord.last_verdict);
}

// ─── Task 4: Selection and tie-break composition (BEH-1, BEH-2) ───────────

/**
 * Compose all eligibility predicates and select the single highest-priority
 * eligible bug (or `null` if none qualify).
 *
 * `issues` MUST be the full board (every type, every status the caller has),
 * not a bug-only slice — `hasOpenBlockingDependencies` needs to resolve
 * dependencies of any type. The `issue.type !== "bug"` check below narrows
 * candidates to bugs; it does not narrow the dependency map, which is built
 * from the same full `issues` array before that filter runs.
 *
 * @param {{ issues: object[], manifest: object, maxPriorityBound: number, ttlMinutes?: number, now?: number, attemptRecords?: Map<string, object> }} params
 * @returns {{ bug: object|null }}
 */
export function selectNextEligibleBug({ issues, manifest, maxPriorityBound, ttlMinutes = DEFAULT_CLAIM_TTL_MINUTES, now = Date.now(), attemptRecords = new Map() }) {
  const issuesById = new Map(issues.map((i) => [i.id, i]));
  const candidates = issues.filter((issue) => {
    if (issue.type !== "bug") return false;
    if (issue.status === "closed" || issue.status === "deferred") return false;
    const priority = issue.priority ?? 2; // json adapter's own create() default — never treat missing as 0
    if (priority < 2) return false; // P0/P1 floor — never eligible regardless of --max-priority (BEH-8)
    if (priority > maxPriorityBound) return false;
    if (isLeaseExcluded(issue, { ttlMinutes, now })) return false; // BEH-3
    if (hasOpenBlockingDependencies(issue, issuesById)) return false; // BEH-4
    if (isAttemptCapExcluded(attemptRecords.get(issue.id) ?? null)) return false; // BEH-5
    if (!isModuleEligible(issue.affected_modules, manifest)) return false; // BEH-6/7/10/11
    return true;
  });

  if (candidates.length === 0) return { bug: null };

  candidates.sort((a, b) => {
    const pa = a.priority ?? 2;
    const pb = b.priority ?? 2;
    if (pa !== pb) return pa - pb; // lower number wins
    return Date.parse(a.created) - Date.parse(b.created); // FIFO — oldest first (BEH-2)
  });

  return { bug: candidates[0] };
}
