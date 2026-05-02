---
name: adev:plan
description: "Decompose reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing. Use to break specs into actionable tasks."
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

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

Before any other steps, determine the operating mode. Explicit flag wins over keyword detection, which wins over project-state inference, which falls back to a multi-choice menu on ambiguity.

### Detection Precedence

1. **Explicit flag (highest priority):** If one of `--spec`, `--feature`, `--release`, `--milestone`, or `--epic` is present, enter that mode immediately. Skip keyword and state detection entirely.
   - Error: if two or more mode flags are passed together, output `CONFLICTING_FLAGS` and exit.

2. **Path argument:** If a single argument ends in `.md` and resembles a file path to a Live Spec (e.g., `multi-repo-workspace/init-workspace.md`), identify it as a spec path and route to **Spec Mode** with that path as the `--spec` value.

3. **Keyword detection (free-text argument):** If a plain-text argument is provided, scan it for mode keywords:
   - "release" or "launch" → **Release Mode** (extract release name from remaining text)
   - "milestone" or "phase" → **Milestone Mode** (extract milestone name from remaining text)
   - "feature" or "module" → **Feature Mode** (extract module name from remaining text)
   - "epic" → **Epic Mode** (extract epic ID from remaining text)
   - Example: "plan release v2" → Release Mode, `name: "v2"`

4. **Project-state scan (no flag, no argument):** Read `.context-index/` to infer mode from current state:
   - If exactly one reviewed spec (with `*.review.md` passing verdict) lacks a corresponding `*.plan.md` → propose **Spec Mode** for that spec.
   - If multiple reviewed specs lack plans → present a multi-choice menu listing all pending specs plus other available modes.
   - If no reviewed specs need plans, check whether any Feature charter has capabilities without specs → propose **Feature Mode**.

5. **Ambiguity fallback (multi-choice menu):** When mode detection cannot resolve to a single mode, present a menu:
   ```
   What would you like to plan?

   1. Spec — decompose a reviewed Live Spec into Tasks
   2. Feature — identify missing specs for a charter module
   3. Release — build a release plan from product.md
   4. Milestone — create or update a milestone Epic
   5. Epic — decompose an existing Epic into Features

   Enter a number or describe what you want to plan:
   ```
   Await user selection and proceed. If the user dismisses without selecting, exit without action.

### Mode Summary Table

| Mode | Entry Condition | What it produces |
|------|----------------|-----------------|
| Spec | `--spec` / `.md` path / single reviewed spec lacking plan | Ordered Task list in a `*.plan.md` file |
| Feature | `--feature <module>` / "feature" keyword | Feature work items under an Epic |
| Release | `--release <name>` / "release" keyword | Sequenced release plan + child Epics |
| Milestone | `--milestone <name>` / "milestone" keyword | Milestone Epic + Feature placeholders |
| Epic | `--epic <id>` / "epic" keyword | Missing Feature proposals under an Epic |

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level planning, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

## Phase Planning Mode (`--phase`)

When `--phase <name>` is provided, the skill switches from single-spec planning to multi-spec phase planning:

### Workspace Dependency Ordering

When `--phase` is used inside a workspace (detected by the presence of a `workspace.yaml` or `.workspace/` configuration at an ancestor directory, or by `workspace` key in `manifest.yaml`):

1. **Detect workspace:** Check whether the current repo is registered in a workspace by reading the workspace config. If no workspace is found, fall back to single-repo behavior (unchanged).
2. **Read dependency graph:** Load the workspace dependency graph (e.g., `workspace.yaml` `dependencies` section or `.workspace/deps.json`). Each entry has the form `from: <repo> → to: <repo>`, meaning `from` depends on `to` (i.e., `to` is upstream of `from`).
3. **Order repos topologically (upstream first):** Sort registered repos so that upstream repos (the `to` side) are planned before downstream repos (the `from` side). This ensures upstream specs are planned and available before repos that depend on them.
   - Example: if `api` depends on `core`, plan `core` first, then `api`.
   - Use Kahn's algorithm or depth-first topological sort on the dependency graph.
4. **Circular dependencies → warning, fall back to declaration order:** If a cycle is detected in the dependency graph, emit a warning:
   ```
   Warning: circular dependency detected among workspace repos: <repo-A> → <repo-B> → <repo-A>
   Falling back to declaration order. Resolve cycles in workspace config before relying on topological ordering.
   ```
   Then proceed using the order in which repos are declared in the workspace config.
5. **No workspace → existing single-repo behavior:** If the current directory is not inside a workspace, or the workspace has only one registered repo, skip all workspace logic and apply the standard phase planning process below.

1. **Scan all specs:** Read all `.md` files under `.context-index/specs/features/` (excluding `charter.md` and `*.plan.md` and `*.review.md`). Parse frontmatter for the `milestone` field.
2. **Filter by phase:** Select specs whose `milestone` matches `<name>` (case-insensitive).
3. **Report matching specs** before planning:
   ```
   Phase: v1
   Matching specs:
     1. auth/password-login.md — status: implemented ✓
     2. auth/session-management.md — status: review-passed ✓
     3. task-boards/create-boards.md — status: draft ⚠ (not yet review-passed)

   3 specs found. 1 warning (draft spec included but may not be ready for planning).
   → Proceed with planning all review-passed specs? (yes / include drafts / select)
   ```
4. **Warn on non-reviewed specs:** Specs that have not reached `review-passed` status are flagged with a warning. Include them in the plan only if the user confirms.
5. **Ordering:** Plan specs in dependency order:
   - Specs within the same charter are ordered by the charter's Capability Map sequence.
   - Cross-charter dependencies are resolved by reading each spec's preconditions and consumed APIs.
   - If no dependency information is available, group by charter (all specs from one charter together).
6. **Output:** For each qualifying spec, run the standard planning process (Steps 1-7). Save each plan adjacent to its spec as usual. At the end, produce a phase summary:
   ```
   Phase v1 planning complete.

   Plans created:
     - .context-index/specs/features/auth/session-management.plan.md (3 tasks)
     - .context-index/specs/features/task-boards/create-boards.plan.md (5 tasks)

   Skipped (already implemented):
     - auth/password-login.md

   Warnings:
     - task-boards/create-boards.md was planned from a draft spec (not review-passed)
   ```

Without `--phase`, behavior is unchanged (single spec planning via `--spec`).

---

## Spec Mode

Steps 1–7 below apply when operating in **Spec Mode**. This is the original single-spec planning flow. It is preserved unchanged. All other modes use their own dedicated sections below.

### Spec Mode Error Codes

- **REVIEW_GATE** — The spec has not been reviewed, or the review verdict is BLOCK, or the spec has drifted since its last review. Block with a clear message and tell the user to run `/adev:review-specs`.

## Step 1: Review Gate

Before planning, verify the spec has passed architecture review.

1. Identify the spec file path. If `--spec` was provided, use that. Otherwise, ask the user which spec to plan.
2. Look for a `.review.md` file adjacent to the spec (same directory, same base name with `.review.md` suffix). For example, `card-ordering.md` expects `card-ordering.review.md`.
3. If no review file exists, **block**:
   ```
   This spec has not been reviewed yet.
   Run /adev:review-specs --spec <path> before planning.
   ```
4. Read the review file. Extract the `Verdict` from the header.
5. If verdict is `BLOCK`, **block**:
   ```
   This spec has unresolved blockers from architecture review.
   Review report: <path to .review.md>
   Resolve the blockers, revise the spec with /adev:specify, and re-review with /adev:review-specs.
   ```
6. Compare file modification times. If the spec is newer than the review file, **block**:
   ```
   The spec has been modified since its last review.
   Run /adev:review-specs --spec <path> to re-review the updated spec.
   ```
7. **Dual drift check.** Detect spec changes that bypassed the review process:
   - **Revision drift:** Compare the spec's `revision` frontmatter field against the `.review.md` file's `last-reviewed-revision` value. If the spec's revision is greater, **block**:
     ```
     Spec revision drift detected: spec is at revision <N>, but review was performed at revision <M>.
     The spec content has changed since the last review.
     Run /adev:review-specs --spec <path> to re-review.
     ```
   - **File hash drift:** Run `git hash-object <spec-file-path>` and compare against the `.review.md` file's `file-sha` value. If they differ, **block**:
     ```
     Spec file drift detected: the spec file has been modified since the last review (hash mismatch).
     Run /adev:review-specs --spec <path> to re-review.
     ```
   - If the `.review.md` file does not contain `last-reviewed-revision` or `file-sha` fields (legacy review), fall back to the file modification time check in step 6.
8. If verdict is `PASS` or `PASS_WITH_NOTES`, proceed. If `PASS_WITH_NOTES`, print the warnings for the user's awareness but do not block.

### Spec Mode — Workspace-Aware Target-Repo Detection

After the Review Gate passes (Step 1) and before loading context (Step 2), check whether the spec declares a `target-repo:` field in its YAML frontmatter:

1. **Parse spec frontmatter** for the `target-repo:` field.
2. **If `target-repo` is present AND `detectWorkspace(cwd)` returns non-null:** enter **workspace-aware Spec Mode**. The remaining steps (2-7) follow the workspace-aware branching documented below.
3. **If `target-repo` is present but no workspace is detected (NO_WORKSPACE fallback):** emit a warning and fall back to the single-repo flow. Rationale: the `target-repo` field is only meaningful inside a workspace; outside a workspace, the spec is treated as a normal single-repo spec. The single-repo fallback ensures the skill remains functional for users who copy workspace specs into standalone repos.
   ```
   Warning: spec declares target-repo: '<value>' but no workspace detected.
   Falling back to single-repo flow. To use workspace-aware planning,
   run from a workspace root or a registered repo directory.
   ```
4. **Validate target-repo** against the workspace registry using `validateModuleName()` from `lib/workspace.mjs`. If validation fails, block with error code `INVALID_TARGET_REPO`:
   ```
   INVALID_TARGET_REPO: target-repo '<value>' is not a valid repo slug
   in the workspace registry. Valid slugs: <list>.
   ```

## Step 2: Load Context

### Essential Context (load now)

Read these files immediately. They are required for every planning decision.

1. **Constitution:** Read `.context-index/constitution.md`. Extract non-negotiable principles, architecture boundaries, quality gate commands, and coding standards.

2. **Platform context:** Read `.context-index/platform-context.yaml`. Note the tech stack, framework versions, and deployment targets.

3. **Parent charter:** Read the feature charter (`.context-index/specs/features/<module>/charter.md`). Extract the capability map. Every task must trace to a capability listed here.

4. **The spec:** Read the Live Spec itself. Extract behavioral contract, acceptance criteria, and actionable task map (if present).

5. **Review report:** Read the `.review.md` file. Note any `PASS_WITH_NOTES` warnings. The plan should address or acknowledge them.

### Workspace-Aware Target-Repo Context Loading

When in workspace-aware Spec Mode (target-repo detected), load context from the target repo instead of (or in addition to) the current repo:

1. **Target repo constitution:** Read `<target-repo-path>/.context-index/constitution.md`. If the target repo's `.context-index/` directory is missing, handle gracefully — proceed without target repo constitution and note the gap in the plan header.
2. **Target repo platform-context:** Read `<target-repo-path>/.context-index/platform-context.yaml`. This determines the target repo's tech stack for task structure.
3. **Target repo orientation:** Read `<target-repo-path>/.context-index/orientation/architecture.md` for module placement and import patterns specific to the target repo.
4. **Special case — `target-repo: workspace`:** When the spec's target-repo value is literally `workspace`, the spec targets the workspace root itself rather than any registered repo. In this case, load the workspace-level `.context-index/` constitution, platform-context, and orientation. There is no repo-specific constitution to load.

### Workspace-Aware Cross-Repo Depends-On Resolution

When in workspace-aware Spec Mode, parse the spec's `depends-on` frontmatter for cross-repo references in the `@repo-slug/spec-slug` format:

1. **Identify cross-repo refs:** Entries matching the pattern `@<repo-slug>/<spec-slug>` are cross-repo dependencies.
2. **Resolve each ref** via `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs`. This returns the absolute path to the referenced spec in the sibling repo.
3. **Include resolved specs in Context Packets:** Add each resolved cross-repo spec as a Context Packet entry so subagents can read the dependency's behavioral contract.
4. **Warn on unresolvable refs:** If a cross-repo ref cannot be resolved (repo not in workspace registry, spec file not found), emit a warning but do not block:
   ```
   Warning: cross-repo dependency @<repo-slug>/<spec-slug> could not be resolved.
   The referenced spec may not exist or the repo may not be registered in the workspace.
   ```

### Reference Context (load when relevant)

Read these as needed during task writing. Do not load everything upfront — load when a task requires this context.

6. **Orientation:** Read `.context-index/orientation/architecture.md` when determining file structure, module placement, or import patterns for tasks.

7. **ADRs:** Read only the ADRs referenced in the spec or charter. Reference specific ADRs in tasks where they apply.

8. **External references:** Read `.context-index/references/**/*.md` only if the spec references external contracts or interfaces.

9. **Cross-cutting specs:** Read files from `.context-index/specs/cross-cutting/` only those that the spec depends on (check spec frontmatter or behavioral contract for references).

10. **Samples:** Read `.context-index/samples/` when writing context packets for tasks. Reference relevant golden samples in task guidance.

11. **Boundary rules:** Read `.context-index/governance/boundaries.yaml` only if the directory exists. Extract boundary rules as additional planning constraints.

12. **Heuristics:** Load module-scoped heuristics for inclusion in the plan. Derive the module slug from the spec's `charter:` frontmatter field. Run inline Node.js using `retrieveHeuristics` and `renderHeuristic` from `<ADEV_ROOT>/lib/heuristics.mjs` (where `<ADEV_ROOT>` is the adev plugin root — derive it from this skill file's base directory by stripping the `skills/<name>/` suffix), passing the module slug and `heuristics.injection_limit` from manifest.yaml (if configured). If the call fails or returns empty, proceed without heuristics — heuristic injection is non-blocking. Store the rendered output for use in Step 5.

## Step 3: Constitution Validation

Before writing any tasks, validate that the planned work stays within constitutional boundaries:

1. Check each acceptance criterion against the constitution's "Architecture Boundaries" section.
2. If any criterion would require creating new services, modifying auth flows, adding dependencies, or crossing other stated boundaries, flag it:
   ```
   Constitution boundary alert:
   The spec requires [action] which the constitution marks as needing human approval.
   Proceed with this in the plan? (yes, the user has approved / no, flag it as blocked)
   ```
3. If the user confirms, include the task but mark it clearly:
   ```
   ### Task N: [Title] [REQUIRES HUMAN APPROVAL]
   ```

Check each planned file path against boundary patterns from `governance/boundaries.yaml`:
- `severity: error` → flag as blocker, must resolve before planning proceeds
- `severity: warning` → flag as warning, proceed with caution
- Tasks touching files across multiple boundary patterns → note as "cross-boundary operation"

## Step 4: Specialist Routing

Read `.context-index/manifest.yaml` and check the `specialists` section. For each planned task, determine if a specialist should handle it:

- Match file paths the task will touch against each specialist's `trigger_patterns`.
- Match task description keywords against each specialist's `trigger_keywords`.
- Scoring: 2 points per pattern match (plus depth bonus), 1 point per keyword match.
- Highest-scoring specialist becomes the primary tag. If no match, tag as `[specialist: none]`.
- If multiple specialists match, tag with the highest scorer. Note secondary matches as a comment.

These tags tell `/adev:implement` which subagent to dispatch for each task.

## Step 5: Write the Plan

### Plan Location

Save the plan adjacent to the spec:
- Spec at `.context-index/specs/features/<module>/<task>.md` gets its plan at `.context-index/specs/features/<module>/<task>.plan.md`
- Cross-cutting spec at `.context-index/specs/cross-cutting/<topic>.md` gets its plan at `.context-index/specs/cross-cutting/<topic>.plan.md`

**Workspace-aware plan save location:** When in workspace-aware Spec Mode, the plan is saved in the workspace `.context-index/`, not in the target repo's `.context-index/`. This keeps workspace-level planning artifacts co-located with the workspace-level specs that produced them.

### Plan Document Header

Every plan starts with this header:

```markdown
# Implementation Plan: <Feature Name>

> **Methodology:** adev
> **Charter:** .context-index/specs/features/<module>/charter.md
> **Spec:** .context-index/specs/features/<module>/<task>.md
> **Review:** <PASS|PASS_WITH_NOTES> (YYYY-MM-DD)
> **Platform:** <framework> <version>, <language>, <key deps>

**Goal:** <One sentence describing what this builds>

**Architecture:** <2-3 sentences about the approach, referencing orientation and ADRs where relevant>

---
```

### Scope Check

If the spec covers multiple independent subsystems that could be built and tested separately, suggest breaking into separate plans. Each plan should produce working, testable software on its own.

### File Structure Section

Before defining tasks, map out all files that will be created or modified:

```markdown
## File Structure

**Create:**
- `src/components/Dashboard.tsx` — Main dashboard component
- `tests/components/Dashboard.test.tsx` — Dashboard unit tests

**Modify:**
- `src/app/layout.tsx:15-20` — Add dashboard route
- `src/lib/api/index.ts:42-50` — Export new endpoint handler

**Reference (read, do not modify):**
- `.context-index/samples/component-sample.md` — Follow this pattern for component structure
- `src/components/ExistingWidget.tsx` — Follow this component's pattern for state management
```

Design units with clear boundaries. Prefer smaller, focused files. Follow existing codebase patterns. If the codebase uses large files, do not unilaterally restructure.

#### Workspace-Aware Repo-Relative File Paths

When in workspace-aware Spec Mode, file paths in the File Structure and Task Structure sections must be repo-relative:

- **When target-repo is a repo slug:** prefix all file paths with the target repo's path relative to the workspace root (e.g., `<repo-slug>/src/module.ts`). This makes paths unambiguous in a multi-repo workspace.
- **When target-repo is `workspace`:** paths are workspace-relative (relative to the workspace root directory).
- **Commit scope:** The commit scope in each task's commit step must include the target repo slug (e.g., `feat(<target-repo-slug>/<module>): ...`). When target-repo is `workspace`, use the workspace name as the scope prefix (e.g., `feat(<workspace-name>/<module>): ...`). Branch naming follows the same convention: `feat/<target-repo-slug>/<short-description>` or `feat/<workspace-name>/<short-description>` for workspace-scoped specs.

### Context Packet Section

After the file structure and before individual tasks, include a context packet manifest per task. This makes subagent context explicit and inspectable.

```markdown
## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/<module>/<task>.md` (criteria 1-3)
- Charter: `.context-index/specs/features/<module>/charter.md` (capability: <name>)
- Sample: `.context-index/samples/<pattern>-sample.md`
- ADR: `.context-index/adrs/<relevant-adr>.md`
- Cross-cutting: `.context-index/specs/cross-cutting/<relevant>.md`
- Boundary rules: `governance/boundaries.yaml` (rules affecting task files)
- Heuristics: <N> entries for module `<M>` (IDs: <id1>, <id2>, ...)

### Task 2 Context
- ...
```

Each packet entry lists the specific file AND the relevant section or criteria within it. `/adev:implement` assembles these packets before dispatching subagents and logs them to `.context-index/packets/` (gitignored) for debugging failed tasks. `/adev:recover` reads packets to diagnose root causes.

### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section to the plan after Context Packets and before Parallelization:

```markdown
## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

<rendered heuristic blocks from Step 2>
```

If no heuristics are available, omit this section entirely.

### Parallelization Hints

After context packets, annotate which tasks can run in parallel (no shared file dependencies):

```markdown
## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared files)
- Group B (independent): Task 3 (no file overlap with Group A)
- Group C (independent): Task 4 (no file overlap with A or B)

Groups B and C can run in parallel with Group A.
```

This is informational for `/adev:implement --parallel` (future). Tasks within a group run sequentially; groups run concurrently.

### Task Summary Table

After the Parallelization section, emit a `## Task Summary` table that provides a quick-glance overview of all tasks. This is the first thing users and `/adev:implement` see before the detailed task sections.

```markdown
## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | ADR for dotenvx dependency | small | unit | — | 2 create, 1 modify |
| 2 | parseInfraRequirements | medium | unit | — | 1 create, 1 modify |
| 3 | dotenvx env file loading | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | Env var presence checks | small | unit | Task 2 | 0 create, 2 modify |
```

**Column definitions:**
- **#** — sequential task number
- **Title** — short task name (from `### Task N: <title>`)
- **Complexity** — small / medium / large (from spec's Actionable Task Map or inferred from file count and description)
- **Strategy** — test strategy assigned to this task
- **Depends On** — task dependencies (from `Depends on:` annotation) or `—` if none
- **Files** — count of files to create and modify

This table is always emitted, regardless of project complexity or strategy configuration.

### Strategy Assignment

For each task, resolve its test strategy using the priority chain defined in `lib/test-strategies/assignment.mjs`:

1. Check if the parent spec declares `test_strategy` in its YAML frontmatter → use it (source: spec-declared, confidence: high)
2. Check if `manifest.yaml` has a `test_strategies` entry whose path globs match the task's file paths → use it (source: manifest, confidence: high)
3. Auto-detect from the task's file paths using `lib/test-strategies/detection.mjs` → use the detected strategy (source: detected, confidence from heuristic)
4. Default to `unit` (source: fallback, confidence: high)

Include the resolved strategy in each task's metadata. If any task uses a non-unit strategy, append a **Strategy Summary** section after the task list:

```markdown
## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| unit | 3 | fallback |
| schema | 2 | manifest |

⚠ Low confidence assignments:
- Task 4: strategy=visual (detected, medium confidence) — verify before proceeding
```

Omit this section entirely when all tasks resolve to `unit` (backward compatible — no noise for projects not using test strategies).

### Infrastructure Requirements Section

After the Strategy Summary (or in its place when no non-unit strategies exist), check whether the plan needs a `## Test Infrastructure Requirements` section.

**Emission trigger (either condition):**
- The spec frontmatter contains `infra_requirements:` (regardless of strategy), OR
- One or more tasks are assigned a non-unit strategy

When all tasks are `unit` AND the spec has no `infra_requirements:` field, skip this section entirely (backward compatible — no noise for pure unit-test tasks).

**Derivation:**
For each non-unit task (or for all tasks when `infra_requirements:` is in spec frontmatter):
1. Read `infra_requirements:` from spec frontmatter — **if present, use as authoritative source and skip auto-detection (skip step 3)**
2. Otherwise, auto-detect from task file paths using file-globbing heuristics (e.g., files under `src/adapters/aws/` → AWS credentials likely needed; task paths matching `**/s3-client.*` → AWS S3 credentials likely needed). Detection uses file globbing only — no import scanning or content parsing.
3. Deduplicate requirements across tasks, grouped by external system.

When auto-detection confidence is `low`, prepend an advisory: "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding."

When `infra_requirements: unknown` is in spec frontmatter, emit `PLAN_INFRA_UNKNOWN` for all tasks in the spec.

**Section format:**

~~~markdown
## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| AWS S3 | Task 1.2, Task 1.4 | integration |
| Postgres 15 | Task 2.1, Task 2.3 | schema, integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `AWS_ACCESS_KEY_ID` | AWS S3 | AWS IAM console — dedicated test account |
| `DATABASE_URL` | Postgres | Provision test DB — inject as CI secret (contains password) |

### Pre-Provisioned State

- [ ] AWS test account with IAM permissions scoped to specific actions and test resource ARNs
- [ ] Postgres 15 instance accessible from test runner

### CI Configuration

These tests are excluded from the default `npm test` run. To execute:
```bash
npm run test:integration
# or: node --test --test-name-pattern "integration"
```

> **Local runs:** Create `.env.test` with credential values. `.env.test` MUST be listed in `.gitignore`.
> In CI, inject credentials as secrets — never hardcode them in workflow files.

### Unresolved Requirements

| Task | Issue | Action Required |
|------|-------|-----------------|
| Task 3.1 | `PLAN_INFRA_UNKNOWN` — external system not identifiable | Declare `infra_requirements:` in spec frontmatter |
~~~

**Non-blocking:** Plan does NOT block when infra requirements are unresolved. It completes the task list and surfaces unresolved items in the `### Unresolved Requirements` table for human review before running `/adev:implement`.

**Strategy Summary update (amends plan-integration Behavior 4):** When this section is emitted, extend the Strategy Distribution summary to include an "infrastructure" column:

~~~
Strategy Distribution:
  unit        ·  8 tasks   (source: fallback)      — no external infra needed
  integration ·  4 tasks   (source: detected/high)  — requires: AWS S3, SQS, Postgres
  schema      ·  2 tasks   (source: detected/high)  — requires: Postgres
  visual      ·  1 task    (source: spec-declared)  — requires: Storybook server (from infra_requirements:)
~~~

### Task Structure

Each task follows TDD. Steps are granular (2-5 minutes each).

````markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <which capability from the charter this implements>
**Strategy:** <strategy_id> (source: <source>, confidence: <level>)
**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Tests:** `tests/exact/path/to/test.ts` — every task must reference at least one test file. If no test file exists yet, the task must create one. This field is required; a task without a `tests:` field is incomplete.

**Context to load:**
- `.context-index/adrs/001-session-store-redis.md` (relevant decision)
- `.context-index/samples/service-sample.md` (follow this pattern)

- [ ] **Write failing test**

```typescript
describe('specificBehavior', () => {
  it('should do the expected thing', () => {
    const result = functionUnderTest(input);
    expect(result).toEqual(expected);
  });
});
```

- [ ] **Verify test fails**

Run: `<test command from constitution quality gates> -- <path to test file>`
Expected: FAIL — `functionUnderTest is not defined` (or similar)

- [ ] **Implement**

```typescript
export function functionUnderTest(input: InputType): OutputType {
  // implementation
  return expected;
}
```

- [ ] **Verify test passes**

Run: `<test command from constitution quality gates> -- <path to test file>`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/<module>/<short-description>`

```bash
git add <specific files>
git commit -m "feat(<module>): add specific feature"
```
````

### Task Ordering

Order tasks so each produces working, testable software:

1. Data models and types first (foundation)
2. Core logic and services second (business rules)
3. API layer or interface contracts third (boundaries)
4. UI components or integration points last (consumer layer)
5. Integration tests after all units are wired

Explicit dependencies: if Task 3 depends on Task 1 and Task 2, state it:
```markdown
### Task 3: Wire Dashboard Route [specialist: none]
**Depends on:** Task 1, Task 2
```

### Quality Gates Section

End the plan with the full quality gate check from the constitution:

```markdown
---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `<test command>`
- [ ] Lint passes: `<lint command>`
- [ ] Type check passes: `<typecheck command>`
- [ ] All acceptance criteria from spec satisfied

If `governance/gates.yaml` exists, use its gate definitions instead of constitution Quality Gates. List deterministic gates with commands. Note probabilistic/no-command gates as skipped.
```

## Step 6: Plan Review Loop

After writing the complete plan, dispatch a plan-reviewer subagent.

**Dispatch the reviewer** (`capable` tier — read from `model_tiers` in `.context-index/platform-context.yaml`; fall back to hardcoded defaults from `.context-index/specs/cross-cutting/model-routing.md` if unset):
```
Task tool (general-purpose):
  description: "Review implementation plan"
  prompt: |
    <content of plan-reviewer-prompt.md from this skill directory>

    ---

    ## Constitution
    <constitution content>

    ## Parent Charter
    <charter content>

    ## Live Spec
    <spec content>

    ## Implementation Plan
    <the plan just written>
```

Provide: the plan document, the Live Spec, the parent charter, and the constitution. Do not pass session history.

**If the reviewer returns "Issues Found":**
1. Read the issues.
2. Fix them in the plan (same agent that wrote the plan fixes it, preserving context).
3. Re-dispatch the reviewer with the updated plan.
4. Maximum 3 iterations. If the loop exceeds 3 iterations, present the remaining issues to the user for guidance.

**If the reviewer returns "Approved":**
Proceed to the execution handoff.

**Disagreements:** If you believe reviewer feedback is incorrect (e.g., flagging something that is intentionally designed that way based on the spec or ADR), explain your reasoning in the plan as a comment and do not change it. The reviewer is advisory.

## Step 7: Execution Handoff

**Update charter Capability Map:** After saving the plan, read the parent charter and update the Capability Map. For each capability covered by this plan, set its `Status` column to `planned`.

**Issue creation (optional):** Read `tasks.backend` from `manifest.yaml`.

If `tasks.backend` is configured:
1. Create an epic: call `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })` from `lib/issues/registry.mjs` (use `getIssueManager(manifest)` to get the active adapter).
2. For each task in the plan, create an issue: call `create({ title: "<task title>", type: "task", priority: 2, epicId: "<epic-id>", planRef: "<plan-file-path>", planTask: <task-number> })`.
3. For each task with `Depends on: Task N, Task M` annotations, call `addDependency(<this-issue-id>, <dependency-issue-id>)` for each dependency.
4. Report: "Created epic `<epic-id>` with `<N>` issues on the issue board."

If `tasks.backend` is not configured in the manifest, skip issue creation entirely.

After the plan is saved and reviewed, present the user with next steps. **Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat summary to its output rules.

```
Plan complete and saved to <path to plan file>.

<N> tasks covering <M> acceptance criteria from the spec.
<S> tasks tagged with specialist routing.

To implement: /adev:implement --plan <path>
To review the plan: open <path to plan file>
To re-plan after spec changes: /adev:plan --spec <path>
```

## Dry-Run Mode

If `--dry-run` is passed, perform Steps 1-4 (gate check, context loading, constitution validation, specialist routing) and show the planned structure without writing any files:

```
Dry run: would create <path to plan file>

Tasks:
1. <Task title> [specialist: <tag>] — <files count> files
2. <Task title> [specialist: <tag>] — <files count> files
...

Spec coverage: <N> of <M> acceptance criteria mapped
Constitution: no boundary violations detected
```

---

## Feature Mode

Activated by `--feature <module>` or by keyword/state detection routing to this mode.

### Precondition Gate (CHARTER_GATE)

Read the charter at `.context-index/specs/features/<module>/charter.md`. If the charter does not exist, or its status is `draft` or `in-progress`, block:
```
CHARTER_GATE: Charter for module '<module>' must be approved before Feature Mode planning.
Create or approve the charter with /adev:brainstorm --module <module>.
```

### Feature Mode Flow

1. **Read the charter.** Extract the Capability Map (table of capabilities with status columns).
2. **Identify gaps.** Find capabilities that lack a corresponding Live Spec (`*.md` in the module's spec directory). A capability lacks a spec if no spec file's frontmatter references it, or if no spec file exists at all for the module.
3. **Propose Live Specs.** For each gap, produce a proposed spec entry:
   - Title (derived from capability name)
   - Scope (one sentence describing what the spec would cover)
   - Suggested file path: `.context-index/specs/features/<module>/<slug>.md`
   - `next_action` (from convention table): `"Run /adev:specify --module <module> to author this Feature"`
4. **Present the proposed Feature plan** to the user for approval:
   ```
   Feature plan for module: <module>

   Capabilities lacking specs:
     1. <capability-name> → proposed spec: <path>
        next_action: Run /adev:specify --module <module> to author this Feature
     2. ...

   Approve this plan to create Feature work items? (yes / edit / cancel)
   ```
5. **On approval**, create work items via the issue manager:
   - If no Epic exists for this charter, create one first:
     ```
     create({ type: "epic", notes: "Charter: <module>" })
     ```
   - For each proposed spec, create a Feature work item:
     ```
     create({
       parent_id: <epic-id>,
       type: "feature",
       spec_ref: null,
       next_action: "Run /adev:specify --module <module> to author this Feature"
     })
     ```
6. **Report:** "Created `<N>` Feature work items under Epic `<epic-id>`."

---

## Release Mode

Activated by `--release <name>` or by keyword detection ("plan release v2" → `name: "v2"`).

### Release Mode — Workspace-Mode Branching

When `detectWorkspace(cwd)` returns non-null **AND** `currentRepoSlug === null` (i.e., invoked at the workspace root, not inside a registered repo), enter this workspace mode branch. Otherwise use the existing Release Mode Flow unchanged.

**Workspace-mode Step 1 (product.md read):** Read `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs` for the milestone section matching `<release-name>`. If no match, prompt as in repo mode.

**Workspace-mode Step 2 (feature list):** Build the feature list by globbing:
- Workspace-level charters: `<workspaceRoot>/.context-index/specs/features/*/charter.md`
- Per-repo charters via `resolveWorkspaceContext(...).siblingRepos[]`: for each sibling repo, glob `<contextPath>/specs/features/*/charter.md`. Apply `assertPathInWorkspace(workspaceRoot, repo.path)` before reading; on `PATH_ESCAPE`, skip the repo with a warning. Apply `readCappedText(file, MAX_CHARTER_FILE_BYTES)` per file. Stop after `MAX_CHARTER_FILES` files loaded in declaration order and warn.
- Annotate each feature entry as `workspace/<module>` or `<repo-slug>/<module>`. **The annotation is display-only in the plan text — NOT persisted to work-item frontmatter** (avoids conflict with `target-repo` convention).

**Workspace-mode Step 3 (dependency graph):** Edges from three sources, all read via `resolveWorkspaceContext(...).dependencyGraph` (do NOT re-parse `adev-workspace.yaml`):
1. Each feature charter's `Dependencies` table
2. Each feature's specs' `depends-on` frontmatter (cross-repo-aware)
3. Workspace repo-to-repo edges

**Dependency inheritance rule:** A workspace edge `{ from: A, to: B }` contributes Feature-level edges from every Feature in repo A to every Feature in repo B. Additive (does not replace explicit spec-level `depends-on`). **NOT transitive** — direct edges only; no transitive closure computed. Cycles (including those arising from inheritance) fall back to declaration order with a warning.

**Workspace-mode Step 4 (topo-sort):** Tie-breakers: (a) upstream repo order from workspace dependency graph, (b) declaration order in workspace `product.md`. Cycles fall back to declaration order with a warning, matching single-repo behaviour.

**Workspace-mode Step 5 (epic creation):** Skip epic-board `create()` calls **unconditionally**. Persist the release plan to workspace `product.md` only. Print:
```
Release plan for '<name>' written to workspace product.md only.
Workspace-level issue-board sync is deferred to the Shared Issue Tracking
capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
```

### Release Mode Flow

1. **Read `product.md`.** Look for a milestone or release section matching `<release-name>` (case-insensitive). If no match is found, prompt the user to create the milestone or cancel:
   ```
   No milestone named '<release-name>' found in product.md.
   Would you like to define it now? (yes / cancel)
   ```
2. **Identify release features.** Extract the list of features/modules named in the release milestone section.
3. **Check existing work items.** If a release Epic already exists on the issue board, call `walkTree(<release-epic-id>)` to get its current child Epics. This is the source of truth for current state.
4. **Build dependency graph.** For each feature:
   - Read its charter's `Dependencies` table (if present).
   - Read each feature's specs for `depends-on` frontmatter fields.
   - Construct a directed graph: `feature A → feature B` means A depends on B (B must be planned/built first).
5. **Sequence the release plan.** Perform a topological sort (upstream first). Identify the critical path. Note any cycles as warnings (fall back to declaration order for cyclic groups).
6. **Produce a sequenced release plan** and present it to the user:
   ```
   Release plan: <release-name>

   Sequenced feature order (upstream first):
     1. <module-A> — no dependencies (start here)
     2. <module-B> — depends on: <module-A>
     3. ...

   Critical path: <module-A> → <module-B> → ...
   Risk: <any notes on missing specs or unreviewed specs>

   Approve to create work items? (yes / edit / cancel)
   ```
7. **On approval**, create:
   - A release umbrella Epic if not already present:
     ```
     create({ type: "epic", notes: "Release: <release-name>" })
     ```
   - A child Epic per feature (skip if already present in `walkTree` result):
     ```
     create({
       parent_id: <release-epic-id>,
       type: "epic",
       notes: "Feature: <module>",
       next_action: "Run /adev:plan --feature <module> to break into Features"
     })
     ```
8. **Report:** "Release plan for `<release-name>` created with `<N>` Epics."

---

## Milestone Mode

Activated by `--milestone <name>` or by keyword detection ("plan milestone Q3" → `name: "Q3"`).

### Milestone Mode — Workspace-Mode Branching

When `detectWorkspace(cwd)` returns non-null **AND** `currentRepoSlug === null` (i.e., invoked at the workspace root, not inside a registered repo), enter this workspace mode branch. Otherwise use the existing Milestone Mode Flow unchanged.

**Workspace-mode (product.md read/write):** Read `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs`. If the milestone section does not exist, prompt for target date, feature list, and success criteria and write the new milestone to workspace `product.md`.

**Feature name parsing:** Accept bare `<module>` OR qualified `workspace/<module>` / `<repo-slug>/<module>`. Validate BOTH tokens with `validateModuleName(token)` from `lib/workspace.mjs`; reject invalid tokens with error `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` and error code `INVALID_MODULE_NAME` **before any filesystem lookup**.

**Ambiguous bare `<module>`** (matches both a workspace charter and a repo charter): prompt the user to disambiguate. The written milestone line always records the qualified form.

**Isolation invariant:** In workspace mode the skill **never writes to any registered repo's `product.md`**. Workspace milestones are workspace-scoped artefacts. This is an isolation violation per the charter's quality attributes.

**Epic creation:** Skip epic-board `create()` calls **unconditionally** (same as Release Mode). Print deferral message substituting `Milestone '<name>'` for `Release plan for '<name>'` in first line:
```
Milestone '<name>' written to workspace product.md only.
Workspace-level issue-board sync is deferred to the Shared Issue Tracking
capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
```

### Milestone Mode Flow

1. **Read `product.md`.** Look for a milestone section matching `<name>`. If none found, prompt the user to define it:
   - Ask for: target date, feature list, success criteria.
   - Write the new milestone definition to `product.md`.
2. **Create or update the milestone Epic:**
   ```
   create({ type: "epic", notes: "Milestone: <name>. Target: <date>" })
   ```
   If a milestone Epic already exists, update its `notes` field; do not create a duplicate.
3. **Create Feature placeholders** for each feature named in the milestone:
   ```
   create({
     parent_id: <milestone-epic-id>,
     type: "feature",
     spec_ref: null,
     next_action: "Run /adev:plan --feature <module> to break into Features"
   })
   ```
4. **Set target date** in the Epic's notes (or a dedicated field if the issue manager supports it).
5. **Report:**
   ```
   Milestone '<name>' planned.
   Epic: <epic-id>
   Feature placeholders: <N>
   Target date: <date>
   ```

---

## Epic Mode

Activated by `--epic <id>` or by keyword detection ("plan epic epic-3" → `id: "epic-3"`).

### Epic Mode Flow

1. **Read the named Epic** from the issue board. If the Epic does not exist, block with a clear error.
2. **Call `walkTree(<epic-id>)`** to get existing child Features and Tasks.
3. **Identify missing Features.** Compare the Epic's `notes` field (which may describe expected capabilities) and any associated charter against the actual child Features already in the tree.
4. **Propose Feature creation** for each gap — behavior thereafter matches Feature Mode (Step 3 onward of Feature Mode).
5. **On approval**, create missing Feature work items:
   ```
   create({
     parent_id: <epic-id>,
     type: "feature",
     spec_ref: null,
     next_action: "Run /adev:plan --feature <module> to break into Features"
   })
   ```
6. **Report:** "Epic `<epic-id>` now has `<N>` Features (`<M>` newly created)."

---

## next_action Convention Table

Every work item created in any mode must have its `next_action` field populated. Use the exact strings below. Token placeholders align with WorkItem field names (e.g., `<spec_ref>` is the Feature's `spec_ref` field value).

| Work Item | State | next_action value |
|-----------|-------|-------------------|
| Task | any | `"Run /adev:implement to do RED-GREEN-REFACTOR for this Task"` |
| Feature | without spec | `"Run /adev:specify --module <module> to author this Feature"` |
| Feature | spec exists, needs review | `"Run /adev:review-specs --module <module>"` |
| Feature | spec reviewed and passing | `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"` |
| Epic | no Features | `"Run /adev:plan --feature <module> to break into Features"` |
| Epic | all Features planned | `"Run /adev:plan --epic <id> to verify decomposition"` |

Substitute the actual value for each token at creation time. Do not leave literal `<module>`, `<spec_ref>`, or `<id>` in persisted work items — replace them with the real values.
