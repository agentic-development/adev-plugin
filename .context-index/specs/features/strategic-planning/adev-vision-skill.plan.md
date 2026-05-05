# Plan: adev:vision Skill

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev:vision-skill.spec.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS_WITH_NOTES

## Overview

Create the `/adev:vision` skill as a markdown-based SKILL.md that guides product vision definition and milestone planning through an interactive interview pattern. The skill reads the constitution, product.md, and existing charters, then helps the user define milestones that are written to a structured `## Milestones` section in `product.md` and synced as epics on the issue board. No companion code is needed — this is purely markdown instructions.

## Tasks

### Task 1: Define Milestones section format for product.md
- **Files:** `skills/vision/SKILL.md` (create — partial, Milestones format definition only)
- **Tests:** `tests/skills/vision.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Define and document the canonical markdown format for the `## Milestones` section in `product.md`. This format is referenced by the skill and other downstream consumers (roadmap, status).

  1. The `## Milestones` section is delimited by the `## Milestones` heading and extends to the next `##` heading or EOF.
  2. Each milestone is a `### <Milestone Name>` subheading with the following fields:
     - **Status:** planned | active | completed
     - **Target:** optional date or timeframe
     - **Features:** bulleted list of feature names (matching charter names where applicable)
  3. Milestones are listed in priority order (highest priority first).
  4. Document this format in the SKILL.md Output section so Claude knows exactly what to write.

  **Test cases:**
  - `skills/vision/SKILL.md` exists
  - SKILL.md contains `## Milestones` format description
  - SKILL.md contains milestone status values: `planned`, `active`, `completed`
  - SKILL.md contains `### ` as the milestone subheading pattern

### Task 2: Create full SKILL.md with interview pattern and all steps
- **Files:** `skills/vision/SKILL.md` (modify — complete the file)
- **Tests:** `tests/skills/vision.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Complete the skill definition with the interactive interview pattern, context loading, milestone writing, and epic creation logic.

  1. Add YAML frontmatter with `name: adev:vision`, `description`, `arguments` list.
  2. Define Arguments section:
     - No required arguments (default: full interview mode)
     - `--refresh` — skip interview, review and update existing milestones
     - `--milestone <name>` — focus on a single milestone
  3. Define Process section with numbered steps:
     - Step 1: Validate preconditions (`.context-index/` exists)
     - Step 2: Load context — read constitution (Identity section), `product.md` (if exists), all feature charters via `Glob("**/**/charter.md")`
     - Step 3: If `product.md` is missing, bootstrap a minimal one from the constitution Identity section
     - Step 4: If `--refresh`, skip to Step 7
     - Step 5: Interview mode — ask ONE question at a time about: business objectives, target audience, success metrics, feature priorities, timeline. Wait for user response before proceeding
     - Step 6: Synthesize interview responses into proposed milestones
     - Step 7: If `--refresh`, review current milestones against latest charters, propose additions/removals/reorderings
     - Step 8: Present proposed milestones to user for approval
     - Step 9: On approval, write `## Milestones` section to `product.md` (replace in-place if exists, append if not; preserve all other sections)
     - Step 10: Sync epics — for each milestone, create or update an epic with the `milestone` field set to the milestone name (match by milestone field per SA-1, not title)
     - Step 11: If vision implies new architectural constraints, propose as clearly labeled amendments with warning per Architecture Boundaries
     - Step 12: If vision references charters that don't exist, list as "Charters to Create" and suggest `/adev:brainstorm`
  4. Define Key Principles section:
     - One question at a time in interview mode
     - Epic matching by milestone field (not title) per review SA-1
     - Constitution amendments are proposed, never applied directly
     - Idempotent: re-running updates rather than duplicates
  5. Note hard dependency on `issue-model-milestone` spec per review SA-2: the milestone field on epics must be implemented first.

  **Test cases:**
  - SKILL.md contains `name: adev:vision` in frontmatter
  - SKILL.md contains `--refresh` flag
  - SKILL.md contains `--milestone` flag
  - SKILL.md contains interview pattern instruction ("one question at a time" or equivalent)
  - SKILL.md references `product.md`
  - SKILL.md contains epic creation/update instructions with milestone field
  - SKILL.md contains constitution amendment warning language
  - SKILL.md contains "Charters to Create" guidance
  - SKILL.md references `createEpic` or `updateEpic` for issue board integration
  - SKILL.md mentions matching epics by milestone field (not title)

## File Structure

**Create:**
- `skills/vision/SKILL.md` — Skill definition with interview pattern, milestone writing, epic sync
- `tests/skills/vision.test.mjs` — Tests verifying skill content and structure

**Modify:**
- None

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev:vision-skill.spec.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev:vision-skill.review.md` — Review notes (SA-1, SA-2, SEC-1, CON-1)
- `.context-index/constitution.md` — Identity section (used for product.md bootstrap)
- `skills/assess/SKILL.md` — Pattern reference for skill file structure
- `tests/skills/assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: Behaviors 2-3, Postconditions (milestone structure: name, target date, status, feature list)
- Spec: Behavior 3 (delimited by `## Milestones` heading to next `##` or EOF)

### Task 2 Context
- Spec: All Behaviors (1-9), Error Cases, Postconditions
- Review: SA-1 (match epics by milestone field), SA-2 (hard dependency on issue-model-milestone)
- `skills/assess/SKILL.md` — Structural pattern for skill frontmatter and process sections
- `.context-index/constitution.md` — Identity section for bootstrap content

## Parallelization

- Task 1 and Task 2: Sequential — both modify the same file (`SKILL.md`), and Task 1 defines the output format that Task 2's process section references

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] Interview pattern asks one question at a time
  - [ ] Reads constitution, product.md, and all existing charters before proposing
  - [ ] Writes Milestones section to product.md with correct structure
  - [ ] Creates epics with milestone field on issue board
  - [ ] Does not duplicate epics on re-run (idempotent)
  - [ ] `--refresh` mode updates existing milestones without full interview
  - [ ] `--milestone <name>` focuses on single milestone
  - [ ] Constitution amendments are proposed, not applied directly
  - [ ] Missing charters are identified and suggested for brainstorm
  - [ ] All quality gates pass (tests, lint, typecheck)
  - [ ] No constitutional violations introduced
