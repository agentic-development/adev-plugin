---
name: adev:implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. Use after planning to begin development. In OpenCode, invoke with skill({ name: 'adev:implement' })"
---

# Implement Plan

Execute an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD, and running 2-stage review (spec compliance then code quality) after each task.

### Dispatch Turn Discipline

**Never end your turn to wait for a dispatched subagent.** A synchronous dispatch (`run_in_background: false`) returns its final result directly in the tool call — there is nothing to wait for. If a dispatch ever returns a task ID instead of a result, that is a bug in the dispatch (the rule above was violated, or the harness backgrounded it anyway): fix the dispatch and re-run it synchronously. Do not end the turn hoping a completion notification will resume you — in a nested subagent context it will not. If this skill is itself running as a dispatched subagent (e.g., a build pipeline step), your own caller is waiting on a result contract — for build pipeline steps this is the `STEP_RESULT` format defined in `skills/build/SKILL.md`. Ending your turn without that result to report is a protocol violation, not a valid pause point.

**Always pass `run_in_background: false`.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context (implement usually runs as a build-step subagent) it does not re-invoke the caller, so a backgrounded dispatch stalls the task loop (field-observed as implement subagents that auto-background and never report a status). This applies to **every** subagent dispatch in this skill: implementer, write-test, spec reviewer, code quality reviewer, visual verifier, and final reviewer.

---

### Load Skill Extensions

**Load Skill Extensions:** After loading the spec context bundle, load any skill extension instructions:

```bash
adev skill-ext load --skill implement
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- `<plan-path>`: path to the plan file (required). Usually `.context-index/specs/features/<module>/<spec-slug>.plan.md`.
- `--task <N>`: execute only task N (useful for re-running a single task after a fix)
- `--dry-run`: show routing decisions and specialist matches without executing
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)
- `--verbose`: disable silent execution for per-task subagents. Includes `VERBOSE: true` in subagent prompts so they narrate each step. Useful for debugging task failures.
- `--parallel`: run file-disjoint task groups concurrently in adev-managed worktrees instead of strictly serially (see Step 2.5). Falls back to serial when the plan has no usable `## Parallelization` section.
- `--fresh`: with `--parallel`, on a re-run collision auto-remove the retained worktree (`adev worktree remove --force`) and proceed, instead of aborting the group with `RERUN_COLLISION`. No effect without `--parallel`.
- `--no-batch`: force solo dispatch for every task, restoring today's strict one-subagent-per-task behavior. Rejected with `CONFLICTING_BATCH_FLAGS` when combined with `--parallel` (`--parallel`'s unit of dispatch is already the group — the two flags would disagree about what "batching off" means).
- `--max-batch <n>`: per-run override of `implement.max_batch_size` (default 4). `1` is equivalent to `--no-batch`.
- `--review-cycles <n>`: per-run override of `implement.max_review_cycles` (default 3), forwarded to every `adev implement resolve-depth` call (the verb is the only validator).

## Prerequisites

Before starting, verify all five conditions. If any fails, stop and tell the user what to fix.

1. **No conflicting batch flags.** If both `--no-batch` and `--parallel` were passed to this skill invocation, stop immediately with `CONFLICTING_BATCH_FLAGS` — do not proceed to Step 1, Step 2, or Step 2.5. This check runs here, unconditionally, precisely because it must fire regardless of which of those steps the run would otherwise take: `--parallel` present routes to Step 2.5's group dispatch instead of Step 2's per-task loop, and Step 2's own "Batch resolution" paragraph (where `adev implement batches` is invoked) never executes on that path — so the flag conflict would otherwise go undetected on exactly the run where the operator most needs to hear about it. Report the same message `adev implement batches` itself would give: "`CONFLICTING_BATCH_FLAGS`: `--no-batch` and `--parallel` are mutually exclusive — `--parallel`'s unit of dispatch is already the group. Drop one flag."
2. **Plan exists.** The plan file must exist and be readable.
3. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
4. **Plan step gate.** As the FIRST action in the skill — before reading the plan file or loading context — gate on the prior step via the lifecycle log, then emit the step-started event:

   ```bash
   adev gate require --skill implement --spec <spec-path>
   adev report --type step --spec <spec-path> --step implement --status started
   ```

   In strict mode (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), `adev gate require` exits `2` if `plan` did not complete with a passing verdict — the skill stops and the operator is told which prior step is missing. In advisory mode, it emits a warning and exits `0`. Do NOT catch the failure — surface the helper's stderr unchanged. Path-containment is enforced by the helper (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`); skill prose MUST NOT pre-validate paths.

   When all tasks finish in Step 4, emit the matching exit event with an explicit `--verdict PASS`. Downstream gates (`/adev:validate::adev gate require`) require the prior step to have completed with a passing verdict; omitting it forces the operator to re-emit the event manually. This point is only reached after all tasks completed and the GREEN-phase gate fired, so success here implies PASS. Failures after that gate emit `--status failed` instead — see "Failure-path exit event" below.

   ```bash
   adev report --type step --spec <spec-path> --step implement --status completed --verdict PASS --from-summary
   ```

   **Failure-path exit event.** Whenever the skill stops after the `--status started` event above without reaching the exit event, emit the terminal event before surfacing the error to the operator:

   ```bash
   adev report --type step --spec <spec-path> --step implement --status failed --verdict FAIL
   ```

   `--verdict FAIL` is required, not decorative — a `step_failed` without one is overwritten by the verdict synthesized from the actor reports on the log, so a run that died partway projects as passing and opens the `validate` gate on unfinished work. For the enumerated abort paths that MUST emit it, follow `references/failure-path-exit-event.md` in this skill directory.

   **Already covered — do not double-emit.** Per-task escalations terminate through the Step 2d blocker path (`plan_task` `blocked`): the blocker-flag protocol, `MISSING_DEPTH_ASSIGNMENT`, and `LOOP_BUDGET_EXHAUSTED` / `LOOP_NO_PROGRESS` / `LOOP_REGRESSED`. Emit the step-level failed event only when the *whole skill* stops.

   **Known gap:** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot ride on the event. Name it in operator-facing output instead.
5. **Working branch.** The current git branch must not be main or master. If it is, stop and ask the user to create a feature branch following the naming convention in `manifest.yaml` (default: `<type>/<module>/<short-description>`, e.g. `feat/auth/login-flow`).

## Process

### Step 1: Load Context

Loads plan, spec, charter, heuristics, and the shared-helper inventory before the first task.

> **Conditional loading:** Read `skills/implement/references/steps/step-1-load-context.md` for the full instructions. Do not act on this section from the summary above.

### Task discovery and state

How tasks are discovered from the plan and how their state is tracked.

> **Conditional loading:** Read `skills/implement/references/task-discovery-and-state.md` for the full instructions. Do not act on this section from the summary above.

### Task transitions

Legal task state transitions and the events each one emits.

> **Conditional loading:** Read `skills/implement/references/task-transitions.md` for the full instructions. Do not act on this section from the summary above.

## Repo-Mode-Inside-Workspace Advisory

The one-line advisory printed when running repo-scoped inside a workspace.

> **Conditional loading:** Read `skills/implement/references/repo-mode-advisory.md` for the full instructions. Do not act on this section from the summary above.

## Step 5: Update Spec Status and Source Manifest

Writes the spec status transition and refreshes the source manifest.

> **Conditional loading:** Read `skills/implement/references/steps/step-5-spec-status-and-manifest.md` for the full instructions. Do not act on this section from the summary above.

## Step 5.5: Commit Trailers

When committing implementation work, include structured trailers in commit messages for traceability:

```
feat(<module>): implement <description>

Spec: .context-index/specs/features/<module>/<spec-slug>.spec.md
Plan-task: <task-number>
Session: <session-id or timestamp>
```

These trailers enable `/adev:retro` and `/adev:hygiene` to trace commits back to specs and tasks.

## Step 6: Feature Completeness Definition of Done

The completeness bar a feature must clear before implement may report done.

> **Conditional loading:** Read `skills/implement/references/steps/step-6-definition-of-done.md` for the full instructions. Do not act on this section from the summary above.

## Red Flags

**Never:**
- Start implementation on main/master without explicit user consent
- Skip either review stage (spec compliance AND code quality are both required)
- Dispatch multiple implementation subagents in parallel (they will conflict on files)
- Make a subagent read the plan file (provide full text in the prompt)
- Proceed with unfixed Critical or Important issues from any review
- Ignore subagent questions (answer before letting them proceed)
- Accept "close enough" on spec compliance (issues found means not done)
- Start code quality review before spec compliance passes (wrong order)
- Move to the next task while either review has open issues
- Re-dispatch a BLOCKED subagent without changing something
- Skip TDD for any task (RED-GREEN-REFACTOR, no exceptions)
- Loosen a test assertion to make it pass (fix the code, not the test)
- Add conditional skip logic to tests (`if visible`, `try/catch`, `>= 0`)
- Change a test without first investigating the actual behavior (screenshot, DOM, logs)
- Propose a fix for a test failure without checking the spec and charter first
- Write tests that assert on runtime data without setting up deterministic seed values
- Skip visual verification for UI tasks (block and require Playwright MCP)
- Proceed with UI tasks when Playwright MCP is not available (stop, do not fall back to code-only review)
- Let implementer self-review replace actual review (both are required)
- Merge to a protected branch (main, master, or any branch listed in completion.protected_branches)
- Push directly to a protected branch without opening a PR
- Ignore merge_policy from manifest.yaml (default is "pr": never merge without explicit configuration)

## API reference

Library functions this skill wraps, for reference when reading its CLI verbs.

> **Conditional loading:** Read `skills/implement/references/api-reference.md` for the full instructions. Do not act on this section from the summary above.

## Next Step in the Lifecycle

Implementation complete. The next step is **`/adev:validate`** — post-implementation checks against the spec and constitution.

If invoked via `/adev:work`, offer to continue: *"Implementation done. Continue to `/adev:validate`?"* The user can stop here.
