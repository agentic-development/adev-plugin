---
name: adev:brainstorm
description: "Explore a feature idea interactively and produce a Feature Charter. Validates against constitution and existing charters. Use before building any new feature or module, when the user mentions a new capability, or says 'let us build X'."
allowed-tools: [Read, Glob, Grep, Write, Agent]
---

# Brainstorm a Feature Charter

Turn a feature idea into a structured Feature Charter through collaborative dialogue. The charter defines WHAT a module does and its boundaries, grounded in the project constitution and existing specs. It does not define HOW the module is built (that is the job of Live Specs and implementation plans).

<HARD-GATE>
Complete the charter and review loop before invoking any implementation skill, writing code, or creating a Live Spec. This gate applies to all features regardless of perceived simplicity.
</HARD-GATE>

## Arguments

- No arguments: freeform brainstorm (user describes the idea conversationally)
- `--module <name>`: scope brainstorm to an existing module (extends or revises its charter)
- `--from-blueprint <path>`: seed brainstorm from a blueprint file (skips early clarification, jumps to approach selection)

## Prerequisites

This skill requires `.context-index/` to exist. If it does not, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to brainstorm.

Do not proceed without a constitution.

## Checklist

Complete these steps in order. Do not skip steps.

1. **Explore context** — load constitution, platform context, existing charters, ADRs, orientation
2. **Clarify** — ask questions one at a time to understand the feature idea
3. **Propose 2-3 approaches** — present options with trade-offs, validate against constitution
4. **Present design sections** — walk through each charter section, get approval per section
5. **Write charter** — save to `.context-index/specs/features/<module>/charter.md`
6. **Charter review loop** — dispatch charter-reviewer subagent, fix issues, max 3 iterations
7. **User reviews** — ask user to review the written charter
8. **Transition** — invoke `/adev:specify` to create Live Specs from the charter

---

## Step 1: Explore Context

Read these files using Glob/Grep/Read. Do not ask the user for information that exists in these files.

### Essential (load now)

Read immediately — these are required for every brainstorm session:
- `.context-index/constitution.md` — project principles and boundaries
- `.context-index/platform-context.yaml` — tech stack and deployment targets
- `.context-index/manifest.yaml` — module registry and configuration
- `.context-index/specs/product.md` (if exists) — product vision and module map

### Reference (load when relevant)

Read on-demand as the conversation touches these areas:
- `.context-index/specs/features/*/charter.md` — load Business Intent and Scope sections only for cross-charter conflict detection. Load the full charter only if a conflict is detected or the user's idea overlaps with an existing module.
- `.context-index/adrs/*.md` — load titles and decision summaries. Load the full ADR only when the emerging design touches a relevant architectural decision.
- `.context-index/orientation/architecture.md` — load only when the user's idea involves file structure or module placement decisions.
- `.context-index/specs/cross-cutting/*.md` — load when checking interface compatibility or shared constraints.
- `.context-index/references/**/*.md` — load when checking external contract compliance.

**If `--module <name>`:** Also read `.context-index/specs/features/<name>/charter.md` and any Live Specs under that directory. When modifying an approved charter in `--module` mode, set `status: evolving`, increment `revision` by 1, and set `updated: <today's date YYYY-MM-DD>`. This signals that the charter is undergoing active changes and downstream specs should check for charter-revision staleness.

**If `--from-blueprint <path>`:** Read the blueprint and extract module definition, business intent, and capability list.

After reading, summarize findings in 3-5 bullet points covering: what the project builds, existing modules and boundaries, architectural constraints, tech stack, and cross-cutting concerns.

## Step 2: Clarify

Ask questions one at a time. Prefer multiple-choice when possible. Do not ask more than one question per message.

**Assessment before questions:** If the idea spans multiple independent subsystems, flag immediately and help decompose into separate modules. Proceed with one at a time.

**Questions to answer (adapt to the idea, not mechanical):**
- What problem does this solve? (Business Intent)
- What is in/out of scope? (Scope and Boundaries)
- Key entities and relationships? (Domain Model)
- What capabilities does it provide? (Capability Map)
- How do other modules interact? (Interface Contracts)
- What quality attributes matter? (Quality Attributes)
- (Optional) Is there an external tracker reference for this feature? If so, record it as `tracker-ref` in the charter frontmatter (e.g., `tracker-ref: JIRA-1234`).

**Constitution check during clarification:**
As the user describes the feature, check each answer against:
- **Non-Negotiable Principles** in the constitution. If the idea conflicts, raise it immediately: "This conflicts with principle N in the constitution: [quote]. Should we adjust the approach or update the principle?"
- **Architecture Boundaries** in the constitution. If the idea crosses a boundary, raise it: "The constitution says [boundary]. This feature would require [violation]. Do you want to proceed with an exception, or adjust the design?"

**Cross-charter conflict check:**
Compare emerging scope against existing charters for:
- Capability overlap: does this module provide something another module already owns?
- Entity duplication: does this module define entities that belong to another module?
- Interface conflicts: does this module expose or consume APIs that contradict existing contracts?

If conflicts are found, present them clearly and ask the user to resolve.

**If `--from-blueprint`:** Skip answered questions, confirm blueprint answers with user.

## Step 3: Propose 2-3 Approaches

Once you understand the feature, propose 2-3 design approaches. For each:

1. **Name and summary** (1-2 sentences)
2. **How it works** (3-5 sentences)
3. **Trade-offs** (pros/cons list)
4. **Constitution compliance** — aligns, stretches, or violates? Quote the principle.
5. **Platform fit** — fits the tech stack? Requires new dependencies?

Lead with your recommended approach. Wait for user to choose before proceeding.

## Step 4: Present Design Sections

For each section 4a-4f below, present the content and ask "Does this look right?" before moving to the next. Scale detail to complexity — straightforward sections get 2-3 sentences, nuanced ones get detailed tables.

- **4a. Business Intent:** 2-3 sentences — why the module exists and what problem it solves.
- **4b. Scope and Boundaries:** Three lists — In Scope (owned capabilities), Out of Scope (explicitly excluded), Dependencies (other modules, with direction).
- **4c. Domain Model:** Entities table (name, description, key attributes), relationships, and invariants (testable business rules).
- **4d. Capability Map:** Table with name, description, priority (must/should/nice-to-have), and phase. Each capability is a candidate for a future Live Spec. Order by priority.
- **4e. Interface Contracts:** Exposed APIs (what this module offers) and Consumed APIs (what it needs). Each with name, type (REST/function/event/message), and description.
- **4f. Quality Attributes:** Table of non-functional requirements (performance, availability, security, observability). Only include attributes with meaningful requirements.

After the user approves all sections, proceed to writing.

## Step 5: Write Charter

Generate the charter file using the template at `${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md`.

**File path:** `.context-index/specs/features/<module>/charter.md` (lowercase, hyphenated slug).

**Before writing:** Create directory if needed. If charter exists (`--module`), read and merge rather than overwrite.

**Writing:** Fill all sections from Step 4, replace placeholders, remove HTML comments, no TODOs/TBDs.

**Lifecycle frontmatter:** Set the following fields in the charter's YAML frontmatter:
- `status: draft`
- `revision: 1`
- `updated: <today's date YYYY-MM-DD>`

**Capability Map Status column:** The Capability Map table must include a `Status` column. Initialize every capability's Status to `—` (em dash). This column is updated by downstream skills as capabilities progress through the lifecycle.

**After writing:**
- Check if `.context-index/specs/product.md` has a module map — if this module is unlisted, tell the user.
- Commit with message: `feat: add <module> feature charter`
- Suggest branch name: `feat/<module>/<short-description>`

## Step 6: Charter Review Loop

Dispatch a charter-reviewer subagent to validate the written charter.

**Tier:** `capable` — read from `model_tiers` in `.context-index/platform-context.yaml`. Fall back to the hardcoded default in `.context-index/specs/cross-cutting/model-routing.md` if unset, and log a one-time advisory.

**Subagent dispatch:**

```
Task tool (general-purpose):
  description: "Review feature charter for completeness and consistency"
  prompt: |
    You are a Feature Charter reviewer for the Agentic Development Framework.

    **Charter to review:** [CHARTER_FILE_PATH]
    **Constitution:** [Paste .context-index/constitution.md]
    **Platform context:** [Paste .context-index/platform-context.yaml]
    **Existing charters:** [Paste file path + Business Intent + Scope for each, or "None"]
    **ADRs:** [Paste file path + decision summary for each, or "None"]

    ## Review Checklist
    - [ ] All 6 sections present and non-empty (Business Intent, Scope, Domain Model, Capabilities, Interfaces, Quality Attributes)
    - [ ] No TODOs, placeholders, "TBD", or "..." remaining; every table has real rows
    - [ ] Business Intent is clear enough to understand the module from this section alone
    - [ ] In Scope / Out of Scope are specific enough to resolve ownership disputes — not vague like "handles user stuff"
    - [ ] Domain Model entities have concrete attributes, not just names; invariants are testable statements, not aspirational goals
    - [ ] Capabilities are distinct, decomposable into Live Specs, with priorities assigned
    - [ ] Every exposed API has type and description; consumed APIs reference real modules
    - [ ] No conflicts with constitution Non-Negotiable Principles OR Architecture Boundaries
    - [ ] No capability/entity/interface overlaps with other charters
    - [ ] Design is compatible with platform-context.yaml tech stack

    ## Calibration
    Only flag issues that would cause real problems during specification or implementation.
    A missing section, a contradiction with the constitution, or an overlap with another charter are issues.
    Minor wording improvements and stylistic preferences are not issues.
    Approve unless there are structural gaps or compliance violations.

    ## Output Format
    ## Charter Review
    **Status:** Approved | Issues Found
    **Issues (if any):**
    - [Section]: [specific issue] — [why it matters]
    **Recommendations (advisory, do not block approval):**
    - [suggestions]
```

**Handling review results:**

- **Approved:** Proceed to Step 7.
- **Issues Found:** Fix each issue, re-dispatch reviewer. Only escalate to user if fixing requires an unmade design decision.
- **After 3 iterations without approval:** Present remaining issues to user. Ask: fix together, accept as-is, or abandon.

## Step 7: User Reviews

After the review loop passes:

> Charter written and committed to `.context-index/specs/features/<module>/charter.md`. Please review it and let me know if you want any changes before we move to specification.

If changes requested: make them, re-run Step 6, ask for approval again. Only proceed once user explicitly approves.

**On user approval:** Update the charter frontmatter: set `status: approved`, increment `revision` by 1, and set `updated: <today's date YYYY-MM-DD>`.

## Step 8: Transition to Specification

Once approved, transition to Live Spec authoring:

> The charter for **<module>** is complete. The next step is to create Live Specs for specific capabilities.
>
> Top-priority capabilities from the charter:
> 1. [capability-1] (must-have)
> 2. [capability-2] (must-have)
> 3. [capability-3] (should-have)
>
> Would you like to specify one of these now? I will invoke `/adev:specify` to create a Live Spec.

**The terminal state is invoking `/adev:specify`.** Do NOT invoke `/adev:plan`, `/adev:implement`, or any other implementation skill.

---

## Key Principles

- **One question at a time.** Do not overwhelm with multiple questions in a single message.
- **Multiple choice preferred.** Easier to answer than open-ended when the options are known.
- **Constitution is law.** Every design decision is checked against constitutional principles. Conflicts are raised immediately.
- **YAGNI ruthlessly.** Remove capabilities the user did not ask for. A charter can always be extended later.
- **Charter, not code.** The charter defines WHAT, not HOW. No implementation details or code examples.
- **Incremental validation.** Present each section, get approval, then move on.
- **Existing work matters.** Always check existing charters, ADRs, and cross-cutting specs for conflicts.
