# Plan: adev-research Skill

## Spec Reference
- Spec: `.context-index/specs/features/strategic-planning/adev-research-skill.md`
- Charter: `.context-index/specs/features/strategic-planning/charter.md`
- Review: PASS_WITH_NOTES

## Overview

Create the `/adev-research` skill as a markdown-based SKILL.md with a companion research output template. The skill enables structured research with internal codebase search, web search, and GitHub code search as sources, producing organized research artifacts at `.context-index/research/<slug>.md`. No companion code is needed — this is purely markdown instructions and a template.

## Tasks

### Task 1: Create research output template
- **Files:** `templates/research-template.md` (create)
- **Tests:** `tests/skills/adev-research.test.mjs` (create)
- **TDD:** RED — write test first, then implement
- **Description:**
  Create the research artifact template that the skill will use when generating output. The template provides the standard structure for all research artifacts.

  1. Create `templates/research-template.md` with YAML frontmatter placeholders: `topic`, `date`, `relates-to`, `sources`, `status` (draft/final).
  2. Include section headings: Summary, Findings (with subsections per source type: Internal, Web, GitHub), Code Examples, Recommendations, References.
  3. Include inline comments explaining what goes in each section.
  4. Address review note SA-1: document slug convention (lowercase, hyphenated, max 50 characters) in a comment at the top.

  **Test cases:**
  - `templates/research-template.md` exists
  - Template contains YAML frontmatter delimiters (`---`)
  - Template contains required frontmatter fields: `topic`, `date`, `sources`, `status`
  - Template contains all required sections: Summary, Findings, Code Examples, Recommendations, References

### Task 2: Create SKILL.md with full skill definition
- **Files:** `skills/adev-research/SKILL.md` (create)
- **Tests:** `tests/skills/adev-research.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Create the skill definition file with all arguments, process steps, and key principles.

  1. Add YAML frontmatter with `name: adev-research`, `description`, `arguments` list.
  2. Define Arguments section with all flags:
     - `<topic>` (required) — free-text research topic
     - `--web` — use web search as a source
     - `--github <owner/repo>` — use GitHub code search (validate owner/repo pattern per SEC-1)
     - `--internal` — search local codebase
     - `--compare` — organize findings as comparison matrix
     - `--issue <id>` — link research to an issue
  3. Document default source behavior per SA-2: when no source flags are specified, use web + internal; GitHub is only used when `--github` is explicitly provided.
  4. Define Process section with numbered steps:
     - Step 1: Validate preconditions (`.context-index/` exists)
     - Step 2: Generate slug from topic (lowercase, hyphenated, max 50 chars per SA-1)
     - Step 3: Check for existing artifact, prompt if collision
     - Step 4: Create `.context-index/research/` directory if missing
     - Step 5: Gather sources — internal (Glob/Grep/Read), web (WebSearch with graceful fallback), GitHub (MCP tools with graceful fallback)
     - Step 6: Organize findings — standard or comparison matrix if `--compare`
     - Step 7: Write artifact using template structure
     - Step 8: If `--issue`, link to issue and update notes
     - Step 9: Report summary of findings and artifact path
  5. Define Key Principles section emphasizing graceful degradation when tools are unavailable.
  6. Define Output section describing the artifact structure and referencing the template.

  **Test cases:**
  - `skills/adev-research/SKILL.md` exists
  - SKILL.md contains `name: adev-research` in frontmatter
  - SKILL.md contains all argument flags: `--web`, `--github`, `--internal`, `--compare`, `--issue`
  - SKILL.md contains graceful degradation instructions for unavailable tools
  - SKILL.md references `templates/research-template.md`
  - SKILL.md contains `.context-index/research/` as output directory
  - SKILL.md contains slug generation convention (lowercase, hyphenated)

### Task 3: Update context routing in constitution
- **Files:** `.context-index/constitution.md` (modify)
- **Tests:** `tests/skills/adev-research.test.mjs` (modify)
- **TDD:** RED — write test first, then implement
- **Description:**
  Add the `.context-index/research/` directory to the Context Routing table in the constitution so that Claude and other skills can discover research artifacts. Address review note CON-1.

  1. Add a row to the Context Routing table: `| Research artifacts | .context-index/research/ |`
  2. Verify the row is placed alphabetically or logically within the table.

  **Test cases:**
  - `constitution.md` contains `research` in the Context Routing table
  - `constitution.md` contains `.context-index/research/` path

## File Structure

**Create:**
- `skills/adev-research/SKILL.md` — Skill definition with arguments, process, principles
- `templates/research-template.md` — Research artifact output template
- `tests/skills/adev-research.test.mjs` — Tests verifying skill and template content

**Modify:**
- `.context-index/constitution.md` — Add research directory to Context Routing table

**Reference (read, do not modify):**
- `.context-index/specs/features/strategic-planning/adev-research-skill.md` — Behavioral contract
- `.context-index/specs/features/strategic-planning/adev-research-skill.review.md` — Review notes (SA-1, SA-2, SEC-1, CON-1)
- `skills/adev-assess/SKILL.md` — Pattern reference for skill file structure
- `tests/skills/adev-assess.test.mjs` — Test pattern reference for SKILL.md tests

## Context Packets

### Task 1 Context
- Spec: Postconditions (artifact structure: frontmatter fields, sections)
- Review: SA-1 (slug generation convention)

### Task 2 Context
- Spec: All Behaviors (1-9), Error Cases, Postconditions
- Review: SA-1 (slug convention), SA-2 (default source behavior), SEC-1 (github repo validation)
- `skills/adev-assess/SKILL.md` — Structural pattern for skill frontmatter and sections

### Task 3 Context
- Review: CON-1 (context routing update)
- `.context-index/constitution.md` — Current Context Routing table

## Parallelization

- Task 1 and Task 2: Can run in parallel (different files)
- Task 3: After Task 2 (constitution update references the skill's output directory)

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] Produces `.context-index/research/<slug>.md` with correct YAML frontmatter
  - [ ] Web search source works when WebSearch is available
  - [ ] Gracefully degrades when WebSearch is unavailable (warning, not error)
  - [ ] GitHub source works when MCP tools are available
  - [ ] Gracefully degrades when GitHub MCP is unavailable
  - [ ] Internal codebase search works via Glob/Grep/Read
  - [ ] `--compare` mode produces a comparison matrix
  - [ ] `--issue <id>` links research to issue and updates issue notes
  - [ ] Existing research artifacts are not silently overwritten
  - [ ] Research directory is auto-created if missing
  - [ ] All quality gates pass (tests, lint, typecheck)
  - [ ] No constitutional violations introduced
