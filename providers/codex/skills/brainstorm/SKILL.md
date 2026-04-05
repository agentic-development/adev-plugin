---
name: adev:brainstorm
description: "You MUST use this before building any new feature or module. Explores the idea interactively, validates against the project constitution and existing charters, and produces a Feature Charter. Use when the user mentions a new feature, wants to add a capability, or says 'let us build X' or 'I want to add Y'. In Codex, invoke with $adev:brainstorm"
---

# Brainstorm a Feature Charter

Turn a feature idea into a structured Feature Charter through collaborative dialogue.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, create any Live Spec, or take any implementation action until you have written the charter, passed the review loop, and the user has approved the final document.
</HARD-GATE>

## Arguments

- No arguments: freeform brainstorm
- `--module <name>`: scope to an existing module
- `--from-blueprint <path>`: seed from blueprint file

## Prerequisites

This skill requires `.context-index/` to exist with a constitution.

## Process

### Step 1: Explore Context

Read using Glob/Grep/Read:
- `.context-index/constitution.md` (required)
- `.context-index/platform-context.yaml` (required)
- `.context-index/manifest.yaml` (required)
- `.context-index/specs/product.md` (optional)
- `.context-index/specs/features/*/charter.md` (existing charters)
- `.context-index/adrs/*.md` (decisions)

### Step 2: Clarify

Ask questions one at a time (multiple-choice preferred):
- What problem does this solve?
- What is in/out of scope?
- Key entities and relationships?
- What capabilities does it provide?
- How do other modules interact?
- What quality attributes matter?

Check against constitution principles as user describes the feature.

### Step 3: Propose 2-3 Approaches

For each approach:
1. Name and summary
2. How it works
3. Trade-offs
4. Constitution compliance
5. Platform fit

Lead with recommended approach. Wait for user choice.

### Step 4: Present Design Sections

For each section, get approval before moving on:

- **4a. Business Intent:** 2-3 sentences
- **4b. Scope and Boundaries:** In/Out/Dependencies lists
- **4c. Domain Model:** Entities table, relationships, invariants
- **4d. Capability Map:** Table with name, priority, phase
- **4e. Interface Contracts:** Exposed/Consumed APIs
- **4f. Quality Attributes:** Non-functional requirements

### Step 5: Write Charter

Generate using template at `${ADEV_PLUGIN_ROOT}/templates/charter-template.md`.

**File:** `.context-index/specs/features/<module>/charter.md`

### Step 6: Charter Review Loop

Dispatch charter-reviewer subagent to validate.

**If approved:** Proceed.
**If issues found:** Fix, re-review. Max 3 iterations.
**If 3+ iterations:** Present remaining issues to user.

### Step 7: User Reviews

> Charter written. Please review and let me know if you want changes.

### Step 8: Transition to Specification

> The charter for **<module>** is complete. Next step is to create Live Specs.
>
> Would you like to specify one now? $adev:specify

## Key Principles

- One question at a time
- Multiple choice preferred
- Constitution is law
- YAGNI ruthlessly
- Charter, not code
- Incremental validation
