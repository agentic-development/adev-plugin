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
- `--kind <kind>`: one of `CHARTER_KINDS` (`module`, `feature`, `cross-cutting`, `initiative`). If omitted, the skill presents the ask-first menu in Step 2 (Clarify). Strict-on-write: missing or invalid values trigger a re-prompt — there is no silent defaulting on write. Read-time defaulting (`feature`) applies only to legacy charters that pre-date this taxonomy.

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
3b. **Offer prototype** — after user selects approach, offer `/adev:prototype` before detailed design
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

**Heuristics:** Load module-scoped heuristics for the target module via the CLI:

```bash
adev heuristics retrieve --module <module-slug> --tier summary --format text
```

Derive the module slug from the `--module <name>` argument if provided, or from the feature idea once identified.
If the module is new (no existing scope file in `.context-index/memory/heuristics/`), use `_global`.
Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — failures degrade to an empty/`__NONE__` result so heuristic injection stays non-blocking.

When heuristics are present (output is not `__NONE__`), prepend the advisory preamble: "The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules."

**Domain-Aware Charter Template:** After loading context, resolve the active domain via the CLI:

```bash
adev domain resolve --module <module-slug> [--charter <charter-path>]
```

The verb resolves the active domain (charter frontmatter → manifest.modules[].domain → manifest.project.domain → 'software'). Stdout is a single JSON object whose `resolved_domain` field is passed to `resolveTemplate('charter', kind, resolved_domain)` in Step 5. The full template is loaded in Step 5 once the kind is also known (resolved in Step 2.1); Step 1 only resolves the domain so subsequent steps can pass it through.

The final section structure is determined by the kind-resolved template in Step 5. Use the template's H2 headings as the section names for this charter. Do not use hardcoded section names — the resolved template is the single source of truth for section structure.
If the template includes a Quality Attributes section, present domain-specific quality attribute suggestions to the user (e.g., data-engineering suggests freshness, completeness, accuracy; software suggests latency, throughput, availability).

## Step 2: Clarify

Ask questions one at a time. Prefer multiple-choice when possible. Do not ask more than one question per message.

**Assessment before questions:** If the idea spans multiple independent subsystems, flag immediately and help decompose into separate modules. Proceed with one at a time.

### Step 2.1: Resolve Charter Kind

Determine the charter `kind:` before approach selection. The kind shapes which subsequent clarifying questions get asked — for example, a `kind: cross-cutting` charter does not need Domain Model questions, and a `kind: module` charter cross-references `manifest.yaml`. The resolved kind is also passed to `resolveTemplate('charter', kind, domain)` in Step 5 to pick the correct charter template.

**If `--kind <value>` was supplied on invocation:**

```javascript
import { isValidKind } from '<ADEV_ROOT>/lib/kinds.mjs';

if (!isValidKind('charter', kind)) {
  // Reject with the closed-enumeration list and stop.
  // Message must list the 4 valid kinds so the user can correct their invocation:
  //   "Invalid --kind 'xxx'. Valid options: module, feature, cross-cutting, initiative."
}
```

If `isValidKind('charter', kind)` returns `false`, reject the invocation with a message naming the 4 valid options and halt. Do not proceed to charter authoring.

**If `--kind` was NOT supplied:** present the ask-first menu and have the user pick:

```
What kind of charter is this?

  1. feature (default) — discrete capability with full domain model
  2. module — lifecycle-slot module registered in manifest.yaml (skill registry shape)
  3. cross-cutting — concern affecting multiple modules (lives in specs/cross-cutting/)
  4. initiative — time-bounded effort (migration, theme, release-bound work)

→ Pick a number or name (default: feature)
```

**Strict-on-write semantics.** The kind axis is required at write time. If the user presses enter without picking a value, re-prompt with:

```
Kind is required for new charters. Pick a number or name.
```

Continue re-prompting until a valid kind is supplied. **No defaulting on write** — there is no silent defaulting at write time; the chosen value is written verbatim to frontmatter. (Read-time defaulting to `feature` applies only to legacy charters authored before this taxonomy landed; new charters must carry an explicit `kind:`.)

**Kind-aware question routing.** Once the kind is resolved, adapt the rest of Step 2's clarifying questions accordingly:

- `kind: feature` — full domain model: Business Intent, Scope, Domain Model, Capability Map, Interfaces, Quality Attributes
- `kind: module` — lifecycle-slot shape: Identity, Scope, Slots/Hooks, Configuration (no Domain Model). Validate the user-supplied module slug against `manifest.yaml:modules[]` — see Step 5 for the manifest cross-reference warning
- `kind: cross-cutting` — concern shape: Business Intent, Affected Modules, Cross-Cutting Behavior, Constraints (no Domain Model, no Capability Map — the charter template's H2 section list determines the actual section structure)
- `kind: initiative` — time-bounded effort: Objective, Phases/Milestones, Success Criteria, Exit Conditions

The exact section names always come from the resolved charter template (loaded in Step 5 via `resolveTemplate('charter', kind, domain)`). Use the template's H2 headings as the source of truth — do not invent section names.

After resolution, the `kind` variable is available for Step 5's `resolveTemplate('charter', kind, domain)` call and for the path-policy branch (cross-cutting save-path).

### Step 2.2: Other Clarifying Questions

**Questions to answer (adapt to the idea, not mechanical):**
Ask questions to fill each section defined in the loaded domain template. Map each question to the corresponding H2 section in the template. For the default software domain, this typically covers Business Intent, Scope and Boundaries, Domain Model, Capability Map, Interface Contracts, and Quality Attributes -- but always use the template's actual section names rather than hardcoded defaults.
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

## Step 3b: Offer Prototype

After the user selects an approach, offer the option to prototype before proceeding to detailed design:

> Would you like to prototype the selected approach before proceeding to detailed design? This lets you see a working sketch before committing to charter sections. (yes / no)

If the user declines, proceed to Step 4.

If the user opts in, dispatch `/adev:prototype` with the following structured context:

```
BRAINSTORM_CONTEXT:
  module: <module-slug>
  approach_summary: <selected approach description from Step 3>
  platform_context: <parsed contents of platform-context.yaml>
  constitution_constraints: <relevant constitutional principles identified during brainstorm, or []>
```

Where:
- `module` (string, required) — the charter module slug (kebab-case, matches directory name under `specs/features/`)
- `approach_summary` (string, required) — the full description of the approach the user selected in Step 3
- `platform_context` (object, required) — the parsed contents of `platform-context.yaml` (the actual object, not a file path or raw YAML string)
- `constitution_constraints` (array of strings, optional, defaults to `[]`) — any constitutional principles that were flagged during the brainstorm clarification phase as relevant constraints for this feature

When brainstorm context is provided, prototype skips its own charter lookup and proceeds directly to tier selection.

**Handling the prototype return result:**

After `/adev:prototype` completes, it returns a `PROTOTYPE_RESULT` with:
- `status`: `"completed"` or `"discarded"`
- `tier`: the prototype tier used (`"wireframe"`, `"mockup"`, or `"functional"`)
- `visual_references`: array of `{ path, description }` for any captured images
- `heuristics_saved`: count of design decisions saved as heuristics
- `persistence`: `"project"` (files kept) or `"ephemeral"` (temp files removed)

Present a summary of the prototype session to the user:

> **Prototype session complete.**
> - Status: `<status>`
> - Tier: `<tier>`
> - Visual references: `<count>` captured
> - Heuristics saved: `<count>`
> - Persistence: `<persistence>`

Then continue to Step 4 (Present Design Sections) with the enriched context from prototyping. The prototype experience should inform the design sections — for example, visual references can guide Quality Attributes, and design decisions captured as heuristics can refine the Domain Model or Capability Map.

## Step 4: Present Design Sections

For each H2 section in the loaded domain template, present the content and ask "Does this look right?" before moving to the next. Scale detail to complexity -- straightforward sections get 2-3 sentences, nuanced ones get detailed tables.

Use the template's section names and structure directly. Do not substitute or rename sections. The domain template is the single source of truth for which sections appear and what they are called.

After the user approves all sections, proceed to writing.

## Step 5: Write Charter

Generate the charter file using the kind-resolved template from `resolveTemplate('charter', kind, domain)`. **Do not hardcode a template filename.** Use the kind value resolved in Step 2.1 and the active domain from `resolveDomain(...)` (loaded in Step 1):

```javascript
import { resolveTemplate } from '<ADEV_ROOT>/lib/template-resolution.mjs';
import { readFileSync } from 'node:fs';

const templatePath = await resolveTemplate('charter', kind, domain.resolved_domain ?? null);
const templateBody = readFileSync(templatePath, 'utf8');
```

**Error handling:**
- If `resolveTemplate` throws `TEMPLATE_NOT_FOUND`: fail with a diagnostic listing the attempted paths (the error's `attempted` array). Suggest checking that the bundled `templates/charter-template.<kind>.md` exists or that the domain extension provides the matching override.
- If `resolveTemplate` throws `UNSAFE_TEMPLATE_PATH`: fail with the offending path (the error's `offendingPath` field). Report verbatim — do not silently fall back.
- If `resolveTemplate` throws `INVALID_KIND` or `INVALID_LAYER`: re-run Step 2.1 (kind resolution); this indicates the kind value was corrupted between resolution and write.

**File path policy (branch on kind):**

- `kind: feature`, `kind: module`, `kind: initiative` → save to `.context-index/specs/features/<module>/charter.md` (lowercase, hyphenated slug).
- `kind: cross-cutting` → save to `.context-index/specs/cross-cutting/<module>/charter.md`. This is a **different parent directory** by design — cross-cutting charters describe concerns that span multiple modules and live alongside other cross-cutting artifacts.

**Cross-cutting directory bootstrap.** When `kind: cross-cutting` and the parent `.context-index/specs/cross-cutting/` directory does not yet exist on disk, prompt the user before creating it:

> The directory `.context-index/specs/cross-cutting/` does not exist yet. This will establish the conventional location for cross-cutting charters in this project. Create it now? (yes / no)

If the user declines, halt and ask whether to abandon the charter or re-select the kind. Do not silently create the directory.

**Manifest cross-reference warning (kind: module).** When `kind: module`, cross-reference the user-supplied module slug against `manifest.yaml:modules[]`. If no entry matches the slug, emit a non-blocking warning and proceed:

> Module charters typically correspond to a manifest entry. Add to manifest.yaml after this charter lands.

The warning is informational; it does NOT block charter creation. Do not auto-update `manifest.yaml` — that is the user's decision.

**Before writing:** Create the destination directory if needed (subject to the cross-cutting prompt above). If charter exists (`--module`), read and merge rather than overwrite.

**Writing:** Fill all sections from Step 4 using the section structure of the resolved template, replace placeholders, remove HTML comments, no TODOs/TBDs.

**Lifecycle frontmatter:** Set the following fields in the charter's YAML frontmatter:
- `kind: <chosen value>` — **explicit, no defaulting on write.** Write the value resolved in Step 2.1 verbatim. Charters authored after Layer 1 of the lifecycle-artifacts taxonomy must carry an explicit `kind:` field; read-time defaulting to `feature` applies only to legacy charters.
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

Once approved, transition to Live Spec authoring. Before listing capabilities,
render a **Spec Organization Plan** so the downstream `/adev:specify` calls have
a deterministic starting grouping. The plan is advisory — the user may always
override it.

### 8.1 Charter-size routing

Count the **must-have** capabilities from the approved charter and route:

- **0 must-have capabilities** — skip the grouping plan entirely. Render only:
  > No must-have capabilities yet — extend the charter or proceed to `/adev:specify` directly.
- **exactly 1 must-have capability** — skip the grouping table. Render the
  single-capability prompt below (preserved from the prior Step 8 wording).
- **≥2 and ≤12 must-have capabilities** — render the full Spec Organization
  Plan (grouping table + optional ASCII dependency graph).
- **>12 must-have capabilities** — render the table for the top 12 by
  Priority/Milestone and append the note:
  > Charter has N capabilities; grouping shown for top 12. Consider splitting the charter.

### 8.2 Grouping heuristics (inline definitions)

Each row of the grouping table cites exactly **one** of these three named
heuristics. Their definitions are pinned here verbatim so the rendering stays
reproducible across model runs:

- **cohesion** — capabilities sharing an invariant (e.g., a multi-file
  version-parity rule) belong together.
- **dependency-chain** — capability X consumes capability Y → both in one spec
  unless Y is reused by other specs.
- **blast-radius** — capabilities that touch the same module/file cluster
  belong together; capabilities that touch independent surfaces should split.

**Heuristic conflict rule.** When two heuristics disagree on the same
capability pair, prefer the more conservative grouping (separate specs) and
emit a note such as:

> ambiguous: `<cap-1>` and `<cap-2>` — cohesion suggests together, blast-radius suggests apart.

### 8.3 Capability grouping table

Render the table:

```
| Spec | Capabilities | Rationale |
|---|---|---|
| <spec-slug> | <cap-1>, <cap-2> | <one of: cohesion / dependency-chain / blast-radius> reason |
```

Every rationale cell MUST cite exactly one of the three heuristic names above.
If a row touches multiple heuristics, pick the dominant one and note the
runner-up in prose ("also: <name>") rather than listing two names.

### 8.4 ASCII dependency graph (conditional)

When two or more grouped specs have ordering dependencies, render an inline
ASCII diagram immediately after the table:

```
spec-A  ┐
        ├─→ spec-B ─→ spec-C
spec-D ─┘
```

When all grouped specs are independent, **omit the graph entirely** — do not
render an empty diagram or a placeholder.

### 8.5 Retained capability list and dual-path handoff

After the Spec Organization Plan, retain the existing top-priority capability
list and offer the user two paths:

> The charter for **<module>** is complete. The next step is to create Live Specs.
>
> Top-priority capabilities from the charter:
> 1. [capability-1] (must-have)
> 2. [capability-2] (must-have)
> 3. [capability-3] (should-have)
>
> Two paths:
>
> - **Specify one group** — invoke `/adev:specify` to write one spec covering N
>   capabilities, using the proposed grouping.
> - **Specify one capability** — invoke `/adev:specify` for a single capability,
>   overriding the grouping for that one spec.

### 8.6 Override stickiness

When the user picks **Specify one capability** (overriding the group), do not re-render the grouping table on subsequent turns of the same session. The override is a per-session decision; treat the remaining capabilities as a flat backlog from that point on.

### 8.7 No new files

Step 8 is a chat-only enrichment. **No new files are written by Step 8.**
Output is durable only via the user's subsequent `/adev:specify` calls; the
charter is not edited here.

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
