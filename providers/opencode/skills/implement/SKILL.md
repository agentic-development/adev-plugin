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

Extract everything subagents will need so they never have to re-read these files themselves.

**Optimization:** Load spec + charter + constitution + plan progress in a single Bash call via the CLI (replaces items 2, 4, and 5 below with one turn):

```bash
adev context load --spec <spec-path> --plan <plan-path>
```

The verb wraps `lib/meta-tools.mjs::loadSpecContext` + `getPlanProgress` and emits JSON `{ context, progress }`. Use `progress` for resume detection (look at `progress.completed` vs `progress.total` and the per-task `progress.tasks` array).

If the CLI call fails, fall back to reading each file individually.

**Load Skill Extensions:** After loading the spec context bundle, load any skill extension instructions:

```bash
adev skill-ext load --skill implement
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

1. The plan file. Extract every task with its full text, file lists, dependencies, and specialist hints.
2. `.context-index/constitution.md`. Extract the Non-Negotiable Principles, Coding Standards, Architecture Boundaries, and Quality Gates sections.
3. `.context-index/manifest.yaml`. Extract the `specialists` registry.
4. The Live Spec referenced by the plan. Extract acceptance criteria and behavioral contract.
5. The Feature Charter referenced by the plan. Extract scope boundaries.
6. Any cross-cutting specs or ADRs listed in the plan's context routing section.
7. **Boundary rules:** If `.context-index/governance/boundaries.yaml` exists, read it.
   Pass boundary rules to implementer subagents as additional constraints in prompt section 2
   (alongside constitution excerpt). If it does not exist, skip.
8. **Routing decisions:** Routing decisions for each task live in the
   sibling sidecar file `<plan-stem>.routing.json`, written by `/adev:route`.
   The plan markdown body is NOT a source of routing state — `**Routing:**`
   blocks in the plan body are forbidden by CON-8 and ignored by this skill
   (and flagged by `lib/plan-immutability.mjs` as
   `PLAN_MUTATED_WITHOUT_SIDECAR`).

   For each task, resolve routing via the CLI verb at dispatch time
   (Step 2a — Context Packet Assembly):

   ```bash
   adev implement read-routing --plan <plan-path> --task-id <task-id> [--agents-allowlist <csv>]
   ```

   The verb prints the routing entry as JSON on stdout on success. On
   failure, it exits non-zero and writes a typed error code to stderr.
   Handle each error code as follows:

   | Exit | Code                       | Action                                                                                |
   |------|----------------------------|---------------------------------------------------------------------------------------|
   | 0    | (success)                  | Parse JSON; dispatch using `selected_agent`                                           |
   | 2    | `ROUTING_SIDECAR_MISSING`  | Stop the skill. Instruct the operator to run `/adev:route --plan <path>` and re-invoke `/adev:implement`. Do NOT silently fall back to inline parsing or default routing. |
   | 3    | `ROUTING_ENTRY_MISSING`    | Stop for this task. Instruct the operator to re-run `/adev:route` (plan grew tasks since the last route) and re-invoke `/adev:implement --task <N>`.                     |
   | 4    | `ROUTING_AGENT_INVALID`    | Stop for this task. The sidecar names an agent slug not in the allowlist (passed via `--agents-allowlist`). Instruct the operator to re-run `/adev:route` after fixing manifest specialists.                              |
   | 1    | `INVALID_PLAN_PATH`        | Argument bug — surface immediately; do not retry.                                     |

   If the sidecar is absent entirely, no fallback to inline parsing or
   default routing is permitted. The skill stops and surfaces the error.
9. **Completion policy:** Read `completion.merge_policy` from manifest.yaml (default: "pr").
   Read `completion.protected_branches` (default: ["main", "master"]).
10. **Model tier resolution:** Read `model_tiers` from `.context-index/platform-context.yaml`.
    All subagent dispatches in this skill use the `capable` tier (implementer, spec reviewer, code quality reviewer, visual verifier).
    If `model_tiers` is absent or a tier is unset, use the hardcoded defaults from `.context-index/specs/cross-cutting/model-routing.md` and log a one-time advisory.
11. **Heuristics:** Load module-scoped heuristics for injection into context packets via the CLI:

    ```bash
    adev heuristics retrieve --module <charter-module> [--injection-limit N]
    ```

    Derive the module slug from the plan's spec `charter:` frontmatter field. Pass `--injection-limit` only when `heuristics.injection_limit` is configured in `manifest.yaml` (otherwise omit for the library default).
    Stdout is a single JSON object `{count, rendered}` where `rendered` is the markdown blocks joined by blank lines. The verb exits 0 regardless — failures degrade to `{count:0, rendered:""}` so heuristic injection stays strictly non-blocking.
    Store the `rendered` output for use in Step 2a.

Write the active plan path to `.context-index/hygiene/.active-plan` so the scope guard hook can monitor file scope during implementation. Clear this file in Step 4 (Completion).

**Execution State Check:** Read `.context-index/.execution-state.json` via `readExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs`. Do NOT hand-parse the JSON or any prior YAML frontmatter — call the library helper:

```javascript
import { readExecutionState } from '<ADEV_ROOT>/lib/execution-state.mjs';
const exec = readExecutionState(projectRoot);
```

If `exec.status === "active"`, resume from `exec.currentTask` instead of task 1. If `exec.status === "blocked"`, surface `exec.blockers` to the user and suggest running `/adev:recover` before continuing. If the state is missing or `status === "idle"`, start from task 1 as normal.

**Update charter Capability Map:** At the start of implementation, read the parent charter and update the Capability Map. For each capability covered by this plan, set its `Status` column to `implementing`.

**Load or create epic on the issue board:** Read `tasks.backend` from `manifest.yaml`. If configured:
- If an epic exists matching this plan's `planRef`, load it.
- If no epic exists, create one via `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })`. The epic is the **only** board entry created here — per-task Issue creation is forbidden by the board-granularity invariant (see `agent-reliable-state-artifacts/charter.md`).
- **Do NOT call `create({ ..., planTask: ... })`.** Plan-task state lives in the lifecycle log, not as Issues on the board. The `JsonAdapter` rejects such calls with `BOARD_GRANULARITY_VIOLATION`.

If `tasks.backend` is not configured, skip epic creation entirely (plan-task events are still emitted to the lifecycle log).

**Claim the epic before dispatching any task.** The board is the only store shared across every worktree of a repo (`lib/issues/resolve-root.mjs` resolves it to the main checkout), so it is the only place a concurrent session's work is visible without a network round-trip. Claim through the CLI — never set `owner` or `claimed_at` by hand, because the check-and-set only holds inside the adapter's CAS loop:

```bash
adev issues claim <epic-id> --owner "${USER}/local" --branch "$(git branch --show-current)"
```

The exit code is the gate, on the same discipline as `requireGate`:

- **`0`** — the claim is yours. Re-claiming as the same owner is idempotent and preserves the original `claimed_at`, so a resumed session is not penalized. Exit `0` may also mean you **inherited an expired lease**: claims expire after `tasks.claim_ttl_minutes` (default 240), and a stale one is taken over automatically. When that happens the result carries a `takeover` block naming the displaced owner — surface it, because that owner may still believe the work is theirs.
- **`2`** — **refused.** The epic is held by a different owner whose lease is still **live**, or is closed. **STOP. Do not dispatch a single task.** Report the holding `owner` and `claimed_at` to the user and let them choose: take over (`adev issues release <epic-id> --owner <holder> --force`, then re-claim) or work elsewhere. Never force a live claim over autonomously — that is another agent's in-flight work, and this refusal is the whole point of the gate. Expired leases are a different case and are handled at exit `0`.
- **`1`** — usage error, unknown issue, or `CLAIM_UNSUPPORTED_BACKEND` (a backend with no atomic write). Warn and continue: a non-atomic backend cannot offer the guarantee, and blocking on it would train operators to bypass the gate.

Owner identity follows the provenance convention the commit hooks already use — `<os-user>/local`, or `<os-user>/remote` when `CLAUDE_CODE_REMOTE=true`. `ADEV_ISSUE_OWNER` overrides it when a runner sets it once per session.

If `tasks.backend` is not configured, skip the claim.

### Task discovery and state

How tasks are discovered from the plan and how their state is tracked.

> **Conditional loading:** Read `skills/implement/references/task-discovery-and-state.md` for the full instructions. Do not act on this section from the summary above.

### Task transitions

Legal task state transitions and the events each one emits.

> **Conditional loading:** Read `skills/implement/references/task-transitions.md` for the full instructions. Do not act on this section from the summary above.

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level orchestration, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns null.

### Step 1.5: Infrastructure Preflight

Runs only when the spec or plan declares infra_requirements.

> **Conditional loading:** Read `skills/implement/references/steps/step-1.5-infra-preflight.md` for the full instructions. Do not act on this section from the summary above.

### Step 1.6: Progress Tracking (Claude Code)

Harness-specific progress reporting during a long implement run.

> **Conditional loading:** Read `skills/implement/references/steps/step-1.6-progress-tracking.md` for the full instructions. Do not act on this section from the summary above.

### Step 2: Per-Task Execution Loop

The core loop: for each routed task, dispatch write-test then implement, then run the two review stages.

> **Conditional loading:** Read `skills/implement/references/steps/step-2-per-task-loop.md` for the full instructions. Do not act on this section from the summary above.

### Step 2.5: Parallel Group Execution

> **Conditional loading:** Read `skills/implement/references/parallel-mode.md` for the full Parallel Group Execution instructions.
> Load it only when `--parallel` is passed; it is not needed on a serial run.

### Step 2-post: Integration Gate

> **Conditional loading:** Read `skills/implement/references/integration-gate.md` for the full Integration Gate instructions.
> Load it only when the plan declares integration-tier gates; it is not needed on a serial run.

### Step 3: Final Review

The whole-plan review that runs once every task has completed.

> **Conditional loading:** Read `skills/implement/references/steps/step-3-final-review.md` for the full instructions. Do not act on this section from the summary above.

### Step 4: Completion

Closing actions once the final review passes.

> **Conditional loading:** Read `skills/implement/references/steps/step-4-completion.md` for the full instructions. Do not act on this section from the summary above.

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
