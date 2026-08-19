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
