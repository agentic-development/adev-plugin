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

Determine the operating mode before anything else. Explicit flag wins over keyword detection, which wins over project-state inference, which falls back to a multi-choice menu on ambiguity.

### Detection Precedence

1. **Explicit flag (highest priority):** if one of `--spec`, `--feature`, `--release`, `--milestone`, `--epic` is present, enter that mode immediately and skip keyword and state detection. Two or more mode flags together → output `CONFLICTING_FLAGS` and exit.

2. **Path argument:** a single argument ending in `.md` that resembles a Live Spec path (e.g. `multi-repo-workspace/init-workspace.md`) routes to **Spec Mode** with that path as `--spec`.

3. **Keyword detection (free-text argument):** scan a plain-text argument for mode keywords, extracting the name from the remaining text:
   - "release" or "launch" → **Release Mode** (e.g. "plan release v2" → Release Mode, `name: "v2"`)
   - "milestone" or "phase" → **Milestone Mode**
   - "feature" or "module" → **Feature Mode**
   - "epic" → **Epic Mode**

4. **Project-state scan (no flag, no argument):** read `.context-index/` to infer mode:
   - Exactly one reviewed spec (passing verdict in `*.review.md`) lacking a `*.plan.md` → propose **Spec Mode** for it.
   - Multiple reviewed specs lacking plans → present the multi-choice menu listing all pending specs plus other modes.
   - No reviewed specs needing plans → if any Feature charter has capabilities without specs, propose **Feature Mode**.

5. **Ambiguity fallback (multi-choice menu):** when detection cannot resolve to a single mode:
   ```
   What would you like to plan?

   1. Spec — decompose a reviewed Live Spec into Tasks
   2. Feature — identify missing specs for a charter module
   3. Release — build a release plan from product.md
   4. Milestone — create or update a milestone Epic
   5. Epic — decompose an existing Epic into Features

   Enter a number or describe what you want to plan:
   ```
   Await selection. If the user dismisses without selecting, exit without action.

### Mode Summary Table

| Mode | Entry Condition | What it produces |
|------|----------------|-----------------|
| Spec | `--spec` / `.md` path / single reviewed spec lacking plan | Ordered Task list in a `*.plan.md` file |
| Feature | `--feature <module>` / "feature" keyword | Feature work items under an Epic |
| Release | `--release <name>` / "release" keyword | Sequenced release plan + child Epics |
| Milestone | `--milestone <name>` / "milestone" keyword | Milestone Epic + Feature placeholders |
| Epic | `--epic <id>` / "epic" keyword | Missing Feature proposals under an Epic |

## Repo-Mode-Inside-Workspace Advisory

When invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` set), behaviour is repo-scoped (existing single-repo flow). Additionally print this advisory to **stdout** (same channel as other skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level planning, cd to <workspace-root> and re-run.)
```

The advisory does not block, and does not appear when `detectWorkspace` returns `null`.

## Phase Planning Mode (`--phase`)

`--phase <name>` switches from single-spec planning to multi-spec phase planning.

### Workspace Dependency Ordering

When `--phase` is used inside a workspace (detected by a `workspace.yaml` or `.workspace/` config at an ancestor directory, or a `workspace` key in `manifest.yaml`):

1. **Detect workspace:** check whether the current repo is registered by reading the workspace config. If none, fall back to single-repo behavior (unchanged).
2. **Read dependency graph:** load it from `workspace.yaml`'s `dependencies` section or `.workspace/deps.json`. Each entry `from: <repo> → to: <repo>` means `from` depends on `to` (`to` is upstream).
3. **Order repos topologically (upstream first)** so upstream specs are planned and available before dependent repos. If `api` depends on `core`, plan `core` first. Use Kahn's algorithm or a depth-first topological sort.
4. **Circular dependencies → warning, fall back to declaration order:**
   ```
   Warning: circular dependency detected among workspace repos: <repo-A> → <repo-B> → <repo-A>
   Falling back to declaration order. Resolve cycles in workspace config before relying on topological ordering.
   ```
5. **No workspace → existing single-repo behavior.** Also applies when the workspace has only one registered repo.

Then, for the phase itself:

1. **Scan all specs:** read all `.md` under `.context-index/specs/features/` (excluding `charter.md`, `*.plan.md`, `*.review.md`) and parse frontmatter for `milestone`.
2. **Filter by phase:** select specs whose `milestone` matches `<name>` (case-insensitive).
3. **Report matching specs** before planning, listing each with its status and flagging drafts:
   ```
   Phase: v1
   Matching specs:
     1. auth/password-login.md — status: implemented ✓
     2. auth/session-management.md — status: review-passed ✓
     3. task-boards/create-boards.md — status: draft ⚠ (not yet review-passed)

   3 specs found. 1 warning (draft spec included but may not be ready for planning).
   → Proceed with planning all review-passed specs? (yes / include drafts / select)
   ```
4. **Warn on non-reviewed specs.** Specs below `review-passed` are flagged; include them only if the user confirms.
5. **Ordering:** specs within a charter follow the charter's Capability Map sequence; cross-charter dependencies come from each spec's preconditions and consumed APIs; with no dependency information, group by charter.
6. **Output:** run the standard planning process (Steps 1-7) for each qualifying spec, saving each plan adjacent to its spec, then produce a phase summary listing plans created (with task counts), specs skipped as already implemented, and warnings.

Without `--phase`, behavior is unchanged (single spec planning via `--spec`).

---

## Spec Mode

Steps 1–7 below apply in **Spec Mode**, the original single-spec planning flow, preserved unchanged. Other modes use their own sections.

### Spec Mode Error Codes

- **REVIEW_GATE** — the spec has not been reviewed, the review verdict is BLOCK, or the spec has drifted since its last review. Block with a clear message and tell the user to run `/adev:review-specs`.

## Step 1: Review Gate

Verify the spec has passed architecture review before planning.

1. Identify the spec file path — from `--spec`, otherwise ask the user which spec to plan.
2. Look for a `.review.md` adjacent to the spec (same directory, same base name). `card-ordering.md` expects `card-ordering.review.md`.
3. If no review file exists, **block**:
   ```
   This spec has not been reviewed yet.
   Run /adev:review-specs --spec <path> before planning.
   ```
4. Read the review file and extract the `Verdict` from the header.
5. If verdict is `BLOCK`, **block**:
   ```
   This spec has unresolved blockers from architecture review.
   Review report: <path to .review.md>
   Resolve the blockers, revise the spec with /adev:specify, and re-review with /adev:review-specs.
   ```
6. Compare modification times. If the spec is newer than the review file, **block**:
   ```
   The spec has been modified since its last review.
   Run /adev:review-specs --spec <path> to re-review the updated spec.
   ```
7. **Code-Side Drift Check (CODE_DRIFT gate).** Before spec-side drift, check code-side drift by calling `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs`:

   - `hasDrift()` returns `true` → **block**:
     ```
     CODE_DRIFT: Spec "<name>" has drift_detected: true. Source file <drift_source>
     was modified since last validation. Run /adev:validate or update the spec
     before planning new work.
     ```
   - `hasDrift()` returns `false` → also run `verifyManifest(manifest, projectRoot)` from `<ADEV_ROOT>/lib/source-manifest.mjs` as a fallback (catches drift on non-Claude-Code hosts where the hook never fired). If the result does not match, block with the CODE_DRIFT message.
   - `verifyManifest()` fails on missing files → block with:
     ```
     CODE_DRIFT_VERIFY_ERROR: Cannot verify source manifest for spec "<name>" —
     <N> files missing. Run /adev:hygiene to diagnose, or /adev:implement to
     re-stamp the manifest.
     ```
   - `hasDrift()` throws (malformed frontmatter) → **block** (fail-closed):
     ```
     CODE_DRIFT_READ_ERROR: Cannot read drift status for spec "<name>" —
     frontmatter may be malformed. Fix the spec frontmatter before planning.
     ```

8. **Dual drift check.** Detect spec changes that bypassed review:
   - **Revision drift:** compare the spec's `revision` frontmatter against the review file's `last-reviewed-revision`. If the spec's revision is greater, **block**:
     ```
     Spec revision drift detected: spec is at revision <N>, but review was performed at revision <M>.
     The spec content has changed since the last review.
     Run /adev:review-specs --spec <path> to re-review.
     ```
   - **File hash drift:** run `git hash-object <spec-file-path>` and compare against the review file's `file-sha`. On mismatch, **block**:
     ```
     Spec file drift detected: the spec file has been modified since the last review (hash mismatch).
     Run /adev:review-specs --spec <path> to re-review.
     ```
   - If the review file lacks `last-reviewed-revision` or `file-sha` (legacy review), fall back to the modification-time check in step 6.
9. If verdict is `PASS` or `PASS_WITH_NOTES`, proceed. For `PASS_WITH_NOTES`, print the warnings for awareness but do not block.

### Spec Mode — Workspace-Aware Target-Repo Detection

After the Review Gate passes and before loading context, check whether the spec declares `target-repo:` in its YAML frontmatter:

1. **Parse spec frontmatter** for `target-repo:`.
2. **`target-repo` present AND `detectWorkspace(cwd)` non-null:** enter **workspace-aware Spec Mode**; Steps 2-7 follow the workspace-aware branches below.
3. **`target-repo` present but no workspace (NO_WORKSPACE fallback):** warn and fall back to the single-repo flow. `target-repo` is only meaningful inside a workspace; outside one the spec is treated as a normal single-repo spec, so the skill stays functional for users who copy workspace specs into standalone repos.
   ```
   Warning: spec declares target-repo: '<value>' but no workspace detected.
   Falling back to single-repo flow. To use workspace-aware planning,
   run from a workspace root or a registered repo directory.
   ```
4. **Validate target-repo** against the workspace registry using `validateModuleName()` from `lib/workspace.mjs`. On failure block with `INVALID_TARGET_REPO`:
   ```
   INVALID_TARGET_REPO: target-repo '<value>' is not a valid repo slug
   in the workspace registry. Valid slugs: <list>.
   ```

## Step 2: Load Context

### Essential Context (load now)

Required for every planning decision:

1. **Constitution:** `.context-index/constitution.md` — non-negotiable principles, architecture boundaries, quality gate commands, coding standards.
2. **Platform context:** `.context-index/platform-context.yaml` — tech stack, framework versions, deployment targets.
3. **Parent charter:** `.context-index/specs/features/<module>/charter.md` — the capability map. Every task must trace to a capability listed here.
4. **The spec:** behavioral contract, acceptance criteria, and actionable task map (if present).
5. **Review report:** the `.review.md` file. Note `PASS_WITH_NOTES` warnings; the plan should address or acknowledge them.

### Workspace-Aware Target-Repo Context Loading

In workspace-aware Spec Mode, load context from the target repo instead of (or in addition to) the current repo:

1. **Target repo constitution:** `<target-repo-path>/.context-index/constitution.md`. If the target repo's `.context-index/` is missing, proceed without it and note the gap in the plan header.
2. **Target repo platform-context:** `<target-repo-path>/.context-index/platform-context.yaml` — determines the target repo's tech stack for task structure.
3. **Target repo orientation:** `<target-repo-path>/.context-index/orientation/architecture.md` — module placement and import patterns for that repo.
4. **Special case — `target-repo: workspace`:** the spec targets the workspace root rather than a registered repo. Load the workspace-level constitution, platform-context, and orientation; there is no repo-specific constitution.

### Workspace-Aware Cross-Repo Depends-On Resolution

In workspace-aware Spec Mode, parse the spec's `depends-on` frontmatter for `@repo-slug/spec-slug` references:

1. **Identify cross-repo refs** matching `@<repo-slug>/<spec-slug>`.
2. **Resolve each** via `resolveRef(workspaceRoot, config, ref)` from `lib/workspace.mjs`, which returns the absolute path to the referenced spec in the sibling repo.
3. **Include resolved specs in Context Packets** so subagents can read the dependency's behavioral contract.
4. **Warn on unresolvable refs** — do not block:
   ```
   Warning: cross-repo dependency @<repo-slug>/<spec-slug> could not be resolved.
   The referenced spec may not exist or the repo may not be registered in the workspace.
   ```

### Reference Context (load when relevant)

Read as needed during task writing, not upfront:

6. **Orientation:** `.context-index/orientation/architecture.md` when determining file structure, module placement, or import patterns.
7. **ADRs:** only those referenced in the spec or charter. Reference specific ADRs in tasks where they apply.
8. **External references:** `.context-index/references/**/*.md` only if the spec references external contracts or interfaces.
9. **Cross-cutting specs:** only those from `.context-index/specs/cross-cutting/` the spec depends on (check frontmatter or behavioral contract).
10. **Samples:** `.context-index/samples/` when writing context packets. Reference relevant golden samples in task guidance.
11. **Boundary rules:** `.context-index/governance/boundaries.yaml` if the directory exists — extra planning constraints.
12. **Heuristics:** load module-scoped heuristics for the plan. Derive the module slug from the spec's `charter:` frontmatter. Use `retrieveHeuristics` and `renderHeuristic` from `<ADEV_ROOT>/lib/heuristics.mjs` (derive `<ADEV_ROOT>` from this skill file's base directory by stripping the `skills/<name>/` suffix), passing the module slug and `heuristics.injection_limit` from manifest.yaml if configured. If the call fails or returns empty, proceed without heuristics — injection is non-blocking. Store the rendered output for Step 5.

## Step 3: Constitution Validation

Validate that planned work stays within constitutional boundaries before writing tasks:

1. Check each acceptance criterion against the constitution's "Architecture Boundaries" section.
2. If a criterion would require new services, auth flow changes, new dependencies, or any other stated boundary crossing, flag it:
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
- `severity: error` → blocker, must resolve before planning proceeds
- `severity: warning` → proceed with caution
- Tasks touching files across multiple boundary patterns → note as "cross-boundary operation"

## Step 4: Specialist Routing

Read the `specialists` section of `.context-index/manifest.yaml`. For each planned task:

- Match the files the task will touch against each specialist's `trigger_patterns`.
- Match task description keywords against each specialist's `trigger_keywords`.
- Score 2 points per pattern match (plus depth bonus), 1 point per keyword match.
- The highest scorer becomes the primary tag; with no match, tag `[specialist: none]`. Note secondary matches as a comment.

These tags tell `/adev:implement` which subagent to dispatch.

## Step 5: Write the Plan

### Plan Location

Save the plan adjacent to the spec:
- `.context-index/specs/features/<module>/<task>.md` → `.context-index/specs/features/<module>/<task>.plan.md`
- `.context-index/specs/cross-cutting/<topic>.md` → `.context-index/specs/cross-cutting/<topic>.plan.md`

**Workspace-aware plan save location:** in workspace-aware Spec Mode the plan is saved in the workspace `.context-index/`, not the target repo's, keeping workspace-level planning artifacts co-located with the specs that produced them.

### Plan Document Header

Every plan starts with:

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

If the spec covers multiple independent subsystems that could be built and tested separately, suggest splitting into separate plans. Each plan should produce working, testable software on its own.

### File Structure Section

Map every file to be created or modified before defining tasks:

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

Design units with clear boundaries. Prefer smaller, focused files, and follow existing codebase patterns — if the codebase uses large files, do not unilaterally restructure.

#### Workspace-Aware Repo-Relative File Paths

In workspace-aware Spec Mode, file paths in File Structure and Task Structure must be repo-relative:

- **target-repo is a repo slug:** prefix all paths with the target repo's path relative to the workspace root (e.g. `<repo-slug>/src/module.ts`), making paths unambiguous across repos.
- **target-repo is `workspace`:** paths are workspace-relative.
- **Commit scope:** each task's commit step includes the target repo slug — `feat(<target-repo-slug>/<module>): ...`, or the workspace name for workspace-scoped specs. Branch naming follows the same convention: `feat/<target-repo-slug>/<short-description>`.

### Context Packet Section

After the file structure and before individual tasks, include a context packet manifest per task, making subagent context explicit and inspectable:

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

Each entry lists the specific file AND the relevant section or criteria within it. `/adev:implement` assembles these packets before dispatching subagents and logs them to `.context-index/packets/` (gitignored) for debugging failed tasks. `/adev:recover` reads packets to diagnose root causes.

### Heuristics Section

If heuristics were loaded in Step 2, add a `## Heuristics` section after Context Packets and before Parallelization:

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

Informational for `/adev:implement --parallel` (future). Tasks within a group run sequentially; groups run concurrently.

### Task Summary Table

After Parallelization, emit a `## Task Summary` table — the first thing users and `/adev:implement` see before the detailed task sections:

```markdown
## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | ADR for dotenvx dependency | small | unit | — | 2 create, 1 modify |
| 2 | parseInfraRequirements | medium | unit | — | 1 create, 1 modify |
| 3 | dotenvx env file loading | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | Env var presence checks | small | unit | Task 2 | 0 create, 2 modify |
```

**Column definitions:** **#** sequential task number; **Title** short name from `### Task N: <title>`; **Complexity** small/medium/large from the spec's Actionable Task Map or inferred from file count and description; **Strategy** the assigned test strategy; **Depends On** from the `Depends on:` annotation, or `—`; **Files** count of files to create and modify.

This table is always emitted, regardless of project complexity or strategy configuration.

### Strategy Assignment

Resolve each task's test strategy using the priority chain in `lib/test-strategies/assignment.mjs`:

1. Parent spec declares `test_strategy` in YAML frontmatter → use it (source: spec-declared, confidence: high)
2. `manifest.yaml` has a `test_strategies` entry whose path globs match the task's files → use it (source: manifest, confidence: high)
3. Auto-detect from the task's file paths via `lib/test-strategies/detection.mjs` (source: detected, confidence from heuristic)
4. Default to `unit` (source: fallback, confidence: high)

Include the resolved strategy in each task's metadata. If any task uses a non-unit strategy, append a **Strategy Summary** after the task list:

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

After the Strategy Summary (or in its place when no non-unit strategies exist), decide whether the plan needs a `## Test Infrastructure Requirements` section.

**Emission trigger (either condition):** the spec frontmatter contains `infra_requirements:` (regardless of strategy), OR one or more tasks are assigned a non-unit strategy. When all tasks are `unit` AND the spec has no `infra_requirements:`, skip this section entirely (backward compatible).

**Derivation.** For each non-unit task (or all tasks when `infra_requirements:` is in spec frontmatter):
1. Read `infra_requirements:` from spec frontmatter — **if present, use as authoritative source and skip auto-detection (skip step 3)**
2. Otherwise auto-detect from task file paths using file-globbing heuristics (e.g. files under `src/adapters/aws/` → AWS credentials likely needed; paths matching `**/s3-client.*` → AWS S3 credentials likely needed). Detection uses file globbing only — no import scanning or content parsing.
3. Deduplicate requirements across tasks, grouped by external system.

When auto-detection confidence is `low`, prepend: "⚠ Infrastructure requirements auto-detected with low confidence — review and confirm before proceeding." When `infra_requirements: unknown` is in spec frontmatter, emit `PLAN_INFRA_UNKNOWN` for all tasks in the spec.

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

**Non-blocking:** the plan does NOT block when infra requirements are unresolved. It completes the task list and surfaces unresolved items in `### Unresolved Requirements` for human review before `/adev:implement`.

**Strategy Summary update (amends plan-integration Behavior 4):** when this section is emitted, extend the Strategy Distribution summary with an infrastructure column:

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

State explicit dependencies — if Task 3 depends on Tasks 1 and 2:
```markdown
### Task 3: Wire Dashboard Route [specialist: none]
**Depends on:** Task 1, Task 2
```

### Quality Gates Section

End the plan with the full quality gate check from the constitution:

```markdown
---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `<test command>`
- Lint passes: `<lint command>`
- Type check passes: `<typecheck command>`
- All acceptance criteria from spec satisfied

If `governance/gates.yaml` exists, use its gate definitions instead of constitution Quality Gates. List deterministic gates with commands. Note probabilistic/no-command gates as skipped.
```

## Step 6: Plan Review Loop

After writing the complete plan, dispatch a plan-reviewer subagent (`capable` tier — read from `model_tiers` in `.context-index/platform-context.yaml`; fall back to the defaults in `.context-index/specs/cross-cutting/model-routing.md` if unset):

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

Provide the plan document, the Live Spec, the parent charter, and the constitution. Do not pass session history.

**If the reviewer returns "Issues Found":** read the issues, fix them in the plan (the same agent that wrote the plan fixes it, preserving context), and re-dispatch the reviewer with the updated plan. Maximum 3 iterations; beyond that, present the remaining issues to the user for guidance.

**If the reviewer returns "Approved":** proceed to the execution handoff.

**Disagreements:** if reviewer feedback is incorrect (e.g. flagging something intentionally designed that way per the spec or an ADR), explain your reasoning in the plan as a comment and do not change it. The reviewer is advisory.

## Step 7: Execution Handoff

**Update charter Capability Map:** after saving the plan, read the parent charter and set the `Status` column to `planned` for each capability this plan covers.

**Issue creation (optional):** read `tasks.backend` from `manifest.yaml`. If configured:

1. Create an epic: `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })` from `lib/issues/registry.mjs` (use `getIssueManager(manifest)` for the active adapter).
2. Per task, create an issue: `create({ title: "<task title>", type: "task", priority: 2, epicId: "<epic-id>", planRef: "<plan-file-path>", planTask: <task-number> })`.
3. For each task with `Depends on: Task N, Task M`, call `addDependency(<this-issue-id>, <dependency-issue-id>)` per dependency.
4. Report: "Created epic `<epic-id>` with `<N>` issues on the issue board."

If `tasks.backend` is not configured, skip issue creation entirely.

After the plan is saved and reviewed, present next steps. **Persona adaptation:** the format below is the Developer persona default; adapt the chat summary to whichever persona is active.

```
Plan complete and saved to <path to plan file>.

<N> tasks covering <M> acceptance criteria from the spec.
<S> tasks tagged with specialist routing.

To implement: /adev:implement --plan <path>
To review the plan: open <path to plan file>
To re-plan after spec changes: /adev:plan --spec <path>
```

## Dry-Run Mode

With `--dry-run`, perform Steps 1-4 (gate check, context loading, constitution validation, specialist routing) and show the planned structure without writing files:

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

Activated by `--feature <module>` or by keyword/state detection.

### Precondition Gate (CHARTER_GATE)

Read `.context-index/specs/features/<module>/charter.md`. If it does not exist, or its status is `draft` or `in-progress`, block:
```
CHARTER_GATE: Charter for module '<module>' must be approved before Feature Mode planning.
Create or approve the charter with /adev:brainstorm --module <module>.
```

### Feature Mode Flow

1. **Read the charter** and extract the Capability Map (capabilities with status columns).
2. **Identify gaps** — capabilities lacking a corresponding Live Spec (`*.md` in the module's spec directory). A capability lacks a spec if no spec file's frontmatter references it, or if no spec file exists for the module at all.
3. **Propose Live Specs** for each gap: title (from the capability name), scope (one sentence), suggested path `.context-index/specs/features/<module>/<slug>.md`, and `next_action` from the convention table: `"Run /adev:specify --module <module> to author this Feature"`.
4. **Present the proposed Feature plan** for approval:
   ```
   Feature plan for module: <module>

   Capabilities lacking specs:
     1. <capability-name> → proposed spec: <path>
        next_action: Run /adev:specify --module <module> to author this Feature
     2. ...

   Approve this plan to create Feature work items? (yes / edit / cancel)
   ```
5. **On approval**, create work items via the issue manager. If no Epic exists for this charter, create one first with `create({ type: "epic", notes: "Charter: <module>" })`, then per proposed spec:
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

When `detectWorkspace(cwd)` is non-null **AND** `currentRepoSlug === null` (invoked at the workspace root, not inside a registered repo), use this branch. Otherwise use the Release Mode Flow unchanged.

**Workspace-mode Step 1 (product.md read):** read `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs` for the milestone section matching `<release-name>`. If no match, prompt as in repo mode.

**Workspace-mode Step 2 (feature list):** build the feature list by globbing workspace-level charters (`<workspaceRoot>/.context-index/specs/features/*/charter.md`) and per-repo charters via `resolveWorkspaceContext(...).siblingRepos[]` (for each sibling repo, glob `<contextPath>/specs/features/*/charter.md`). Apply `assertPathInWorkspace(workspaceRoot, repo.path)` before reading; on `PATH_ESCAPE`, skip the repo with a warning. Apply `readCappedText(file, MAX_CHARTER_FILE_BYTES)` per file, and stop after `MAX_CHARTER_FILES` files loaded in declaration order, with a warning. Annotate each feature as `workspace/<module>` or `<repo-slug>/<module>`. **The annotation is display-only in the plan text — NOT persisted to work-item frontmatter** (avoids conflict with the `target-repo` convention).

**Workspace-mode Step 3 (dependency graph):** edges come from three sources, all read via `resolveWorkspaceContext(...).dependencyGraph` (do NOT re-parse `adev-workspace.yaml`): each feature charter's `Dependencies` table; each feature's specs' `depends-on` frontmatter (cross-repo-aware); and workspace repo-to-repo edges.

**Dependency inheritance rule:** a workspace edge `{ from: A, to: B }` contributes Feature-level edges from every Feature in repo A to every Feature in repo B. Additive (does not replace explicit spec-level `depends-on`) and **NOT transitive** — direct edges only, no transitive closure. Cycles (including those from inheritance) fall back to declaration order with a warning.

**Workspace-mode Step 4 (topo-sort):** tie-breakers are (a) upstream repo order from the workspace dependency graph, then (b) declaration order in workspace `product.md`. Cycles fall back to declaration order with a warning, matching single-repo behaviour.

**Workspace-mode Step 5 (epic creation):** skip epic-board `create()` calls **unconditionally**. Persist the release plan to workspace `product.md` only, and print:
```
Release plan for '<name>' written to workspace product.md only.
Workspace-level issue-board sync is deferred to the Shared Issue Tracking
capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
```

### Release Mode Flow

1. **Read `product.md`** for a milestone or release section matching `<release-name>` (case-insensitive). If no match:
   ```
   No milestone named '<release-name>' found in product.md.
   Would you like to define it now? (yes / cancel)
   ```
2. **Identify release features** — the features/modules named in that milestone section.
3. **Check existing work items.** If a release Epic already exists, call `walkTree(<release-epic-id>)` for its current child Epics — that is the source of truth for current state.
4. **Build dependency graph.** Per feature, read its charter's `Dependencies` table (if present) and each spec's `depends-on` frontmatter. Construct a directed graph where `feature A → feature B` means A depends on B (B must be planned/built first).
5. **Sequence the release plan** by topological sort (upstream first). Identify the critical path. Note cycles as warnings and fall back to declaration order for cyclic groups.
6. **Present the sequenced plan** for approval:
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
7. **On approval**, create a release umbrella Epic if not present (`create({ type: "epic", notes: "Release: <release-name>" })`), then a child Epic per feature, skipping any already present in the `walkTree` result:
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

When `detectWorkspace(cwd)` is non-null **AND** `currentRepoSlug === null`, use this branch. Otherwise use the Milestone Mode Flow unchanged.

**Workspace-mode (product.md read/write):** read `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs`. If the milestone section does not exist, prompt for target date, feature list, and success criteria, then write the new milestone to workspace `product.md`.

**Feature name parsing:** accept bare `<module>` OR qualified `workspace/<module>` / `<repo-slug>/<module>`. Validate BOTH tokens with `validateModuleName(token)` from `lib/workspace.mjs`; reject invalid tokens with `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` and error code `INVALID_MODULE_NAME` **before any filesystem lookup**.

**Ambiguous bare `<module>`** (matching both a workspace charter and a repo charter): prompt the user to disambiguate. The written milestone line always records the qualified form.

**Isolation invariant:** in workspace mode the skill **never writes to any registered repo's `product.md`**. Workspace milestones are workspace-scoped artefacts; writing into a repo is an isolation violation per the charter's quality attributes.

**Epic creation:** skip epic-board `create()` calls **unconditionally** (same as Release Mode). Print the deferral message with `Milestone '<name>'` substituted in the first line:
```
Milestone '<name>' written to workspace product.md only.
Workspace-level issue-board sync is deferred to the Shared Issue Tracking
capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
```

### Milestone Mode Flow

1. **Read `product.md`** for a milestone section matching `<name>`. If none, prompt for target date, feature list, and success criteria, then write the new milestone definition to `product.md`.
2. **Create or update the milestone Epic:** `create({ type: "epic", notes: "Milestone: <name>. Target: <date>" })`. If a milestone Epic already exists, update its `notes`; do not create a duplicate.
3. **Create Feature placeholders** for each feature named in the milestone:
   ```
   create({
     parent_id: <milestone-epic-id>,
     type: "feature",
     spec_ref: null,
     next_action: "Run /adev:plan --feature <module> to break into Features"
   })
   ```
4. **Set target date** in the Epic's notes (or a dedicated field if the issue manager supports one).
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

1. **Read the named Epic** from the issue board. If it does not exist, block with a clear error.
2. **Call `walkTree(<epic-id>)`** for existing child Features and Tasks.
3. **Identify missing Features** by comparing the Epic's `notes` field (which may describe expected capabilities) and any associated charter against the child Features already in the tree.
4. **Propose Feature creation** for each gap — behavior thereafter matches Feature Mode from its Step 3 onward.
5. **On approval**, create the missing Feature work items:
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

Every work item created in any mode must have its `next_action` field populated. Use the exact strings below. Token placeholders align with WorkItem field names (e.g. `<spec_ref>` is the Feature's `spec_ref` field value).

| Work Item | State | next_action value |
|-----------|-------|-------------------|
| Task | any | `"Run /adev:implement to do RED-GREEN-REFACTOR for this Task"` |
| Feature | without spec | `"Run /adev:specify --module <module> to author this Feature"` |
| Feature | spec exists, needs review | `"Run /adev:review-specs --module <module>"` |
| Feature | spec reviewed and passing | `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"` |
| Epic | no Features | `"Run /adev:plan --feature <module> to break into Features"` |
| Epic | all Features planned | `"Run /adev:plan --epic <id> to verify decomposition"` |

Substitute the actual value for each token at creation time. Do not leave literal `<module>`, `<spec_ref>`, or `<id>` in persisted work items — replace them with the real values.
