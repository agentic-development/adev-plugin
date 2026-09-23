---
name: adev:build
description: "End-to-end build orchestrator. Chains review, plan, route, implement, and validate for one or more specs through a full lifecycle pipeline. Use when the user says 'build', 'end to end', 'full pipeline', 'build the spec', 'build the milestone', 'run the whole pipeline', or wants to execute multiple lifecycle steps in sequence without manual handoffs. In OpenCode, invoke with skill({ name: 'adev:build' })"
---

# Build Pipeline Orchestrator

Chain review, plan, route, implement, and validate into a single end-to-end pipeline for one or more specs. Supports resuming from failure, batch processing by charter module or milestone, and dry-run preview.

**Announce at start:** "I'm using the adev:build skill to orchestrate a full build pipeline."

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill build
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

### Dispatch Turn Discipline

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. A task ID means the rule above was violated (or the harness backgrounded anyway): fix the dispatch and re-run synchronously rather than ending the turn on a notification that will not arrive. Ending the turn before the STEP_RESULT above is in hand is a protocol violation, not a valid pause point.

**Always pass `run_in_background: false` on the `Agent({...})` call.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context it does not re-invoke the caller, so a backgrounded dispatch stalls the pipeline (field-observed as build steps that auto-background and never return a STEP_RESULT). Synchronous dispatch returns the subagent's final report directly in the tool result, which is what the STEP_RESULT protocol below requires.

---

## Arguments

Full argument reference for every pipeline mode.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/arguments.md` for the full instructions. Do not act on this section from the summary above.

## Prerequisites

Before starting, verify all conditions. If any fails, stop and tell the user what to fix.

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec provided or discoverable.** At least one spec must be specified via `--spec` or discoverable via `--charter` or `--milestone`.
3. **Valid arguments.** If `--spec` is provided, the file must exist. If `--charter` (or `--module`) is provided, the module name must be a non-empty string and `.context-index/specs/features/<module>/` must be a directory. If `--milestone` is provided, the milestone name must be a non-empty string.

4. **Read build config.** Resolve `build.max_retries` from `user-config` (local `.context-index/user-config` → global `<PLUGIN_ROOT>/user-config` → default `0`). Use `parseUserConfig()` from `lib/persona.mjs` to read both config files. Look for the key `build.max_retries`. Clamp to range 0-3 with a warning if out of range.

5. **Read review-retry config.** Resolve `build.max_review_retries` from `manifest.yaml::build.max_review_retries` (default 2 per `lib/manifest.mjs` Task 12 of review-block-auto-retry). Set to `0` to disable the BLOCK→revise auto-retry loop entirely (sidecar+fail-loud on the first BLOCK — the legacy 7e333fd behavior). Negative values are rejected at manifest load with `INVALID_MAX_REVIEW_RETRIES`. The CLI flag `--require-human-final-pass` orthogonally requires operator sign-off when the loop converges on PASS — see the BLOCK→revise auto-retry loop documentation in Step 1 below.

If `.context-index/` does not exist, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev:init` first to set up the context index, then come back to build.

## Pipeline Modes

The mode matrix: full, single-spec, milestone, charter, workspace, resume.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline-modes.md` for the full instructions. Do not act on this section from the summary above.

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level building, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

---

## Delegation Protocol

How the orchestrator dispatches each sub-skill and what it hands over.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/delegation/delegation-protocol.md` for the full instructions. Do not act on this section from the summary above.

## One-Step-Per-Invocation Dispatch

The build orchestrator executes **exactly one pipeline step per turn**, then yields control. This is the primary structural mechanism preventing the agent from skipping steps or inlining work due to accumulated context.

### Dispatch Loop (the only thing the orchestrator does)

The full per-turn loop: pick the next step, dispatch it, record the result, stop.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/delegation/dispatch-loop.md` for the full instructions. Do not act on this section from the summary above.

### Why One Step Per Turn

This model prevents the "finish the work" failure mode where accumulated context causes the agent to skip lifecycle steps. By executing one step per turn and re-invoking with a fresh context, the orchestrator never accumulates enough context to feel compelled to shortcut. Each turn has a single, narrow task: read state, determine next step, dispatch one subagent, record result.

### Verbose Mode

Applies only when --verbose is passed: extra per-step reporting.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/verbose-mode.md` for the full instructions. Do not act on this section from the summary above.

## Build Pipeline

The orchestrator executes exactly one of these steps per invocation. After dispatch and state persistence, it re-invokes itself for the next step. See One-Step-Per-Invocation Dispatch above.

The pipeline executes 5 steps per spec, in strict order. For each step, the orchestrator: (1) checks the skip condition on artifacts, (2) calls `requireGate(state, "<prior-step>", { mode })` to enforce that the prior step actually passed, (3) dispatches a subagent via the Agent tool if not skipped, (4) reads the subagent's result, (5) checks the stop condition, and (6) persists build state.

### Gate Between Sub-Skill Dispatches

The verdict check that must pass before the next step may be dispatched.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/delegation/dispatch-gate.md` for the full instructions. Do not act on this section from the summary above.

### Step 0: Specify (Full Pipeline only)

Authors the Live Spec. Runs only in the full pipeline, and only when the spec does not already exist.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/step-0-specify.md` for the full instructions. Do not act on this section from the summary above.

### Step 1: Review

Dispatches /adev:review-specs over the target spec and gates on the returned verdict.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/step-1-review.md` for the full instructions. Do not act on this section from the summary above.

### Step 2: Plan

Dispatches /adev:plan to decompose the reviewed spec into ordered tasks.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/step-2-plan.md` for the full instructions. Do not act on this section from the summary above.

### Step 3: Route

Dispatches /adev:route to score each task and assign an execution mode.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/step-3-route.md` for the full instructions. Do not act on this section from the summary above.

### Step 4: Implement

Dispatches /adev:implement to execute the routed plan.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/step-4-implement.md` for the full instructions. Do not act on this section from the summary above.

**Rigor tier propagation:** Read `skills/build/step4-tier-propagation.md` for the `--tier` handoff to `/adev:implement`.

### Step 5: Validate

Dispatches /adev:validate and records the PASS/FAIL verdict on the build log.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/step-5-validate.md` for the full instructions. Do not act on this section from the summary above.

### Validate→Implement Retry Loop

Governs re-entry into Step 4 after a failing Step 5, including the retry ceiling.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/pipeline/validate-implement-retry.md` for the full instructions. Do not act on this section from the summary above.

## Build State

Build-orchestrator resume state is persisted via `lib/build-state.mjs`. The helper owns the on-disk shape — derived per spec, where `<slug>` comes from the spec filename (lowercase, hyphenated, without extension). Treat the helper as the source of truth; do not interact with its underlying storage directly.

### Directory Creation

The helper creates its underlying storage directory on first write. Skill prose does not need to test for existence or create directories — call `createBuildState(projectRoot, specPath, ...)` and let the helper handle filesystem setup.

### State File Format

On-disk schema of the build state file.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/build-state-format.md` for the full instructions. Do not act on this section from the summary above.

### Incremental Persistence

When and how the orchestrator flushes build state to disk.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/build-state-persistence.md` for the full instructions. Do not act on this section from the summary above.

## Resume Mode

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/resume-mode.md` for the full Resume Mode instructions.

---

## Stale Build Detection

How a resumed build decides that recorded state is too old to trust.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/stale-build-detection.md` for the full instructions. Do not act on this section from the summary above.

## Charter Mode

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/charter-mode.md` for the full Charter Mode instructions.

---

## Milestone Mode

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/milestone-mode.md` for the full Milestone Mode instructions.

---

## Workspace-Mode Build (`--milestone` at Workspace Root)

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/workspace-mode.md` for the full Workspace-Mode Build instructions.

---

## Dry Run Mode

Applies only when --dry-run is passed: prints the planned pipeline without dispatching.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/dry-run-mode.md` for the full instructions. Do not act on this section from the summary above.

## Single Spec Mode (`--spec`)

Applies only when --spec is passed: runs the pipeline against exactly one spec.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/single-spec-mode.md` for the full instructions. Do not act on this section from the summary above.

## Error Cases

Enumerated failure modes and the required orchestrator response to each.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/error-cases.md` for the full instructions. Do not act on this section from the summary above.

## Key Principles

1. **Dispatch as subagent, never inline.** Every pipeline step MUST be dispatched as a fresh subagent via the Agent tool. The subagent invokes the child skill via the Skill tool. The orchestrator never performs review, planning, routing, implementation, or validation itself — not even partially. See the Delegation Protocol section.

2. **Fail fast, retry smart, resume gracefully.** When a step fails, stop immediately for that spec, save state, and report. Exception: when `build.max_retries` in user-config is > 0 and validate fails, the orchestrator can retry the implement→validate loop with scoped failure context. Retries stop on budget exhaustion, no progress, or regression. The user can always fix issues manually and `--resume` without re-running completed steps.

3. **Incremental state persistence.** Build state is saved after every step, not just at the end. An interrupted build (network failure, timeout, user abort) always has an accurate state file.

4. **Milestone independence.** In `--milestone` mode, specs are independent units. One spec's failure does not cascade to unrelated specs. Only explicit `depends-on` relationships create blocking dependencies.

5. **Dry run is sacred.** `--dry-run` is strictly read-only. It never invokes a skill, writes a file, or modifies state. It exists to give the user confidence before committing to a potentially long build.

6. **Pipeline order is fixed.** The 5-step order (review, plan, route, implement, validate) is invariant. Steps can be skipped based on conditions, but they are never reordered.

7. **Issue board is optional.** All issue board operations are guarded by `tasks.backend` in the manifest. If unconfigured, the build runs identically but without issue tracking.

8. **One step per turn.** The orchestrator dispatches exactly one pipeline step per invocation, persists state, and re-invokes itself for the next step. It never runs two or more steps in a single turn. This prevents context accumulation from causing step-skipping. See the One-Step-Per-Invocation Dispatch section.

---

## Red Flags

**Never:**
- Execute a pipeline step directly from the orchestrator's context — every step MUST go through a subagent via the Agent tool
- Call the Skill tool directly from the orchestrator for a pipeline step — the Skill tool is called by the subagent, not the orchestrator
- Read source code, run tests, dispatch implementation subagents, or write reports from the orchestrator — these happen inside the step subagent's isolated context
- Attempt to "summarize" what a child skill does and do it yourself — each skill has dozens of substeps you cannot see from this file
- Skip the Agent tool dispatch because "it's just a small step" — even the route step (the lightest) must be a subagent to maintain the isolation guarantee
- Inline implementation work (TDD, specialist routing, review) because it "seems simpler" — the subagent handles this when it loads `/adev:implement` via the Skill tool
- Inline validation checks because it "seems faster" — the subagent runs the full 13-check suite when it loads `/adev:validate` via the Skill tool
- Modify build state for a step before the subagent has returned its result
- Continue to the next step if the subagent has not fully completed and returned its STEP_RESULT
- Parse or act on intermediate output from the subagent — only the final STEP_RESULT matters for orchestration decisions
- Introspect tool availability before dispatching — never scan the loaded tool list, the deferred-tools list, or ToolSearch results looking for "Agent" (or "Task") and self-abort based on the result. Agent is eagerly loaded and not deferred, so it is correctly absent from the deferred-tools list; that absence is NOT evidence of unavailability. Dispatch optimistically — the harness is the only authority on tool availability.
- Record a step as FAILED with error `"Agent ... not available"` or `"Task ... not available"` without first attempting an actual `Agent({...})` call and observing the harness reject it. The orchestrator must attempt the Agent call before recording any tool-unavailability failure — prose-level self-abort is a build bug, not a safe fallback. Note: there is no `Task` tool in this CLI; Agent is the only dispatcher.

## API reference

Library functions this skill wraps, for reference when reading its CLI verbs.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/api-reference.md` for the full instructions. Do not act on this section from the summary above.
