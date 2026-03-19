---
name: adev-brainstorm
description: "You MUST use this before building any new feature or module. Explores the idea interactively, validates against the project constitution and existing charters, and produces a Feature Charter saved to .context-index/specs/features/<module>/charter.md."
---

# Brainstorm a Feature Charter

Turn a feature idea into a structured Feature Charter through collaborative dialogue. The charter defines WHAT a module does and its boundaries, grounded in the project constitution and existing specs. It does not define HOW the module is built (that is the job of Live Specs and implementation plans).

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, create any Live Spec, or take any implementation action until you have written the charter, passed the review loop, and the user has approved the final document. This applies to EVERY feature regardless of perceived simplicity.
</HARD-GATE>

## Arguments

- No arguments: freeform brainstorm (user describes the idea conversationally)
- `--module <name>`: scope brainstorm to an existing module (extends or revises its charter)
- `--from-blueprint <path>`: seed brainstorm from a blueprint file (skips early clarification, jumps to approach selection)

## Prerequisites

This skill requires `.context-index/` to exist. If it does not, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev-init` first to set up the context index, then come back to brainstorm.

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
8. **Transition** — invoke `/adev-specify` to create Live Specs from the charter

---

## Step 1: Explore Context

Read these files using Glob/Grep/Read. Do not ask the user for information that exists in these files.

**Required reads:**
- `.context-index/constitution.md` — project principles, boundaries, quality gates
- `.context-index/platform-context.yaml` — tech stack, framework versions, deployment targets
- `.context-index/manifest.yaml` — specialist registry, context loading strategy

**Conditional reads:**
- `.context-index/specs/product.md` — if it exists, read the product charter for vision and module map
- `.context-index/specs/features/*/charter.md` — read all existing feature charters (use Glob to find them). Note their module names, scopes, dependencies, and interfaces. You need this to detect conflicts and overlaps later.
- `.context-index/adrs/*.md` — read all ADRs. Note decisions that constrain the design space.
- `.context-index/orientation/architecture.md` — if it exists, read for module boundaries and codebase structure
- `.context-index/specs/cross-cutting/*.md` — read any cross-cutting specs for shared constraints
- `.context-index/references/**/*.md` — if the references directory exists, read external reference charters and contracts. Note external interfaces this module must comply with.

**If `--module <name>` was provided:**
- Read `.context-index/specs/features/<name>/charter.md` if it exists. You are extending or revising this charter, not replacing it from scratch.
- Read any Live Specs under `.context-index/specs/features/<name>/` to understand existing implementation scope.

**If `--from-blueprint <path>` was provided:**
- Read the blueprint file at the given path.
- Extract the module definition, business intent, and capability list from the blueprint.
- These seed the brainstorm and reduce the number of clarifying questions needed.

After reading, summarize what you found in 3-5 bullet points:
- What the project builds (from product charter or constitution)
- What modules already exist and their boundaries
- What architectural decisions constrain the design (from ADRs)
- What the tech stack enables and limits (from platform context)
- Any relevant cross-cutting concerns

## Step 2: Clarify

Ask questions one at a time. Prefer multiple-choice questions when possible. Open-ended is fine for exploratory questions. Do not ask more than one question per message.

**Assessment before questions:**
Before asking detailed questions, assess scope. If the idea describes multiple independent subsystems, flag this immediately:

> This sounds like it spans multiple modules. Before diving into details, let me suggest how to decompose it. Each module gets its own charter, and we brainstorm them one at a time.

Help the user identify independent modules, then proceed with the first one.

**Questions to answer (adapt to the idea, do not ask all of these mechanically):**
- What user or business problem does this solve? (Business Intent)
- What is in scope and what is explicitly out of scope? (Scope and Boundaries)
- What are the key entities and their relationships? (Domain Model)
- What capabilities does this module provide? (Capability Map)
- How do other modules interact with this one? (Interface Contracts)
- What quality attributes matter most? (Quality Attributes)

**Constitution check during clarification:**
As the user describes the feature, check each answer against:
- **Non-Negotiable Principles** in the constitution. If the idea conflicts, raise it immediately: "This conflicts with principle N in the constitution: [quote]. Should we adjust the approach or update the principle?"
- **Architecture Boundaries** in the constitution. If the idea crosses a boundary (e.g., creates a new database table when the constitution says not to without approval), raise it: "The constitution says [boundary]. This feature would require [violation]. Do you want to proceed with an exception, or adjust the design?"

**Cross-charter conflict check:**
Compare the emerging feature scope against existing charters:
- Capability overlap: does this module provide something another module already owns?
- Entity duplication: does this module define entities that belong to another module?
- Interface conflicts: does this module expose or consume APIs in ways that contradict existing contracts?

If conflicts are found, present them clearly and ask the user how to resolve them.

**If `--from-blueprint` was provided:**
Skip questions whose answers are already in the blueprint. Confirm the blueprint-provided answers with the user: "The blueprint says [X]. Does that still hold, or do you want to adjust?"

## Step 3: Propose 2-3 Approaches

Once you understand the feature well enough, propose 2-3 design approaches. For each approach:

1. **Name and summary** (1-2 sentences)
2. **How it works** (3-5 sentences describing the approach)
3. **Trade-offs** (pros and cons as a bulleted list)
4. **Constitution compliance** — note whether each approach aligns with, stretches, or violates constitutional principles. Quote the specific principle.
5. **Platform fit** — note how each approach fits the tech stack from `platform-context.yaml`. Flag if an approach requires adding new dependencies or technologies.

Lead with your recommended approach and explain why you recommend it.

Wait for the user to choose an approach or request modifications before proceeding.

## Step 4: Present Design Sections

Walk through the charter structure one section at a time. Present each section, then ask: "Does this look right?" before moving to the next.

Scale each section to its complexity. A straightforward section gets 2-3 sentences. A nuanced section gets detailed tables and explanations.

**Section order:**

### 4a. Business Intent
Present 2-3 sentences describing why this module exists and what problem it solves. This is the "elevator pitch" for the module.

### 4b. Scope and Boundaries
Present three lists:
- **In Scope:** capabilities this module owns
- **Out of Scope:** capabilities explicitly excluded (prevents scope creep)
- **Dependencies:** other modules or services this module depends on, with dependency direction

### 4c. Domain Model
Present:
- **Entities** table: entity name, description, key attributes
- **Relationships:** how entities relate to each other
- **Invariants:** business rules that must always hold true

### 4d. Capability Map
Present a table of capabilities with:
- Capability name
- Description
- Priority (must-have / should-have / nice-to-have)

Each capability is a candidate for a future Live Spec. Order by priority.

### 4e. Interface Contracts
Present:
- **Exposed APIs:** what this module offers to other modules (endpoints, functions, events, messages)
- **Consumed APIs:** what this module needs from other modules

For each interface, include: name, type (REST endpoint / function / event / message), and a brief description.

### 4f. Quality Attributes
Present a table of non-functional requirements specific to this module:
- Performance
- Availability
- Security
- Observability

Only include attributes that have meaningful requirements. Do not pad with generic statements.

After the user approves all sections, proceed to writing.

## Step 5: Write Charter

Generate the charter file using the template at `${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md`.

**File path:** `.context-index/specs/features/<module>/charter.md`

Where `<module>` is the module slug (lowercase, hyphenated, e.g., `task-boards`, `user-management`).

**Before writing:**
1. Create the directory if it does not exist: `.context-index/specs/features/<module>/`
2. If a charter already exists at that path (when using `--module`), read it first and merge changes rather than overwriting. Preserve any sections the user did not modify.

**Writing the charter:**
- Fill in all sections from the approved design in Step 4
- Replace all `...` placeholders in the template with actual content
- Remove HTML comments from the template (they are authoring instructions, not charter content)
- Do not include placeholder text, TODOs, or TBDs

**After writing:**
- If `.context-index/specs/product.md` exists and has a module map, check whether this module is listed. If not, tell the user: "This is a new module not listed in the product charter. After we finalize the charter, consider updating the product charter module map."
- Commit the charter file to git with message: `feat: add <module> feature charter`

## Step 6: Charter Review Loop

Dispatch a charter-reviewer subagent to validate the written charter. The reviewer checks structure, constitution compliance, and cross-charter consistency.

**Subagent dispatch:**

```
Task tool (general-purpose):
  description: "Review feature charter for completeness and consistency"
  prompt: |
    You are a Feature Charter reviewer for the Agentic Development Framework.

    **Charter to review:** [CHARTER_FILE_PATH]
    **Constitution:** [Read and paste the full content of .context-index/constitution.md]
    **Platform context:** [Read and paste the full content of .context-index/platform-context.yaml]
    **Existing charters:** [For each existing charter, paste its file path and Business Intent + Scope sections. If there are no other charters, state "No other charters exist."]
    **ADRs:** [For each ADR, paste its file path and decision summary. If there are no ADRs, state "No ADRs exist."]

    ## What to Check

    | Category | What to Look For |
    |----------|------------------|
    | Structure | All 6 required sections present and non-empty: Business Intent, Scope and Boundaries, Domain Model, Capability Map, Interface Contracts, Quality Attributes |
    | Completeness | No TODOs, placeholders, "TBD", or "..." remaining. Every table has at least one real row. |
    | Business Intent | Clear, specific, 2-3 sentences. If you cannot tell what the module does from this section alone, it fails. |
    | Scope Clarity | In Scope and Out of Scope are specific enough to resolve ownership disputes. Not vague like "handles user stuff." |
    | Domain Model | Entities have concrete attributes, not just names. Invariants are testable statements, not aspirational goals. |
    | Capability Map | Each capability is distinct and decomposable into a Live Spec. Priorities are assigned. |
    | Interface Contracts | Every exposed API has a type and description. Consumed APIs reference real modules. |
    | Constitution Compliance | No capability or design decision conflicts with Non-Negotiable Principles or Architecture Boundaries in the constitution. |
    | Cross-Charter Consistency | No capability overlaps with other charters' In Scope lists. No entity duplicates another charter's Domain Model. Interface contracts are compatible with existing charters' exposed APIs. |
    | Platform Fit | Design decisions are compatible with the tech stack in platform-context.yaml. No implicit technology additions. |

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
    - [suggestions for improvement]
```

**Handling review results:**

- **Approved:** Proceed to Step 7.
- **Issues Found:** Fix each issue in the charter file. Then re-dispatch the reviewer with the updated charter. Do not ask the user about issues you can fix yourself (missing details that were discussed, structural fixes). Only escalate to the user if fixing the issue requires a design decision not yet made.
- **After 3 iterations without approval:** Stop the loop and present the remaining issues to the user. Ask them to decide: fix the issues together, accept the charter as-is, or abandon.

## Step 7: User Reviews

After the review loop passes, ask the user to review the written charter:

> Charter written and committed to `.context-index/specs/features/<module>/charter.md`. Please review it and let me know if you want any changes before we move to specification.

Wait for the user's response. If they request changes:
1. Make the changes
2. Re-run the charter review loop (Step 6)
3. Ask for approval again

Only proceed once the user explicitly approves.

## Step 8: Transition to Specification

Once the user approves the charter, transition to Live Spec authoring:

> The charter for **<module>** is complete. The next step is to create Live Specs for specific capabilities.
>
> Top-priority capabilities from the charter:
> 1. [capability-1] (must-have)
> 2. [capability-2] (must-have)
> 3. [capability-3] (should-have)
>
> Would you like to specify one of these now? I will invoke `/adev-specify` to create a Live Spec.

**The terminal state is invoking `/adev-specify`.** Do NOT invoke `/adev-plan`, `/adev-implement`, or any other implementation skill. The ONLY skill you invoke after brainstorming is `/adev-specify`.

---

## Key Principles

- **One question at a time.** Do not overwhelm with multiple questions in a single message.
- **Multiple choice preferred.** Easier to answer than open-ended when the options are known.
- **Constitution is law.** Every design decision is checked against constitutional principles. Conflicts are raised immediately, not buried in the charter.
- **YAGNI ruthlessly.** Remove capabilities the user did not ask for. A charter can always be extended later.
- **Charter, not code.** The charter defines WHAT, not HOW. Do not include implementation details, technology choices (beyond what platform-context.yaml establishes), or code examples.
- **Incremental validation.** Present each section, get approval, then move on. Do not dump the entire charter at once.
- **Existing work matters.** Always check existing charters, ADRs, and cross-cutting specs for conflicts before finalizing.
