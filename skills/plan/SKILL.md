---
name: adev:plan
description: "Decompose reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing. Use to break specs into actionable tasks."
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

## Arguments

- `--spec <path>`: plan a specific spec (required unless a spec path is obvious from conversation context)
- `--phase <name>`: plan all specs matching a phase/milestone across all modules (e.g., `--phase v1`)
- `--dry-run`: show the plan structure without writing it

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

## Step 2: Load Context

### Essential Context (load now)

Read these files immediately. They are required for every planning decision.

1. **Constitution:** Read `.context-index/constitution.md`. Extract non-negotiable principles, architecture boundaries, quality gate commands, and coding standards.

2. **Platform context:** Read `.context-index/platform-context.yaml`. Note the tech stack, framework versions, and deployment targets.

3. **Parent charter:** Read the feature charter (`.context-index/specs/features/<module>/charter.md`). Extract the capability map. Every task must trace to a capability listed here.

4. **The spec:** Read the Live Spec itself. Extract behavioral contract, acceptance criteria, and actionable task map (if present).

5. **Review report:** Read the `.review.md` file. Note any `PASS_WITH_NOTES` warnings. The plan should address or acknowledge them.

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

### Task Structure

Each task follows TDD. Steps are granular (2-5 minutes each).

````markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <which capability from the charter this implements>
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

After the plan is saved and reviewed, present the user with next steps:

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
