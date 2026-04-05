# Plan: adev-status Milestone Extension

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev-status-milestone-ext.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS

## Overview

Extend the existing `skills/adev-status/SKILL.md` to add milestone progress views. This adds a `--milestone <name>` argument for a detailed single-milestone view, and augments the `--all` dashboard mode with a "Milestone Progress" aggregation section when milestones exist on epics. All changes are markdown-only — no companion code is needed.

## Tasks

### Task 1: Add `--milestone` argument to Arguments section
- **Files:** `skills/adev-status/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-status-milestone.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Update the Arguments section of SKILL.md to include the new `--milestone` flag:
  1. Add `--milestone <name>`: Show detailed status for a single milestone
  2. Place it after the existing `--charter` argument for logical ordering
  3. Note that `--milestone` is mutually exclusive with `--spec` and `--charter`

  **Test cases:**
  - SKILL.md contains `--milestone <name>` in the Arguments section
  - SKILL.md contains `--milestone` at least twice (argument definition and process section)

### Task 2: Add Milestone Progress section to `--all` mode
- **Files:** `skills/adev-status/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-status-milestone.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Extend the `--all` mode Process section to include milestone progress reporting:
  1. Add a new step after scanning charters and specs: scan all epics for `milestone` fields
  2. If any epics have milestones, add a "Milestone Progress" report section showing per-milestone aggregation: total epics, total issues, open/in_progress/closed counts, percentage complete
  3. If no epics have milestones, skip the section entirely (unchanged behavior)
  4. Add the Milestone Progress block to the `--all` output format example
  5. Note that if `tasks.backend` is not configured, skip milestone progress silently

  **Test cases:**
  - SKILL.md contains "Milestone Progress" section heading or label
  - SKILL.md describes per-milestone aggregation with open/in_progress/closed counts
  - SKILL.md describes skipping milestone section when no milestones exist
  - SKILL.md describes skipping milestone section when tasks.backend is not configured

### Task 3: Add single-milestone detailed view
- **Files:** `skills/adev-status/SKILL.md` (modify)
- **Tests:** `tests/skills/adev-status-milestone.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add a new Process subsection for `--milestone <name>` mode:
  1. Define the heading: `### Mode: --milestone <name>`
  2. Step 1: Query the issue board for all epics with `milestone` matching `<name>`
  3. Step 2: For each matching epic, list all child issues with their statuses
  4. Step 3: For each epic, find related specs (by matching charter or plan references) and report their statuses (draft/review-passed/implemented/validated)
  5. Step 4: Compute aggregate progress: total issues, issues by status, percentage complete
  6. Step 5: Display the milestone name, associated epics, issue breakdown, and spec statuses
  7. Define error case: if no epics match, print "No epics found for milestone '<name>'. Available milestones: ..." and list known milestones
  8. Add output format example showing the detailed milestone view

  **Test cases:**
  - SKILL.md contains `### Mode: --milestone` section
  - SKILL.md describes listing associated epics and their issues
  - SKILL.md describes spec status reporting within milestone view
  - SKILL.md describes error message with available milestones when no match found

## File Structure

**Create:**
- `tests/skills/adev-status-milestone.test.mjs` — Tests verifying SKILL.md milestone content

**Modify:**
- `skills/adev-status/SKILL.md` — Add milestone argument, milestone progress in --all, and single-milestone view

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev-status-milestone-ext.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev-status-milestone-ext.review.md` — Review (clean PASS)
- `lib/issues/registry.mjs` — Issue model API reference for querying epics
- `tests/skills/adev-assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: `adev-status-milestone-ext.md` (Behaviors 1-4, Arguments)
- SKILL.md: Arguments section (current flags)

### Task 2 Context
- Spec: `adev-status-milestone-ext.md` (Behaviors 1-2, Postconditions)
- SKILL.md: Mode `--all` section (current report sections and output format)

### Task 3 Context
- Spec: `adev-status-milestone-ext.md` (Behaviors 3-4, Error Cases)
- SKILL.md: Mode `--charter` section (pattern reference for single-entity detailed view)

## Parallelization

- Task 1: Can run first (independent — adds argument definition)
- Task 2, Task 3: Sequential after Task 1 — both reference the argument added in Task 1, and both modify the same file
- Task 2 and Task 3 are independent of each other but sequential due to shared file

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `--all` mode shows Milestone Progress section when milestones exist
  - [ ] `--all` mode is unchanged when no milestones exist
  - [ ] `--milestone <name>` shows detailed single-milestone view
  - [ ] Missing milestone shows available milestones
  - [ ] Gracefully handles unconfigured tasks.backend
  - [ ] No constitutional violations introduced
