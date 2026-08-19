/**
 * Tests for `adev issues next` (lib/issues/eligibility.mjs + lib/cli/issues-next.mjs).
 *
 * Coverage grows task-by-task per the implementation plan:
 *   Task 1 — resolvePriorityBound / validateBugType (BEH-8, BEH-9)
 *   Task 2 — isModuleEligible (BEH-6, BEH-7, BEH-10, BEH-11)
 *   Task 3 — isLeaseExcluded / hasOpenBlockingDependencies / isAttemptCapExcluded (BEH-3, BEH-4, BEH-5)
 *   Task 4 — selectNextEligibleBug composition (BEH-1, BEH-2, plus BEH-8/BEH-4 composition regressions)
 *   Task 5 — end-to-end CLI dispatch (Error Cases table, BEH-1/BEH-8/BEH-9)
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolvePriorityBound,
  validateBugType,
  isModuleEligible,
  RESERVED_SAFETY_TAGS,
  isLeaseExcluded,
  hasOpenBlockingDependencies,
  isAttemptCapExcluded,
} from "../../lib/issues/eligibility.mjs";

test("resolvePriorityBound: omitted --max-priority defaults to P3 (BEH-8 safety floor)", () => {
  const result = resolvePriorityBound(undefined);
  assert.equal(result.bound, 3);
  assert.equal(result.error, null);
});

test("resolvePriorityBound: P0 and P1 are rejected (BEH-8)", () => {
  for (const p of ["P0", "P1"]) {
    const result = resolvePriorityBound(p);
    assert.equal(result.bound, null);
    assert.equal(result.error?.code, "INVALID_PRIORITY_BOUND");
  }
});

test("resolvePriorityBound: malformed value is rejected", () => {
  const result = resolvePriorityBound("P9");
  assert.equal(result.error?.code, "INVALID_PRIORITY_BOUND");
});

test("resolvePriorityBound: P2/P3 map onto 2/3", () => {
  assert.equal(resolvePriorityBound("P2").bound, 2);
  assert.equal(resolvePriorityBound("P3").bound, 3);
});

test("validateBugType: non-bug --type is rejected (BEH-9)", () => {
  assert.equal(validateBugType("feature").error?.code, "UNSUPPORTED_TYPE");
  assert.equal(validateBugType("bug").error, null);
  assert.equal(validateBugType(undefined).error, null); // --type defaults to "bug"
});

// ─── Task 2: Module-safety eligibility checks (BEH-6, BEH-7, BEH-10, BEH-11) ──

test("isModuleEligible: >1 affected_modules entries excluded regardless of content (BEH-6)", () => {
  const manifest = { modules: [{ slug: "cli" }, { slug: "hooks" }] };
  assert.equal(isModuleEligible(["cli", "hooks"], manifest), false);
});

test("isModuleEligible: reserved safety tags excluded unconditionally (BEH-7)", () => {
  const manifest = { modules: [] };
  for (const tag of RESERVED_SAFETY_TAGS) {
    assert.equal(isModuleEligible([tag], manifest), false);
  }
});

test("isModuleEligible: manifest-configured excluded_modules excluded (BEH-7)", () => {
  const manifest = { modules: [{ slug: "billing" }], tasks: { bugfix_loop: { excluded_modules: ["billing"] } } };
  assert.equal(isModuleEligible(["billing"], manifest), false);
});

test("isModuleEligible: empty/absent affected_modules excluded (BEH-10)", () => {
  const manifest = { modules: [{ slug: "cli" }] };
  assert.equal(isModuleEligible(undefined, manifest), false);
  assert.equal(isModuleEligible([], manifest), false);
});

test("isModuleEligible: unrecognized slug excluded (BEH-11)", () => {
  const manifest = { modules: [{ slug: "cli" }] };
  assert.equal(isModuleEligible(["typo-slug"], manifest), false);
});

test("isModuleEligible: single real, non-excluded manifest slug is eligible", () => {
  const manifest = { modules: [{ slug: "cli" }] };
  assert.equal(isModuleEligible(["cli"], manifest), true);
});

test("isModuleEligible: malformed (non-array) excluded_modules fails closed to the reserved tags only, does not throw", () => {
  const manifest = { modules: [{ slug: "cli" }], tasks: { bugfix_loop: { excluded_modules: "not-an-array" } } };
  assert.doesNotThrow(() => isModuleEligible(["cli"], manifest));
  assert.equal(isModuleEligible(["cli"], manifest), true); // "cli" still eligible — malformed config ignored, not misread as excluding everything
  assert.equal(isModuleEligible(["review-gate"], manifest), false); // reserved tags remain excluded regardless
});

// ─── Task 3: Lease, dependency, and attempt-cap exclusion (BEH-3, BEH-4, BEH-5) ──

test("isLeaseExcluded: live (non-expired) claim excluded (BEH-3)", () => {
  const issue = { owner: "alice", claimed_at: new Date().toISOString() };
  assert.equal(isLeaseExcluded(issue, { ttlMinutes: 240, now: Date.now() }), true);
});

test("isLeaseExcluded: expired claim not excluded (BEH-3)", () => {
  const old = new Date(Date.now() - 300 * 60_000).toISOString();
  const issue = { owner: "alice", claimed_at: old };
  assert.equal(isLeaseExcluded(issue, { ttlMinutes: 240, now: Date.now() }), false);
});

test("isLeaseExcluded: unclaimed issue not excluded", () => {
  assert.equal(isLeaseExcluded({}, { ttlMinutes: 240, now: Date.now() }), false);
});

test("isLeaseExcluded: omitted ttlMinutes defaults to DEFAULT_CLAIM_TTL_MINUTES (240), not 0/disabled (round-3 cq-1 regression)", () => {
  // A claim well past 240 minutes but with no ttlMinutes passed must NOT be
  // treated as "expiry disabled forever excluded" — it must resolve the
  // same real default isClaimStale itself uses, so a stale claim is NOT
  // excluded even when the caller omits the option entirely.
  const old = new Date(Date.now() - 300 * 60_000).toISOString();
  const issue = { owner: "alice", claimed_at: old };
  assert.equal(isLeaseExcluded(issue, {}), false);
  assert.equal(isLeaseExcluded(issue), false); // opts object itself omitted
});

test("hasOpenBlockingDependencies: open dependency excludes (BEH-4)", () => {
  const issue = { id: "b1", dependencies: ["b0"] };
  const byId = new Map([["b0", { id: "b0", status: "open" }]]);
  assert.equal(hasOpenBlockingDependencies(issue, byId), true);
});

test("hasOpenBlockingDependencies: all deps closed does not exclude", () => {
  const issue = { id: "b1", dependencies: ["b0"] };
  const byId = new Map([["b0", { id: "b0", status: "closed" }]]);
  assert.equal(hasOpenBlockingDependencies(issue, byId), false);
});

test("hasOpenBlockingDependencies: a dangling dependency id (absent from issuesById) does not exclude (round-3 cq-2, pinned behavior)", () => {
  const issue = { id: "b1", dependencies: ["deleted-issue"] };
  const byId = new Map(); // full board, but the referenced id no longer exists on it
  assert.equal(hasOpenBlockingDependencies(issue, byId), false);
});

test("isAttemptCapExcluded: NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED exclude (BEH-5)", () => {
  for (const verdict of ["NO_PROGRESS", "REGRESSED", "BUDGET_EXHAUSTED"]) {
    assert.equal(isAttemptCapExcluded({ last_verdict: verdict }), true);
  }
  assert.equal(isAttemptCapExcluded({ last_verdict: "PASS" }), false);
  assert.equal(isAttemptCapExcluded({ last_verdict: "CONTINUE" }), false);
  assert.equal(isAttemptCapExcluded(null), false); // no AttemptRecord = zero attempts
});
