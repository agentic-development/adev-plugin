---
name: adev:brainstorm
description: "Explore a feature idea interactively and produce a Feature Charter. Validates against constitution and existing charters. Use before building any new feature or module, when the user mentions a new capability, or says 'let us build X'. In Codex, invoke with $adev:brainstorm"
allowed-tools: [Read, Glob, Grep, Write, Agent]
---

# Brainstorm a Feature Charter

Turn a feature idea into a structured Feature Charter through collaborative dialogue. The charter defines WHAT a module does and its boundaries, grounded in the project constitution and existing specs. It does not define HOW the module is built (that is the job of Live Specs and implementation plans).

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, create any Live Spec, or take any implementation action until you have written the charter, passed the review loop, and the user has approved the final document. This applies to EVERY feature regardless of perceived simplicity.
</HARD-GATE>

### Dispatch Turn Discipline

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

**Always pass `run_in_background: false` on every `Agent({...})` dispatch in this skill.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context it does not re-invoke the caller, so a backgrounded dispatch stalls the pipeline (field-observed as steps that auto-background and never return a result).

---

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill brainstorm
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

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

Loads constitution, existing charters, and prior art before asking anything.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-1-explore-context.md` for the full instructions. Do not act on this section from the summary above.

## Step 2: Clarify

The interactive clarification round that precedes charter authoring.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-2-clarify.md` for the full instructions. Do not act on this section from the summary above.

## Step 3: Propose 2-3 Approaches

Once you understand the feature, propose 2-3 design approaches. For each:

1. **Name and summary** (1-2 sentences)
2. **How it works** (3-5 sentences)
3. **Trade-offs** (pros/cons list)
4. **Constitution compliance** — aligns, stretches, or violates? Quote the principle.
5. **Platform fit** — fits the tech stack? Requires new dependencies?

Lead with your recommended approach. Wait for user to choose before proceeding.

## Step 3b: Offer Prototype

Optional branch into /adev:prototype before specification.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-3b-offer-prototype.md` for the full instructions. Do not act on this section from the summary above.

## Step 4: Present Design Sections

For each H2 section in the loaded domain template, present the content and ask "Does this look right?" before moving to the next. Scale detail to complexity -- straightforward sections get 2-3 sentences, nuanced ones get detailed tables.

Use the template's section names and structure directly. Do not substitute or rename sections. The domain template is the single source of truth for which sections appear and what they are called.

After the user approves all sections, proceed to writing.

## Step 5: Write Charter

Renders the Feature Charter from the clarified answers.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-5-write-charter.md` for the full instructions. Do not act on this section from the summary above.

## Step 5b: Product.md Bootstrap

Runs only when the project has no Product Charter yet.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-5b-product-bootstrap.md` for the full instructions. Do not act on this section from the summary above.

## Step 6: Charter Review Loop

Dispatches the charter reviewer and applies its verdict, up to the retry ceiling.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-6-charter-review-loop.md` for the full instructions. Do not act on this section from the summary above.

## Step 7: User Reviews

After the review loop passes:

> Charter written and committed to `.context-index/specs/features/<module>/charter.md`. Please review it and let me know if you want any changes before we move to specification.

If changes requested: make them, re-run Step 6, ask for approval again. Only proceed once user explicitly approves.

**On user approval:** Update the charter frontmatter: set `status: approved`, increment `revision` by 1, and set `updated: <today's date YYYY-MM-DD>`.

## Step 8: Transition to Specification

Hands the approved charter to /adev:specify and states what the caller receives.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/brainstorm/references/steps/step-8-transition-to-spec.md` for the full instructions. Do not act on this section from the summary above.

## Key Principles

- **One question at a time.** Do not overwhelm with multiple questions in a single message.
- **Multiple choice preferred.** Easier to answer than open-ended when the options are known.
- **Constitution is law.** Every design decision is checked against constitutional principles. Conflicts are raised immediately.
- **YAGNI ruthlessly.** Remove capabilities the user did not ask for. A charter can always be extended later.
- **Charter, not code.** The charter defines WHAT, not HOW. No implementation details or code examples.
- **Incremental validation.** Present each section, get approval, then move on.
- **Existing work matters.** Always check existing charters, ADRs, and cross-cutting specs for conflicts.

## Next Step in the Lifecycle

Charter approved and written. The next step is **`/adev:specify`** — author Live Specs within this charter's scope.

If you arrived here via `/adev:work` (the front door), offer to continue automatically: *"Charter ready. Continue to `/adev:specify`?"* Otherwise, name this as the next step. The user can always stop here.
