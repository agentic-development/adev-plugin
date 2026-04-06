# Plan: adev:start Intake Extension

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev:start-intake-ext.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS_WITH_NOTES

## Overview

Extend the existing `skills/start/SKILL.md` to add an `--intake` mode for triaging incoming work requests into classified issues on the issue board. This adds `--intake` as a new argument with optional `--file` sub-flag for batch processing, a classification table for categorizing requests, and processing steps that match requests to existing epics and milestones. All changes are markdown-only — no companion code is needed.

## Tasks

### Task 1: Add `--intake` argument and classification table
- **Files:** `skills/start/SKILL.md` (modify)
- **Tests:** `tests/skills/start-intake.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Update the Arguments section and add intake classification logic to SKILL.md:
  1. Add `--intake [<description>]` to the Arguments section: intake mode for triaging incoming requests into issues
  2. Add `--intake --file <path>` variant for batch processing from a file
  3. Add an Intake Classification Table mapping signal keywords to work types (bug/feature/task) and priority estimates:
     - Bug signals: "bug", "broken", "crash", "error", "regression" — default priority 1
     - Feature signals: "feature", "add", "new", "enhance", "support" — default priority 2
     - Task signals: "task", "chore", "update", "migrate", "refactor" — default priority 3
  4. Per review note SA-1, specify that epic matching uses: first exact match on epic title substring, then charter scope keyword matching, then milestone feature list matching — first match wins
  5. Per review note SEC-1, specify that `--file` input must be UTF-8 text and is limited to 100KB to prevent reading binary or oversized files

  **Test cases:**
  - SKILL.md contains `--intake` in the Arguments section
  - SKILL.md contains `--file` flag documentation
  - SKILL.md contains an intake classification table with bug/feature/task types
  - SKILL.md contains epic matching algorithm description
  - SKILL.md contains file size validation (100KB limit)

### Task 2: Add intake processing steps
- **Files:** `skills/start/SKILL.md` (modify)
- **Tests:** `tests/skills/start-intake.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add a new process section for intake mode after the existing Step 5:
  1. Define heading: `## Step 6: Intake Mode` (branches from Step 2 when `--intake` is detected)
  2. Step 6.1: Check prerequisites — `.context-index/` exists and `tasks.backend` is configured; if not, print error and stop
  3. Step 6.2: If description is provided as argument, process single request; otherwise prompt user interactively
  4. Step 6.3: For each request, classify work type using the classification table from Task 1
  5. Step 6.4: Estimate priority based on keywords and context (use classification table defaults, adjust based on urgency signals like "urgent", "critical", "blocker")
  6. Step 6.5: Match to existing epic by searching epics and charters; if no match found, propose creating a new epic or filing under "Unassigned"
  7. Step 6.6: Present proposed issue with all fields filled (title, type, priority, epic) and ask for confirmation
  8. Step 6.7: On confirmation, create the issue via the configured adapter
  9. Report: "Created `<id>`: <title> (type: <type>, priority: <N>, epic: <epic-id or Unassigned>)"

  **Test cases:**
  - SKILL.md contains "Intake Mode" section
  - SKILL.md contains prerequisite check for `tasks.backend`
  - SKILL.md describes single-request interactive processing
  - SKILL.md describes epic matching and "Unassigned" fallback
  - SKILL.md describes user confirmation before issue creation

### Task 3: Add batch file mode
- **Files:** `skills/start/SKILL.md` (modify)
- **Tests:** `tests/skills/start-intake.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Extend the intake processing section to support batch file processing:
  1. Add sub-step for `--file <path>`: read the file, split into individual requests (separated by blank lines or one per line)
  2. Per review note SA-2, specify that the file format is plain text (UTF-8), one request per line or separated by blank lines; empty lines are treated as separators
  3. Process each request through the same classification and matching pipeline
  4. After processing all requests, present a summary table showing all proposed issues:
     ```
     | # | Title | Type | Priority | Epic | Milestone |
     |---|-------|------|----------|------|-----------|
     | 1 | Fix login crash | bug | 1 | epic-3 | v1 |
     | 2 | Add dark mode | feature | 2 | Unassigned | — |
     ```
  5. Ask for user confirmation: "Create all N issues? (yes / edit / cancel)"
  6. On "yes", create all issues and report summary: "Created N issues on issue board."
  7. On "edit", allow the user to modify individual entries before creation
  8. On "cancel", abort without creating any issues
  9. Define error case: if file not found, print "File not found: <path>" and stop

  **Test cases:**
  - SKILL.md contains `--file` processing description
  - SKILL.md contains summary table format for batch results
  - SKILL.md contains user confirmation prompt (yes/edit/cancel)
  - SKILL.md contains file-not-found error handling
  - SKILL.md describes plain text UTF-8 file format

## File Structure

**Create:**
- `tests/skills/start-intake.test.mjs` — Tests verifying SKILL.md intake content

**Modify:**
- `skills/start/SKILL.md` — Add --intake argument, classification table, processing steps, and batch file mode

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev:start-intake-ext.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev:start-intake-ext.review.md` — Review notes (SA-1, SA-2, SEC-1, CON-1)
- `skills/issues/SKILL.md` — Issue creation patterns (create, createEpic)
- `lib/issues/registry.mjs` — Issue model API reference
- `tests/skills/assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: `adev:start-intake-ext.md` (Behaviors 1-2, 4-5)
- Review: `adev:start-intake-ext.review.md` (SA-1 — epic matching, SA-2 — file format, SEC-1 — file validation)
- SKILL.md: Arguments section (current flags), Step 2 classification table (pattern reference)

### Task 2 Context
- Spec: `adev:start-intake-ext.md` (Behaviors 1-2, 4-5, 7, Error Cases)
- SKILL.md: Step 2 (classification), Step 4 (routing — pattern for proposing and confirming)
- `skills/issues/SKILL.md`: Create Issue section (adapter call pattern)

### Task 3 Context
- Spec: `adev:start-intake-ext.md` (Behaviors 3, 6, Error Cases)
- Review: `adev:start-intake-ext.review.md` (SA-2 — file format pinning)
- SKILL.md: Intake processing steps from Task 2 (extends the same section)

## Parallelization

- Task 1: Runs first — establishes the argument definition and classification table
- Task 2: Sequential after Task 1 — references the classification table and argument syntax
- Task 3: Sequential after Task 2 — extends the intake processing section with batch file support

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `--intake` mode processes a single request interactively
  - [ ] `--intake "<description>"` processes a single request from argument
  - [ ] `--intake --file <path>` batch-processes multiple requests
  - [ ] Each request is classified by type (bug/feature/task)
  - [ ] Each request is assigned a priority estimate
  - [ ] Requests are matched to existing epics by charter scope
  - [ ] Unmatched requests are flagged for new epic creation or "Unassigned"
  - [ ] Summary table shown before creating issues
  - [ ] User confirmation required before batch creation
  - [ ] No constitutional violations introduced
