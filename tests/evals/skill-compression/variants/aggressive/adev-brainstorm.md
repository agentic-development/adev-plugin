---
name: adev-brainstorm
description: "You MUST use this before building any new feature or module. Explores the idea interactively, validates against the project constitution and existing charters, and produces a Feature Charter. Use whenever the user mentions a new feature, wants to add a capability, discusses a module idea, or says 'let us build X', 'I want to add Y', or 'we need a new Z'. Also use when the user wants to explore or brainstorm an idea before committing to implementation."
---

# Brainstorm a Feature Charter

Turn a feature idea into a structured Feature Charter through collaborative dialogue. The charter defines WHAT a module does and its boundaries, grounded in the project constitution and existing specs. Accepts optional `--module <name>` (extend existing charter) or `--from-blueprint <path>` (seed from blueprint, skip early clarification).

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, create any Live Spec, or take any implementation action until you have written the charter, passed the review loop, and the user has approved the final document. This applies to EVERY feature regardless of perceived simplicity.
</HARD-GATE>

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
7. **User approval and transition** — user reviews, then invoke `/adev-specify`

---

## Step 1: Explore Context

Read these files using Glob/Grep/Read. Do not ask the user for information that exists in these files.

**Required:** `.context-index/constitution.md`, `.context-index/platform-context.yaml`, `.context-index/manifest.yaml`

**Conditional (read if they exist):**
- `.context-index/specs/product.md`
- `.context-index/specs/features/*/charter.md`
- `.context-index/adrs/*.md`
- `.context-index/orientation/architecture.md`
- `.context-index/specs/cross-cutting/*.md`
- `.context-index/references/**/*.md`

**If `--module <name>`:** Also read the existing charter and Live Specs under that module directory.

**If `--from-blueprint <path>`:** Read and extract module definition, business intent, and capabilities.

After reading, summarize what you found in 3-5 bullet points:
- What the project builds (from product charter or constitution)
- What modules already exist and their boundaries
- What architectural decisions constrain the design (from ADRs)
- What the tech stack enables and limits (from platform context)
- Any relevant cross-cutting concerns

## Step 2: Clarify

Ask questions one at a time. Prefer multiple-choice when possible. Do not ask more than one question per message.

**Assessment before questions:** If the idea spans multiple independent subsystems, flag immediately and help decompose into separate modules. Proceed with one at a time.

**Key questions (adapt to the idea):**
- What problem does this solve? (Business Intent)
- What is in/out of scope? (Scope and Boundaries)
- Key entities, capabilities, interfaces, and quality needs?

**Constitution check:** As the user describes the feature, check each answer against Non-Negotiable Principles and Architecture Boundaries in the constitution. If the idea conflicts, raise it immediately: "This conflicts with principle N: [quote]. Should we adjust the approach or update the principle?"

**Cross-charter conflict check:** Compare emerging scope against existing charters for capability overlap, entity duplication, and interface conflicts. If conflicts are found, present them clearly and ask the user how to resolve.

**If `--from-blueprint`:** Skip answered questions, confirm blueprint answers with user.

## Step 3: Propose 2-3 Approaches

Once you understand the feature, propose 2-3 design approaches. For each:

1. **Name and summary** (1-2 sentences)
2. **How it works** (3-5 sentences)
3. **Trade-offs** (pros/cons list)
4. **Constitution compliance** — aligns, stretches, or violates? Quote the principle.
5. **Platform fit** — fits the tech stack from `platform-context.yaml`? Requires new dependencies?

Lead with your recommended approach and explain why. Wait for user to choose before proceeding.

## Step 4: Present Design Sections

For each section 4a-4f below, present the content and ask "Does this look right?" before moving to the next. Scale detail to complexity.

- **4a. Business Intent:** 2-3 sentences — why the module exists and what problem it solves.
- **4b. Scope and Boundaries:** Three lists — In Scope, Out of Scope, Dependencies (with direction).
- **4c. Domain Model:** Entities table (name, description, key attributes), relationships, and invariants.
- **4d. Capability Map:** Table with name, description, priority (must-have / should-have / nice-to-have), and phase. Phase indicates WHEN this capability ships (free-form string). Each capability is a candidate for a future Live Spec. Order by priority.
- **4e. Interface Contracts:** Exposed APIs (what this module offers to others) and Consumed APIs (what it needs from others). For each: name, type (REST endpoint / function / event / message), and description.
- **4f. Quality Attributes:** Non-functional requirements table (performance, availability, security, observability). Only include attributes that have meaningful requirements — do not pad with generic statements.

After the user approves all sections, proceed to writing.

## Step 5: Write Charter

Generate the charter using `${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md`.

**File path:** `.context-index/specs/features/<module>/charter.md` (lowercase, hyphenated slug).

**Before writing:** Create directory if needed. If charter exists (`--module`), read it first and merge changes rather than overwriting. Preserve sections the user did not modify.

**Writing:** Fill all sections from Step 4, replace all `...` placeholders, remove HTML comments (they are authoring instructions), no TODOs/TBDs.

**After writing:**
- Check if `.context-index/specs/product.md` has a module map — if this module is unlisted, tell the user to consider updating it.
- Commit with message: `feat: add <module> feature charter`
- Suggest branch name: `feat/<module>/<short-description>`

## Step 6: Charter Review Loop

Dispatch a charter-reviewer subagent to validate the written charter.

**Subagent dispatch:**

```
Task tool (general-purpose):
  description: "Review feature charter for completeness and consistency"
  prompt: |
    You are a Feature Charter reviewer.

    **Charter:** [CHARTER_FILE_PATH]
    **Constitution:** [Paste .context-index/constitution.md]
    **Platform context:** [Paste .context-index/platform-context.yaml]
    **Existing charters:** [Paste path + Business Intent + Scope for each, or "None"]
    **ADRs:** [Paste path + decision summary for each, or "None"]

    ## Review Checklist
    - [ ] All 6 sections present and non-empty
    - [ ] No TODOs, placeholders, or "TBD"; every table has real rows
    - [ ] Business Intent clear enough to understand module standalone
    - [ ] Scope specific enough to resolve ownership disputes
    - [ ] Entities have concrete attributes; invariants are testable
    - [ ] Capabilities are distinct and decomposable into Live Specs
    - [ ] APIs have type and description; consumed APIs reference real modules
    - [ ] No conflicts with constitution principles or boundaries
    - [ ] No overlaps with other charters
    - [ ] Compatible with platform-context.yaml

    Only flag issues causing real problems. Approve unless structural gaps or compliance violations.

    **Output:** Status (Approved | Issues Found), Issues list, Recommendations (advisory).
```

**Handling review results:**

- **Approved:** Proceed to Step 7.
- **Issues Found:** Fix each issue in the charter file, then re-dispatch the reviewer with updated charter. Do not ask the user about issues you can fix yourself (missing details that were discussed, structural fixes). Only escalate to the user if fixing requires a design decision not yet made.
- **After 3 iterations without approval:** Stop the loop. Present remaining issues to user. Ask: fix together, accept as-is, or abandon.

## Step 7: User Approval and Transition

After the review loop passes:

> Charter written and committed to `.context-index/specs/features/<module>/charter.md`. Please review it and let me know if you want any changes before we move to specification.

Wait for the user's response. If they request changes:
1. Make the changes
2. Re-run the charter review loop (Step 6)
3. Ask for approval again

Only proceed once the user explicitly approves. Once approved:

> The charter for **<module>** is complete. Top-priority capabilities:
> 1. [capability-1] (must-have)
> 2. [capability-2] (must-have)
> 3. [capability-3] (should-have)
>
> Would you like to specify one of these now? I will invoke `/adev-specify` to create a Live Spec.

**The terminal state is invoking `/adev-specify`.** Do NOT invoke `/adev-plan`, `/adev-implement`, or any other implementation skill. The ONLY skill you invoke after brainstorming is `/adev-specify`.
