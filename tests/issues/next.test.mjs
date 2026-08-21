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

import { test, describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  resolvePriorityBound,
  validateBugType,
  isModuleEligible,
  RESERVED_SAFETY_TAGS,
  isLeaseExcluded,
  hasOpenBlockingDependencies,
  isAttemptCapExcluded,
  selectNextEligibleBug,
} from "../../lib/issues/eligibility.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

test("resolvePriorityBound: omitted --max-priority defaults to P3 (BEH-8 safety floor)", () => {
  const result = resolvePriorityBound(undefined);
  assert.equal(result.bound, 3);
  assert.equal(result.error, null);
});

test("resolvePriorityBound: P0 and P1 are accepted (BEH-8 amendment — configurable priority band)", () => {
  assert.equal(resolvePriorityBound("P0").bound, 0);
  assert.equal(resolvePriorityBound("P0").error, null);
  assert.equal(resolvePriorityBound("P1").bound, 1);
  assert.equal(resolvePriorityBound("P1").error, null);
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

test("isAttemptCapExcluded: NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED/UNREPRODUCIBLE exclude (BEH-5)", () => {
  for (const verdict of ["NO_PROGRESS", "REGRESSED", "BUDGET_EXHAUSTED", "UNREPRODUCIBLE"]) {
    assert.equal(isAttemptCapExcluded({ last_verdict: verdict }), true);
  }
  assert.equal(isAttemptCapExcluded({ last_verdict: "PASS" }), false);
  assert.equal(isAttemptCapExcluded({ last_verdict: "CONTINUE" }), false);
  assert.equal(isAttemptCapExcluded(null), false); // no AttemptRecord = zero attempts
});

// ─── Task 4: Selection and tie-break composition (BEH-1, BEH-2) ───────────

function bug(overrides) {
  return {
    id: "b1", type: "bug", status: "open", priority: 3,
    created: "2026-01-01T00:00:00.000Z", dependencies: [],
    affected_modules: ["cli"], ...overrides,
  };
}

test("selectNextEligibleBug: returns highest-priority eligible bug within bound (BEH-1)", () => {
  const issues = [bug({ id: "b1", priority: 3 }), bug({ id: "b2", priority: 2 })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug.id, "b2"); // lower number = higher priority
});

test("selectNextEligibleBug: returns null when nothing qualifies", () => {
  const result = selectNextEligibleBug({ issues: [], manifest: {}, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

test("selectNextEligibleBug: ties resolve FIFO by oldest created (BEH-2)", () => {
  const issues = [
    bug({ id: "b1", priority: 2, created: "2026-01-02T00:00:00.000Z" }),
    bug({ id: "b2", priority: 2, created: "2026-01-01T00:00:00.000Z" }),
  ];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug.id, "b2");
});

test("selectNextEligibleBug: priority above bound excluded", () => {
  const issues = [bug({ id: "b1", priority: 4 })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

test("selectNextEligibleBug: an eligible P0 bug is returned when maxPriorityBound admits it (BEH-8 amendment)", () => {
  const issues = [bug({ id: "p0-bug", priority: 0 })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 0, attemptRecords: new Map() });
  assert.equal(result.bug.id, "p0-bug");
});

test("selectNextEligibleBug: a P0 bug tagged against a reserved safety module is still excluded (BEH-7 unaffected by BEH-8 widening)", () => {
  const issues = [bug({ id: "p0-bug", priority: 0, affected_modules: ["review-gate"] })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [] }, maxPriorityBound: 0, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

test("selectNextEligibleBug: a P0 bug with empty affected_modules is still excluded (BEH-10 unaffected by BEH-8 widening)", () => {
  const issues = [bug({ id: "p0-bug", priority: 0, affected_modules: [] })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 0, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

test("selectNextEligibleBug: a P0 bug with an unrecognized module slug is still excluded (BEH-11 unaffected by BEH-8 widening)", () => {
  const issues = [bug({ id: "p0-bug", priority: 0, affected_modules: ["typo-slug"] })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 0, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

test("selectNextEligibleBug: a bug blocked by a non-bug work item is excluded, and no OTHER candidate exists to mask the check (BEH-4, full-board dependency map)", () => {
  // issuesById must be built from the FULL board (all types), not just bug candidates —
  // a dependency on a `feature`/`task` work item must still block. This is the ONLY
  // candidate bug in the fixture, so a false negative here (dependency wrongly ignored)
  // cannot be masked by another eligible bug winning the tie-break — unlike an end-to-end
  // fixture that also carries an unrelated eligible bug, this assertion has no escape hatch.
  const blocker = { id: "f1", type: "feature", status: "open", dependencies: [], created: "2026-01-01T00:00:00.000Z" };
  const blocked = bug({ id: "b1", dependencies: ["f1"] });
  const result = selectNextEligibleBug({ issues: [blocked, blocker], manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

test("selectNextEligibleBug: missing priority is treated as eligible (normalized to 2/P2) rather than excluded or treated as P0", () => {
  // Normalization is internal to filtering/sorting (`priority ?? 2`) — the function
  // returns the ORIGINAL issue object unmodified, so `result.bug.priority` stays
  // `undefined` on the returned object. Only the selection outcome (id) is asserted;
  // callers that need a materialized priority read `result.bug.priority ?? 2` themselves.
  const issue = bug({ id: "b1" });
  delete issue.priority;
  const result = selectNextEligibleBug({ issues: [issue], manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug.id, "b1");
});

test("selectNextEligibleBug: cascading exclusion — the more-urgent candidate is excluded (attempt-cap), the next eligible candidate wins (round-4 cq-1)", () => {
  const issues = [
    bug({ id: "urgent-but-excluded", priority: 2 }),
    bug({ id: "next-in-line", priority: 3 }),
  ];
  const attemptRecords = new Map([["urgent-but-excluded", { last_verdict: "REGRESSED" }]]);
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords });
  assert.equal(result.bug.id, "next-in-line");
});

test("selectNextEligibleBug: deferred-status bug is excluded (round-4 cq-2)", () => {
  const issues = [bug({ id: "b1", status: "deferred" })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
  assert.equal(result.bug, null);
});

// ─── Task 5: `adev issues next` CLI verb — end-to-end dispatch ────────────

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function makeProject({ backend = "json" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "issues-next-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  const manifestBody = backend
    ? `tasks:\n  backend: ${backend}\nmodules:\n  - slug: cli\n`
    : "modules:\n  - slug: cli\n"; // no tasks.backend key at all
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifestBody);
  return dir;
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [join(REPO_ROOT, "cli/index.mjs"), "issues", "next", ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("adev issues next — CLI", () => {
  let noBackendDir, emptyBoardDir, seededDir, seededBugId, blockedOnlyDir;

  before(async () => {
    noBackendDir = makeProject({ backend: null });

    emptyBoardDir = makeProject();
    await new JsonAdapter(emptyBoardDir).init();

    seededDir = makeProject();
    const adapter = new JsonAdapter(seededDir);
    await adapter.init();
    const created = await adapter.create({ title: "seeded eligible bug", type: "bug", priority: 2 });
    await adapter.update(created.id, { affected_modules: ["cli"] });
    seededBugId = created.id;

    // Isolated fixture for the dependency-blocking regression: this board's
    // ONLY bug is blocked. Reusing `seededDir` (which already carries an
    // unrelated eligible bug) would make a false-negative dependency check
    // undetectable — the pre-existing bug would win the tie-break regardless
    // of whether the blocker was ever consulted.
    blockedOnlyDir = makeProject();
    const blockedAdapter = new JsonAdapter(blockedOnlyDir);
    await blockedAdapter.init();
    const blocker = await blockedAdapter.create({ title: "blocking feature", type: "feature" });
    const blocked = await blockedAdapter.create({ title: "blocked bug", type: "bug", priority: 2 });
    await blockedAdapter.update(blocked.id, { affected_modules: ["cli"], dependencies: [blocker.id] });
  });

  after(() => {
    for (const d of [noBackendDir, emptyBoardDir, seededDir, blockedOnlyDir]) rmSync(d, { recursive: true, force: true });
  });

  it("ISSUE_BOARD_NOT_CONFIGURED when tasks.backend unset", () => {
    const result = runCli(["--type", "bug", "--json"], noBackendDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ISSUE_BOARD_NOT_CONFIGURED/);
  });

  it("UNSUPPORTED_TYPE for non-bug --type", () => {
    const result = runCli(["--type", "feature", "--json"], emptyBoardDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /UNSUPPORTED_TYPE/);
  });

  it("INVALID_PRIORITY_BOUND for malformed --max-priority", () => {
    const result = runCli(["--max-priority", "P9", "--json"], emptyBoardDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INVALID_PRIORITY_BOUND/);
  });

  it("--max-priority P0/P1 succeed end-to-end (BEH-8 amendment — configurable priority band)", () => {
    for (const p of ["P0", "P1"]) {
      const result = runCli(["--max-priority", p, "--json"], emptyBoardDir);
      assert.equal(result.status, 0);
      assert.deepEqual(JSON.parse(result.stdout), { bug: null });
    }
  });

  it('returns {"bug": null} exit 0 when nothing eligible', () => {
    const result = runCli(["--type", "bug", "--json"], emptyBoardDir);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { bug: null });
  });

  it("returns the seeded eligible bug end-to-end", () => {
    const result = runCli(["--type", "bug", "--max-priority", "P3", "--json"], seededDir);
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.bug.id, seededBugId);
  });

  it("a bug blocked by a non-bug dependency is excluded end-to-end, with no other candidate to mask a false negative", () => {
    const result = runCli(["--type", "bug", "--max-priority", "P3", "--json"], blockedOnlyDir);
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    // blockedOnlyDir's only bug is blocked by a `type: "feature"` dependency — if the
    // dependency map were ever rebuilt from a bug-only fetch, this assertion fails
    // because the blocked bug would surface with nothing to hide it.
    assert.equal(parsed.bug, null);
  });
});
