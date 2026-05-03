---
name: adev:implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. Use after planning to begin development."
context: fork
---

# Implement Plan

Execute an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD, and running 2-stage review (spec compliance then code quality) after each task.

## Execution Protocol

**Silent execution (subagent mode):** When this skill is invoked as a subagent (via the Agent tool from a parent orchestrator), execute all steps silently:
- Chain steps continuously without intermediate commentary or narration.
- Do NOT emit confirmations like "Loaded the context" or "Proceeding to step N."
- Do NOT summarize intermediate findings between steps.
- Use parallel tool calls (multiple Read/Grep/Glob in one turn) for context-loading phases.
- Report ONLY the final result in the structured format expected by the parent.

This directive does NOT apply when:
- The skill is invoked interactively by a user.
- The subagent prompt contains `VERBOSE: true` (debug mode — narrate all steps).

## Arguments

- `<plan-path>`: path to the plan file (required). Usually `.context-index/specs/features/<module>/<spec-slug>-plan.md`.
- `--task <N>`: execute only task N (useful for re-running a single task after a fix)
- `--dry-run`: show routing decisions and specialist matches without executing
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)
- `--verbose`: disable silent execution for per-task subagents. Includes `VERBOSE: true` in subagent prompts so they narrate each step. Useful for debugging task failures.

## Prerequisites

Before starting, verify all four conditions. If any fails, stop and tell the user what to fix.

1. **Plan exists.** The plan file must exist and be readable.
2. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
3. **Spec review passed.** The plan must reference a spec with a passing `.review.md` file adjacent to it. If the review file is missing, has status BLOCK, or is older than the spec's last modification date, direct the user to run `/adev:review-specs` first.
4. **Working branch.** The current git branch must not be main or master. If it is, stop and ask the user to create a feature branch following the naming convention in `manifest.yaml` (default: `<type>/<module>/<short-description>`, e.g. `feat/auth/login-flow`).

## Process

### Step 1: Load Context

**Read these files in a single turn using parallel tool calls:**

Extract everything subagents will need so they never have to re-read these files themselves.

1. The plan file. Extract every task with its full text, file lists, dependencies, and specialist hints.
2. `.context-index/constitution.md`. Extract the Non-Negotiable Principles, Coding Standards, Architecture Boundaries, and Quality Gates sections.
3. `.context-index/manifest.yaml`. Extract the `specialists` registry.
4. The Live Spec referenced by the plan. Extract acceptance criteria and behavioral contract.
5. The Feature Charter referenced by the plan. Extract scope boundaries.
6. Any cross-cutting specs or ADRs listed in the plan's context routing section.
7. **Boundary rules:** If `.context-index/governance/boundaries.yaml` exists, read it.
   Pass boundary rules to implementer subagents as additional constraints in prompt section 2
   (alongside constitution excerpt). If it does not exist, skip.
8. **Routing tags:** If tasks have routing annotations (from `/adev:route`), read them.
   Adjust execution strategy per task based on `auto-agent`, `assisted-agent`, or `human-only` tags.
   If no routing tags exist, treat all tasks as `auto-agent` (default behavior).
9. **Completion policy:** Read `completion.merge_policy` from manifest.yaml (default: "pr").
   Read `completion.protected_branches` (default: ["main", "master"]).
10. **Model tier resolution:** Read `model_tiers` from `.context-index/platform-context.yaml`.
    All subagent dispatches in this skill use the `capable` tier (implementer, spec reviewer, code quality reviewer, visual verifier).
    If `model_tiers` is absent or a tier is unset, use the hardcoded defaults from `.context-index/specs/cross-cutting/model-routing.md` and log a one-time advisory.
11. **Heuristics:** Load module-scoped heuristics for injection into context packets.
    Derive the module slug from the plan's spec `charter:` frontmatter field.
    **Plugin root resolution:** The `lib/` directory lives at the adev plugin root, NOT the project root. Derive the plugin root from this skill file's base directory by stripping the `skills/<name>/` suffix. Use the absolute path in imports. Replace `<ADEV_ROOT>` below with the resolved path.
    Run inline Node.js:
    ```bash
    node -e "import { retrieveHeuristics, renderHeuristic } from '<ADEV_ROOT>/lib/heuristics.mjs'; const h = await retrieveHeuristics(process.cwd(), '<module>', { injectionLimit: <limit-from-manifest-or-undefined> }); console.log(JSON.stringify({ count: h.length, rendered: h.map(renderHeuristic).join('\n\n') }));"
    ```
    Where `<ADEV_ROOT>` is the resolved absolute plugin root path, `<module>` is the charter module slug, and `<limit>` comes from `heuristics.injection_limit` in manifest.yaml (omit if not set).
    If the command fails or returns `count: 0`, proceed without heuristics — heuristic injection is strictly non-blocking.
    Store the `rendered` output for use in Step 2a.

Write the active plan path to `.context-index/hygiene/.active-plan` so the scope guard hook can monitor file scope during implementation. Clear this file in Step 4 (Completion).

**Execution State Check:** Read `.context-index/.execution-state.md` using inline Node.js: `node -e "import { readExecutionState } from '<ADEV_ROOT>/lib/execution-state.mjs'; ..."` (where `<ADEV_ROOT>` is the resolved absolute plugin root path). If the file exists with `status: "active"`, resume from the `currentTask` in the state file instead of task 1. If `status: "blocked"`, surface the blocker to the user and suggest running `/adev:recover` before continuing. If the file is missing or `status: "idle"`, start from task 1 as normal.

**Update charter Capability Map:** At the start of implementation, read the parent charter and update the Capability Map. For each capability covered by this plan, set its `Status` column to `implementing`.

**Load or create issue board:** Read `tasks.backend` from `manifest.yaml`. If configured:
- If issues exist matching this plan's `plan-ref` (check via `list({ planRef: "<plan-file-path>" })`), load them.
- If no issues exist, create them now: create an epic with the plan's title and `plan-ref`, then create one issue per plan task with title, type `task`, priority `2`, `plan-ref`, `plan-task` number, and `epic-id`. Record dependencies via `addDependency()` for tasks with `Depends on:` annotations.
- Update the first task's issue status to `in_progress` via `update(id, { status: "in_progress" })`.

If `tasks.backend` is not configured, skip issue board operations.

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

**Invocation:** Run inline Node.js (same pattern as heuristics loading):

```bash
node --input-type=module -e "
import { runPreflight, formatPreflightReport } from '<ADEV_ROOT>/lib/infra-preflight.mjs';
const report = await runPreflight('<specPath>', '<planPath>', { timeout: <timeout>, noInfra: <noInfra> });
console.log(JSON.stringify(report));
"
```

Where `<ADEV_ROOT>` is the resolved absolute plugin root path, `<specPath>` is extracted from the plan's `Spec:` header, and `<planPath>` is the `<plan-path>` argument.

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
   - Ask the user: "Skip this task and mark the issue as closed with 'Already implemented'?"
   - If user confirms: update the issue status to `closed` with notes "Already implemented (detected by implementation probe)", skip to next task.
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
- `human-only`: generate scaffolding only (type stubs, file structure, test shells), present as a manual task checklist, mark the issue status as `deferred` with note "MANUAL — requires human implementation" via `update(id, { status: "deferred", notes: "MANUAL — requires human implementation" })`, skip to next task

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

**Spec traceability.** If Entire.io integration is configured (`integrations.session_capture.provider: entire` in `manifest.yaml`), prepend a traceability marker:

```
<!-- entire:spec-trace spec=".context-index/specs/features/<module>/<task>.md" task="N" -->
```

**Update Execution State:** Before dispatching the implementer subagent, write execution state using inline Node.js: `node -e "import { writeExecutionState } from '<ADEV_ROOT>/lib/execution-state.mjs'; ..."` with `status: "active"`, `planRef` set to the plan file path, `currentTask` set to the task number, `issueBinding` set to the issue ID (if `tasks.backend` is configured), `nextAction` set to the task description, and `progress` set to the full task checklist with completed tasks marked done. If `writeExecutionState` fails, log a warning and continue — do not block implementation.

#### 2d. Dispatch and Handle Status

Dispatch the subagent. Handle the returned status:

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
- **Update Execution State on Blocker:** Write execution state with `status: "blocked"`, `blockers` set to the blocker description, and `nextAction` set to the recommended resolution. Use inline Node.js: `node -e "import { writeExecutionState } from '<ADEV_ROOT>/lib/execution-state.mjs'; ..."`.
- The user can: provide guidance (re-dispatch with new info), modify the spec (back to `/adev:specify`), or skip the task.
- Never force a retry without changing something. If the subagent said it is stuck, something needs to change.

#### 2e. Visual Verification (UI tasks)

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
1. Update the issue status to `closed` via `close(id, "Implemented and reviewed")`.
2. **Update plan file checkboxes.** Read the plan file and mark all `- [ ]` checkboxes within the current task's section as `- [x]`. The task section starts at `### Task N:` and ends at the next `### Task` heading or end of file. Write the updated plan file back. This provides a persistent, human-readable record of completion that outlives the ephemeral execution state.
3. Record: specialist used (or "generic"), review cycles needed, concerns noted.
4. Move to the next task.

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

**Clear Execution State:** After all tasks are complete, clear the execution state using inline Node.js: `node -e "import { clearExecutionState } from '<ADEV_ROOT>/lib/execution-state.mjs'; ..."`. This resets the state to `idle` so the next session starts fresh. If `clearExecutionState` fails, log a warning — implementation is still considered complete.

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

After all tasks are complete and before reporting completion:

1. Read the spec file that this plan implements (the plan file references the spec)
2. Parse YAML frontmatter
3. Update status: `review-passed` → `implemented`
4. **Compute source manifest:** Call `computeManifest(specPath)` from `lib/source-manifest.mjs` to generate a hash manifest of all source files produced by this implementation. Stamp the result as a `source-manifest` block in the spec's YAML frontmatter:
   ```yaml
   source-manifest:
     sha: "abc1234"          # first 7 chars of composite SHA-256
     files:
       - src/lib/feature.mjs
       - tests/feature.test.mjs
     computed-at: "2026-04-01T10:00:00.000Z"
   ```
5. Write the spec file back
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

Spec: .context-index/specs/features/<module>/<spec-slug>.md
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
