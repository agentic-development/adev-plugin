---
name: adev:brainstorm
description: "Explore a feature idea interactively and produce a Feature Charter. Validates against constitution and existing charters. Use before building any new feature or module, when the user mentions a new capability, or says 'let us build X'."
allowed-tools: [Read, Glob, Grep, Write, Agent]
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
- `--no-bootstrap`: suppress product.md bootstrap even on first-charter scenarios (charter is written without product.md modifications)

## Prerequisites

This skill requires `.context-index/` to exist. If it does not, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to brainstorm.

Do not proceed without a constitution.

## Workspace Root Handling

Before starting Step 1, detect whether the skill is being invoked at a **workspace root** (a directory that contains a `workspace.yaml` or `.workspace/` configuration but is not itself one of the registered repos):

- **At workspace root, `.context-index/` exists:** Save the charter to the workspace-level `.context-index/specs/features/<module>/charter.md`. This is a workspace-level charter that applies across repos. All other steps proceed normally using this workspace context index.

- **At workspace root, `.context-index/` does not exist:** Do not proceed. Tell the user:

  > You are at the workspace root, but no workspace context index has been initialized.
  > Run `/adev:init --workspace` to set up the workspace-level context index, then come back to brainstorm.

- **Inside a registered repo (not workspace root):** Use existing single-repo behavior unchanged. The charter is saved to the repo's own `.context-index/specs/features/<module>/charter.md`.

**Detecting workspace root:** Check whether the current directory contains `workspace.yaml` (or `.workspace/config.yaml`) AND whether the current directory is NOT listed as a registered repo path within that config. If both conditions hold, treat the current location as workspace root.

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level planning, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

## Checklist

Complete these steps in order. Do not skip steps.

1. **Explore context** — load constitution, platform context, existing charters, ADRs, orientation
2. **Clarify** — ask questions one at a time to understand the feature idea
3. **Propose 2-3 approaches** — present options with trade-offs, validate against constitution
4. **Present design sections** — walk through each charter section, get approval per section
5. **Write charter** — save to `.context-index/specs/features/<module>/charter.md`
5b. **Product.md bootstrap** — bootstrap or update product.md (skipped with `--no-bootstrap` or `--module`)
6. **Charter review loop** — dispatch charter-reviewer subagent, fix issues, max 2 iterations
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

**Heuristics:** Load module-scoped heuristics for the target module.
Derive the module slug from the `--module <name>` argument if provided, or from the feature idea once identified.
If the module is new (no existing scope file in `.context-index/memory/heuristics/`), use `_global` only.
**Plugin root resolution:** Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Replace `<ADEV_ROOT>` with the resolved path.
Run inline Node.js:
```javascript
const { retrieveHeuristics, renderHeuristic } = await import('<ADEV_ROOT>/lib/heuristics.mjs');
const entries = await retrieveHeuristics(projectRoot, moduleSlug, { tier: 'summary' });
const rendered = entries.map(renderHeuristic).join('\n\n');
```
If the call fails or returns empty, proceed without heuristics — non-blocking.
When heuristics are present, prepend: "The following heuristics are lessons learned from past work
in this module. Use them as guidance, not as hard rules."

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
- Commit with message: `feat: add <module> feature charter`
- Suggest branch name: `feat/<module>/<short-description>`
- Then proceed to **Step 5b** below before starting the review loop.

## Step 5b: Product.md Bootstrap

> **Skip this step entirely if:** the user passed `--no-bootstrap`, OR if `--module <name>` was used (revision mode — no new charter is being created).

This step runs immediately after the charter is written (Step 5). It keeps `product.md` in sync with the growing set of charters.

### 5b-1: First Charter Detection

Glob `.context-index/specs/features/*/charter.md`. Count the results.

- **If this is the first charter** (count is 1 — only the charter just written exists): proceed to **5b-2: Bootstrap Flow**.
- **If other charters already exist** (count > 1) AND `.context-index/specs/product.md` exists: proceed to **5b-4: Module Map Append**.
- **If other charters already exist** AND `.context-index/specs/product.md` does NOT exist: treat as a first-vision opportunity — proceed to **5b-2: Bootstrap Flow**, and list all existing charters in the Module Map when writing product.md.

### 5b-2: Bootstrap Flow

**Check if `.context-index/specs/product.md` already exists.**

- If it exists: skip bootstrap entirely (product.md is preserved as-is). Go to **5b-4: Module Map Append**.
- If it does not exist: continue below.

**Ask ONE question to the user:**

> This is the first charter in the project. What is the product trying to do, in one sentence? (This becomes the product vision.)

Wait for the user's response. Do not ask any follow-up questions.

- If the user provides a sentence: use it as the Vision.
- If the user declines or provides no response: write product.md with an empty Vision section and add an advisory comment: `<!-- TODO: fill in product vision -->`.

### 5b-3: Write product.md

Read `.context-index/constitution.md` to extract the project name from its Identity section. Use that as `<project name>`.

Write the following to `.context-index/specs/product.md`:

```markdown
# Product Vision: <project name>

## Vision

<user's one-sentence response, or empty with TODO comment>

## Module Map

| Module | Description | Charter |
|--------|-------------|---------|
| <module-slug> | <one-line Business Intent from the charter just written> | [charter.md](./features/<module-slug>/charter.md) |
```

If other charters already existed (edge case from 5b-1), add a row for each existing charter as well. Extract their one-line Business Intent from each charter file.

After writing, print:

> Bootstrapped product.md from your one-sentence vision. Run /adev:plan --milestone <name> later to define milestones, or update product.md directly.

### 5b-3a: Workspace-Mode Adjustments

> **This subsection applies only when Step 5b is executing in workspace mode** (as detected by `detectWorkspace` — see Workspace Root Handling). In repo mode (existing behaviour), all paths and prompts remain unchanged.

#### 1. Mode Branching

When invoked at a workspace root, Step 5b's globbing path for first-charter detection becomes:

```
<workspaceRoot>/.context-index/specs/features/*/charter.md
```

And the write path for product.md becomes `resolveWorkspaceProductPath(workspaceRoot)` (from `lib/workspace.mjs`). In repo mode, paths remain unchanged.

#### 2. Project Name Resolution

In workspace mode, the project name for the `product.md` title is resolved as follows:

- Prefer `workspace.name` from `adev-workspace.yaml`
- Fall back to the workspace root directory basename (directory name)

**No workspace-level `constitution.md` is required** (unlike repo mode, which reads the constitution for the project name).

#### 3. Augmented Vision Prompt

> **Supersession note:** This workspace-mode prompt supersedes the single-question contract from `@design/brainstorm-product-bootstrap` Behavior 3 when in workspace mode. The prompt remains a single question; only its preface changes.

When bootstrapping at a workspace root for the first time, ask this ONE question:

```
This is the first workspace-level charter. The workspace '<name>' currently
coordinates <N> repos:
  - <slug>: <identity one-liner>
  - ...
What is the workspace trying to do, in one sentence? (This becomes the
workspace product vision.)
```

Replace `<name>` with the resolved workspace name, `<N>` with the count of registered repos, and each `<slug>: <identity one-liner>` with the repo's slug and its extracted identity (see rule 4 below).

#### 4. Identity Extraction Rule per Registered Repo

Apply in order, stopping at the first success:

1. First sentence of the `## Identity` section of the repo's `.context-index/constitution.md`
2. If no `## Identity` section exists, use the first sentence of the constitution body (text after frontmatter and title)
3. If the file is absent or empty, use the literal string `no constitution`

#### 5. Sanitisation

Before including an identity one-liner in the prompt, call `sanitizeIdentityOneLiner(raw)` from `lib/workspace.mjs`. This function strips control characters (`\x00-\x1F`, `\x7F`) and ANSI CSI sequences, and truncates to 200 UTF-8 characters with an ellipsis on overflow.

#### 6. Missing Repo Path Handling

If `detectWorkspace` flagged `missing: true` for a repo, OR if `assertPathInWorkspace(workspaceRoot, repoPath)` threw `PATH_ESCAPE`, skip that repo silently. All other repos continue to be processed.

#### 7. Module Map in Workspace Mode

In workspace mode, the Module Map table contains **workspace-charter rows only** — per-repo charters are NOT mixed in. Each repo retains its own `product.md` with its own Module Map. The workspace `product.md` tracks only workspace-level charters.

#### 8. `--no-bootstrap` in Workspace Mode

The `--no-bootstrap` flag suppresses Step 5b at the workspace root identically to single-repo mode — no product.md is written and no question is asked.

### 5b-4: Module Map Append

**When `product.md` exists,** append a row for the new module to the Module Map section after writing the charter.

**Idempotency rule:** Before appending, scan the Module Map table for an existing row whose first cell matches `<module-slug>`. If found, update the description in that row in place. Do NOT add a duplicate row.

**If `product.md` has no `## Module Map` section:**

- Create the section. Insert it just before `## Milestones` if that section exists, or at the end of the file if Milestones is absent.
- Add the table header and the new row.
- Inform the user: `"Created Module Map section in product.md."`

**If `product.md` exists but the Module Map table cannot be parsed** (e.g., the file is malformed or uses a non-standard format): skip the append and warn the user:

> product.md exists but Module Map cannot be parsed; please update manually.

**Row format:**

```
| <module-slug> | <one-line Business Intent from the charter> | [charter.md](./features/<module-slug>/charter.md) |
```

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
- **After 2 iterations without approval:** Present remaining issues to user. Ask: fix together, accept as-is, or abandon.

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
