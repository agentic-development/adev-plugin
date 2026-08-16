---
name: adev:plan
description: "Decompose reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing. Use to break specs into actionable tasks."
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

## Output Directive: Artifact-to-Disk Summarization

**CRITICAL:** When producing the plan document, follow this two-step pattern:

1. **Write** the full plan to disk using the Write tool (same as today — full content at the plan file path)
2. **Present** ONLY a structured summary to the user. Do NOT echo the full plan content in your response.

**Summary format (max ~500 tokens):**

```
Plan saved to <path>.

<N> tasks covering <M> acceptance criteria.
<S> specialist-routed tasks.

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 1 | <title> | <N> create, <N> modify | — |
| ... | ... | ... | ... |

Quality gates: <command>
Next: /adev:implement --plan <path>
```

**What NOT to include in the chat response:**
- Full task bodies (TDD steps, code snippets, test stubs)
- Full file structure section
- Full context packets section
- Plan review dispatch details (just report the verdict)
- Heuristics section content

These are all written to disk and available via `Read <plan-path>`. The user or next skill reads from disk, not from conversation history.

## Arguments

- `--spec <path>`: plan a specific spec (routes to Spec Mode)
- `--feature <module>`: plan a feature charter (routes to Feature Mode)
- `--release <name>`: plan a named release (routes to Release Mode)
- `--milestone <name>`: create or update a milestone (routes to Milestone Mode)
- `--epic <id>`: decompose an Epic into Features (routes to Epic Mode)
- `--phase <name>`: plan all specs matching a phase/milestone across all modules (e.g., `--phase v1`)
- `--dry-run`: show the plan structure without writing it

Passing more than one of `--spec`, `--feature`, `--release`, `--milestone`, `--epic` in a single invocation throws **CONFLICTING_FLAGS** and the skill exits without action.

## Step 0: Mode Detection

Determine the operating mode first. Explicit flag beats keyword detection, which beats project-state inference, which falls back to a menu.

1. **Explicit flag (highest priority):** enter that mode immediately, skipping keyword and state detection. Two or more mode flags → `CONFLICTING_FLAGS`, exit.
2. **Path argument:** a lone `.md` argument resembling a Live Spec path routes to **Spec Mode** with that path as `--spec`.
3. **Keyword detection:** scan free text and extract the name from the rest — "release"/"launch" → **Release Mode** ("plan release v2" → `name: "v2"`), "milestone"/"phase" → **Milestone Mode**, "feature"/"module" → **Feature Mode**, "epic" → **Epic Mode**.
4. **Project-state scan (no flag, no argument):** exactly one reviewed spec (passing `*.review.md`) lacking a `*.plan.md` → propose **Spec Mode**; several → the menu, listing all pending specs plus other modes; none → a charter with unspecced capabilities → propose **Feature Mode**.
5. **Ambiguity fallback:** present the numbered menu (Spec / Feature / Release / Milestone / Epic) and await selection. If the user dismisses it without selecting, exit without action.

| Mode | Entry Condition | What it produces |
|------|----------------|-----------------|
| Spec | `--spec` / `.md` path / single reviewed spec lacking plan | Ordered Task list in a `*.plan.md` file |
| Feature | `--feature <module>` / "feature" keyword | Feature work items under an Epic |
| Release | `--release <name>` / "release" keyword | Sequenced release plan + child Epics |
| Milestone | `--milestone <name>` / "milestone" keyword | Milestone Epic + Feature placeholders |
| Epic | `--epic <id>` / "epic" keyword | Missing Feature proposals under an Epic |

## Repo-Mode-Inside-Workspace Advisory

When invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` set), behaviour stays repo-scoped. Additionally print this advisory to **stdout** (same channel as other skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level planning, cd to <workspace-root> and re-run.)
```

Non-blocking, and absent when `detectWorkspace` returns `null`.

## Phase Planning Mode (`--phase`)

`--phase <name>` switches from single-spec to multi-spec phase planning.

**Workspace dependency ordering.** Inside a workspace (a `workspace.yaml` or `.workspace/` config at an ancestor directory, or a `workspace` key in `manifest.yaml`): detect whether the current repo is registered — if not, fall back to unchanged single-repo behavior. Load the dependency graph (`workspace.yaml` `dependencies` or `.workspace/deps.json`), where `from: <repo> → to: <repo>` means `from` depends on `to`. Sort repos topologically upstream-first (Kahn or depth-first) so upstream specs are planned before dependent repos — if `api` depends on `core`, plan `core` first. On a cycle, warn `circular dependency detected among workspace repos: <A> → <B> → <A>. Falling back to declaration order.` and use the workspace config's declaration order. A single-repo workspace skips all workspace logic.

Then, for the phase:

1. **Scan all specs** under `.context-index/specs/features/` (excluding `charter.md`, `*.plan.md`, `*.review.md`) and parse frontmatter for `milestone`.
2. **Filter by phase** — specs whose `milestone` matches `<name>` case-insensitively.
3. **Report matching specs** before planning, each with its status, flagging drafts, then ask: `Proceed with planning all review-passed specs? (yes / include drafts / select)`
4. **Warn on non-reviewed specs.** Specs below `review-passed` are included only if the user confirms.
5. **Ordering:** within a charter, follow the Capability Map sequence; across charters, resolve from each spec's preconditions and consumed APIs; with no dependency information, group by charter.
6. **Output:** run Steps 1-7 per qualifying spec, saving each plan adjacent to its spec, then emit a phase summary listing plans created with task counts, specs skipped as already implemented, and warnings.

Without `--phase`, behavior is unchanged (single spec planning via `--spec`).

---

## Spec Mode

Steps 1–7 apply in **Spec Mode**, the original single-spec flow, preserved unchanged. Other modes use their own sections.

**Error code — REVIEW_GATE:** the spec is unreviewed, the verdict is BLOCK, or the spec drifted since review. Block with a clear message telling the user to run `/adev:review-specs`.

## Step 1: Review Gate

1. Identify the spec path from `--spec`, otherwise ask the user which spec to plan.
2. Look for the adjacent `.review.md` (same directory, same base name — `card-ordering.md` expects `card-ordering.review.md`). Missing → **block**: "This spec has not been reviewed yet. Run /adev:review-specs --spec <path> before planning."
3. Read the review file and extract the `Verdict`. `BLOCK` → **block**, naming the review report path and telling the user to resolve the blockers, revise with `/adev:specify`, and re-review with `/adev:review-specs`.
4. If the spec is newer than the review file → **block**: "The spec has been modified since its last review. Run /adev:review-specs --spec <path> to re-review the updated spec."
5. **Code-Side Drift Check (CODE_DRIFT gate).** Before spec-side drift, call `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs`:
   - `true` → **block**:
     ```
     CODE_DRIFT: Spec "<name>" has drift_detected: true. Source file <drift_source>
     was modified since last validation. Run /adev:validate or update the spec
     before planning new work.
     ```
   - `false` → also run `verifyManifest(manifest, projectRoot)` from `<ADEV_ROOT>/lib/source-manifest.mjs` as a fallback, which catches drift on non-Claude-Code hosts where the hook never fired. No match → block with the CODE_DRIFT message. Missing files → block `CODE_DRIFT_VERIFY_ERROR: Cannot verify source manifest for spec "<name>" — <N> files missing. Run /adev:hygiene to diagnose, or /adev:implement to re-stamp the manifest.`
   - throws on malformed frontmatter → **block** (fail-closed) with `CODE_DRIFT_READ_ERROR: Cannot read drift status for spec "<name>" — frontmatter may be malformed. Fix the spec frontmatter before planning.`
6. **Dual drift check** for spec changes that bypassed review:
   - **Revision drift:** the spec's `revision` frontmatter greater than the review's `last-reviewed-revision` → block, naming both revisions and directing the user to re-review.
   - **File hash drift:** `git hash-object <spec-file-path>` differing from the review's `file-sha` → block on the hash mismatch and direct the user to re-review.
   - Legacy reviews lacking both fields fall back to the modification-time check in step 4.
7. `PASS` or `PASS_WITH_NOTES` → proceed. For `PASS_WITH_NOTES`, print the warnings for awareness but do not block.

**Workspace-aware target-repo detection.** After the gate and before loading context, parse the spec frontmatter for `target-repo:`:

- **Present AND `detectWorkspace(cwd)` non-null** → enter workspace-aware Spec Mode; Steps 2-7 follow the workspace-aware branches below.
- **Present but no workspace (NO_WORKSPACE fallback)** → warn (`spec declares target-repo: '<value>' but no workspace detected. Falling back to single-repo flow.`) and use the single-repo flow. `target-repo` is only meaningful inside a workspace, so this keeps the skill functional for users who copy workspace specs into standalone repos.
- **Validate** the value against the workspace registry with `validateModuleName()` from `lib/workspace.mjs`. On failure block: `INVALID_TARGET_REPO: target-repo '<value>' is not a valid repo slug in the workspace registry. Valid slugs: <list>.`

## Step 2: Load Context

**Essential context (load now)** — required for every planning decision:

1. **Constitution** (`.context-index/constitution.md`) — non-negotiable principles, architecture boundaries, quality gate commands, coding standards.
2. **Platform context** (`.context-index/platform-context.yaml`) — tech stack, framework versions, deployment targets.
3. **Parent charter** (`.context-index/specs/features/<module>/charter.md`) — the capability map. Every task must trace to a capability listed here.
4. **The spec** — behavioral contract, acceptance criteria, and actionable task map if present.
5. **Review report** — the `.review.md`. Note `PASS_WITH_NOTES` warnings; the plan should address or acknowledge them.

**Workspace-aware target-repo context loading.** In workspace-aware Spec Mode, load the target repo's constitution, platform-context (which determines its tech stack for task structure), and orientation (module placement and import patterns) from `<target-repo-path>/.context-index/`. If that directory is missing, proceed without it and note the gap in the plan header. When `target-repo` is literally `workspace`, the spec targets the workspace root: load the workspace-level context instead, as there is no repo-specific constitution.

**Workspace-aware cross-repo depends-on resolution.** Parse the spec's `depends-on` frontmatter for `@<repo-slug>/<spec-slug>` entries, resolve each via `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs` to get the absolute path in the sibling repo, and add each resolved spec to the Context Packets so subagents can read the dependency's behavioral contract. Unresolvable refs produce a warning (repo not registered, or spec file missing) but do not block.

**Reference context (load when a task needs it)**, not upfront:

6. **Orientation** (`architecture.md`) — for file structure, module placement, import patterns.
7. **ADRs** — only those referenced in the spec or charter; cite specific ADRs in the tasks where they apply.
8. **External references** (`references/**/*.md`) — only if the spec references external contracts or interfaces.
9. **Cross-cutting specs** — only those the spec depends on, per its frontmatter or behavioral contract.
10. **Samples** (`.context-index/samples/`) — when writing context packets; reference relevant golden samples in task guidance.
11. **Boundary rules** (`governance/boundaries.yaml`) — if the directory exists, as additional planning constraints.
12. **Heuristics** — module-scoped, keyed on the spec's `charter:` slug, via `retrieveHeuristics` and `renderHeuristic` from `<ADEV_ROOT>/lib/heuristics.mjs` (derive `<ADEV_ROOT>` from this skill file's base directory by stripping the `skills/<name>/` suffix), passing the module slug and `heuristics.injection_limit` from manifest.yaml if configured. Injection is non-blocking — on failure or empty result, proceed without them. Store the rendered output for Step 5.

## Step 3: Constitution Validation

Before writing tasks, check each acceptance criterion against the constitution's "Architecture Boundaries". If a criterion would require new services, auth flow changes, new dependencies, or another stated boundary crossing, flag it and ask: `Proceed with this in the plan? (yes, the user has approved / no, flag it as blocked)`. On confirmation, include the task marked `### Task N: [Title] [REQUIRES HUMAN APPROVAL]`.

Check each planned file path against `governance/boundaries.yaml`: `severity: error` is a blocker that must be resolved before planning proceeds; `severity: warning` proceeds with caution; tasks spanning multiple boundary patterns are noted as "cross-boundary operation".

## Step 4: Specialist Routing

Read `manifest.yaml`'s `specialists` section. Per task, match the files it touches against each specialist's `trigger_patterns` and its description keywords against `trigger_keywords`, scoring 2 points per pattern match (plus depth bonus) and 1 per keyword match. Tag the highest scorer, or `[specialist: none]` when nothing matches, noting secondary matches as a comment. These tags tell `/adev:implement` which subagent to dispatch.

## Step 5: Write the Plan

**Plan location.** Adjacent to the spec: `.context-index/specs/features/<module>/<task>.md` → `<task>.plan.md`; cross-cutting specs follow the same rule in `.context-index/specs/cross-cutting/`. In workspace-aware Spec Mode the plan is saved in the workspace `.context-index/`, not the target repo's, keeping workspace-level planning artifacts co-located with the specs that produced them.

**Plan document header.** Every plan opens with `# Implementation Plan: <Feature Name>`, then a blockquote carrying Methodology (adev), Charter path, Spec path, Review (`<PASS|PASS_WITH_NOTES>` plus date), and Platform (framework, version, language, key deps); then **Goal** (one sentence on what this builds) and **Architecture** (2-3 sentences on the approach, referencing orientation and ADRs where relevant).

**Scope check.** If the spec covers multiple independent subsystems that could be built and tested separately, suggest splitting into separate plans. Each plan should produce working, testable software on its own.

**File Structure section.** Before defining tasks, map every file under three headings — `**Create:**`, `**Modify:**` (with line ranges, e.g. `src/app/layout.tsx:15-20`), and `**Reference (read, do not modify):**` — annotating each entry with its purpose. Design units with clear boundaries, prefer smaller focused files, and follow existing codebase patterns; if the codebase uses large files, do not unilaterally restructure.

*Workspace-aware repo-relative paths:* when target-repo is a repo slug, prefix every path with the repo's path relative to the workspace root (`<repo-slug>/src/module.ts`) so paths are unambiguous across repos; when it is `workspace`, paths are workspace-relative. Commit scope carries the slug — `feat(<target-repo-slug>/<module>): ...`, or the workspace name for workspace-scoped specs — and branches follow `feat/<target-repo-slug>/<short-description>`.

**Context Packets section.** After the file structure and before individual tasks, include one packet per task listing the spec (with the criteria it covers), charter (with capability), samples, ADRs, cross-cutting specs, boundary rules affecting the task's files, and the heuristics count and IDs for the module. Each entry names the specific file AND the relevant section or criteria within it. `/adev:implement` assembles these packets before dispatching subagents and logs them to `.context-index/packets/` (gitignored) for debugging failed tasks; `/adev:recover` reads them to diagnose root causes.

**Heuristics section.** If heuristics loaded in Step 2, add `## Heuristics` after Context Packets and before Parallelization, prefaced by a note that the block is a snapshot taken at plan generation for review convenience and that `/adev:implement` reads the live heuristic store at execution time. If none are available, omit the section entirely.

**Parallelization hints.** Annotate which tasks can run in parallel (no shared file dependencies), grouping them so tasks within a group run sequentially and groups run concurrently. Informational for `/adev:implement --parallel` (future).

**Task Summary table.** After Parallelization, emit `## Task Summary` — the first thing users and `/adev:implement` see before the detailed task sections:

```markdown
| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | ADR for dotenvx dependency | small | unit | — | 2 create, 1 modify |
| 3 | dotenvx env file loading | medium | unit | Task 2 | 0 create, 2 modify |
```

Complexity is small/medium/large from the spec's Actionable Task Map or inferred from file count and description; Depends On comes from the `Depends on:` annotation or `—`; Files counts creates and modifies. This table is always emitted, regardless of project complexity or strategy configuration.

**Strategy assignment.** Resolve each task's test strategy using the priority chain in `lib/test-strategies/assignment.mjs`: spec frontmatter `test_strategy` (spec-declared, high confidence) → a `manifest.yaml` `test_strategies` entry whose globs match the task's files (manifest, high) → auto-detection from file paths via `lib/test-strategies/detection.mjs` (detected, heuristic confidence) → default `unit` (fallback, high). Record strategy, source, and confidence in each task's metadata. If any task is non-unit, append a **Strategy Summary** table of strategy, task count, and source, flagging low-confidence assignments for verification before proceeding. Omit the section entirely when every task resolves to `unit` (backward compatible — no noise for projects not using test strategies).

**Test Infrastructure Requirements section.** Emit after the Strategy Summary (or in its place) when either the spec frontmatter contains `infra_requirements:` (regardless of strategy) or one or more tasks are non-unit. When all tasks are `unit` AND the spec declares nothing, skip it entirely.

Derivation: read `infra_requirements:` from spec frontmatter — **if present, use as authoritative and skip auto-detection**. Otherwise auto-detect from task file paths with file-globbing heuristics (files under `src/adapters/aws/` → AWS credentials likely needed; paths matching `**/s3-client.*` → AWS S3 credentials likely needed), using globbing only, with no import scanning or content parsing. Then deduplicate requirements across tasks, grouped by external system. Low confidence gets the advisory "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding"; `infra_requirements: unknown` emits `PLAN_INFRA_UNKNOWN` for all tasks in the spec.

The section carries: **External Systems** (system, required by, strategy), **Credentials / Environment Variables** (variable, required for, where to get it), **Pre-Provisioned State** (a checklist), **CI Configuration** (these tests are excluded from the default `npm test` run; give the `npm run test:integration` invocation), and **Unresolved Requirements** (task, issue, action required). It opens with the warning that requirements must be satisfied before integration tests run, that tasks lacking them produce setup errors rather than test failures, and that you must **never record actual credential values in plan output or spec files — env var names only**. Local runs use a `.env.test` that MUST be gitignored; CI injects credentials as secrets, never hardcoded in workflow files.

**Non-blocking:** the plan does NOT block on unresolved infra requirements. It completes the task list and surfaces unresolved items for human review before `/adev:implement`. When the section is emitted, extend the Strategy Distribution summary with an infrastructure column naming what each strategy requires.

**Task structure.** Each task follows TDD, with steps granular enough to take 2-5 minutes each:

````markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <which capability from the charter this implements>
**Strategy:** <strategy_id> (source: <source>, confidence: <level>)
**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Tests:** `tests/exact/path/to/test.ts` — every task must reference at least one test file. If no test file exists yet, the task must create one. This field is required; a task without a `tests:` field is incomplete.

**Context to load:** <relevant ADRs and golden samples, each with why it applies>

- [ ] **Write failing test** — the test body, in the project's test framework
- [ ] **Verify test fails** — run `<test command from constitution quality gates> -- <path to test file>`; expected FAIL (e.g. `functionUnderTest is not defined`)
- [ ] **Implement** — the implementation body
- [ ] **Verify test passes** — same command; expected PASS
- [ ] **Commit** — branch `feat/<module>/<short-description>` if not already created, then:

```bash
git add <specific files>
git commit -m "feat(<module>): add specific feature"
```
````

**Task ordering.** Order tasks so each produces working, testable software: data models and types first (foundation), core logic and services second (business rules), API layer and interface contracts third (boundaries), UI components and integration points last (consumer layer), and integration tests after all units are wired. State dependencies explicitly — a task depending on others carries `**Depends on:** Task 1, Task 2`.

**Quality Gates section.** End the plan with the constitution's full quality gate check: tests, lint, and typecheck commands, plus "All acceptance criteria from spec satisfied". Note that after all tasks complete, `/adev:validate` verifies the suite and records results in the validation report (`.validate.md`), not in the plan. If `governance/gates.yaml` exists, use its gate definitions instead of the constitution's Quality Gates, listing deterministic gates with commands and noting probabilistic or no-command gates as skipped.

## Step 6: Plan Review Loop

After writing the complete plan, dispatch a plan-reviewer subagent (`capable` tier — read `model_tiers` from `.context-index/platform-context.yaml`, falling back to the defaults in `.context-index/specs/cross-cutting/model-routing.md` if unset). Pass the contents of `plan-reviewer-prompt.md` from this skill directory, followed by the constitution, the parent charter, the Live Spec, and the plan just written. Do not pass session history.

**"Issues Found":** read the issues, fix them in the plan (the same agent that wrote it fixes it, preserving context), and re-dispatch with the updated plan. Maximum 3 iterations; beyond that, present the remaining issues to the user for guidance.

**"Approved":** proceed to the execution handoff.

**Disagreements:** the reviewer is advisory. If feedback is incorrect — flagging something intentionally designed that way per the spec or an ADR — explain the reasoning in a plan comment and do not change it.

Report only the verdict in chat, per the Output Directive.

## Step 7: Execution Handoff

**Update charter Capability Map:** after saving the plan, read the parent charter and set the `Status` column to `planned` for each capability this plan covers.

**Issue creation (optional):** read `tasks.backend` from `manifest.yaml`. If it is not configured, skip issue creation entirely. If configured, use `getIssueManager(manifest)` from `lib/issues/registry.mjs` to get the active adapter, then:

1. `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })`
2. Per task: `create({ title: "<task title>", type: "task", priority: 2, epicId: "<epic-id>", planRef: "<plan-file-path>", planTask: <task-number> })`
3. Per `Depends on: Task N, Task M` annotation: `addDependency(<this-issue-id>, <dependency-issue-id>)` for each dependency
4. Report: "Created epic `<epic-id>` with `<N>` issues on the issue board."

Then present next steps using the summary format from the Output Directive. **Persona adaptation:** that format is the Developer persona default; adapt the chat summary to whichever persona is active.

## Dry-Run Mode

With `--dry-run`, perform Steps 1-4 (gate check, context loading, constitution validation, specialist routing) and show the planned structure without writing any files: the would-be plan path, the numbered task list with specialist tags and file counts, acceptance-criteria coverage (`<N> of <M> mapped`), and constitution boundary status.

---

## Feature Mode

Activated by `--feature <module>` or by keyword/state detection.

**Precondition gate (CHARTER_GATE):** read `.context-index/specs/features/<module>/charter.md`. If it does not exist, or its status is `draft` or `in-progress`, block:
```
CHARTER_GATE: Charter for module '<module>' must be approved before Feature Mode planning.
Create or approve the charter with /adev:brainstorm --module <module>.
```

**Flow:**

1. **Read the charter** and extract the Capability Map.
2. **Identify gaps** — capabilities lacking a Live Spec. A capability lacks a spec if no spec file's frontmatter references it, or if no spec file exists for the module at all.
3. **Propose Live Specs** per gap: title derived from the capability name, a one-sentence scope, the suggested path `.context-index/specs/features/<module>/<slug>.md`, and the `next_action` string from the convention table.
4. **Present the proposed Feature plan** listing each capability with its proposed spec path and next_action, and ask: `Approve this plan to create Feature work items? (yes / edit / cancel)`
5. **On approval**, create work items via the issue manager. If no Epic exists for this charter, create one first with `create({ type: "epic", notes: "Charter: <module>" })`, then per proposed spec create `{ parent_id: <epic-id>, type: "feature", spec_ref: null, next_action: "Run /adev:specify --module <module> to author this Feature" }`.
6. **Report:** "Created `<N>` Feature work items under Epic `<epic-id>`."

---

## Release Mode

Activated by `--release <name>` or by keyword detection ("plan release v2" → `name: "v2"`).

**Workspace-mode branching.** When `detectWorkspace(cwd)` is non-null **AND** `currentRepoSlug === null` (invoked at the workspace root rather than inside a registered repo), use this branch; otherwise the Release Mode Flow is unchanged.

- *product.md read:* use `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs` for the milestone section matching `<release-name>`; on no match, prompt as in repo mode.
- *Feature list:* glob workspace-level charters (`<workspaceRoot>/.context-index/specs/features/*/charter.md`) plus each sibling repo's charters via `resolveWorkspaceContext(...).siblingRepos[]`. Guard every read with `assertPathInWorkspace(workspaceRoot, repo.path)`, skipping the repo with a warning on `PATH_ESCAPE`; cap each file with `readCappedText(file, MAX_CHARTER_FILE_BYTES)` and stop after `MAX_CHARTER_FILES` files in declaration order, with a warning. Annotate each feature `workspace/<module>` or `<repo-slug>/<module>` — **display-only in the plan text, NOT persisted to work-item frontmatter**, which avoids conflicting with the `target-repo` convention.
- *Dependency graph:* edges come from charter `Dependencies` tables, spec `depends-on` frontmatter (cross-repo-aware), and workspace repo-to-repo edges, all read via `resolveWorkspaceContext(...).dependencyGraph` — do NOT re-parse `adev-workspace.yaml`.
- *Dependency inheritance:* a workspace edge `{ from: A, to: B }` contributes Feature-level edges from every Feature in repo A to every Feature in repo B. Additive (it does not replace explicit spec-level `depends-on`) and **NOT transitive** — direct edges only, no transitive closure. Cycles, including those arising from inheritance, fall back to declaration order with a warning.
- *Topo-sort tie-breakers:* (a) upstream repo order from the workspace dependency graph, then (b) declaration order in workspace `product.md`.
- *Epic creation:* skip epic-board `create()` calls **unconditionally**, persist the release plan to workspace `product.md` only, and print that workspace-level issue-board sync is deferred to the Shared Issue Tracking capability (Phase 2), per the multi-repo-workspace charter's Deferred Capabilities.

**Release Mode Flow:**

1. **Read `product.md`** for a milestone or release section matching `<release-name>` (case-insensitive). No match → prompt the user to define it now or cancel.
2. **Identify release features** named in that milestone section.
3. **Check existing work items.** If a release Epic exists, `walkTree(<release-epic-id>)` returns its current child Epics — the source of truth for current state.
4. **Build the dependency graph.** Per feature, read its charter's `Dependencies` table and each spec's `depends-on` frontmatter, constructing a directed graph where `feature A → feature B` means A depends on B and B must be planned or built first.
5. **Sequence the plan** by topological sort (upstream first), identify the critical path, and note cycles as warnings, falling back to declaration order for cyclic groups.
6. **Present the sequenced order**, critical path, and risks (missing or unreviewed specs) and ask: `Approve to create work items? (yes / edit / cancel)`
7. **On approval**, create the release umbrella Epic if absent (`create({ type: "epic", notes: "Release: <release-name>" })`), then a child Epic per feature not already in the `walkTree` result, each with `notes: "Feature: <module>"` and `next_action: "Run /adev:plan --feature <module> to break into Features"`.
8. **Report:** "Release plan for `<release-name>` created with `<N>` Epics."

---

## Milestone Mode

Activated by `--milestone <name>` or by keyword detection ("plan milestone Q3" → `name: "Q3"`).

**Workspace-mode branching** (same entry condition as Release Mode):

- *product.md read/write:* via `resolveWorkspaceProductPath(workspaceRoot)`. If the milestone section does not exist, prompt for target date, feature list, and success criteria and write the new milestone to workspace `product.md`.
- *Feature name parsing:* accept bare `<module>` OR qualified `workspace/<module>` / `<repo-slug>/<module>`. Validate BOTH tokens with `validateModuleName(token)` from `lib/workspace.mjs`, rejecting invalid tokens with `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` and error code `INVALID_MODULE_NAME` **before any filesystem lookup**.
- *Ambiguous bare `<module>`* (matching both a workspace charter and a repo charter): prompt the user to disambiguate. The written milestone line always records the qualified form.
- *Isolation invariant:* in workspace mode the skill **never writes to any registered repo's `product.md`**. Workspace milestones are workspace-scoped artefacts; doing otherwise is an isolation violation per the charter's quality attributes.
- *Epic creation:* skip epic-board `create()` calls **unconditionally** (same as Release Mode) and print the deferral message with `Milestone '<name>'` substituted into the first line.

**Milestone Mode Flow:**

1. **Read `product.md`** for a milestone section matching `<name>`. If none, ask for target date, feature list, and success criteria, then write the definition to `product.md`.
2. **Create or update the milestone Epic:** `create({ type: "epic", notes: "Milestone: <name>. Target: <date>" })`. If one already exists, update its `notes` — do not create a duplicate.
3. **Create Feature placeholders** for each feature in the milestone: `{ parent_id: <milestone-epic-id>, type: "feature", spec_ref: null, next_action: "Run /adev:plan --feature <module> to break into Features" }`.
4. **Set the target date** in the Epic's notes, or a dedicated field if the issue manager supports one.
5. **Report** the milestone name, Epic ID, Feature placeholder count, and target date.

---

## Epic Mode

Activated by `--epic <id>` or by keyword detection ("plan epic epic-3" → `id: "epic-3"`).

1. **Read the named Epic** from the issue board. If it does not exist, block with a clear error.
2. **Call `walkTree(<epic-id>)`** for existing child Features and Tasks.
3. **Identify missing Features** by comparing the Epic's `notes` field (which may describe expected capabilities) and any associated charter against the child Features already in the tree.
4. **Propose Feature creation** per gap — behavior thereafter matches Feature Mode from its Step 3 onward.
5. **On approval**, create each missing Feature: `{ parent_id: <epic-id>, type: "feature", spec_ref: null, next_action: "Run /adev:plan --feature <module> to break into Features" }`.
6. **Report:** "Epic `<epic-id>` now has `<N>` Features (`<M>` newly created)."

---

## next_action Convention Table

Every work item created in any mode must have its `next_action` field populated with the exact string below. Token placeholders align with WorkItem field names (e.g. `<spec_ref>` is the Feature's `spec_ref` value).

| Work Item | State | next_action value |
|-----------|-------|-------------------|
| Task | any | `"Run /adev:implement to do RED-GREEN-REFACTOR for this Task"` |
| Feature | without spec | `"Run /adev:specify --module <module> to author this Feature"` |
| Feature | spec exists, needs review | `"Run /adev:review-specs --module <module>"` |
| Feature | spec reviewed and passing | `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"` |
| Epic | no Features | `"Run /adev:plan --feature <module> to break into Features"` |
| Epic | all Features planned | `"Run /adev:plan --epic <id> to verify decomposition"` |

Substitute the actual value for each token at creation time. Do not leave literal `<module>`, `<spec_ref>`, or `<id>` in persisted work items.
