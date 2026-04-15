---
name: adev:implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. Use after planning to begin development."
context: fork
---

# Implement Plan

Execute an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD, and running 2-stage review (spec compliance then code quality) after each task.

## Arguments

- `<plan-path>`: path to the plan file (required). Usually `.context-index/specs/features/<module>/<spec-slug>-plan.md`.
- `--task <N>`: execute only task N (useful for re-running a single task after a fix)
- `--dry-run`: show routing decisions and specialist matches without executing

## Prerequisites

Before starting, verify all four conditions. If any fails, stop and tell the user what to fix.

1. **Plan exists.** The plan file must exist and be readable.
2. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
3. **Spec review passed.** The plan must reference a spec with a passing `.review.md` file adjacent to it. If the review file is missing, has status BLOCK, or is older than the spec's last modification date, direct the user to run `/adev:review-specs` first.
4. **Working branch.** The current git branch must not be main or master. If it is, stop and ask the user to create a feature branch following the naming convention in `manifest.yaml` (default: `<type>/<module>/<short-description>`, e.g. `feat/auth/login-flow`).

## Process

### Step 1: Load Context

Read these files once at the start. Extract everything subagents will need so they never have to re-read these files themselves.

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
2. For each listed file, read and extract the relevant section.
3. Write the assembled packet to `.context-index/packets/<task-slug>.md` (gitignored). This log enables post-mortem debugging via `/adev:recover`.
4. If no context_packet section exists in the plan, assemble a default packet from: constitution excerpt, spec acceptance criteria for this task, charter capability, and any samples matching the task's file patterns.
5. **Heuristics injection:** If heuristics were loaded in Step 1 (count > 0), append a `## Heuristics` section to the context packet with the rendered blocks from Step 1. Prefix the section with the advisory preamble:

   > The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

   All tasks in the same plan receive the same heuristic set. If no heuristics are available, omit this section entirely — do not emit an empty placeholder.

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
2. **Constitution excerpt.** The Non-Negotiable Principles and Coding Standards sections. Keep under 60 lines. Do not include the full constitution.
3. **Task description.** Full text of the task from the plan. Never make the subagent read the plan file.
4. **Scene-setting context.** Where this task fits in the feature. What prior tasks produced. Dependencies and constraints. Relevant file paths or code snippets the subagent will need. Before implementing, read the actual source files you will modify. Do not assume file contents based on the task description or plan. If a file has changed since the plan was written, work with the current state.
5. **Spec excerpt.** The acceptance criteria from the Live Spec that this task addresses.
6. **Scope discipline.** Only make changes directly required by the task. Do not refactor surrounding code, add abstractions, create helper files, or introduce patterns unless the task explicitly requires it. If you notice improvements outside the task scope, note them in your Concerns section but do not implement them.
7. **TDD mandate.** This section is non-negotiable. Include the full content of `tdd-mandate.md` from this skill directory.

7. **Specialist context** (if routed). Load the specialist prompt template from `.context-index/specialists/<name>.md` (for `invoke: subagent`) or note the skill to invoke (for `invoke: skill`). Include domain-specific guidelines.
8. **Blocker flag protocol.** If the subagent encounters an unresolvable issue, it must write a structured blocker file to `.context-index/hygiene/blockers/<task-slug>.md` using the blocker template (category, description, what was tried, what is needed) and STOP. The blocker file triggers `/adev:recover` for diagnosis. Never loop on a problem — file a blocker and halt.
9. **Escalation rules.** The subagent must report one of four status codes. It must never silently produce work it is unsure about. It is always acceptable to stop and escalate.
9. **Report format:**

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
5. If `governance/gates.yaml` does not exist, fall back to manifest quality gates (existing behavior)

After both reviews pass:
1. Update the issue status to `closed` via `close(id, "Implemented and reviewed")`.
2. Record: specialist used (or "generic"), review cycles needed, concerns noted.
3. Move to the next task.

### Step 2-post: Integration Gate

After all tasks are complete, run the integration tier gate if configured.

1. Read `manifest.yaml` `gates:` section. If `gates.integration` is defined, resolve its commands using the tiered-gate-schema resolution rules.
2. If `gates.integration` is not defined, skip this step silently (current behavior preserved — Step 3 follows Step 2 directly).
3. If `--task <N>` was passed (single-task re-run), skip this step. Integration gates only run when all tasks complete in a full plan execution.
4. **E2E exclusion:** Only the fast tier (per-task in Step 2) and integration tier (this step) execute during implementation. The E2E tier is excluded from `/adev:implement` — E2E gates execute only during `/adev:validate` Check 1c.
5. This step reads from `manifest.yaml` only. `governance/gates.yaml` does not apply to the integration gate step (governance gates only apply to `/adev:validate` Check 1). This is orthogonal to the Step 2h per-task governance gates, which continue to operate independently.

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
6. **Update charter Capability Map:** Read the parent charter and update the Capability Map. For each capability covered by this spec, set its `Status` column to `implemented`.
7. Log: "Updated spec status: review-passed → implemented"

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
