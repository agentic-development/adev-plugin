---
name: adev:vision
description: "Define or refine the product vision and milestones. Use when the user says 'define the vision', 'set milestones', 'plan the product roadmap', 'what should we build first', 'prioritize features', 'create milestones', or wants to establish the strategic direction for the project. Also use with --refresh to update milestones against current charters."
---

# Define Product Vision & Milestones

Guide the user through defining a product vision and structured milestones via an interactive interview. The vision is grounded in the project constitution, existing charters, and the current state of the product. Milestones are written to `product.md` and synced as epics on the issue board.

**Announce at start:** "I'm using the adev:vision skill to define the product vision and milestones."

## Arguments

- No arguments: full interactive interview mode
- `--refresh`: skip the interview; review and update existing milestones against the latest charters
- `--milestone <name>`: focus on defining or refining a single milestone rather than the full vision

## Prerequisites

This skill requires `.context-index/` to exist with `constitution.md` and `manifest.yaml`. If it does not, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to define the vision.

Do not proceed without a constitution.

---

## Step 1: Load Context

Read these files using Glob/Grep/Read. Do not ask the user for information that exists in these files.

**Required:**
- `.context-index/constitution.md` — focus on the Identity section for product identity
- `.context-index/manifest.yaml` — check for `tasks.backend` configuration

**Conditional (read if they exist):**
- `.context-index/specs/product.md` — existing product vision, module map, and Milestones section
- `.context-index/specs/features/*/charter.md` — all existing feature charters (note names, scopes, dependencies)
- `.context-index/tasks/tasks.md` — current issue board state (existing epics)

After reading, summarize findings in 3-5 bullet points covering: project identity, existing features, current milestones (if any), and issue board state.

### Bootstrap: product.md Missing

If `product.md` does not exist, create a minimal one from the constitution Identity section:

```markdown
# Product Vision

<!-- Generated from constitution Identity section by /adev:vision -->

<extracted identity and purpose from constitution>

## Module Map

<!-- Populated by /adev:brainstorm as charters are created -->

## Milestones

<!-- Populated by /adev:vision -->
```

Save to `.context-index/specs/product.md`, then proceed.

---

## Step 2: Route by Mode

- If `--refresh` was specified, skip to **Step 5 (Refresh Mode)**.
- If `--milestone <name>` was specified, note the target milestone name and proceed with the interview focused on that milestone only.
- Otherwise, proceed with the full interview.

### Error: --refresh but No Milestones Section

If `--refresh` was specified but `product.md` has no `## Milestones` section, print:

> No Milestones section found in product.md. Falling back to full interview mode to define initial milestones.

Then proceed with the full interview (Step 3).

---

## Step 3: Interview

Ask questions **one at a time**. Wait for the user's response before asking the next question. Prefer multiple-choice when possible. Do not ask more than one question per message.

Adapt the questions to the project context. Skip questions whose answers are already clear from the loaded context. The core topics to cover:

1. **Business Objectives** — "What are the primary goals for this product? What problem does it solve and for whom?"
2. **Target Audience** — "Who are the primary users? Are there distinct user segments with different needs?"
3. **Success Metrics** — "How will you measure success? What metrics matter most?"
4. **Feature Inventory** — "Looking at the existing charters [list them], are there additional features you want to include? Any that should be deferred or removed?"
5. **Priorities** — "Of these features, which are essential for the first usable version? Which can come later?"
6. **Timeline** — "Do you have target dates or timeframes for delivery? Any hard deadlines?"

If `--milestone <name>` is active, focus the questions on that specific milestone: which features belong in it, what its target date is, and what its success criteria are.

**Constitution check during interview:**
As the user describes objectives, check each answer against the Non-Negotiable Principles and Architecture Boundaries in the constitution. If the vision conflicts with a principle, raise it immediately:

> "This conflicts with principle N in the constitution: [quote]. Should we adjust the vision or propose an amendment to the principle?"

---

## Step 4: Propose Milestones

Synthesize the interview responses into a structured milestone proposal. Present it to the user for review before writing anything.

### Milestone Format

For each milestone, present:

```
### <Milestone Name>
- **Status:** planned | active | completed
- **Target:** <date or timeframe, if provided>
- **Features:**
  - <feature-name-1> (charter: exists | needed)
  - <feature-name-2> (charter: exists | needed)
- **Success Criteria:** <brief description>
```

Rules for the proposal:
- List milestones in **priority order** (highest priority first)
- Each feature should appear in exactly one milestone
- Features with existing charters should reference them
- Features without charters should be marked as "charter: needed"
- If `--milestone <name>` is active, propose only that milestone

Ask the user: "Does this milestone structure look right? Would you like to adjust anything before I write it?"

Wait for explicit approval before proceeding to Step 6.

---

## Step 5: Refresh Mode

This step runs only when `--refresh` is specified.

1. Read the current `## Milestones` section from `product.md`
2. Read all current charters via `Glob("**/charter.md")`
3. Compare milestones against charters:
   - Are there charters not assigned to any milestone? Flag as "unassigned"
   - Are there milestone features that lack charters? Flag as "charter missing"
   - Have any charters changed scope since the milestones were last defined?
   - Are milestone priorities still appropriate given current project state?
4. Read the issue board to check epic status for each milestone
5. Present a refresh report:

```
## Milestone Refresh Report

### Changes Detected
- New charters since last vision: [list]
- Charters removed or renamed: [list]
- Unassigned charters: [list]

### Proposed Updates
- Add <feature> to milestone <name>
- Remove <feature> from milestone <name> (charter deleted)
- Reorder: move <milestone> before <milestone> (reason)

### No Changes Needed
- <milestone>: all features accounted for, priorities unchanged
```

Ask the user to approve the proposed updates. On approval, proceed to Step 6.

---

## Step 6: Write Milestones to product.md

Write the approved milestones to `product.md` using the `## Milestones` section delimiter.

### Writing Rules

1. **Section boundary:** The `## Milestones` section starts at the `## Milestones` heading and extends to the next `##` heading or EOF.
2. **Replace in-place:** If a `## Milestones` section already exists, replace its entire content (from the heading to the next `##` heading or EOF). Preserve all other sections unchanged.
3. **Append if new:** If no `## Milestones` section exists, append it at the end of `product.md`.
4. **Format:** Use the canonical milestone format:

```markdown
## Milestones

### <Milestone Name>
- **Status:** planned
- **Target:** <date or timeframe>
- **Features:**
  - <feature-name-1>
  - <feature-name-2>
```

5. Each milestone is a `### <Milestone Name>` subheading.
6. Status values: `planned`, `active`, `completed`.
7. Milestones are listed in priority order (highest priority first).

After writing, confirm: "Updated product.md with N milestones."

---

## Step 7: Create or Update Epics on Issue Board

Sync milestones to the issue board as epics.

### Guard: Check tasks.backend

Before creating or updating epics, read `manifest.yaml` and check for `tasks.backend` configuration. If unconfigured, print:

> Issue board not configured (no `tasks.backend` in manifest). Skipping epic creation. Run `/adev:init` with task tracking to enable this.

And skip this step.

### Epic Sync Rules

For each milestone:

1. **Match by milestone field, not title.** Search existing epics where the `milestone` field matches the milestone name. Do not match by title — titles may have been edited.
2. **If an epic exists** with the matching milestone field: update its title, feature list, and status to match the current milestone definition. Use `updateEpic()`.
3. **If no epic exists** for the milestone: create a new epic with `createEpic({ title: "<Milestone Name>", milestone: "<Milestone Name>" })`. Include the feature list in the epic body.
4. **Idempotent:** Re-running this step must update existing epics, not create duplicates.

After syncing, report: "Created N new epics, updated M existing epics on issue board."

---

## Step 8: Constitution Amendment Proposals

If the vision implies new architectural constraints, quality requirements, or principles that are not already in the constitution, propose them as amendments.

### Rules

- **Never edit the constitution directly.** Amendments require human approval per Architecture Boundaries.
- Present proposed amendments as a clearly labeled section:

```
## Proposed Constitution Amendments

> ⚠ These amendments require human approval per Architecture Boundaries.

### Amendment 1: <Title>
- **Section:** <which constitution section to modify>
- **Current:** <quote current text, or "New addition">
- **Proposed:** <proposed new text>
- **Rationale:** <why the vision requires this>
```

- If no amendments are needed, skip this section silently.

---

## Step 9: Transition

After milestones are written and epics are synced, guide the user to the next steps.

1. **Charters to Create:** If any milestone features lack charters, list them and suggest:

> The following features need charters before they can be specified and planned:
> - <feature-name-1>
> - <feature-name-2>
>
> Use `/adev:brainstorm` to create a charter for each.

2. **Existing Charters Ready for Specs:** If any charters exist but lack specs, suggest `/adev:specify`.

3. **Roadmap:** If multiple milestones were defined, suggest:

> Use `/adev:roadmap` to analyze dependencies across milestones and produce an implementation roadmap.

---

## Key Principles

1. **One question at a time** — In interview mode, never ask more than one question per message. Wait for the user's response before continuing.
2. **Epic matching by milestone field** — Always match epics by the `milestone` field, never by title. Titles may be edited independently.
3. **Constitution amendments are proposals** — Never edit the constitution directly. All amendments must be explicitly labeled and require human approval.
4. **Idempotent execution** — Re-running the skill updates existing milestones and epics rather than creating duplicates.
5. **Preserve existing content** — When writing to product.md, only modify the `## Milestones` section. All other sections must be preserved unchanged.
6. **Ground in context** — Always read the constitution, existing charters, and product.md before proposing anything. The vision must be consistent with established project context.
7. **User approval before writing** — Never write milestones to product.md or create epics without explicit user approval of the proposed structure.
