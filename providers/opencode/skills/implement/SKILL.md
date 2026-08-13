---
name: adev:implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. Use after planning to begin development. In OpenCode, invoke with skill({ name: 'adev:implement' })"
---

# Implement Plan

Execute an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD, and running 2-stage review (spec compliance then code quality) after each task.

## Arguments

- `<plan-path>`: path to the plan file (required). Usually `.context-index/specs/features/<module>/<spec-slug>.plan.md`.
- `--task <N>`: execute only task N (useful for re-running a single task after a fix)
- `--dry-run`: show routing decisions and specialist matches without executing
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)
- `--verbose`: disable silent execution for per-task subagents. Includes `VERBOSE: true` in subagent prompts so they narrate each step. Useful for debugging task failures.
- `--parallel`: run file-disjoint task groups concurrently in adev-managed worktrees instead of strictly serially (see Step 2.5). Falls back to serial when the plan has no usable `## Parallelization` section.
- `--fresh`: with `--parallel`, on a re-run collision auto-remove the retained worktree (`adev worktree remove --force`) and proceed, instead of aborting the group with `RERUN_COLLISION`. No effect without `--parallel`.

## Prerequisites

Before starting, verify all four conditions. If any fails, stop and tell the user what to fix.

1. **Plan exists.** The plan file must exist and be readable.
2. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
3. **Plan step gate.** As the FIRST action in the skill — before reading the plan file or loading context — gate on the prior step via the lifecycle log, then emit the step-started event:

   ```bash
   adev gate require --skill implement --spec <spec-path>
   adev report --type step --spec <spec-path> --step implement --status started
   ```

   In strict mode (default — resolved from `manifest.yaml`'s `lifecycle.gate_mode`), `adev gate require` exits `2` if `plan` did not complete with a passing verdict — the skill stops and the operator is told which prior step is missing. In advisory mode, it emits a warning and exits `0`. Do NOT catch the failure — surface the helper's stderr unchanged. Path-containment is enforced by the helper (`INVALID_PROJECT_ROOT` / `INVALID_SPEC_PATH`); skill prose MUST NOT pre-validate paths.

   When all tasks finish in Step 4, emit the matching exit event with an explicit `--verdict PASS`. Downstream gates (`/adev:validate::adev gate require`) require the prior step to have completed with a passing verdict; omitting it forces the operator to re-emit the event manually. The `implement` step only reaches this emission point after all tasks completed and the GREEN-phase gate fired in Step 4; success at this stage implies PASS. (Failure modes earlier in the skill emit `status: failed` separately and do not reach this line.)

   ```bash
   adev report --type step --spec <spec-path> --step implement --status completed --verdict PASS --from-summary
   ```
4. **Working branch.** The current git branch must not be main or master. If it is, stop and ask the user to create a feature branch following the naming convention in `manifest.yaml` (default: `<type>/<module>/<short-description>`, e.g. `feat/auth/login-flow`).

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

### Task discovery and state

The plan file is the source of truth for *what the tasks are*. The lifecycle log projection is the source of truth for *what state each task is in*.

```javascript
import { currentState, reportPlanTask } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

const state = currentState(projectRoot, specPath);
// planTasks shape: { [task_id]: { status, notes, plan, updated } }
//
// `/adev:plan` seeds one `pending` event per task at authoring time, so every
// task in the plan should already appear here. If a task is missing from the
// projection, the plan was authored before this surface was migrated — fall
// back to treating it as `pending`.
const nextTask = plan.tasks.find(t =>
  state.planTasks[t.id]?.status === 'pending' ||
  state.planTasks[t.id]?.status === 'in_progress' ||
  state.planTasks[t.id] === undefined
);
```

### Task transitions

All state transitions go through `reportPlanTask`. The plan file is read-only after authoring — no checkbox flips, no inline state stamps, no per-task Issue updates.

```javascript
// At task start (before dispatching the implementer subagent):
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'in_progress', notes: null,
});

// At task done (after GREEN + REFACTOR + both reviews pass):
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'done',
  notes: '<optional ≤200-char summary or null>',
});

// On a blocker the skill cannot resolve:
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'blocked',
  notes: '<≤200-char operator-facing summary — no stack traces, no env values, no full command output>',
});

// On a user-declined optional task (e.g., user skips a REFACTOR-only task):
reportPlanTask(projectRoot, specPath, {
  plan: planFilePath, task_id, status: 'skipped', notes: null,
});
```

**Blocker notes guidance:** Blocker `notes` must be a short operator-facing summary. Do not paste stack traces, env values, secrets, or full command output. The foundation caps `notes` at 4 KB but operators need a one-line description, not a dump.

12. **Workspace detection:** Call `detectWorkspace(cwd)` and store the returned workspace state for use in Steps 2a and 2c. Workspace detection is re-run fresh per task as defensive hygiene (ensures state is current if workspace config changed during a long implementation session), not as concurrency support. If `detectWorkspace` returns `null`, proceed with the existing single-repo flow unchanged.

## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level orchestration, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns null.

### Step 1.5: Infrastructure Preflight

After loading context, check whether the spec or plan declares `infra_requirements`. If so, run the infrastructure preflight.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> --plan <planPath> [--timeout N] [--no-infra]
```

Where `<specPath>` is extracted from the plan's `Spec:` header and `<planPath>` is the `<plan-path>` argument. Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

Parse the JSON output. If `report.passed === false`, display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
  3. Use --task N to run only tasks that don't need this infrastructure
```

Option 3 is shown only when the plan has mixed strategies (some unit, some non-unit). Omit it when all tasks require the failed infrastructure.

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

If `runPreflight()` throws `PREFLIGHT_FILE_NOT_FOUND` or `PREFLIGHT_PARSE_ERROR`, block with the error message.

### Step 1.6: Progress Tracking (Claude Code)

If the `TaskCreate` tool is available (Claude Code environment), create a tracking task for each plan task to provide real-time progress visibility to the user:

```
For each task N in the plan:
  TaskCreate({ title: "Task N: <task-title>", status: "pending" })
```

This creates a visual task list in the Claude Code UI that the user can monitor at a glance.

**If `TaskCreate` is not available** (non-Claude-Code environment — e.g., Cursor, OpenCode), skip this step entirely. Progress is reported via text output as before. Do not error or warn.

**Per-task updates (during Step 2 loop):**
- When starting a task: `TaskUpdate(taskId, { status: "in_progress" })`
- When a task passes review: `TaskUpdate(taskId, { status: "completed" })`
- When a task fails or is blocked: `TaskUpdate(taskId, { status: "failed" })`
- When a task is skipped (already implemented): `TaskUpdate(taskId, { status: "completed" })`

**Cleanup:** After all tasks complete (Step 4: Completion), do not delete the tasks — leave them visible so the user can review the final state.

### Step 2: Per-Task Execution Loop

For each task in dependency order:

#### 2.pre: Implementation Probe

Before dispatching a subagent, check if the task's target files already exist and may be already implemented:

1. Read the task's file list from the plan (Create + Modify + Test files).
2. Check if all listed files already exist on disk.
3. If all files exist AND test files are present:
   - Run the test files: `node --test <test-file>`.
   - If tests pass: the task is likely already implemented.
   - Report: "Task <N> appears already implemented — <file-list> exist and tests pass."
   - Ask the user: "Skip this task and mark it as done with 'Already implemented'?"
   - If user confirms: emit `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "done", notes: "Already implemented (detected by implementation probe)" })`, skip to next task.
   - If user declines: proceed with normal dispatch.
4. If files exist but tests fail (or no test files): proceed with normal dispatch (code exists but may be incomplete).
5. If files don't exist: proceed with normal dispatch (standard case).

This probe prevents re-implementing work that was done outside the lifecycle or in a previous session.

#### 2a. Context Packet Assembly

Before routing or dispatching, assemble the task's context packet:

1. Read the task's `context_packet` section from the plan (if present).
2. For each listed file, read and extract the relevant section. **Source-manifest-guided loading:** When the spec has `source-manifest.files[]`, prioritize those files — read the primary implementation file in full, read test files and siblings as signatures only (`grep "^export"`). This provides targeted context without loading everything.
3. Write the assembled packet to `.context-index/packets/<task-slug>.md` (gitignored). This log enables post-mortem debugging via `/adev:recover`.
4. If no context_packet section exists in the plan, assemble a default packet from: constitution excerpt, spec acceptance criteria for this task, charter capability, and any samples matching the task's file patterns. If the spec has `source-manifest.files[]`, include those as the primary context source.
5. **Heuristics injection:** If heuristics were loaded in Step 1 (count > 0), append a `## Heuristics` section to the context packet with the rendered blocks from Step 1. Prefix the section with the advisory preamble:

   > The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

   All tasks in the same plan receive the same heuristic set. If no heuristics are available, omit this section entirely — do not emit an empty placeholder.

6. **Cross-repo reference resolution (workspace mode only):** If workspace state is non-null (from Step 1, item 12), parse the Live Spec's `depends-on` frontmatter for entries matching the `@repo-slug/spec-slug` pattern. For each cross-repo reference found:
   - Call `resolveRef(workspaceRoot, config, ref)` to resolve the reference. `resolveRef` only searches `specs/features/` within the target repo's `.context-index/` directory.
   - If resolution succeeds, read the resolved spec file's Behavioral Contract and Acceptance Criteria sections.
   - If resolution fails (returns `null`), emit a non-blocking warning: "Cross-repo reference '@repo-slug/spec-slug' could not be resolved — skipping." Do not abort the task.
   - Append all successfully resolved content under a `## Cross-Repo Reference Context` heading in the context packet. This section provides the implementer subagent with behavioral contracts from sibling repos that the current task depends on.
   - If no cross-repo references exist in `depends-on`, or if workspace state is null, skip this step entirely.

**Routing tag check:** If the task has a routing tag from `/adev:route`:
- `auto-agent`: proceed with standard dispatch
- `assisted-agent`: proceed with dispatch, but pause after RED phase (tests written) for user review before GREEN phase
- `human-only`: generate scaffolding only (type stubs, file structure, test shells), present as a manual task checklist, emit `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "skipped", notes: "MANUAL — requires human implementation" })`, skip to next task

#### 2b. Specialist Routing

Determine which specialist (if any) should handle this task.

**Match scoring algorithm:**

1. Collect the task's file list (Create + Modify + Test files from the plan).
2. Collect the task's title and description text.
3. For each specialist declared in `manifest.yaml` under the `specialists` key:
   - **Pattern score:** For each `trigger_patterns` glob that matches any file in the task's file list, add 2 points. Add a depth bonus equal to the number of path segments in the pattern beyond the root (e.g., `components/**` = 1 bonus, `src/app/api/**` = 3 bonus). Total per matching pattern = 2 + depth bonus.
   - **Keyword score:** For each `trigger_keywords` entry found (case-insensitive substring match) in the task title or description, add 1 point.
   - Total score = sum of all pattern scores + sum of all keyword scores.
4. **Routing decision:**
   - No specialist scores above 0: use generic implementation subagent.
   - Single highest scorer: route to that specialist.
   - Tie between highest scorers: the specialist declared first in `manifest.yaml` wins.
   - Secondary matches (score > 0 but not highest): record them. Pass the list to the code quality reviewer in step 2g so it knows which additional domains to check.

**Example.** Given specialists:

```yaml
specialists:
  frontend-design:
    trigger_patterns: ["*.tsx", "*.css", "components/**"]
    trigger_keywords: ["UI", "layout", "responsive"]
  security:
    trigger_patterns: ["**/auth/**", "**/middleware/**"]
    trigger_keywords: ["authentication", "authorization"]
```

And a task touching `src/components/LoginForm.tsx` and `src/lib/auth/session.ts`:

| Specialist | Pattern Hits | Pattern Score | Keyword Hits | Keyword Score | Total |
|---|---|---|---|---|---|
| frontend-design | `*.tsx` (2+0), `components/**` (2+1) | 5 | 0 | 0 | 5 |
| security | `**/auth/**` (2+1) | 3 | 0 | 0 | 3 |

Primary: frontend-design. Secondary: security (flagged for review).

If `--dry-run` was passed, print the routing table for every task and stop.

#### 2c. Compose Subagent Prompt

Build the implementer subagent prompt with these sections in order:

1. **Role.** "You are implementing Task N: [title]." If routed to a specialist: "You are the [specialist name] specialist implementing Task N: [title]."
1b. **Execution directive.** If `--verbose` is NOT set: "Execute silently — no intermediate narration. Chain all steps without commentary. Use parallel tool calls for multi-file reads. Report ONLY the final result in the Report Format below." If `--verbose` IS set: "VERBOSE: true" (enables step-by-step narration for debugging).
2. **Constitution excerpt.** The Non-Negotiable Principles and Coding Standards sections. Keep under 60 lines. Do not include the full constitution.
3. **Task description.** Full text of the task from the plan. Never make the subagent read the plan file.
4. **Scene-setting context.** Where this task fits in the feature. What prior tasks produced. Dependencies and constraints. Relevant file paths or code snippets the subagent will need. Before implementing, read the actual source files you will modify. Do not assume file contents based on the task description or plan. If a file has changed since the plan was written, work with the current state. If workspace state is non-null and the spec has a `target-repo:` frontmatter field, include an informational advisory: "This task targets repo '<target-repo>' within workspace '<workspace-name>'. All file paths are relative to that repo's root."
5. **Spec excerpt.** The acceptance criteria from the Live Spec that this task addresses.
6. **Scope discipline.** Only make changes directly required by the task. Do not refactor surrounding code, add abstractions, create helper files, or introduce patterns unless the task explicitly requires it. If you notice improvements outside the task scope, note them in your Concerns section but do not implement them. **Cross-repo isolation constraint (workspace mode):** When operating inside a workspace, do NOT modify files in sibling repos. Cross-repo reference context is read-only — it informs your implementation but all changes must be confined to the current repo. If a task requires changes in a sibling repo, report it as NEEDS_CONTEXT with a note identifying the sibling repo and required changes.
7. **TDD mandate.** This section is non-negotiable. Include the full content of `tdd-mandate.md` from this skill directory.

   **Write-test subagent dispatch:** When dispatching write-test subagents, set `ADEV_DISPATCHED_BY=implement` in the subagent environment so write-test can detect dispatch mode and skip its own preflight (implement already verified infrastructure).

   **Domain-Aware Test Config:** Load domain test config for test framework detection and gaming thresholds via the CLI:

   ```bash
   adev domain load-test-config --module <module-slug> [--charter <charter-path>]
   ```

   Stdout is a single JSON object `{ domain, config, warnings }` where `config` contains `permitted_tools`, `skip_patterns`, and `max_test_file_size`. Pass `config.permitted_tools` to the write-test subagent for test framework detection. Pass `config.skip_patterns` for domain-specific skipped test detection.

   **Test Depth Resolution:** Before dispatching the write-test subagent, resolve the task's assigned test depth via the CLI:

   ```bash
   adev test-policy resolve --plan <plan-path> --task-id <task-id>
   ```

   Stdout is a single JSON object carrying a `depth` field (`minimal | standard | thorough`). Pass the resolved depth into the write-test subagent's prompt alongside `config.permitted_tools`/`config.skip_patterns` — it tells the subagent how many case classes the suite must cover.

   After the write-test subagent hands back a suite and it is accepted, verify an assignment was recorded:

   ```bash
   adev test-policy assert-assigned --plan <plan-path> --task-id <task-id>
   ```

   A non-zero exit fails the write-test step for that task with `MISSING_DEPTH_ASSIGNMENT` rather than passing silently — do not proceed to GREEN phase or accept the suite.

7. **Specialist context** (if routed). Load the specialist prompt template from `.context-index/specialists/<name>.md` (for `invoke: subagent`) or note the skill to invoke (for `invoke: skill`). Include domain-specific guidelines.
8. **Blocker flag protocol.** If the subagent encounters an unresolvable issue, it must write a structured blocker file to `.context-index/hygiene/blockers/<task-slug>.md` using the blocker template (category, description, what was tried, what is needed) and STOP. The blocker file triggers `/adev:recover` for diagnosis. Never loop on a problem — file a blocker and halt.
9. **Escalation rules.** The subagent must report one of four status codes. It must never silently produce work it is unsure about. It is always acceptable to stop and escalate.
9. **Report format** (subagent reports use the full format regardless of persona; the chat summary presented to the user follows the active persona's output rules):

```
## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
- **What you implemented** (or attempted, if blocked)
- **Tests written and results** (which tests, pass/fail, TDD cycle count)
- **Files changed** (created, modified, deleted)
- **Self-review findings** (issues found and fixed during self-review)
- **Concerns** (if DONE_WITH_CONCERNS: what you are unsure about)
- **Missing context** (if NEEDS_CONTEXT: what you need and where you looked)
- **Blocker** (if BLOCKED: what prevents progress and what you tried)
```

Keep your report under 2,000 tokens. List files and results concisely. Do not restate the task description.

**Cleanup before reporting.** Remove any debugging console.log, print, or debugger statements added during development. Remove commented-out exploration code. Verify all imports are used and no temporary files were left behind.

**Update Execution State:** Before dispatching the implementer subagent, write execution state via the CLI:

```bash
adev execution-state write \
  --status active \
  --plan-ref <plan-file-path> \
  --current-task <task-number> \
  [--issue-binding <issue-id>] \
  --next-action "<task description>" \
  --progress-json '<json-array-of-progress-items>'
```

The verb wraps `lib/execution-state.mjs::writeExecutionState`. If the CLI call exits non-zero, log a warning and continue — do not block implementation.

#### 2d. Dispatch and Handle Status

Dispatch the subagent with `Agent({description, prompt, run_in_background: false})` and nothing else.

**Always pass `run_in_background: false`.** The harness backgrounds Agent dispatches by default: the call returns immediately with a task ID and the caller is only re-invoked by a completion notification. That notification path is reliable only at the top level of a session — inside a nested subagent context (implement usually runs as a build-step subagent) it does not re-invoke the caller, so a backgrounded dispatch stalls the task loop (field-observed as implement subagents that auto-background and never report a status). This applies to **every** subagent dispatch in this skill: implementer, write-test, spec reviewer, code quality reviewer, visual verifier, and final reviewer.

**Do not pass `isolation: "worktree"`.** Implement runs tasks serially against the orchestrator's branch; the subagent must write to the same working tree. From inside an existing worktree (`cwd` contains `.claude/worktrees/`), worktree isolation nests a new worktree inside the parent — the parent then captures it as untracked `.claude/worktrees/agent-<id>/` content, and every per-task dispatch adds another level (8+ deep observed in field reports). Subagents that commit also defeat the harness's auto-cleanup contract, leaving the nested trees on disk forever.

Handle the returned status:

**DONE.** Proceed to visual verification (step 2e) then 2-stage review (steps 2f-2g).

**DONE_WITH_CONCERNS.** Read the concerns carefully.
- Observational concerns (e.g., "this file is getting large", "naming could be improved"): note them and proceed to review. Pass them to the code quality reviewer.
- Correctness or scope concerns (e.g., "unsure this handles the edge case in the spec"): address before review. Re-dispatch with clarification, or ask the user.

**NEEDS_CONTEXT.** The subagent lacks information.
1. Check whether the missing context exists in `.context-index/` (charters, ADRs, samples, orientation, cross-cutting specs).
2. If found: re-dispatch the same subagent with the additional context appended to the prompt.
3. If not found: ask the user to provide the missing information.
4. Maximum 2 re-dispatches per task. After the second, escalate to the user regardless.

**BLOCKED.** The subagent cannot proceed.
- Present the blocker description to the user immediately.
- **Emit a `plan_task` blocked event:** `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "blocked", notes: "<≤200-char operator-facing summary>" })`. The `notes` field must NOT contain stack traces, env values, secrets, or full command output — those belong in the blocker file under `.context-index/hygiene/blockers/`, not in the lifecycle log.
- **Update Execution State on Blocker:** Write execution state with `status: "blocked"`, `blockers` set to the blocker description, and `nextAction` set to the recommended resolution, via the CLI:
  ```bash
  adev execution-state write --status blocked \
    --blockers "<blocker description>" \
    --next-action "<recommended resolution>"
  ```
- The user can: provide guidance (re-dispatch with new info), modify the spec (back to `/adev:specify`), or skip the task.
- Never force a retry without changing something. If the subagent said it is stuck, something needs to change.

#### 2e. Visual Verification (UI tasks)

**Domain-Aware Verification Config:** Before checking UI patterns, resolve the active domain and load verification config via the CLI:

```bash
adev domain load-verification --module <module-slug> [--charter <charter-path>] [--mcp-server <name>]...
```

Pass each active MCP server name as `--mcp-server <name>` (repeat the flag for multiple). Stdout is a single JSON object `{ domain, config, warnings }`. If the verification tool listed in the domain config is not in the active MCP server set, `config` is `null` and a `TOOL_UNAVAILABLE` warning appears in `warnings`.

Based on the verification `type`:
- `visual`: use browser-based snapshot verification (existing Playwright flow below)
- `output`: use output comparison via assertions — no browser, no MCP tool
- `flow`: use assertion-based checks on workflow definitions
If no verification config exists (`config` is null), log a warning and skip domain-specific verification.

**Trigger:** If any file in the task's file list matches UI patterns: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `components/**`, `app/**/page.*`, `app/**/layout.*`, `pages/**`.

**Playwright MCP required.** Check for the Playwright MCP browser tools (`browser_navigate`, `browser_snapshot`). If they are not available, **STOP the entire implementation** and tell the user:

```
BLOCKED: This task modifies UI files but no browser verification tool is available.

Install the Playwright MCP server so the agent can visually verify UI work:
  npm install -g @anthropic/mcp-playwright

Then add it to your Claude Code MCP config and restart.

Without visual verification, UI tasks cannot be validated one-shot.
The agent will ship broken layouts, invisible elements, and styling regressions.
```

Do not proceed. Do not skip. Do not fall back to code-only review for UI tasks.

**If Playwright is available:**

1. **Dev server.** Ensure the dev server is running. If not, start it (`npm run dev`, `next dev`, or whatever the project uses). Wait for it to be ready.
2. **Navigate.** Use the browser tool to navigate to the route this task affects. Infer the route from the file path (e.g., `app/dashboard/page.tsx` → `/dashboard`). If ambiguous, check the spec for the target URL.
3. **Snapshot and verify.** Take a browser snapshot. Compare against the Visual Expectations section from the Live Spec:
   - Are all described elements visible and correctly positioned?
   - Does text content render (no blank screens, no hydration errors)?
   - Are interactive states working (hover, focus, disabled)?
4. **Responsive check.** If the spec mentions mobile or responsive behavior, resize the viewport to 375px width and re-snapshot. Verify mobile expectations.
5. **Fix loop.** If something is wrong:
   - Identify the issue from the snapshot.
   - IMPORTANT: If a test assertion fails after the visual fix, investigate the
     rendered UI (snapshot) before changing the assertion. The visual result is
     the source of truth. If the snapshot shows the correct behavior but the test
     fails, the test selector or matcher is wrong — fix the selector, not the
     assertion strength. If the snapshot shows incorrect behavior, fix the
     component code.
   - Fix the code.
   - Re-snapshot and verify.
   - Maximum 3 visual fix cycles per task. After the third, report remaining visual issues in the subagent report as DONE_WITH_CONCERNS.
6. **Evidence.** Include a summary of what was visually verified in the subagent report (which pages, which breakpoints, what was checked).

**If the spec has no Visual Expectations section:** Still take a basic snapshot after implementation. Verify the page loads without errors, shows content (not a blank screen), and has no console errors. This is the minimum bar.

#### 2f. Stage 1 Review: Spec Compliance

Dispatch a fresh spec reviewer subagent with:

- Full task requirements from the plan
- The implementer's status report (what they claim they built)
- The acceptance criteria from the Live Spec
- Instructions to not trust the report and independently read the actual code

The spec reviewer verifies by reading code, not by trusting the report:
- **Missing requirements:** Was everything requested actually implemented?
- **Extra work:** Was anything built that was not requested?
- **Misunderstandings:** Were requirements interpreted correctly?

**If the reviewer finds issues:** The implementer subagent (same one) fixes them. The spec reviewer reviews again. Maximum 3 review cycles per task. After the third, escalate to the user.

**Only proceed to Stage 2 after Stage 1 passes.**

#### 2g. Stage 2 Review: Code Quality

Dispatch a fresh code quality reviewer subagent with:

- The implementer's report
- The task requirements
- The git diff (base SHA before task, head SHA after task)
- The Coding Standards section from the constitution
- Any concerns from the implementer (if DONE_WITH_CONCERNS)
- Secondary specialist matches from step 2a (so the reviewer checks those domains)

The code quality reviewer checks the items in `code-quality-checklist.md` from this skill directory.

**Critical or Important issues:** The implementer fixes them. The reviewer reviews again. Repeat until approved.

**Minor issues:** Noted but do not block progress.

#### 2h. Mark Task Complete

After both reviews pass, if `governance/gates.yaml` exists:
1. Read gates where `triggers` includes "post-task" or "post-implement"
2. For each gate with `kind: deterministic` and non-empty `command`: run it. If fail + `required: true` → task failure. If fail + `required: false` → log warning.
3. `kind: probabilistic` or no `command` → log "Skipped (requires platform runtime)"
4. `approver_role` → log informational note
5. If `governance/gates.yaml` does not exist, skip governance gate checks.

After both reviews pass:
1. Emit a `plan_task` `done` event: `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "done", notes: <optional 1-line summary or null> })`. This is the **only** task-completion signal — the plan file itself is not modified.
2. **Do NOT mutate plan file checkboxes.** The `- [ ]` markers in the plan file are authoring guides for human reviewers; they are not authoritative state and are never flipped by skills. Authoritative status lives in `currentState(spec).planTasks` (folded from `plan_task` events in the lifecycle log).
3. **Commit-per-task is MANDATORY.** Per `incremental-artifact-writes.spec.md` Integration Point 2, every plan task MUST produce exactly one git commit before the orchestrator moves on. The commit IS the checkpoint — if a later task fails or a session crashes mid-pipeline, the prior task's work is preserved in git history. Multi-task implementations with a single combined commit are forbidden; they defeat the recovery guarantee.
4. Record: specialist used (or "generic"), review cycles needed, concerns noted.
5. Move to the next task.

### Step 2.5: Parallel Group Execution (`--parallel`)

When invoked with `--parallel`, file-disjoint task groups run concurrently in adev-managed worktrees instead of strictly serially. This changes *when* work runs, never *what* it produces — a parallel run must be behaviorally equivalent to serial (the equivalence eval is the load-bearing gate). Groups are **consumed, not computed** here: `adev parallel groups --plan <plan>` parses the plan's `## Parallelization` section.

**Fall back to the serial Step 2 loop** (printing the reason) when any of these holds:
- the `--parallel` flag is absent (no message);
- `adev parallel groups --plan <plan>` reports `malformed: true`, or yields 0 or 1 independent group (`serial: no/malformed parallelization section` / `serial: single group`);
- `adev worktree guard` reports `nested: true` (`serial: nested in <kind> worktree`).

**Otherwise, orchestrate:**

1. Ensure `.adev/worktrees/` is git-ignored (managed block). Record the baseline with `adev parallel baseline` → `{ branch, head, clean }`, and read the concurrency cap with `adev parallel max-parallel`.
2. For each independent group, in waves bounded by the cap: guard re-runs with `adev parallel collision --slug <plan-slug>-<group>`. On `collision: true`: if `--fresh` was passed, auto-remove the retained worktree with `adev worktree remove --slug <…> --force` and continue; otherwise abort that group with `RERUN_COLLISION` (the operator must clear it manually with `adev worktree remove --slug <…> --force`, or re-run with `--fresh`). With no collision, create the worktree with `adev worktree add --slug <plan-slug>-<group>`.
3. Dispatch the wave's group subagents **concurrently in a single message** — one `Agent({description, prompt, run_in_background: false})` per group, all issued in the same message so the wave runs in parallel. Two failure modes to avoid: a backgrounded dispatch (`run_in_background` omitted or true) stalls because the nested caller is never re-invoked (see the Step 2d guardrail), and dispatching the groups across separate messages serializes them, defeating `--parallel`. **Never** pass `isolation: "worktree"` (the same nesting/cleanup hazards as Step 2d apply). Each group's prompt MUST bind the subagent to its worktree: *"`<worktree-path>` is your working-tree root; run every git and file operation with an absolute path or `git -C <worktree-path>` — never a relative op in the shared cwd (it would race on `index.lock`); run the group's tasks sequentially with full TDD + 2-stage review; commit each task to branch `adev/<plan-slug>-<group>`."*
4. **Join** — wait for every group subagent to return — then, before any merge-back:
   - assert the orchestrator is unpolluted: `adev parallel assert-clean --base-head <baseline.head>`. A non-zero `ORCHESTRATOR_POLLUTED` (a subagent committed/edited the orchestrator branch instead of its worktree) aborts the whole run before any merge.
   - verify each group is complete: `adev parallel verify --branch adev/<plan-slug>-<group> --base <baseline.head> --tasks <group task ids> --done <done task ids>`. A `COMMITS_NOT_VERIFIED` (a group task's commit is missing — partial work) marks that group failed; it is not merged.
5. Merge verified groups back into the orchestrator branch in deterministic order via `adev worktree merge --slug <plan-slug>-<group>`. On each clean merge, remove that group's worktree immediately (`adev worktree remove --slug <…> --delete-branch`) so a crash mid-run never leaves a merged worktree behind.
6. On any group failure (subagent error, `COMMITS_NOT_VERIFIED`, `RERUN_COLLISION`, or `MERGE_CONFLICT`): retain that group's worktree for inspection, leave its plan tasks open, still merge and clean up the *successful* groups, print a summary naming the retained worktree paths, and exit non-zero so orchestrators (e.g. `/adev:build`) detect the partial failure.

The per-task TDD loop, 2-stage review, and commit-per-task rules from Step 2 apply unchanged *inside* each worktree; this section only governs the parallel orchestration and merge-back.

### Step 2-post: Integration Gate

After all tasks are complete, run the integration tier gate if configured.

1. Read `governance/gates.yaml`. Filter gates where `tier: integration`. If no integration-tier gates are defined, skip this step silently.
2. If no integration-tier gates are defined in `governance/gates.yaml`, skip this step silently (current behavior preserved — Step 3 follows Step 2 directly).
3. If `--task <N>` was passed (single-task re-run), skip this step. Integration gates only run when all tasks complete in a full plan execution.
4. **E2E exclusion:** Only the fast tier (per-task in Step 2) and integration tier (this step) execute during implementation. The E2E tier is excluded from `/adev:implement` — E2E gates execute only during `/adev:validate` Check 1c.

**Execute commands sequentially.** All commands within the integration tier share the tier's severity (default: `error`). Individual commands do not have their own severity.

**If a command exits non-zero with `severity: error`:**
- Emit a standalone failure report immediately with command output (truncated to last 8 KB per stream).
- Steps 3 (Final Review), 4 (Completion), and all subsequent steps do not execute.
- Write execution state: `status: "blocked"`, `blockers` set to the integration gate failure details, `nextAction` set to "Fix integration issues and re-run /adev:implement or /adev:validate."
- Report: "Integration gates failed. Fix the integration issues and re-run `/adev:implement --task <last>` or `/adev:validate`."

**If a command exits non-zero with `severity: warning`:**
- Record the failure as WARN.
- Step 3 (Final Review) proceeds.
- The warning is included in the Step 4 completion report.

**If all commands pass:** Proceed to Step 3.

**Integration Gates section in completion report:** If integration gates were executed, the Step 4 completion report includes an "Integration Gates" section showing a GateResult per command: tier name, command, pass/fail/warn status, duration, and output for failures.

### Step 3: Final Review

After all tasks are complete, dispatch a final code quality reviewer subagent that reviews the entire implementation across all tasks:

- Cross-task consistency (shared types, naming conventions, import patterns)
- Integration between tasks (do components connect correctly?)
- Overall architecture coherence (does the whole thing match the charter's scope?)

If `governance/boundaries.yaml` exists, run final boundary compliance check: grep all changed files against boundary patterns, report violations.

### Step 4: Completion

Clear `.context-index/hygiene/.active-plan` (scope guard deactivates).

**Clear Execution State:** After all tasks are complete, clear the execution state via the CLI:

```bash
adev execution-state clear
```

This resets the state to `idle` so the next session starts fresh. If the CLI call exits non-zero, log a warning — implementation is still considered complete.

Read the `completion.merge_policy` from manifest.yaml (default: "pr").

If merge_policy is "pr" or the current target branch is in protected_branches:
  Do NOT merge. Do NOT push to the protected branch. Suggest opening a PR.

If merge_policy is "merge" AND target branch is NOT protected:
  Offer to merge. Still confirm with the user before executing.

If merge_policy is "ask":
  Ask the user: "Open a PR or merge directly?"

Report to the user:

```
Implementation complete.

Tasks: N/N completed
Specialist routing: [list which specialists were used and for which tasks]
Review cycles: [total across all tasks, highlight any task that needed 3+]
Concerns noted: [list any DONE_WITH_CONCERNS items]

Next step: run /adev:validate for full post-implementation validation.
```

If merge_policy is "pr" (or target is a protected branch), append:

```
When validation passes, open a PR: gh pr create --base <target-branch>
Do NOT merge directly to <target-branch>.
```

## Step 5: Update Spec Status and Source Manifest

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> `adev/status-enum-legal` diagnostic enforces this enum at write time.

After all tasks are complete and before reporting completion:

1. Read the spec file that this plan implements (the plan file references the spec)
2. Parse YAML frontmatter
3. Update status: `review-passed` → `implemented`
4. **Compute source manifest:** Collect all source files produced by this implementation, then call the CLI to compute a deterministic SHA-256 manifest. Stamp the result as a `source-manifest` block in the spec's YAML frontmatter.

   **Collecting the file list:** Walk each task in the plan and collect every file listed under `Files: Modify:` and `Files: Create:` (exclude `Files: Reference:` — those are read-only context). Deduplicate and sort. These are project-root-relative paths (e.g., `lib/milestones.mjs`, not absolute paths).

   **Invocation:**
   ```bash
   adev source-manifest compute --files <comma-separated-paths>
   ```

   Example:
   ```bash
   adev source-manifest compute --files lib/feature.mjs,tests/feature.test.mjs
   ```

   Stdout is a single-line JSON object matching `computeManifest()`'s return shape: `{ sha, files, computedAt }`. The `sha` is the first 7 characters of the composite SHA-256. The `files` array is sorted ascending. The `computedAt` is an ISO 8601 timestamp. Pass `--out <path>` to write the JSON to a file instead of stdout (the file is created with `mkdir -p` semantics for the parent directory). Exit codes: `0` on success, `1` on argument error, missing source file, or path traversal.

   Write the returned manifest into the spec's YAML frontmatter:
   ```yaml
   source-manifest:
     sha: "abc1234"          # first 7 chars of composite SHA-256
     files:
       - lib/feature.mjs
       - tests/feature.test.mjs
     computed-at: "2026-04-01T10:00:00.000Z"
   ```
5. Write the spec file back.

   **Incremental authoring for source-manifest stamping (`.partial` pattern):** When the spec file is non-trivial (~ 2 KB or larger, which is the common case for any reviewed Live Spec), the frontmatter rewrite MUST follow the `.partial` + atomic-rename protocol from `incremental-artifact-writes.spec.md`. Write the updated spec body to `<spec-path>.partial` with a `partial_schema: implement@1` marker in the first authored chunk (the chunk that carries the new frontmatter), then atomically rename to `<spec-path>` once the write completes. Use the existing artifact-commit CLI verb (`adev artifact commit ...`) which already implements the `.tmp` byte-level atomic-rename idiom — the `.partial` layer applies when the rewrite is performed by an agent over multiple Write calls rather than a single fs operation. On a mid-rewrite crash, the next `/adev:implement` invocation detects the partial and resumes.

   **Runaway-write guard:** Before each Write to the spec's `.partial`, run `adev partial check-size --artifact <spec-path>` to verify the in-progress rewrite has not exceeded `partial_oversize_multiplier × expected` bytes (defaults: 3× max(prior spec size, 50 KB)). Exit code 2 with `PARTIAL_ARTIFACT_OVERSIZE` is a hard stop: do NOT continue rewriting, do NOT commit the rename, surface the error to the user. Protects against retry loops re-writing prior chunks.

6. **Clear drift flag:** After re-stamping the source manifest, clear any drift flag on the spec:
   ```javascript
   const { clearDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
   await clearDrift(specPath);
   ```
   If `clearDrift()` fails (e.g., write error), log a warning but do not block implementation completion.
7. **Update charter Capability Map:** Read the parent charter and update the Capability Map. For each capability covered by this spec, set its `Status` column to `implemented`.
8. Log: "Updated spec status: review-passed → implemented"

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

After Step 5.5, verify lifecycle artifact completeness. This is distinct from `/adev:validate` (which checks code correctness) — this checks that all lifecycle bookkeeping is done.

**Checklist:**

1. **All epic issues closed:** If the plan has an associated epic (via issue board), check that ALL issues in the epic are now closed. If not, report which issues remain open.
2. **Source manifest stamped:** Verify the spec has a `source-manifest` block in frontmatter (done in Step 5).
3. **Spec status updated:** Verify the spec status is `implemented` (done in Step 5).
4. **Charter capability status updated:** Verify the charter's Capability Map has the capability status set to `implemented` (done in Step 5).
5. **Epic closed:** If all issues in the epic are now closed, update the epic status to `closed`. Use `updateEpic(epicId, { status: 'closed' })` from the issue adapter.

**Output format:**
```
Feature Completeness DoD:
  [x] All epic issues closed (N/N)
  [x] Source manifest stamped (sha: abc1234)
  [x] Spec status: implemented
  [x] Charter capability: implemented
  [x] Epic closed: epic-N

— or —

  [x] All epic issues closed (N/N)
  [x] Source manifest stamped (sha: abc1234)
  [x] Spec status: implemented
  [x] Charter capability: implemented
  [ ] Epic NOT closed — 2 issues still open (issue-4, issue-5)
```

If any item fails, report it but do NOT block completion. The implementation is done; the DoD gaps are informational for follow-up.

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

Lifecycle event log (gates, step tracking, debug interventions, plan-task channel):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — reads the per-spec JSONL log and returns a `StateProjection`: `{ spec, status, currentStep, currentTask, steps, planTasks, interventions, startedAt, updatedAt }`.
- `requireGate(state, "plan", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns, in advisory mode) when the `plan` step is not complete.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode` (`strict` default).
- `reportStep(projectRoot, specPath, { step, status, verdict? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `lifecycle_step` event at skill entry/exit.
- `reportIntervention(projectRoot, specPath, { kind, note })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `debug_intervention` event when implementation hits a recoverable obstacle (rerouted to `/adev:debug`, prompt edits, etc.).
- `reportPlanTask` and `state.planTasks` — plan-task state transitions are owned by this skill per `plan-task-events.spec.md`. See that spec for the full transition semantics (`pending` → `in_progress` → `completed` / `blocked`). This skill does NOT mutate plan-file checkboxes; the plan file is read-only after authoring.

Execution state:

- `readExecutionState(projectRoot)` / `writeExecutionState(projectRoot, state)` / `clearExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs` — read/write/clear `.context-index/.execution-state.json` for cross-session resume tracking. Do not hand-parse the JSON.

Issue board:

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter for epic-level work-item tracking (per-task issues are forbidden by the board-granularity invariant).
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.

## Next Step in the Lifecycle

Implementation complete. The next step is **`/adev:validate`** — post-implementation checks against the spec and constitution.

If invoked via `/adev:work`, offer to continue: *"Implementation done. Continue to `/adev:validate`?"* The user can stop here.
