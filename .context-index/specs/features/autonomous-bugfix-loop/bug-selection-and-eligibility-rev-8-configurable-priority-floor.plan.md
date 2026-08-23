<!-- partial_schema: plan@1 -->

# Implementation Plan: Bug Selection Verb and Eligibility Filter — Configurable Priority Floor

> **Methodology:** adev
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-21)
> **Platform:** Node.js (ESM), `node:test`, npm, zero external dependencies

**Goal:** Amend `adev issues next`'s eligibility filter (target revision 8 of `bug-selection-and-eligibility.spec.md`) so `--max-priority` accepts the full `P0`-`P4` range instead of rejecting `P0`/`P1`, leaving BEH-7's unconditional module-exclusion floor as the sole safety boundary, and add BEH-12's excluded-module-set visibility so an operator using the widened bound can see what remains protected.

**Architecture:** This is a small, surgical amendment to an already-shipped verb — no new files, no new modules. `lib/issues/eligibility.mjs`'s `resolvePriorityBound()` drops its P0/P1 rejection branch, and `selectNextEligibleBug()` drops its redundant `priority < 2` floor check (the ceiling check `priority > maxPriorityBound` already does all the filtering once P0/P1 become admissible bounds). `lib/cli/issues-next.mjs` gains one new behavior (BEH-12): when the resolved bound is `P0` or `P1`, it prints the effective excluded-module set (`resolveExcludedModules()`, already exported by `eligibility.mjs`) to stderr before returning its normal stdout result — additive only, no change to the JSON contract or exit codes. `tests/issues/next.test.mjs` (the existing per-behavior suite for this spec) is extended, not replaced: BEH-1 through BEH-7, BEH-9, BEH-10, BEH-11 tests are untouched per the spec's own acceptance criterion; only the BEH-8-specific tests change, and new tests are added for the P0/P1-widened composition regressions (BEH-7+P0, BEH-10+P0, BEH-11+P0) and for BEH-12.

---

## File Structure

**Modify:**
- `lib/issues/eligibility.mjs:29-61` — `DEFAULT_MAX_PRIORITY_BOUND` comment (line 29, stale "Safety floor (BEH-8)" phrasing) + `resolvePriorityBound()`: remove the P0/P1 rejection branch and its docstring language
- `lib/issues/eligibility.mjs:196-236` — `selectNextEligibleBug()`: remove the `priority < 2` floor check (line 217) and its comment; docstring above the function is unaffected
- `lib/cli/issues-next.mjs:60-118` — `run()`: add BEH-12 stderr print of the effective excluded-module set when the resolved bound is P0/P1
- `lib/cli/issues-next.mjs:120-129` — `help()`: update the `--max-priority` description (no longer "rejects P0/P1")
- `tests/issues/next.test.mjs:40-46` — replace the "P0 and P1 are rejected" test with a "P0 and P1 are accepted" test
- `tests/issues/next.test.mjs:197-204` — replace the "P0/P1 bugs are NEVER returned" test with a test that P0/P1 bugs ARE returned when otherwise eligible
- `tests/issues/next.test.mjs:311-317` — narrow the CLI-level `INVALID_PRIORITY_BOUND for P0/P1/malformed` test to malformed values only
- `tests/issues/next.test.mjs` (new tests appended near the Task 4/5 sections) — BEH-7+P0, BEH-10+P0, BEH-11+P0 composition regressions; BEH-12 stderr assertions
- `docs/cli-reference.md:659` — update the `next` verb's `--max-priority` documentation to the full `P0`-`P4` range and note the module-exclusion floor as the actual safety boundary; mention BEH-12's stderr output

**Reference (read, do not modify):**
- `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` — base spec; BEH-7 (unconditional module-exclusion floor), BEH-10/BEH-11 (fail-closed defaults) are unchanged and must keep passing exactly as specified
- `lib/issues/eligibility.mjs` (`resolveExcludedModules`, `isModuleEligible`) — already exported; BEH-12 reuses `resolveExcludedModules()` directly, no new export needed
- `tests/issues/next.test.mjs` — existing suite; the `bug()` fixture helper and `runCli()`/`makeProject()` CLI harness are reused as-is

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md` (Behavioral Delta — BEH-8 replacement text; Acceptance Criteria bullets 1-4)
- Base spec: `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` (original BEH-7, BEH-10, BEH-11 text — unchanged, must still pass)
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: Eligibility Filter — now "amendment review-passed")
- Source files: `lib/issues/eligibility.mjs` (full read — `resolvePriorityBound`, `selectNextEligibleBug`, `isModuleEligible`, `resolveExcludedModules`)
- Existing tests: `tests/issues/next.test.mjs` (full read — Task 1 and Task 4 sections, lines 34-56 and 161-227)

### Task 2 Context
- Spec: same amendment spec (BEH-12 full text — trigger condition, stderr-only, every invocation not just first, no stdout/exit-code change)
- Review note: boundary reviewer's rationale for BEH-12 (privilege-escalation visibility gap) — see spec's Amendment Rationale section
- Source files: `lib/cli/issues-next.mjs` (full read), `lib/issues/eligibility.mjs` (export signature: `resolveExcludedModules(manifest)` from Task 1)
- Existing tests: `tests/issues/next.test.mjs` (full read — Task 5 CLI section, lines 245-341, including the `runCli`/`makeProject` harness)

### Task 3 Context
- Spec: same amendment spec (Acceptance Criteria — `docs/cli-reference.md`'s `--max-priority` documentation criterion)
- Doc file: `docs/cli-reference.md:657-663` (existing `set-modules`/`next` documentation block — follow its prose style and format)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion to an unbounded universal that cannot be discharged.
- **Evidence:** 1 observations

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

All three tasks touch `tests/issues/next.test.mjs` (Tasks 1 and 2 directly; Task 3 is doc-only but follows for narrative order), and Task 2's stderr behavior reuses `resolveExcludedModules()` shipped by Task 1. No independent group — parallel dispatch would only produce merge conflicts on the shared test file.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | BEH-8: remove the priority-based P0/P1 floor | small | unit | — | 0 create, 2 modify |
| 2 | BEH-12: excluded-module visibility on widened bound | small | unit | Task 1 | 0 create, 2 modify |
| 3 | Update `--max-priority` documentation | small | unit | Task 2 | 0 create, 1 modify |

---

## Task Structure

### Task 1: BEH-8 — remove the priority-based P0/P1 floor [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `lib/issues/eligibility.mjs:32-61` (`resolvePriorityBound`)
- Modify: `lib/issues/eligibility.mjs:196-236` (`selectNextEligibleBug`)
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — extend (per-behavior granularity, source: manifest `test_policy.granularity: per-behavior`; this suite already covers BEH-8, so the existing BEH-8 tests are replaced in place rather than a new suite created). Covers the amended BEH-8, plus new BEH-7+P0/BEH-10+P0/BEH-11+P0 composition regressions required by the spec's Acceptance Criteria.

**Context to load:**
- Amendment spec's Behavioral Delta section (new BEH-8 text)
- Base spec's BEH-7, BEH-10, BEH-11 text (must remain unaffected)

- [ ] **Write failing test**

Replace the existing test at `tests/issues/next.test.mjs:40-46` (`"resolvePriorityBound: P0 and P1 are rejected (BEH-8)"`):

```javascript
test("resolvePriorityBound: P0 and P1 are accepted (BEH-8 amendment — configurable priority band)", () => {
  assert.equal(resolvePriorityBound("P0").bound, 0);
  assert.equal(resolvePriorityBound("P0").error, null);
  assert.equal(resolvePriorityBound("P1").bound, 1);
  assert.equal(resolvePriorityBound("P1").error, null);
});
```

Replace the existing test at `tests/issues/next.test.mjs:197-204` (`"selectNextEligibleBug: P0/P1 bugs are NEVER returned..."`):

```javascript
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
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `resolvePriorityBound("P0")` still returns `{ bound: null, error: { code: "INVALID_PRIORITY_BOUND", ... } }`, and the P0-bug selection tests fail because `selectNextEligibleBug` still applies the hard `priority < 2` floor.

- [ ] **Implement**

In `lib/issues/eligibility.mjs`, `resolvePriorityBound` (currently lines 42-61): delete the `if (raw === "P0" || raw === "P1") { ... }` rejection block (lines 51-59) entirely. The function becomes:

```javascript
export function resolvePriorityBound(raw) {
  if (raw == null) return { bound: DEFAULT_MAX_PRIORITY_BOUND, error: null };
  const num = PRIORITY_LABEL_TO_NUMBER[raw];
  if (num === undefined) {
    return {
      bound: null,
      error: { code: "INVALID_PRIORITY_BOUND", message: `Invalid --max-priority "${raw}". Valid: P0-P4.` },
    };
  }
  return { bound: num, error: null };
}
```

Update the docstring above it (lines 32-41) to describe the amended behavior — the full `P0`-`P4` range is selectable; BEH-7's module-exclusion floor is now the sole safety boundary, not this resolver.

Also update the one-line comment on `DEFAULT_MAX_PRIORITY_BOUND` (line 29, just above line 32): `/** Safety floor (BEH-8): the resolved bound when --max-priority is omitted. */` — after this amendment, this default is no longer "the safety floor" (BEH-7's module-exclusion floor is), so drop that phrase; describe it as just the default bound. (Plan-review flagged this: it falls just outside the file's stated 32-61 edit range but is stale terminology introduced by the same change.)

In `lib/issues/eligibility.mjs`, `selectNextEligibleBug` (currently lines 211-236): delete the line `if (priority < 2) return false; // P0/P1 floor — never eligible regardless of --max-priority (BEH-8)` (line 217). The ceiling check `if (priority > maxPriorityBound) return false;` (line 218) is unchanged and now does all priority-band filtering — since `maxPriorityBound` can now itself resolve to 0 or 1, a P0 bug is only ever excluded by the ceiling when the caller passed a bound below its own priority, exactly as intended.

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS — including all pre-existing BEH-1 through BEH-7, BEH-9, BEH-10, BEH-11 tests, unmodified and still green.

- [ ] **Commit**

Branch (if not already created): `feat/autonomous-bugfix-loop/configurable-priority-floor`

```bash
git add lib/issues/eligibility.mjs tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): allow P0/P1 through --max-priority (BEH-8 amendment)

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md
Plan-task: 1"
```

---

### Task 2: BEH-12 — excluded-module visibility on widened bound [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: detected, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/cli/issues-next.mjs:60-118` (`run()`)
- Modify: `lib/cli/issues-next.mjs:120-129` (`help()`)
- Test: `tests/issues/next.test.mjs`

**Tests:** `tests/issues/next.test.mjs` — extend (per-behavior granularity, source: manifest). BEH-12 has no existing coverage; new CLI-level tests are added to the Task 5 CLI section of the same suite, alongside a narrowed replacement for the existing `INVALID_PRIORITY_BOUND for P0/P1/malformed` test.

**Context to load:**
- Amendment spec's BEH-12 text (trigger: `--max-priority P0`/`P1`; stderr-only; every invocation; no stdout/exit-code change)
- `lib/issues/eligibility.mjs` `resolveExcludedModules(manifest)` (from Task 1 — unchanged export)

- [ ] **Write failing test**

Replace the existing test at `tests/issues/next.test.mjs:311-317` (`"INVALID_PRIORITY_BOUND for P0/P1/malformed"`):

```javascript
it("INVALID_PRIORITY_BOUND for malformed values only (P0/P1 now accepted, BEH-8 amendment)", () => {
  const result = runCli(["--max-priority", "P9", "--json"], emptyBoardDir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INVALID_PRIORITY_BOUND/);
});

it("--max-priority P0/P1 succeed and print the effective excluded-module set to stderr (BEH-12)", () => {
  const result = runCli(["--max-priority", "P0", "--json"], emptyBoardDir);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { bug: null });
  assert.match(result.stderr, /review-gate/);
  assert.match(result.stderr, /convergence-detector/);
  assert.match(result.stderr, /retry-loop/);
  assert.match(result.stderr, /bugfix-loop/);
});

it("--max-priority P2/P3/P4 and the default do NOT print the excluded-module set (BEH-12 — only widened invocations get it)", () => {
  for (const args of [["--type", "bug", "--json"], ["--max-priority", "P3", "--json"], ["--max-priority", "P4", "--json"]]) {
    const result = runCli(args, emptyBoardDir);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/next.test.mjs`
Expected: FAIL — `run()` in `lib/cli/issues-next.mjs` never writes to stderr on success today; the new BEH-12 assertions fail.

- [ ] **Implement**

In `lib/cli/issues-next.mjs`, after `resolvePriorityBound` succeeds (after line 64, before the `tasks.backend` check) or immediately before the final `console.log`/return (either placement satisfies "before returning its result" — place it right after `bound` is resolved, since that is where the amendment's rationale — visibility "at the moment they use the widened bound" — is most direct):

```javascript
if (bound === 0 || bound === 1) {
  const { resolveExcludedModules } = await import("../issues/eligibility.mjs"); // or a static top-level import alongside the existing ones
  const excluded = [...resolveExcludedModules(manifest)].sort();
  console.error(`Excluded modules (safety floor, unaffected by --max-priority): ${excluded.join(", ")}`);
}
```

Prefer a static top-level import of `resolveExcludedModules` alongside the existing `resolvePriorityBound`/`validateBugType`/`selectNextEligibleBug` import from `../issues/eligibility.mjs` (line 20-24) rather than a dynamic `import()` — there is no lazy-load reason here, this is a straight-line CLI verb.

Update `help()` (lines 120-129): change `"--type currently only accepts \"bug\" (default). --max-priority defaults\nto P3 and rejects P0/P1 — those are outside the eligibility filter's\nsafety boundary and can never be selected via this verb."` to describe the full `P0`-`P4` range and note that `--max-priority P0`/`P1` prints the effective excluded-module set to stderr.

- [ ] **Verify test passes**

Run: `node --test tests/issues/next.test.mjs`
Expected: PASS — all tests including Task 1's and Task 2's new assertions.

- [ ] **Commit**

```bash
git add lib/cli/issues-next.mjs tests/issues/next.test.mjs
git commit -m "feat(autonomous-bugfix-loop): print excluded-module set on widened --max-priority (BEH-12)

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md
Plan-task: 2"
```

---

### Task 3: Update `--max-priority` documentation [specialist: none]

**Charter capability:** Eligibility Filter
**Strategy:** unit (source: fallback, confidence: high — doc-only task, no test file; the acceptance criterion itself notes this is verified by manual review, not a test, per the wiring reviewer's PASS_WITH_NOTES finding)
**Depends on:** Task 2
**Files:**
- Modify: `docs/cli-reference.md:659`

**Tests:** none — documentation-only change. The parent spec's acceptance criterion for this item ("`docs/cli-reference.md`'s `--max-priority` documentation is updated...") has no test/lint backing it; this was flagged and explicitly left as-is by the wiring reviewer as a normal doc-update convention in this project (see spec review, `implicit-cross-spec-consumer-reference`/`doc-update-without-stated-reader` note).

**Context to load:**
- `docs/cli-reference.md:657-663` (existing `set-modules`/`next` block — match its prose style)

- [ ] **Write failing test**

N/A — doc-only task, no test file per this project's convention for doc-update acceptance criteria (see Strategy note above).

- [ ] **Verify test fails**

N/A.

- [ ] **Implement**

In `docs/cli-reference.md`, update the `next` verb's documentation line (currently line 659):

Replace:
> `--max-priority` defaults to `P3` (covering `P2`/`P3`) and rejects `P0`/`P1` with `INVALID_PRIORITY_BOUND` — those priorities are outside the eligibility filter's safety boundary by design, not merely deprioritized, and can never be selected via this verb regardless of flags.

With:
> `--max-priority` defaults to `P3` (covering `P2`/`P3`) and accepts the full `P0`-`P4` range — a malformed value (not `P0`-`P4`) still exits non-zero with `INVALID_PRIORITY_BOUND`. The module-exclusion floor below (reserved safety tags and any manifest-configured `tasks.bugfix_loop.excluded_modules`) is the actual safety boundary, not the priority band — it is unconditional and applies regardless of `--max-priority`. When `--max-priority P0` or `P1` is used, `adev issues next` additionally prints the effective excluded-module set to stderr before returning, so the operator can see what remains protected at the widened bound.

- [ ] **Verify test passes**

N/A.

- [ ] **Commit**

```bash
git add docs/cli-reference.md
git commit -m "docs(autonomous-bugfix-loop): document the full P0-P4 --max-priority range

Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md
Plan-task: 3"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied

`governance/gates.yaml` exists in this project — `/adev:validate` uses its gate definitions in place of this fallback list.
