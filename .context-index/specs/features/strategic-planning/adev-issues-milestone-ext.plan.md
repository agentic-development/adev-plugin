# Plan: adev:issues Milestone Extension

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev:issues-milestone-ext.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS_WITH_NOTES

## Overview

Extend the existing `skills/issues/SKILL.md` to support milestone-based workflows. This adds `--milestone` as an argument to the `epic`, `list`, and `update` subcommands, and introduces milestone-based grouping in the board display when milestones are present on epics. All changes are markdown-only — no companion code is needed.

## Tasks

### Task 1: Add `--milestone` to Arguments section for epic, list, and update
- **Files:** `skills/issues/SKILL.md` (modify)
- **Tests:** `tests/skills/issues-milestone.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Update the Arguments section of SKILL.md to include `--milestone <name>` as an optional flag on three subcommands:
  1. Add `--milestone <name>` to the `epic` command signature: `epic "<title>" [--milestone <name>]`
  2. Add `--milestone <name>` to the `list` command signature: `list [--status <status>] [--epic <epic-id>] [--milestone <name>]`
  3. Add `--milestone <name>` to the `update` command signature: `update <id> [--status <status>] [--milestone <name>]`
  4. Clarify per review note CON-1 that `--status` and `--milestone` can be combined on `update` (both fields are updated in a single call)

  **Test cases:**
  - SKILL.md contains `--milestone` in the epic command line
  - SKILL.md contains `--milestone` in the list command line
  - SKILL.md contains `--milestone` in the update command line
  - SKILL.md contains at least 3 occurrences of `--milestone`

### Task 2: Update Board Display section with milestone grouping logic
- **Files:** `skills/issues/SKILL.md` (modify)
- **Tests:** `tests/skills/issues-milestone.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Extend the Board Display subsection to describe milestone-aware grouping behavior:
  1. Add a paragraph explaining that when any epic has a `milestone` field set, the board groups epics by milestone name, with a heading per milestone
  2. Add a "No Milestone" group for epics without a milestone assignment
  3. Specify that within each milestone group, the existing epic/status grouping applies
  4. Specify that when no epics have milestones, the display is unchanged (backward compatible)
  5. Add an example showing the milestone-grouped board format

  **Test cases:**
  - SKILL.md contains "No Milestone" group description
  - SKILL.md contains "milestone" in the Board Display section
  - SKILL.md describes backward-compatible behavior when no milestones exist

### Task 3: Update Create Epic section with milestone parameter
- **Files:** `skills/issues/SKILL.md` (modify)
- **Tests:** `tests/skills/issues-milestone.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Update the Create Epic subsection to document the optional `milestone` parameter:
  1. Note that `createEpic()` now accepts an optional `milestone` field
  2. When `--milestone <name>` is provided, set the `milestone` field on the epic
  3. When `--milestone` is omitted, the epic is created without a milestone (backward compatible)
  4. Update the report line to include milestone when present: `Created <id>: <title> (milestone: <name>)`

  **Test cases:**
  - SKILL.md mentions milestone in the Create Epic section
  - SKILL.md describes backward-compatible epic creation without milestone

## File Structure

**Create:**
- `tests/skills/issues-milestone.test.mjs` — Tests verifying SKILL.md milestone content

**Modify:**
- `skills/issues/SKILL.md` — Add milestone support to arguments, board display, and epic creation

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev:issues-milestone-ext.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev:issues-milestone-ext.review.md` — Review notes (CON-1 re: flag interaction)
- `lib/issues/registry.mjs` — Issue model API reference
- `tests/skills/assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: `adev:issues-milestone-ext.md` (Behaviors 1-4, Acceptance Criteria)
- Review: `adev:issues-milestone-ext.review.md` (CON-1 — flag interaction clarification)
- SKILL.md: Arguments section (current command signatures)

### Task 2 Context
- Spec: `adev:issues-milestone-ext.md` (Behaviors 5-6, Board Display)
- SKILL.md: Board Display section (current format and example)

### Task 3 Context
- Spec: `adev:issues-milestone-ext.md` (Behaviors 1-2, Create Epic)
- SKILL.md: Create Epic section (current createEpic documentation)

## Parallelization

- Task 1, Task 2, Task 3: Sequential — all modify the same file (`SKILL.md`), and Task 1 establishes the argument syntax that Tasks 2 and 3 reference
- Test file creation in Task 1, then extended in Tasks 2 and 3

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `epic` command accepts `--milestone <name>`
  - [ ] `list` command accepts `--milestone <name>` filter
  - [ ] `update` command accepts `--milestone <name>` for epics
  - [ ] Board display groups by milestone when milestones exist
  - [ ] Board display is unchanged when no milestones exist
  - [ ] No constitutional violations introduced
