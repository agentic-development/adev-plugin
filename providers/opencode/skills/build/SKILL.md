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

- `--spec <path>`: build a single spec end-to-end through all pipeline steps
- `--charter <module>`: discover and build all specs under `.context-index/specs/features/<module>/`
- `--module <module>`: alias for `--charter`
- `--milestone <name>`: discover and build all specs with matching `milestone` frontmatter
- `--resume`: resume an interrupted build from the last successful step
- `--dry-run`: show the pipeline plan without executing any skill or writing any file
- `--no-route`: skip the route step (Step 3) in the pipeline
- `--full`: run the Full Pipeline (specify → review → plan → route → implement → validate). Without `--full`, the default Implement Pipeline skips specify and review and requires a pre-existing `.review.md`.
- `--from <step>`: override resume point — force restart from a specific step (`specify`, `review`, `plan`, `route`, `implement`, `validate`). Useful if build state is corrupted or stale.
- `--no-infra`: skip infrastructure preflight in implement and validate steps (user-only — the agent must never set this flag). Propagated to sub-skills via `ADEV_NO_INFRA=1` env var.
- `--verbose`: disable silent execution for all subagents in this pipeline run. Subagent prompts include `VERBOSE: true`, causing skills to narrate each step. Useful for debugging pipeline failures.
- `--auto`: run the entire pipeline without prompting the user for input. Stale builds are overwritten (not prompted). Subagent prompts include `AUTO: true`, instructing sub-skills to make autonomous decisions instead of asking the user (e.g., accept default choices, skip confirmations). The build stops on errors rather than asking for guidance. Useful for CI, scheduled builds, and batch operations.
- `--require-human-final-pass`: hybrid-mode gate added by the `review-block-auto-retry` spec. When the BLOCK→revise loop converges on PASS at revision N+1, the build halts with verdict `PASS_PENDING_HUMAN` instead of proceeding. A `human_approval_required` lifecycle event is emitted. The operator runs `/adev:build --resume --spec <spec>` to acknowledge the final revision and continue to plan/implement. Use in risk-averse domains where auto-revised specs require human sign-off before downstream work.
- `--tier <full|quick>`: rigor tier (graduated-rigor-tiers spec). When provided, propagated to the `/adev:review-specs --tier <t>` dispatch in Step 1 and the `/adev:validate --tier <t>` dispatch in Step 5. When absent, each of those steps resolves its own rigor tier via the routing signal / risk policy / default `full` precedence described in `graduated-rigor-tiers.spec.md` — the build orchestrator does not resolve or default this value itself. Invalid values surface as `INVALID_TIER` from whichever step first attempts resolution. **Not the same as gate tiers.** This is the rigor tier (`full`/`quick`) that governs review/validate depth — do not confuse it with the *gate* tiers (`fast`/`integration`/`e2e`) that Check 1 of `/adev:validate` groups quality gates into (see the Dry Run Mode gate-tier summary below); the two are unrelated concepts that happen to share the word "tier".

## Prerequisites

Preconditions checked once, before the first dispatch of a build.

> **Conditional loading:** Read `skills/build/references/prerequisites.md` for the full instructions. Do not act on this section from the summary above.

## Pipeline Modes

**Implement Pipeline** (default, no `--full`): `plan → route → implement → validate`

Use when the spec already exists with a valid `.review.md` (PASS or PASS_WITH_NOTES verdict). Skips specify and review. If no `.review.md` is found, the skill warns and stops. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Full Pipeline** (`--full`): `specify → review (BLOCK → /adev:specify --revise loop, up to build.max_review_retries cycles) → plan → route → implement → validate`

Use when starting from scratch or when the spec needs authoring. Step 0 dispatches `/adev:specify` only when no spec file exists AND the lifecycle log has no completed `specify` event for this spec; otherwise Step 0 is recorded as `skipped` (the prior session's spec work is authoritative — `review-specs` and downstream gates catch any drift). Step 1 runs `/adev:review-specs`; on BLOCK with `build.max_review_retries > 0`, the build dispatches the BLOCK→revise auto-retry loop documented under "Blocker handling" below — `/adev:specify --revise <spec>` re-authors the spec, `/adev:review-specs` re-evaluates, and the convergence detector (`lib/loop-convergence.mjs`) decides PASS / CONTINUE / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED. With `--require-human-final-pass`, a PASS verdict halts the build at `PASS_PENDING_HUMAN` for operator acknowledgement. Includes the validate→implement retry loop if `build.max_retries > 0`.

**Model:** The build orchestrator carries no `model:` frontmatter pin — it runs on the session's active model (the hardcode was removed in `42294cf7`/`170f8837`; no spec tracks that key). Its own work is mechanical (gate-check, dispatch, record); a cheaper model there was floated in the 2026-05-16 validation-charter retro (Opus was ~5x Sonnet's cost on cache reads) but isn't enforced. Worker skills resolve their own tier from `platform-context.yaml:model_tiers` (see `.context-index/specs/cross-cutting/model-routing.spec.md`). Config-driven binding via `/adev:sync` is tracked by `issue-538`.

---

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level building, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns `null`.

---

## Delegation Protocol

**This is the most important section of this skill.**

The build orchestrator is a coordinator. It decides *which* skill to run next, checks skip/stop conditions on artifacts, persists build state, and reports progress. It does NOT perform review, planning, routing, implementation, or validation itself — not even partially.

### Subagent Dispatch Model

**Every pipeline step MUST be dispatched as a fresh subagent using the Agent tool.** Each subagent gets a clean context with no prior knowledge of the build pipeline, and its prompt instructs it to invoke the target skill via the Skill tool. This provides two guarantees:

1. **No pseudo-invocation.** A fresh subagent has no "knowledge" of what the child skill does. It must load the full SKILL.md via the Skill tool to execute it. It cannot summarize or shortcut.
2. **Context isolation.** Each pipeline step runs in its own context. A 200K-token implement step does not pollute the orchestrator's context. The orchestrator only sees the result summary.

### Dispatch Optimism (Tool Availability)

**Dispatch optimistically. Do not introspect tool availability before calling Agent.** The harness is the only authority on whether a tool exists — call `Agent(...)` and let it return either a result or a harness-level rejection. There is no other valid signal of unavailability.

In particular:

- **`Agent` is the only dispatcher** in this CLI. The name `Task` appears in some Anthropic SDK docs but is NOT a tool name in Claude Code — there is no `Task` tool to look for. Searching for "Task" will always return nothing and is meaningless.
- **`Agent` is eagerly loaded, not deferred.** It is declared in the top-level `<functions>` block of every orchestrator session, not in the deferred-tools list and not via ToolSearch. Its absence from the deferred-tools list is NOT evidence of unavailability — it is the expected state.
- **ToolSearch only enumerates deferred tools.** Running `ToolSearch` with query `select:Agent` or keyword `agent` will correctly return zero matches even when Agent is available, because Agent is not deferred. Do not interpret an empty ToolSearch result as proof of absence.
- **The harness is the only authority.** If — and only if — an attempted `Agent({...})` call returns a harness-level error indicating the tool does not exist, may the orchestrator record the step as FAILED with an unavailability reason. You must attempt the Agent call before recording any such failure. Self-aborting at the prose level (i.e., refusing to dispatch because you "couldn't find Agent in the tool list") is a build bug, not a safe fallback.

### Context Packet Assembly

How the orchestrator assembles the context packet that accompanies a dispatch.

> **Conditional loading:** Read `skills/build/references/delegation/context-packet-assembly.md` for the full instructions. Do not act on this section from the summary above.

### Subagent Prompt Template

The verbatim prompt skeleton handed to each dispatched sub-skill.

> **Conditional loading:** Read `skills/build/references/delegation/subagent-prompt-template.md` for the full instructions. Do not act on this section from the summary above.

### What the Orchestrator Does Directly

The short list of work the orchestrator performs itself instead of delegating.

> **Conditional loading:** Read `skills/build/references/delegation/orchestrator-direct-work.md` for the full instructions. Do not act on this section from the summary above.

## One-Step-Per-Invocation Dispatch

The build orchestrator executes **exactly one pipeline step per turn**, then yields control. This is the primary structural mechanism preventing the agent from skipping steps or inlining work due to accumulated context.

### Dispatch Loop (the only thing the orchestrator does)

The full per-turn loop: pick the next step, dispatch it, record the result, stop.

> **Conditional loading:** Read `skills/build/references/delegation/dispatch-loop.md` for the full instructions. Do not act on this section from the summary above.

### Why One Step Per Turn

This model prevents the "finish the work" failure mode where accumulated context causes the agent to skip lifecycle steps. By executing one step per turn and re-invoking with a fresh context, the orchestrator never accumulates enough context to feel compelled to shortcut. Each turn has a single, narrow task: read state, determine next step, dispatch one subagent, record result.

### Verbose Mode

Applies only when --verbose is passed: extra per-step reporting.

> **Conditional loading:** Read `skills/build/references/verbose-mode.md` for the full instructions. Do not act on this section from the summary above.

## Build Pipeline

The orchestrator executes exactly one of these steps per invocation. After dispatch and state persistence, it re-invokes itself for the next step. See One-Step-Per-Invocation Dispatch above.

The pipeline executes 5 steps per spec, in strict order. For each step, the orchestrator: (1) checks the skip condition on artifacts, (2) calls `requireGate(state, "<prior-step>", { mode })` to enforce that the prior step actually passed, (3) dispatches a subagent via the Agent tool if not skipped, (4) reads the subagent's result, (5) checks the stop condition, and (6) persists build state.

### Gate Between Sub-Skill Dispatches

The verdict check that must pass before the next step may be dispatched.

> **Conditional loading:** Read `skills/build/references/delegation/dispatch-gate.md` for the full instructions. Do not act on this section from the summary above.

### Step 0: Specify (Full Pipeline only)

Authors the Live Spec. Runs only in the full pipeline, and only when the spec does not already exist.

> **Conditional loading:** Read `skills/build/references/pipeline/step-0-specify.md` for the full instructions. Do not act on this section from the summary above.

### Step 1: Review

Dispatches /adev:review-specs over the target spec and gates on the returned verdict.

> **Conditional loading:** Read `skills/build/references/pipeline/step-1-review.md` for the full instructions. Do not act on this section from the summary above.

### Step 2: Plan

Dispatches /adev:plan to decompose the reviewed spec into ordered tasks.

> **Conditional loading:** Read `skills/build/references/pipeline/step-2-plan.md` for the full instructions. Do not act on this section from the summary above.

### Step 3: Route

Dispatches /adev:route to score each task and assign an execution mode.

> **Conditional loading:** Read `skills/build/references/pipeline/step-3-route.md` for the full instructions. Do not act on this section from the summary above.

### Step 4: Implement

Dispatches /adev:implement to execute the routed plan.

> **Conditional loading:** Read `skills/build/references/pipeline/step-4-implement.md` for the full instructions. Do not act on this section from the summary above.

**Rigor tier propagation:** Read `skills/build/step4-tier-propagation.md` for the `--tier` handoff to `/adev:implement`.

### Step 5: Validate

Dispatches /adev:validate and records the PASS/FAIL verdict on the build log.

> **Conditional loading:** Read `skills/build/references/pipeline/step-5-validate.md` for the full instructions. Do not act on this section from the summary above.

### Validate→Implement Retry Loop

Governs re-entry into Step 4 after a failing Step 5, including the retry ceiling.

> **Conditional loading:** Read `skills/build/references/pipeline/validate-implement-retry.md` for the full instructions. Do not act on this section from the summary above.

## Build State

Build-orchestrator resume state is persisted via `lib/build-state.mjs`. The helper owns the on-disk shape — derived per spec, where `<slug>` comes from the spec filename (lowercase, hyphenated, without extension). Treat the helper as the source of truth; do not interact with its underlying storage directly.

### Directory Creation

The helper creates its underlying storage directory on first write. Skill prose does not need to test for existence or create directories — call `createBuildState(projectRoot, specPath, ...)` and let the helper handle filesystem setup.

### State File Format

On-disk schema of the build state file.

> **Conditional loading:** Read `skills/build/references/build-state-format.md` for the full instructions. Do not act on this section from the summary above.

### Incremental Persistence

When and how the orchestrator flushes build state to disk.

> **Conditional loading:** Read `skills/build/references/build-state-persistence.md` for the full instructions. Do not act on this section from the summary above.

## Resume Mode

> **Conditional loading:** Read `skills/build/references/resume-mode.md` for the full Resume Mode instructions.

---

## Stale Build Detection

How a resumed build decides that recorded state is too old to trust.

> **Conditional loading:** Read `skills/build/references/stale-build-detection.md` for the full instructions. Do not act on this section from the summary above.

## Charter Mode

> **Conditional loading:** Read `skills/build/references/charter-mode.md` for the full Charter Mode instructions.

---

## Milestone Mode

> **Conditional loading:** Read `skills/build/references/milestone-mode.md` for the full Milestone Mode instructions.

---

## Workspace-Mode Build (`--milestone` at Workspace Root)

> **Conditional loading:** Read `skills/build/references/workspace-mode.md` for the full Workspace-Mode Build instructions.

---

## Dry Run Mode

Applies only when --dry-run is passed: prints the planned pipeline without dispatching.

> **Conditional loading:** Read `skills/build/references/dry-run-mode.md` for the full instructions. Do not act on this section from the summary above.

## Single Spec Mode (`--spec`)

Applies only when --spec is passed: runs the pipeline against exactly one spec.

> **Conditional loading:** Read `skills/build/references/single-spec-mode.md` for the full instructions. Do not act on this section from the summary above.

## Error Cases

Enumerated failure modes and the required orchestrator response to each.

> **Conditional loading:** Read `skills/build/references/error-cases.md` for the full instructions. Do not act on this section from the summary above.

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

> **Conditional loading:** Read `skills/build/references/api-reference.md` for the full instructions. Do not act on this section from the summary above.
