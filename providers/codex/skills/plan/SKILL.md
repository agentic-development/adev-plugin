---
name: adev:plan
description: "Decompose reviewed Live Specs into ordered implementation tasks with TDD expectations and context routing. Use to break specs into actionable tasks. In Codex, invoke with $adev:plan"
---

# Plan Implementation

Decompose a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability.

**Announce at start:** "I'm using the adev:plan skill to create the implementation plan."

### Dispatch Turn Discipline

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

**Always pass `run_in_background: false` on every `Agent({...})` dispatch in this skill.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context it does not re-invoke the caller, so a backgrounded dispatch stalls the pipeline (field-observed as steps that auto-background and never return a result).

---

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill plan
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- `--spec <path>`: plan a specific spec (routes to Spec Mode)
- `--feature <module>`: plan a feature charter (routes to Feature Mode)
- `--release <name>`: plan a named release (routes to Release Mode)
- `--milestone <name>`: create or update a milestone (routes to Milestone Mode)
- `--epic <id>`: decompose an Epic into Features (routes to Epic Mode)
- `--milestone <name>`: plan all specs matching a milestone across all modules (e.g., `--milestone v1`)
- `--dry-run`: show the plan structure without writing it

Passing more than one of `--spec`, `--feature`, `--release`, `--milestone`, `--epic` in a single invocation throws **CONFLICTING_FLAGS** and the skill exits without action.

## Step 0: Mode Detection

Picks feature / release / milestone / epic mode from the arguments and repo state.

> **Conditional loading:** Read `skills/plan/references/steps/step-0-mode-detection.md` for the full instructions. Do not act on this section from the summary above.

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level planning, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

## Milestone Planning Mode (`--milestone`)

> **Conditional loading:** Read `skills/plan/references/milestone-mode.md` for the full Milestone Planning Mode instructions.

---

## Spec Mode

Steps 1–7 below apply when operating in **Spec Mode**. This is the original single-spec planning flow. It is preserved unchanged. All other modes use their own dedicated sections below.

### Spec Mode Error Codes

- **REVIEW_GATE** — The spec has not been reviewed, or the review verdict is BLOCK, or the spec has drifted since its last review. Block with a clear message and tell the user to run `/adev:review-specs`.

## Step 1: Review Gate

Refuses to plan a spec that has not passed review, and states the one gate-passing abort.

> **Conditional loading:** Read `skills/plan/references/steps/step-1-review-gate.md` for the full instructions. Do not act on this section from the summary above.

## Step 2: Load Context

Assembles charter, spec, constitution, and pattern context before decomposition.

> **Conditional loading:** Read `skills/plan/references/steps/step-2-load-context.md` for the full instructions. Do not act on this section from the summary above.

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

Emits the ordered task list with TDD expectations and per-task context routing.

> **Conditional loading:** Read `skills/plan/references/steps/step-5-write-the-plan.md` for the full instructions. Do not act on this section from the summary above.

## Test Infrastructure Requirements

How infra_requirements are derived and recorded on the plan.

> **Conditional loading:** Read `skills/plan/references/test-infrastructure-requirements.md` for the full instructions. Do not act on this section from the summary above.

## Step 6: Plan Review Loop

Dispatches the plan reviewer and applies its verdict, up to the retry ceiling.

> **Conditional loading:** Read `skills/plan/references/steps/step-6-plan-review-loop.md` for the full instructions. Do not act on this section from the summary above.

## Step 7: Execution Handoff

Hands the finished plan to route/implement and states what the caller receives.

> **Conditional loading:** Read `skills/plan/references/steps/step-7-execution-handoff.md` for the full instructions. Do not act on this section from the summary above.

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

> **Conditional loading:** Read `skills/plan/references/feature-mode.md` for the full Feature Mode instructions.

---

## Release Mode

> **Conditional loading:** Read `skills/plan/references/release-mode.md` for the full Release Mode instructions.

---

## Milestone Mode

> **Conditional loading:** Read `skills/plan/references/milestone-mode.md` for the full Milestone Mode instructions.

---

## Epic Mode

> **Conditional loading:** Read `skills/plan/references/epic-mode.md` for the full Epic Mode and next_action Convention Table.

---

## API reference

Library functions this skill wraps, for reference when reading its CLI verbs.

> **Conditional loading:** Read `skills/plan/references/api-reference.md` for the full instructions. Do not act on this section from the summary above.

## Next Step in the Lifecycle

Plan ready. The next step is **`/adev:route`** (score tasks for autonomy vs review — optional) and then **`/adev:implement`**.

If invoked via `/adev:work`, offer to continue: *"Plan ready. Continue to `/adev:route`, or straight to `/adev:implement`?"* The user can stop here.
