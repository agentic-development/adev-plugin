---
name: adev:brainstorm
description: "You MUST use this before building any new feature or module. Explores the idea interactively, validates against the project constitution and existing charters, and produces a Feature Charter. Use whenever the user mentions a new feature, wants to add a capability, discusses a module idea, or says 'let us build X', 'I want to add Y', or 'we need a new Z'. Also use when the user wants to explore or brainstorm an idea before committing to implementation."
---

# Brainstorm a Feature Charter

Turn a feature idea into a structured Feature Charter through collaborative dialogue. The charter defines WHAT a module does and its boundaries, grounded in the project constitution and existing specs. It does not define HOW the module is built (that is the job of Live Specs and implementation plans).

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, create any Live Spec, or take any implementation action until you have written the charter, passed the review loop, and the user has approved the final document. This applies to EVERY feature regardless of perceived simplicity.
</HARD-GATE>

## Output Directive: Artifact-to-Disk Summarization

**CRITICAL:** When producing the charter document, follow this two-step pattern:

1. **Write** the full charter to disk using the Write tool (same as today — full content at the charter file path)
2. **Present** ONLY a structured summary to the user. Do NOT echo the full charter content in your response.

**Summary format (max ~500 tokens):**

```
Charter saved to <path>.

<module> — <business intent in one line>.
<N> capabilities (<M> must-have), <K> exposed interfaces.

| Capability | Priority | Phase |
|---|---|---|
| <name> | must-have | v1 |
| ... | ... | ... |

In scope: <short list>.  Out of scope: <short list>.
Review: <Approved | Issues Found, N fixed over M iterations>
Next: /adev:specify --charter <module>
```

**What NOT to include in the chat response:**
- Full section bodies (Domain Model tables, Interface Contracts, Quality Attributes)
- The full reviewer prompt or the reviewer's raw output (just report the verdict)
- The template's boilerplate

These are all written to disk and available via `Read <charter-path>`. The user or next skill reads from disk, not from conversation history.

This directive governs the **final** write-up only. Steps 2-4 below are still interactive and still present their content in chat — you cannot get section-by-section approval from a file the user has not read yet.

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

**Required:** `.context-index/constitution.md` (principles, boundaries, quality gates), `.context-index/platform-context.yaml` (tech stack, versions, deployment targets), `.context-index/manifest.yaml` (specialist registry, context loading strategy).

**Conditional (read if they exist):**
- `.context-index/specs/product.md` — product vision and module map
- `.context-index/specs/features/*/charter.md` — all existing charters (Glob for them). Note module names, scopes, dependencies, interfaces — you need this to detect conflicts later.
- `.context-index/adrs/*.md` — decisions that constrain the design space
- `.context-index/orientation/architecture.md` — module boundaries and codebase structure
- `.context-index/specs/cross-cutting/*.md` — shared constraints
- `.context-index/references/**/*.md` — external reference charters and contracts this module must comply with

**If `--module <name>`:** Read that module's `charter.md` and any Live Specs under its directory. You are extending or revising the charter, not replacing it.

**If `--from-blueprint <path>`:** Read the blueprint; extract module definition, business intent, and capability list to seed the brainstorm and cut down the clarifying questions.

After reading, summarize findings in 3-5 bullets: what the project builds, existing modules and boundaries, architectural constraints from ADRs, what the tech stack enables and limits, and relevant cross-cutting concerns.

## Step 2: Clarify

Ask questions one at a time. Prefer multiple-choice when possible; open-ended is fine for exploratory questions. Never more than one question per message.

**Assessment before questions:** If the idea spans multiple independent subsystems, flag it immediately:

> This sounds like it spans multiple modules. Before diving into details, let me suggest how to decompose it. Each module gets its own charter, and we brainstorm them one at a time.

Help the user identify independent modules, then proceed with the first one.

**Questions to answer (adapt to the idea, do not ask mechanically):**
- What user or business problem does this solve? (Business Intent)
- What is in scope and what is explicitly out of scope? (Scope and Boundaries)
- What are the key entities and their relationships? (Domain Model)
- What capabilities does this module provide? (Capability Map)
- How do other modules interact with this one? (Interface Contracts)
- What quality attributes matter most? (Quality Attributes)

**Constitution check during clarification.** Check each answer against:
- **Non-Negotiable Principles.** On conflict, raise immediately: "This conflicts with principle N in the constitution: [quote]. Should we adjust the approach or update the principle?"
- **Architecture Boundaries.** On a crossing, raise: "The constitution says [boundary]. This feature would require [violation]. Do you want to proceed with an exception, or adjust the design?"

**Cross-charter conflict check.** Compare the emerging scope against existing charters for capability overlap (does another module already own this?), entity duplication (do these entities belong to another module?), and interface conflicts (do these APIs contradict existing contracts?). Present any conflicts clearly and ask the user how to resolve them.

**If `--from-blueprint`:** Skip questions the blueprint already answers, but confirm them: "The blueprint says [X]. Does that still hold?"

## Step 3: Propose 2-3 Approaches

Once you understand the feature well enough, propose 2-3 design approaches. For each:

1. **Name and summary** (1-2 sentences)
2. **How it works** (3-5 sentences)
3. **Trade-offs** (pros and cons as a bulleted list)
4. **Constitution compliance** — aligns, stretches, or violates? Quote the specific principle.
5. **Platform fit** — how it fits the stack in `platform-context.yaml`. Flag any new dependencies or technologies.

Lead with your recommended approach and say why. Wait for the user to choose or request modifications before proceeding.

## Step 4: Present Design Sections

Walk through the charter structure one section at a time. Present each, then ask "Does this look right?" before moving on. Scale each section to its complexity — straightforward sections get 2-3 sentences, nuanced ones get detailed tables.

- **4a. Business Intent** — 2-3 sentences on why this module exists and what problem it solves. The module's elevator pitch.
- **4b. Scope and Boundaries** — three lists: **In Scope** (capabilities this module owns), **Out of Scope** (explicitly excluded, prevents scope creep), **Dependencies** (other modules or services, with dependency direction).
- **4c. Domain Model** — **Entities** table (name, description, key attributes), **Relationships** between them, and **Invariants** (business rules that must always hold).
- **4d. Capability Map** — table of capability name, description, priority (must-have / should-have / nice-to-have), and phase (v1, v2, mvp, post-launch, or blank). Phase is WHEN it ships, priority is how important it is; phases are free-form strings agreed with the user. Each capability is a candidate for a future Live Spec. Order by priority.
- **4e. Interface Contracts** — **Exposed APIs** (what this module offers others) and **Consumed APIs** (what it needs from others). Each with name, type (REST endpoint / function / event / message), and a brief description.
- **4f. Quality Attributes** — table of non-functional requirements: performance, availability, security, observability. Include only attributes with meaningful requirements; do not pad with generic statements.

After the user approves all sections, proceed to writing.

## Step 5: Write Charter

Generate the charter from the template at `${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md`.

**File path:** `.context-index/specs/features/<module>/charter.md`, where `<module>` is a lowercase hyphenated slug (e.g. `task-boards`, `user-management`).

**Before writing:** create `.context-index/specs/features/<module>/` if missing. If a charter already exists there (the `--module` case), read it first and merge rather than overwrite — preserve sections the user did not modify.

**Writing:** fill every section from the approved Step 4 design, replace all `...` placeholders with real content, strip the template's HTML comments (they are authoring instructions), and leave no TODOs or TBDs.

**After writing:**
- If `.context-index/specs/product.md` has a module map that omits this module, say: "This is a new module not listed in the product charter. After we finalize the charter, consider updating the product charter module map."
- Commit with message: `feat: add <module> feature charter`
- Suggest the implementation branch name: `feat/<module>/<short-description>` (e.g. `feat/auth/login-flow`)

Then present the disk-summary described in the Output Directive above — not the charter body.

## Step 6: Charter Review Loop

Dispatch a charter-reviewer subagent to validate the written charter against structure, constitution compliance, and cross-charter consistency.

**Subagent dispatch:**

```
Task tool (general-purpose):
  description: "Review feature charter for completeness and consistency"
  prompt: |
    You are a Feature Charter reviewer for the Agentic Development Framework.

    **Charter to review:** [CHARTER_FILE_PATH]
    **Constitution:** [full content of .context-index/constitution.md]
    **Platform context:** [full content of .context-index/platform-context.yaml]
    **Existing charters:** [each charter's path + Business Intent and Scope sections, or "No other charters exist."]
    **ADRs:** [each ADR's path + decision summary, or "No ADRs exist."]

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

**Handling results:**

- **Approved:** proceed to Step 7.
- **Issues Found:** fix each issue in the charter file, then re-dispatch the reviewer with the updated charter. Do not ask the user about issues you can fix yourself (missing details already discussed, structural fixes). Escalate only when the fix requires a design decision not yet made.
- **After 3 iterations without approval:** stop, present the remaining issues, and ask the user to decide — fix them together, accept as-is, or abandon.

Report only the verdict and the count of fixed issues in chat, per the Output Directive.

## Step 7: User Reviews

After the review loop passes, ask the user to review the written charter:

> Charter written and committed to `.context-index/specs/features/<module>/charter.md`. Please review it and let me know if you want any changes before we move to specification.

Wait for their response. If they request changes: make them, re-run the Step 6 review loop, and ask for approval again. Only proceed once the user explicitly approves.

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

**The terminal state is invoking `/adev:specify`.** Do NOT invoke `/adev:plan`, `/adev:implement`, or any other implementation skill. The ONLY skill you invoke after brainstorming is `/adev:specify`.

---

## Key Principles

- **One question at a time.** Do not overwhelm with multiple questions in a single message.
- **Multiple choice preferred.** Easier to answer than open-ended when the options are known.
- **Constitution is law.** Every design decision is checked against constitutional principles. Conflicts are raised immediately, not buried in the charter.
- **YAGNI ruthlessly.** Remove capabilities the user did not ask for. A charter can always be extended later.
- **Charter, not code.** The charter defines WHAT, not HOW. No implementation details, technology choices beyond platform-context.yaml, or code examples.
- **Incremental validation.** Present each section, get approval, then move on. Do not dump the entire charter at once.
- **Existing work matters.** Always check existing charters, ADRs, and cross-cutting specs for conflicts before finalizing.
- **The artifact lives on disk.** The final charter is read from the file, not re-read from the conversation.
