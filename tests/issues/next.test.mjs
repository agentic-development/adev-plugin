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
