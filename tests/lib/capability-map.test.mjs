// tests/lib/capability-map.test.mjs
//
// Root-cause regression test for adev-plugin-step7-capability-regression-0r65:
// `/adev:review-specs` Step 7 wrote the charter Capability Map `Status`
// column unconditionally on a passing verdict, so a re-review of an
// already-`implemented` capability (e.g. after `/adev:validate` FAILs and
// the spec is revised) regressed the row back to `review-passed`, losing
// the record that the capability was actually built.
//
// Spec: .context-index/specs/features/spec-lifecycle/capability-status-column.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAPABILITY_STATUSES,
  capabilityStatusRank,
  isMonotonicCapabilityAdvance,
  applyCapabilityStatus,
} from "../../lib/capability-map.mjs";

function charterFixture(status) {
  return `---
charter: scoring-engine
status: evolving
revision: 4
updated: 2026-08-01
---

# Feature Charter: Scoring Engine

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Scoring engine | Verdict tallying | must-have | v1 | ${status} |
| Other capability | Unrelated row | nice-to-have | v1 | specified |
`;
}

// ── capabilityStatusRank / isMonotonicCapabilityAdvance ────────────────────

test("capabilityStatusRank ranks the canonical lifecycle order", () => {
  assert.equal(capabilityStatusRank("—"), 0);
  assert.equal(capabilityStatusRank("specified"), 1);
  assert.equal(capabilityStatusRank("review-passed"), 2);
  assert.equal(capabilityStatusRank("planned"), 3);
  assert.equal(capabilityStatusRank("implementing"), 4);
  assert.equal(capabilityStatusRank("implemented"), 5);
  assert.equal(capabilityStatusRank("validated"), 6);
});

test("capabilityStatusRank returns -1 for unrecognized or non-string values", () => {
  assert.equal(capabilityStatusRank("bogus"), -1);
  assert.equal(capabilityStatusRank(""), -1);
  assert.equal(capabilityStatusRank(undefined), -1);
  assert.equal(capabilityStatusRank(null), -1);
});

test("isMonotonicCapabilityAdvance allows forward moves", () => {
  assert.equal(isMonotonicCapabilityAdvance("—", "specified"), true);
  assert.equal(isMonotonicCapabilityAdvance("specified", "review-passed"), true);
  assert.equal(isMonotonicCapabilityAdvance("review-passed", "planned"), true);
});

test("isMonotonicCapabilityAdvance rejects a regression to an earlier step (the reported bug)", () => {
  assert.equal(isMonotonicCapabilityAdvance("implemented", "review-passed"), false);
  assert.equal(isMonotonicCapabilityAdvance("validated", "review-passed"), false);
  assert.equal(isMonotonicCapabilityAdvance("planned", "specified"), false);
});

test("isMonotonicCapabilityAdvance rejects a no-op write to the same status", () => {
  assert.equal(isMonotonicCapabilityAdvance("implemented", "implemented"), false);
});

test("isMonotonicCapabilityAdvance treats an unrecognized current status as pre-lifecycle", () => {
  assert.equal(isMonotonicCapabilityAdvance("some-legacy-value", "specified"), true);
  assert.equal(isMonotonicCapabilityAdvance(undefined, "specified"), true);
});

test("isMonotonicCapabilityAdvance throws CAPABILITY_STATUS_INVALID for an illegal next status", () => {
  assert.throws(
    () => isMonotonicCapabilityAdvance("specified", "not-a-real-status"),
    (err) => err.code === "CAPABILITY_STATUS_INVALID",
  );
});

test("CAPABILITY_STATUSES is frozen and matches the spec's documented order", () => {
  assert.deepEqual(CAPABILITY_STATUSES, [
    "—",
    "specified",
    "review-passed",
    "planned",
    "implementing",
    "implemented",
    "validated",
  ]);
  assert.throws(() => { CAPABILITY_STATUSES.push("x"); });
});

// ── applyCapabilityStatus: the actual charter-table write ──────────────────

test("applyCapabilityStatus advances a not-yet-reviewed capability to review-passed", () => {
  const charter = charterFixture("specified");
  const result = applyCapabilityStatus(charter, "Scoring engine", "review-passed", { today: "2026-08-26" });
  assert.equal(result.updated, true);
  assert.equal(result.previousStatus, "specified");
  assert.equal(result.newStatus, "review-passed");
  assert.match(result.content, /\| Scoring engine \| Verdict tallying \| must-have \| v1 \| review-passed \|/);
  assert.match(result.content, /revision: 5/);
  assert.match(result.content, /updated: 2026-08-26/);
  // Unrelated row untouched.
  assert.match(result.content, /\| Other capability \| Unrelated row \| nice-to-have \| v1 \| specified \|/);
});

test("applyCapabilityStatus refuses to regress an already-implemented capability on re-review (the reported bug)", () => {
  const charter = charterFixture("implemented");
  const result = applyCapabilityStatus(charter, "Scoring engine", "review-passed", { today: "2026-08-26" });
  assert.equal(result.updated, false);
  assert.equal(result.reason, "NOT_MONOTONIC");
  assert.equal(result.previousStatus, "implemented");
  // Content is returned unchanged — no regression, no revision bump.
  assert.equal(result.content, charter);
  assert.match(result.content, /\| Scoring engine \| Verdict tallying \| must-have \| v1 \| implemented \|/);
});

test("applyCapabilityStatus refuses to regress a validated capability on re-review", () => {
  const charter = charterFixture("validated");
  const result = applyCapabilityStatus(charter, "Scoring engine", "review-passed", {});
  assert.equal(result.updated, false);
  assert.equal(result.reason, "NOT_MONOTONIC");
  assert.equal(result.previousStatus, "validated");
});

test("applyCapabilityStatus reports CAPABILITY_NOT_FOUND for an unmatched capability name", () => {
  const charter = charterFixture("specified");
  const result = applyCapabilityStatus(charter, "Nonexistent capability", "review-passed", {});
  assert.equal(result.updated, false);
  assert.equal(result.reason, "CAPABILITY_NOT_FOUND");
  assert.equal(result.content, charter);
});

test("applyCapabilityStatus reports PARSE_ERROR when the charter has no Capability Map table", () => {
  const charter = "---\nrevision: 1\n---\n\n# Charter\n\nNo table here.\n";
  const result = applyCapabilityStatus(charter, "Anything", "specified", {});
  assert.equal(result.updated, false);
  assert.equal(result.reason, "PARSE_ERROR");
});

test("applyCapabilityStatus throws CAPABILITY_STATUS_INVALID for an illegal nextStatus before touching the file", () => {
  const charter = charterFixture("specified");
  assert.throws(
    () => applyCapabilityStatus(charter, "Scoring engine", "bogus-status", {}),
    (err) => err.code === "CAPABILITY_STATUS_INVALID",
  );
});

test("applyCapabilityStatus is idempotent under repeated re-review at the same passing status", () => {
  const charter = charterFixture("review-passed");
  const result = applyCapabilityStatus(charter, "Scoring engine", "review-passed", {});
  assert.equal(result.updated, false);
  assert.equal(result.reason, "NOT_MONOTONIC");
  assert.equal(result.content, charter);
});
