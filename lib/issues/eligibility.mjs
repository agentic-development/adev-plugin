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
