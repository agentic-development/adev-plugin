# Plan: Issue Model Milestone Extension

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/issue-model-milestone.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS

## Overview

Add an optional `milestone` string field to the Epic data model across the entire issue management stack. This touches the typedef and validation in `lib/issues/interface.mjs`, the file-based serialization/parsing in `lib/issues/file-adapter.mjs` (with backward compatibility for existing tasks.md files lacking the Milestone column), the beads adapter delegation in `lib/issues/beads-adapter.mjs`, and milestone-based filtering in the `list` path.

## Tasks

### Task 1: Extend Epic typedef and validateEpic
- **Files:** `lib/issues/interface.mjs` (modify)
- **Tests:** `tests/lib/issues-interface.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  1. Add `@property {string} [milestone] - Milestone name` to the `@typedef Epic` JSDoc block (after `planRef`).
  2. Add `@property {string} [milestone] - Filter by milestone` to the `@typedef IssueFilter` JSDoc block.
  3. Update `validateEpic()` to include `milestone` in the returned object: if `data.milestone` is a non-empty string, include it; if it is a non-string truthy value, coerce via `String()`; otherwise set to `undefined`.

  **Test cases:**
  - `validateEpic({ title: "T", milestone: "v1" })` returns object with `milestone: "v1"`
  - `validateEpic({ title: "T" })` returns object with `milestone: undefined`
  - `validateEpic({ title: "T", milestone: "" })` returns object with `milestone: undefined`
  - `validateEpic({ title: "T", milestone: 42 })` returns object with `milestone: "42"` (coercion)

### Task 2: Update file-adapter with backward-compatible Milestone column
- **Files:** `lib/issues/file-adapter.mjs` (modify)
- **Tests:** `tests/lib/issues-file-adapter.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  1. Update `EPIC_HEADER` to add a Milestone column: `| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |`.
  2. Update `EPIC_SEPARATOR` to match the new column count.
  3. Update `serializeEpicRow()` to include `escapeCell(epic.milestone)` between Plan-Ref and Created.
  4. Update `parseEpicRow()` to handle both 6-cell (old format) and 7-cell (new format) rows:
     - If `cells.length >= 7`: parse milestone from `cells[4]`, shift Created/Updated to `cells[5]`/`cells[6]`.
     - If `cells.length === 6`: set `milestone: undefined`, parse Created/Updated from `cells[4]`/`cells[5]` (backward compat).
  5. Update `_read()` epic parsing: change the minimum cell count check from `cells.length >= 6` to `cells.length >= 6` (stays the same, but parseEpicRow now handles both widths).

  **Test cases:**
  - Round-trip: createEpic with milestone, read back, milestone matches
  - Round-trip: createEpic without milestone, read back, milestone is undefined
  - Backward compat: manually write a 6-column tasks.md, read parses without error and milestone is undefined for all epics
  - Re-serialization: after reading a 6-column file and writing, the output has 7 columns with Milestone header
  - Milestone value with pipe character is escaped and unescaped correctly

### Task 3: Update beads-adapter epic delegation
- **Files:** `lib/issues/beads-adapter.mjs` (modify)
- **Tests:** `tests/lib/issues-beads-adapter.test.mjs` (modify, if exists; otherwise create)
- **TDD:** RED — write test first, then implement
- **Description:**
  1. Verify that `createEpic()` and `updateEpic()` in BeadsAdapter delegate to `this._fileAdapter` — since FileAdapter now handles milestone, the beads adapter inherits support automatically.
  2. Write a test confirming that milestone passes through the delegation: call `beadsAdapter.createEpic({ title: "T", milestone: "v1" })` and verify the returned epic has `milestone: "v1"`.

  **Test cases:**
  - `createEpic({ title: "T", milestone: "v1" })` via beads adapter returns epic with milestone field
  - `updateEpic(id, { milestone: "v2" })` via beads adapter returns updated epic with new milestone
  - Delegation to FileAdapter is confirmed (epic appears in tasks.md)

### Task 4: Add milestone filtering to list/listEpics path
- **Files:** `lib/issues/file-adapter.mjs` (modify)
- **Tests:** `tests/lib/issues-file-adapter.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  1. The FileAdapter currently has no `listEpics()` method — epic listing is done via `_read().epics`. If a public `listEpics(filters)` method does not exist, add one that reads epics and applies optional filters including `milestone`.
  2. If epic listing is handled through the existing `list()` path or externally, add milestone filtering to the appropriate location.
  3. Ensure `IssueManagerInterface` documents the milestone filter capability.

  **Test cases:**
  - Create 3 epics: 2 with milestone "v1", 1 with milestone "v2" — filter by milestone "v1" returns 2
  - Filter by milestone "v2" returns 1
  - Filter by milestone "v3" returns 0 (empty array)
  - No milestone filter returns all epics

### Task 5: Integration tests for full milestone lifecycle
- **Files:** `tests/lib/issues-milestone.test.mjs` (create)
- **Tests:** N/A (this task is the test)
- **TDD:** RED — write comprehensive integration tests
- **Description:**
  1. Full lifecycle test: create epic with milestone, list, update milestone, verify persistence.
  2. Backward compatibility integration test: write an old-format tasks.md, init adapter, read epics, create new epic with milestone, verify old epics have `milestone: undefined` and new epic has the value.
  3. Cross-adapter test: create epic with milestone via FileAdapter, read back and verify; repeat conceptually for BeadsAdapter delegation.

  **Test cases:**
  - Create epic with milestone "v1", update to "v2", read back shows "v2"
  - Old-format file parsed correctly with milestone undefined on all epics
  - New epic added to old-format file causes re-serialization with Milestone column
  - validateEpic round-trips milestone through create and read

## File Structure

**Create:**
- `tests/lib/issues-milestone.test.mjs` — Integration tests for milestone lifecycle

**Modify:**
- `lib/issues/interface.mjs` — Epic typedef, IssueFilter typedef, validateEpic function
- `lib/issues/file-adapter.mjs` — EPIC_HEADER, EPIC_SEPARATOR, serializeEpicRow, parseEpicRow, listEpics filtering
- `lib/issues/beads-adapter.mjs` — Verify delegation passes milestone through (may need no code changes)
- `tests/lib/issues-interface.test.mjs` — validateEpic milestone tests
- `tests/lib/issues-file-adapter.test.mjs` — File adapter milestone tests

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/issue-model-milestone.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/issue-model-milestone.review.md` — Review (PASS, no findings)
- `tests/helpers.mjs` — Test helper utilities

## Context Packets

### Task 1 Context
- `lib/issues/interface.mjs` lines 26-34 (Epic typedef), lines 36-42 (IssueFilter typedef), lines 173-189 (validateEpic)
- Spec: Behaviors 7-8, Error Cases (coercion)

### Task 2 Context
- `lib/issues/file-adapter.mjs` lines 21-22 (EPIC_HEADER/SEPARATOR), lines 39-48 (serializeEpicRow), lines 67-76 (parseEpicRow), lines 131-134 (_read epic cell count check)
- Spec: Behaviors 1-2, 5-6, Error Cases (old-format 6 columns)

### Task 3 Context
- `lib/issues/beads-adapter.mjs` lines 188-200 (createEpic/updateEpic delegation to FileAdapter)
- Spec: Postconditions ("Both file and beads adapters support the milestone field identically")

### Task 4 Context
- `lib/issues/file-adapter.mjs` lines 247-259 (list method with filters)
- Spec: Behavior 4 (milestone filter)

### Task 5 Context
- All modified files from Tasks 1-4
- `tests/lib/issues-file-adapter.test.mjs` — existing test patterns for setup/teardown

## Parallelization

- Task 1 and Task 2: Can run in parallel (different files)
- Task 3: After Task 2 (depends on FileAdapter milestone support)
- Task 4: After Task 2 (extends FileAdapter)
- Task 5: After Tasks 1-4 (integration tests validate all changes together)

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `milestone` field round-trips through `createEpic` / `list` / `updateEpic` on file adapter
  - [ ] `milestone` field round-trips through `createEpic` / `list` / `updateEpic` on beads adapter
  - [ ] Existing tasks.md without Milestone column parses without error
  - [ ] After re-serialization, tasks.md includes the Milestone column
  - [ ] `validateEpic()` accepts and returns milestone field
  - [ ] Filtering epics by milestone returns correct results
  - [ ] All quality gates pass (tests, lint, typecheck)
  - [ ] No constitutional violations introduced
