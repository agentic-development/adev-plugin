<!-- partial_schema: plan@1 -->

# Implementation Plan: Bug Selection Verb and Eligibility Filter

> **Methodology:** adev
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-19)
> **Platform:** Node.js (ESM), `node:test`, npm, zero external dependencies

**Goal:** Implement `adev issues next --type bug --max-priority <p> --json`, the read-only bug-selection verb that returns the single highest-priority eligible bug (or `{"bug": null}`), gated by the eligibility filter's safety boundary (priority band, blast-radius/module checks, attempt-cap consult).

**Architecture:** The eligibility filter's decision logic (priority-bound validation, module-safety checks, lease/dependency/attempt-cap exclusion, tie-break selection) lives in a new pure module, `lib/issues/eligibility.mjs`, mirroring the existing `isClaimStale`/`isClaimUnexpirable`/`checkCloseGuard` predicate style already in `lib/issues/interface.mjs`. The CLI verb itself, `lib/cli/issues-next.mjs`, follows the read-only-report shape of the existing `lib/cli/issues-stale.mjs` (arg parsing via `node:util` `parseArgs`, `getIssueManager(manifest)` for board access, `--json`/human-readable dual output, exit codes for the three declared error cases) and is wired into the `adev issues` dispatcher (`lib/cli/issues.mjs`) alongside `migrate`/`claim`/`release`/`stale`/`set-modules`. `WorkItem.affected_modules` (the schema this filter reads) and its v1 producer (`adev issues set-modules`) already shipped in this spec revision — this plan implements only the read side (the eligibility filter and its CLI verb) plus the still-undocumented `tasks.bugfix_loop.excluded_modules` manifest key.

---

## File Structure

**Create:**
- `lib/issues/eligibility.mjs` — pure eligibility-filter predicates and the top-level `selectNextEligibleBug()` composition (BEH-1–11)
- `lib/cli/issues-next.mjs` — `adev issues next` CLI verb: arg parsing, error codes, JSON/human output
- `tests/issues/next.test.mjs` — `node:test` coverage for the full eligibility matrix and CLI dispatch

**Modify:**
- `lib/cli/issues.mjs:23-77` — add `next` subcommand to the dispatcher and its `help()` line
- `templates/manifest-template.yaml:250-261` — add a doc comment for `tasks.bugfix_loop.excluded_modules` alongside the existing `attempt_cap`/`reproduction_attempt_limit` block
- `docs/cli-reference.md:543-610` — document `issues next` in the `### issues` section, alongside the existing `stale`/`set-modules` entries

**Reference (read, do not modify):**
- `lib/issues/interface.mjs` — `isClaimStale`, `isClaimUnexpirable`, `normalizeClaimTtlMinutes`, `checkCloseGuard`, `VALID_PRIORITIES` — predicate style and lease/dependency semantics to follow
- `lib/bugfix-loop-attempts.mjs` — `readAttemptRecord(projectRoot, issueId)` returns the latest `AttemptRecord` or `null` (zero-attempts case); this is the sibling `per-issue-attempt-cap` spec's already-shipped read API
- `lib/issues/registry.mjs` — `getIssueManager(manifest, projectRoot)`; note it silently defaults to `json` when `tasks.backend` is unconfigured (round-6 review RI-2) — the verb must check `manifest.tasks.backend` explicitly before calling it, not rely on it to throw
- `lib/cli/issues-stale.mjs` — pattern reference for a read-only reporting CLI verb (arg parsing, dual `--json`/human output, exit-0-on-success-scan shape)
- `lib/cli/issues-set-modules.mjs` — pattern reference for the sibling verb that writes the field this filter reads

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` (Preconditions bullet on `--max-priority` P0–P4↔0–4 mapping; BEH-8, BEH-9; Error Cases table rows for `UNSUPPORTED_TYPE`, `INVALID_PRIORITY_BOUND`)
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: Eligibility Filter)
- Source files: `lib/issues/interface.mjs` (full read — `VALID_PRIORITIES`, `VALID_TYPES`, error-code conventions like `err.code = "..."`)

### Task 2 Context
- Spec: same file (BEH-6, BEH-7, BEH-10, BEH-11 and their "Evaluation order" paragraph; Preconditions bullets on `affected_modules` schema and the heuristics-module divergence rationale)
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: Eligibility Filter; Invariants — "never attempts an issue whose blast radius touches its own dependency machinery")
- Source files: `lib/issues/eligibility.mjs` (from Task 1, full read), `templates/manifest-template.yaml:250-261` (signatures only — existing `bugfix_loop` doc-comment shape)
- Cross-cutting: `.context-index/specs/features/heuristics/validate-extraction.spec.md` Check 12 (permissive precedent BEH-11 deliberately diverges from — read only the cited section)

### Task 3 Context
- Spec: same file (BEH-3, BEH-4, BEH-5; Preconditions bullet on `AttemptRecord`/attempt-cap read access)
- Sibling spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (BEH-4 — the authoritative three-value exclusion set `{NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED}`; BEH-5 — zero-attempts default)
- Source files: `lib/issues/eligibility.mjs` (from Tasks 1-2, full read), `lib/bugfix-loop-attempts.mjs` (export signatures: `readAttemptRecord`), `lib/issues/interface.mjs` (export signatures: `isClaimStale`, `isClaimUnexpirable`, `checkCloseGuard`)

### Task 4 Context
- Spec: same file (BEH-1, BEH-2; Postconditions — "exactly one eligible WorkItem reference or an explicit null result")
- Source files: `lib/issues/eligibility.mjs` (from Tasks 1-3, full read)

### Task 5 Context
- Spec: same file (Error Cases table in full; Postconditions — "performs no writes")
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: Bug Selection Verb; Interface Contracts — `adev issues next --type bug --max-priority <p> --json`)
- Source files: `lib/issues/eligibility.mjs` (from Tasks 1-4, full read), `lib/cli/issues-stale.mjs` (full read — pattern to follow), `lib/cli/issues-set-modules.mjs` (full read — sibling verb pattern), `lib/cli/issues.mjs` (full read — dispatcher to modify)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5

All five tasks read or write `lib/issues/eligibility.mjs` (Tasks 1-4) or depend on its complete surface (Task 5), and Tasks 1-4 also share `tests/issues/next.test.mjs`. There is no independent group — parallel dispatch would only produce merge conflicts on the same two files.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Priority bound and type validation | small | unit | — | 2 create, 0 modify |
| 2 | Module-safety eligibility checks | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | Lease, dependency, and attempt-cap exclusion | medium | unit | Task 1 | 0 create, 1 modify |
| 4 | Selection and tie-break composition | small | unit | Task 2, Task 3 | 0 create, 1 modify |
| 5 | `adev issues next` CLI verb and wiring | medium | unit | Task 4 | 1 create, 3 modify |

---

## Task Structure

### Task 1: Priority bound and type validation [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `lib/issues/eligibility.mjs`
- Create: `tests/issues/next.test.mjs`
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — new suite (per-behavior granularity, source: manifest; no prior suite covers this spec's behavior group, so this task creates it). Covers BEH-8 and BEH-9.

**Context to load:**
- `lib/issues/interface.mjs` (`VALID_PRIORITIES`, `VALID_TYPES`, error-code convention)
- Spec Preconditions bullet: `--max-priority` P0–P4 ↔ `WorkItem.priority` 0–4 mapping

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePriorityBound, PRIORITY_LABEL_TO_NUMBER } from "../../lib/issues/eligibility.mjs";

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
```

*(`validateBugType` is imported alongside `resolvePriorityBound` in the real top-of-file import statement.)*

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/issues/eligibility.mjs'` (file does not exist yet)

- [ ] **Implement**

```javascript
// lib/issues/eligibility.mjs
export const PRIORITY_LABEL_TO_NUMBER = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 });
export const DEFAULT_MAX_PRIORITY_BOUND = 3; // P3, the safety floor (BEH-8)

export function resolvePriorityBound(raw) {
  if (raw == null) return { bound: DEFAULT_MAX_PRIORITY_BOUND, error: null };
  const num = PRIORITY_LABEL_TO_NUMBER[raw];
  if (num === undefined) {
    return { bound: null, error: { code: "INVALID_PRIORITY_BOUND", message: `Invalid --max-priority "${raw}". Valid: P0-P4.` } };
  }
  if (raw === "P0" || raw === "P1") {
    return { bound: null, error: { code: "INVALID_PRIORITY_BOUND", message: `--max-priority "${raw}" is outside the eligibility filter's safety boundary and cannot be selected.` } };
  }
  return { bound: num, error: null };
}

export function validateBugType(raw) {
  const type = raw ?? "bug";
  if (type !== "bug") {
    return { type: null, error: { code: "UNSUPPORTED_TYPE", message: `--type "${type}" is not supported this milestone. Only "bug" is selectable.` } };
  }
  return { type, error: null };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS (this task's subset of assertions)

- [ ] **Commit**

Branch (if not already created): `feat/autonomous-bugfix-loop/bug-selection-eligibility`

```bash
git add lib/issues/eligibility.mjs tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add priority bound and type validation for adev issues next

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
Plan-task: 1"
```

---

### Task 2: Module-safety eligibility checks [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/issues/eligibility.mjs`
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — extend (per-behavior granularity; same suite as Task 1). Covers BEH-6, BEH-7, BEH-10, BEH-11.

**Context to load:**
- Spec Behaviors BEH-6, BEH-7, BEH-10, BEH-11 (including the "Evaluation order" paragraph — BEH-6 first, then BEH-7, then BEH-11; BEH-10 is the separate empty/absent case)
- `.context-index/specs/features/heuristics/validate-extraction.spec.md` Check 12 (read only for the permissive-fallback contrast BEH-11 deliberately diverges from — not required for implementation, background only)

- [ ] **Write failing test**

```javascript
import { isModuleEligible, RESERVED_SAFETY_TAGS } from "../../lib/issues/eligibility.mjs";

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
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `isModuleEligible is not a function` (not yet exported)

- [ ] **Implement**

```javascript
// lib/issues/eligibility.mjs (append)
export const RESERVED_SAFETY_TAGS = Object.freeze(["review-gate", "convergence-detector", "retry-loop", "bugfix-loop"]);

export function resolveExcludedModules(manifest) {
  const additive = manifest?.tasks?.bugfix_loop?.excluded_modules;
  const extra = Array.isArray(additive) ? additive.filter((s) => typeof s === "string") : [];
  return new Set([...RESERVED_SAFETY_TAGS, ...extra]);
}

export function isModuleEligible(affectedModules, manifest) {
  if (!Array.isArray(affectedModules) || affectedModules.length === 0) return false; // BEH-10
  if (affectedModules.length > 1) return false; // BEH-6
  const [slug] = affectedModules;
  const excluded = resolveExcludedModules(manifest); // BEH-7
  if (excluded.has(slug)) return false;
  const knownSlugs = new Set((manifest?.modules ?? []).map((m) => m.slug));
  if (!knownSlugs.has(slug)) return false; // BEH-11
  return true;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/eligibility.mjs tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add module-safety eligibility checks to issues eligibility filter

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
Plan-task: 2"
```

---

### Task 3: Lease, dependency, and attempt-cap exclusion [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/issues/eligibility.mjs`
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — extend (per-behavior granularity; same suite). Covers BEH-3, BEH-4, BEH-5.

**Context to load:**
- Spec Behaviors BEH-3, BEH-4, BEH-5; Preconditions bullet on `AttemptRecord` read access
- `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` BEH-4 (authoritative three-value exclusion set), BEH-5 (zero-attempts default)
- `lib/issues/interface.mjs` (`isClaimStale`, `isClaimUnexpirable`, `normalizeClaimTtlMinutes`)
- `lib/bugfix-loop-attempts.mjs` (`readAttemptRecord`)

- [ ] **Write failing test**

```javascript
import { isLeaseExcluded, hasOpenBlockingDependencies, isAttemptCapExcluded } from "../../lib/issues/eligibility.mjs";

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

test("isAttemptCapExcluded: NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED exclude (BEH-5)", () => {
  for (const verdict of ["NO_PROGRESS", "REGRESSED", "BUDGET_EXHAUSTED"]) {
    assert.equal(isAttemptCapExcluded({ last_verdict: verdict }), true);
  }
  assert.equal(isAttemptCapExcluded({ last_verdict: "PASS" }), false);
  assert.equal(isAttemptCapExcluded({ last_verdict: "CONTINUE" }), false);
  assert.equal(isAttemptCapExcluded(null), false); // no AttemptRecord = zero attempts
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `isLeaseExcluded is not a function` (not yet exported)

- [ ] **Implement**

```javascript
// lib/issues/eligibility.mjs (append)
import { isClaimStale, isClaimUnexpirable } from "./interface.mjs";

export function isLeaseExcluded(issue, { ttlMinutes, now = Date.now() } = {}) {
  if (!issue.owner) return false;
  const lease = { ttlMs: ttlMinutes * 60_000, now };
  if (isClaimUnexpirable(issue)) return true; // never expires — always excluded while claimed
  return !isClaimStale(issue, lease); // excluded only while the lease is still live
}

export function hasOpenBlockingDependencies(issue, issuesById) {
  const deps = issue.dependencies ?? [];
  return deps.some((depId) => {
    const dep = issuesById.get(depId);
    return dep && dep.status !== "closed";
  });
}

// Exact three-value set per per-issue-attempt-cap.spec.md BEH-4 — authoritative, do not diverge.
const ATTEMPT_CAP_EXCLUDING_VERDICTS = new Set(["NO_PROGRESS", "REGRESSED", "BUDGET_EXHAUSTED"]);

export function isAttemptCapExcluded(attemptRecord) {
  if (!attemptRecord) return false; // no record = zero attempts (BEH-5)
  return ATTEMPT_CAP_EXCLUDING_VERDICTS.has(attemptRecord.last_verdict);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/eligibility.mjs tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add lease, dependency, and attempt-cap exclusion checks

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
Plan-task: 3"
```

---

### Task 4: Selection and tie-break composition [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 2, Task 3
**Files:**
- Modify: `lib/issues/eligibility.mjs`
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — extend (per-behavior granularity; same suite). Covers BEH-1, BEH-2, plus the BEH-8 P0/P1 floor and the BEH-4 full-board dependency composition explicitly (both were review-flagged composition gaps, not new behaviors — BEH-8 and BEH-4 themselves are already covered by Tasks 1 and 3's own predicate-level tests; these are the *composed* regression cases).

**Context to load:**
- Spec Behaviors BEH-1, BEH-2, BEH-4, BEH-8; Postconditions ("exactly one eligible WorkItem reference or an explicit null result — never a partial or ambiguous response")
- `lib/issues/eligibility.mjs` (Tasks 1-3, full read — this task composes all prior predicates)

- [ ] **Write failing test**

```javascript
import { selectNextEligibleBug } from "../../lib/issues/eligibility.mjs";

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

test("selectNextEligibleBug: P0/P1 bugs are NEVER returned even though maxPriorityBound (2 or 3) would numerically admit them (BEH-8 safety boundary — round-1 review blocker)", () => {
  // maxPriorityBound can only ever resolve to 2 or 3 (Task 1 rejects P0/P1 at the flag),
  // but a P0/P1 bug could still exist on the board — the ceiling check `priority > bound`
  // does not exclude a priority NUMERICALLY BELOW the bound. An explicit floor is required.
  const issues = [bug({ id: "p0-bug", priority: 0 }), bug({ id: "p1-bug", priority: 1 })];
  const result = selectNextEligibleBug({ issues, manifest: { modules: [{ slug: "cli" }] }, maxPriorityBound: 3, attemptRecords: new Map() });
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
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `selectNextEligibleBug is not a function` (not yet exported)

- [ ] **Implement**

```javascript
// lib/issues/eligibility.mjs (append)
//
// `issues` MUST be the full board (every type, every status the caller has),
// not a bug-only slice — hasOpenBlockingDependencies needs to resolve
// dependencies of ANY type (round-1 review, Task 5 correctness finding).
// The `issue.type !== "bug"` check below is what narrows candidates to bugs;
// it does not narrow the dependency map, which is built from the same
// full `issues` array before that filter runs.
export function selectNextEligibleBug({ issues, manifest, maxPriorityBound, ttlMinutes = 240, now = Date.now(), attemptRecords = new Map() }) {
  const issuesById = new Map(issues.map((i) => [i.id, i]));
  const candidates = issues.filter((issue) => {
    if (issue.type !== "bug") return false;
    if (issue.status === "closed" || issue.status === "deferred") return false;
    const priority = issue.priority ?? 2; // json adapter's own create() default — never treat missing as 0
    if (priority < 2) return false; // P0/P1 floor — never eligible regardless of --max-priority (BEH-8, round-1 review blocker)
    if (priority > maxPriorityBound) return false;
    if (isLeaseExcluded(issue, { ttlMinutes, now })) return false;
    if (hasOpenBlockingDependencies(issue, issuesById)) return false;
    if (isAttemptCapExcluded(attemptRecords.get(issue.id) ?? null)) return false;
    if (!isModuleEligible(issue.affected_modules, manifest)) return false;
    return true;
  });

  if (candidates.length === 0) return { bug: null };

  candidates.sort((a, b) => {
    const pa = a.priority ?? 2;
    const pb = b.priority ?? 2;
    if (pa !== pb) return pa - pb; // lower number wins
    return Date.parse(a.created) - Date.parse(b.created); // FIFO — oldest first
  });

  return { bug: candidates[0] };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/eligibility.mjs tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): compose eligibility predicates into selectNextEligibleBug

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
Plan-task: 4"
```

---

### Task 5: `adev issues next` CLI verb and wiring [specialist: none]

**Charter capability:** Bug Selection Verb
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 4
**Files:**
- Create: `lib/cli/issues-next.mjs`
- Modify: `lib/cli/issues.mjs:23-77`
- Modify: `templates/manifest-template.yaml:250-261`
- Modify: `docs/cli-reference.md:543-610`
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — extend (per-behavior granularity; same suite). Covers the three Error Cases rows and end-to-end CLI dispatch of BEH-1/BEH-8/BEH-9 through the real `adev issues next` command, plus an end-to-end regression for the BEH-4 full-board dependency fetch fix (round-1 review correctness finding).

**Context to load:**
- Spec Error Cases table (`ISSUE_BOARD_NOT_CONFIGURED`, `UNSUPPORTED_TYPE`, `INVALID_PRIORITY_BOUND`)
- `lib/cli/issues-stale.mjs` (full read — pattern to follow: `parseArgs`, dual output, exit codes)
- `lib/cli/issues-set-modules.mjs` (full read — sibling verb, same dispatcher)
- `lib/cli/issues.mjs` (full read — dispatcher to modify)
- `tests/issues/set-modules.test.mjs` (full read — real CLI dispatch + `JsonAdapter`-seeded fixture pattern this task's test block follows verbatim)
- `lib/bugfix-loop-attempts.mjs` (export signature: `readAllAttemptRecords(projectRoot)` — one-read-per-invocation batch API, used instead of per-issue `readAttemptRecord` calls per the round-1 review recommendation)

- [ ] **Write failing test**

Follow `tests/issues/set-modules.test.mjs`'s exact fixture pattern — `mkdtempSync` under
`os.tmpdir()`, a `.context-index/manifest.yaml` written by hand, and a real `JsonAdapter`
used to seed issues directly (no shell-out for setup, only for the verb under test). Drive
the verb itself with real CLI dispatch via `spawnSync(process.execPath, ["cli/index.mjs", ...])`,
matching this task's own **Tests** field ("end-to-end CLI dispatch").

```javascript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

// Repo root — cli/index.mjs is invoked from here so spawnSync's cwd for the
// *repo* stays fixed while `--project-root`-equivalent behavior is driven by
// each fixture dir's own .context-index/manifest.yaml (mirrors how the real
// CLI resolves projectRoot from cwd).
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
    // of whether the blocker was ever consulted (round-2 review finding: the
    // first draft of this test was vacuous for exactly this reason).
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

  it("INVALID_PRIORITY_BOUND for P0/P1/malformed", () => {
    for (const p of ["P0", "P1", "P9"]) {
      const result = runCli(["--max-priority", p, "--json"], emptyBoardDir);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /INVALID_PRIORITY_BOUND/);
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

  it("a bug blocked by a non-bug dependency is excluded end-to-end, with no other candidate to mask a false negative (round-1 correctness fix + round-2 test-rigor fix)", () => {
    const result = runCli(["--type", "bug", "--max-priority", "P3", "--json"], blockedOnlyDir);
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    // blockedOnlyDir's only bug is blocked by a `type: "feature"` dependency — if the
    // dependency map were ever rebuilt from a bug-only fetch (reverting the round-1 fix),
    // this assertion fails because the blocked bug would surface with nothing to hide it.
    assert.equal(parsed.bug, null);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `unknown issues subcommand: next` (dispatcher does not route `next` yet)

- [ ] **Implement**

```javascript
// lib/cli/issues-next.mjs
import { parseArgs } from "node:util";
import { getIssueManager } from "../issues/registry.mjs";
import { readAllAttemptRecords } from "../bugfix-loop-attempts.mjs";
import {
  resolvePriorityBound,
  validateBugType,
  selectNextEligibleBug,
} from "../issues/eligibility.mjs";
import { normalizeClaimTtlMinutes } from "../issues/interface.mjs";

const USAGE = "usage: adev issues next [--type bug] [--max-priority P0-P4] [--json]";
const OPTIONS = { type: { type: "string" }, "max-priority": { type: "string" }, json: { type: "boolean" } };

export async function run({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(err.message); console.error(USAGE); return 1;
  }

  const { type, error: typeError } = validateBugType(parsed.values.type);
  if (typeError) { console.error(`${typeError.code}: ${typeError.message}`); return 1; }

  const { bound, error: boundError } = resolvePriorityBound(parsed.values["max-priority"]);
  if (boundError) { console.error(`${boundError.code}: ${boundError.message}`); return 1; }

  if (!manifest?.tasks?.backend) {
    console.error("ISSUE_BOARD_NOT_CONFIGURED: tasks.backend is not configured in manifest.yaml.");
    return 1;
  }

  let manager, issues;
  try {
    manager = getIssueManager(manifest, projectRoot);
    // Fetch the FULL board (no type filter) — selectNextEligibleBug's dependency
    // check (BEH-4) must resolve blockers of ANY type, not just bugs. Narrowing
    // to `type` bugs happens inside selectNextEligibleBug itself, over the same
    // full array used to build its issuesById map (round-1 review correctness
    // finding — a bug-only fetch here silently treated non-bug blockers as
    // "not found" = non-blocking).
    issues = await manager.list();
  } catch (err) {
    console.error(err.message); return 1;
  }

  const ttlMinutes = typeof manager.claimTtlMinutes === "number"
    ? manager.claimTtlMinutes
    : normalizeClaimTtlMinutes(manifest?.tasks?.claim_ttl_minutes);

  // One JSONL read for every issue's AttemptRecord, not one read per issue
  // (readAttemptRecord re-parses the whole log on every call).
  const attemptRecords = readAllAttemptRecords(projectRoot);

  const { bug } = selectNextEligibleBug({ issues, manifest, maxPriorityBound: bound, ttlMinutes, attemptRecords });

  if (parsed.values.json) {
    console.log(JSON.stringify({ bug: bug ?? null }, null, 2));
    return 0;
  }
  console.log(bug ? `${bug.id}: ${bug.title} (P${bug.priority})` : "No eligible bug.");
  return 0;
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Read-only: returns the next eligible bug (or {\"bug\": null}). Never");
  console.log("claims, closes, or mutates the board or any AttemptRecord.");
}

export default { run, help };
```

Modify `lib/cli/issues.mjs`: add a `next` branch (mirrors the existing `stale`/`set-modules` branches) that dynamically imports `./issues-next.mjs`, and add `"  next         Return the next eligible bug (read-only)"` to `help()`.

Modify `templates/manifest-template.yaml`: append a doc line near the existing `bugfix_loop.attempt_cap`/`reproduction_attempt_limit` comment block documenting `bugfix_loop.excluded_modules` (additive list layered on top of the four hardcoded reserved safety tags, which are never manifest-overridable).

Modify `docs/cli-reference.md`: add a `**\`next [--type bug] [--max-priority P0-P4] [--json]\`:**` entry in the `### issues` section, alongside the existing `stale`/`set-modules` entries, describing the read-only selection contract and the safety-boundary defaults.

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS

Run full suite: `npm test`
Expected: PASS (no regressions in `tests/issues/*` or elsewhere)

- [ ] **Commit**

```bash
git add lib/cli/issues-next.mjs lib/cli/issues.mjs templates/manifest-template.yaml docs/cli-reference.md tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add adev issues next CLI verb

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
Plan-task: 5"
```

---

## Task Ordering

1. Task 1 (foundation — priority/type validation, no dependencies)
2. Task 2 (module-safety checks — depends on Task 1's file existing)
3. Task 3 (lease/dependency/attempt-cap checks — depends on Task 1's file existing; independent of Task 2's additions but shares the same file, so sequenced after it to avoid conflicting edits)
4. Task 4 (composition — depends on Task 2 and Task 3's exports)
5. Task 5 (CLI verb + wiring — depends on Task 4's `selectNextEligibleBug` being complete)

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml`:

- **test** (fast, required, error severity): `npm test` — triggers `post-task`, `post-implement`
- All acceptance criteria from `bug-selection-and-eligibility.spec.md` satisfied, including the two rows already checked off this revision (`set-modules` round-trip on both backends)
- No constitutional violations introduced (zero external dependencies added; `lib/cli/issues-next.mjs` and `lib/issues/eligibility.mjs` are pure ESM, Node built-ins only)
