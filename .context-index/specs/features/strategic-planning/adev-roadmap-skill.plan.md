# Plan: adev:roadmap Skill

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev:roadmap-skill.spec.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS_WITH_NOTES

## Overview

Create the `/adev:roadmap` skill as a markdown-based SKILL.md that analyzes product milestones, feature charters, and spec dependencies to produce a structured roadmap document with dependency graphs, topologically sorted implementation order, risk assessment, and parallelization opportunities. The roadmap is saved to `.context-index/specs/roadmap/`. No companion code is needed — this is purely markdown instructions.

## Tasks

### Task 1: Create SKILL.md with dependency analysis, critical path, and risk assessment
- **Files:** `skills/roadmap/SKILL.md` (create)
- **Tests:** `tests/skills/roadmap.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Create the full skill definition with all analysis capabilities.

  1. Add YAML frontmatter with `name: adev:roadmap`, `description`, `arguments` list.
  2. Define Arguments section:
     - No required arguments (default: full roadmap across all milestones)
     - `--milestone <name>` — produce roadmap for a single milestone
     - `--all` — explicit flag for full roadmap (same as no arguments)
  3. Define Process section with numbered steps:
     - Step 1: Validate preconditions (`.context-index/` exists, `product.md` has Milestones section)
     - Step 2: Load context — read `product.md` milestones, all feature charters (`Glob("**/charter.md")`), all specs
     - Step 3: If `--milestone`, filter to the specified milestone; if milestone not found, print available milestones and ask user to choose
     - Step 4: Build dependency graph — read each charter's Dependencies table and each spec's Preconditions to identify cross-feature dependencies
     - Step 5: Detect circular dependencies — if found, report the cycle and ask user to resolve before proceeding
     - Step 6: Determine critical path — the longest chain of dependent features constraining overall timeline
     - Step 7: Topological sort — produce implementation order respecting all dependencies
     - Step 8: Risk assessment — assign high/medium/low risk per feature based on: dependency count, spec completeness, complexity signals from charter
     - Step 9: Identify parallelization opportunities — features with no mutual dependencies that can be worked on simultaneously
     - Step 10: Flag charters without specs as "specs needed" and suggest `/adev:specify`
     - Step 11: Write roadmap document to `.context-index/specs/roadmap/<milestone-slug>.md` (or `full-roadmap.md` for `--all`/default)
     - Step 12: Update epics with milestone assignments if any are missing (guard: check `tasks.backend` in manifest)
     - Step 13: Report summary — feature count, critical path length, risk distribution, parallelization groups
  4. Define Output Format section describing the roadmap document structure:
     - YAML frontmatter: milestone(s), date, feature count
     - Per-milestone section with: feature list (with charter references), dependency graph (text-based DAG using indentation or arrow notation), implementation order (numbered list), risk assessment table, parallelization groups
  5. Define Key Principles section:
     - Cross-feature dependencies stored in roadmap document (not via `addDependency()` which operates on issues not epics)
     - Read-only analysis of charters and specs — no mutation of existing data except roadmap output and epic updates
     - Graceful handling when no charters exist (minimal roadmap with milestone structure only)

  **Test cases:**
  - `skills/roadmap/SKILL.md` exists
  - SKILL.md contains `name: adev:roadmap` in frontmatter
  - SKILL.md contains `--milestone` flag
  - SKILL.md contains `--all` flag
  - SKILL.md contains dependency graph instructions
  - SKILL.md contains "critical path" analysis
  - SKILL.md contains "topological" sort or implementation order
  - SKILL.md contains risk assessment (high/medium/low)
  - SKILL.md contains parallelization instructions
  - SKILL.md contains circular dependency detection
  - SKILL.md references `.context-index/specs/roadmap/` as output directory
  - SKILL.md contains "specs needed" flagging for charters without specs
  - SKILL.md references `product.md` milestones as input

### Task 2: Define roadmap output format and create directory convention
- **Files:** `skills/roadmap/SKILL.md` (modify — ensure output format section is complete)
- **Tests:** `tests/skills/roadmap.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Finalize the roadmap output format within SKILL.md and document the directory convention. Address review note SA-2 about context routing.

  1. Ensure the Output Format section in SKILL.md specifies the complete roadmap document structure including:
     - YAML frontmatter with `milestones`, `generated`, `feature-count` fields
     - `## Dependency Graph` section with text-based DAG (arrow notation: `feature-a -> feature-b`)
     - `## Implementation Order` section with topologically sorted numbered list
     - `## Risk Assessment` section with table: Feature | Risk Level | Factors
     - `## Parallelization Groups` section with grouped feature lists
     - `## Specs Needed` section listing charters without specs
  2. Document that `.context-index/specs/roadmap/` is the canonical output directory.
  3. Document naming convention: `<milestone-slug>.md` for single-milestone roadmaps, `full-roadmap.md` for all-milestones roadmaps.

  **Test cases:**
  - SKILL.md contains dependency graph format (arrow notation or DAG description)
  - SKILL.md contains risk assessment table format
  - SKILL.md contains `full-roadmap.md` naming convention
  - SKILL.md contains YAML frontmatter specification for roadmap output

## File Structure

**Create:**
- `skills/roadmap/SKILL.md` — Skill definition with dependency analysis, critical path, risk assessment
- `tests/skills/roadmap.test.mjs` — Tests verifying skill content and structure

**Modify:**
- None

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev:roadmap-skill.spec.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev:roadmap-skill.review.md` — Review notes (SA-1, SA-2)
- `.context-index/specs/features/strategic-planning/adev:vision-skill.spec.md` — Vision spec (defines Milestones section that roadmap reads)
- `skills/assess/SKILL.md` — Pattern reference for skill file structure
- `tests/skills/assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: All Behaviors (1-10), Error Cases, Postconditions
- Review: SA-1 (dependency data in roadmap doc, not issue model), SA-2 (context routing)
- `skills/assess/SKILL.md` — Structural pattern for skill frontmatter and process sections
- Vision spec: Milestones section format (input to roadmap)

### Task 2 Context
- Spec: Behaviors 6-7 (roadmap output structure, per-milestone sections)
- Spec: Postconditions (roadmap document at `.context-index/specs/roadmap/`)
- Review: SA-2 (context routing for roadmap directory)

## Parallelization

- Task 1 and Task 2: Sequential — both modify the same file (`SKILL.md`), and Task 1 creates the file that Task 2 refines

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - Reads product.md milestones and all feature charters
  - Builds cross-feature dependency graph from charter Dependencies tables
  - Determines critical path through dependency chain
  - Produces topologically sorted implementation order
  - Includes risk assessment per feature
  - Identifies parallelization opportunities
  - Flags charters without specs as "specs needed"
  - Saves roadmap to `.context-index/specs/roadmap/`
  - Updates epic dependencies on issue board
  - Detects and reports circular dependencies
  - `--milestone` mode works for single milestone
  - All quality gates pass (tests, lint, typecheck)
  - No constitutional violations introduced
