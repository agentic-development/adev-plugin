---
name: adev-implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. Reads plans produced by /adev-plan and dispatches one fresh subagent per task. Use when the user says 'implement the plan', 'start coding', 'execute the tasks', 'build it', or wants to begin development after planning is complete."
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
3. **Spec review passed.** The plan must reference a spec with a passing `.review.md` file adjacent to it. If the review file is missing, has status BLOCK, or is older than the spec's last modification date, direct the user to run `/adev-review-specs` first.
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
8. **Routing tags:** If tasks have routing annotations (from `/adev-route`), read them.
   Adjust execution strategy per task based on `auto-agent`, `assisted-agent`, or `human-only` tags.
   If no routing tags exist, treat all tasks as `auto-agent` (default behavior).
9. **Completion policy:** Read `completion.merge_policy` from manifest.yaml (default: "pr").
   Read `completion.protected_branches` (default: ["main", "master"]).

Write the active plan path to `.context-index/hygiene/.active-plan` so the scope guard hook can monitor file scope during implementation. Clear this file in Step 4 (Completion).

Create a TodoWrite entry for every task extracted from the plan.

### Step 2: Per-Task Execution Loop

For each task in dependency order:

#### 2a. Context Packet Assembly

Before routing or dispatching, assemble the task's context packet:

1. Read the task's `context_packet` section from the plan (if present).
2. For each listed file, read and extract the relevant section.
3. Write the assembled packet to `.context-index/packets/<task-slug>.md` (gitignored). This log enables post-mortem debugging via `/adev-recover`.
4. If no context_packet section exists in the plan, assemble a default packet from: constitution excerpt, spec acceptance criteria for this task, charter capability, and any samples matching the task's file patterns.

**Routing tag check:** If the task has a routing tag from `/adev-route`:
- `auto-agent`: proceed with standard dispatch
- `assisted-agent`: proceed with dispatch, but pause after RED phase (tests written) for user review before GREEN phase
- `human-only`: generate scaffolding only (type stubs, file structure, test shells), present as a manual task checklist, mark task as MANUAL in TodoWrite, skip to next task

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
4. **Scene-setting context.** Where this task fits in the feature. What prior tasks produced. Dependencies and constraints. Relevant file paths or code snippets the subagent will need.
5. **Spec excerpt.** The acceptance criteria from the Live Spec that this task addresses.
6. **TDD mandate.** This section is non-negotiable:

```
## TDD: RED-GREEN-REFACTOR

Every piece of production code requires a failing test first.

1. RED: Write one failing test that captures the next behavior to implement.
2. VERIFY RED: Run the test. Confirm it fails for the expected reason (missing feature, not a typo or import error). If it passes, you are testing existing behavior. Fix the test.
3. GREEN: Write the minimal code to make the test pass. Nothing more.
4. VERIFY GREEN: Run the test. Confirm it passes. Confirm all other tests still pass.
5. REFACTOR: Clean up while keeping all tests green.
6. REPEAT for the next behavior.

No production code without a failing test first. No exceptions.
If you wrote code before the test, delete it and start over.

### Test Integrity

When a test fails unexpectedly:

1. INVESTIGATE FIRST. Before changing any assertion, look at the actual behavior:
   - For UI: take a browser snapshot, read the DOM, check console errors.
   - For API: read the actual response body, status code, headers.
   - For logic: add a console.log or debugger, read the actual value.
   Understand WHY the test failed before deciding what to change.
   Then check project context before proposing a fix:
   - Read the Live Spec's acceptance criteria — is the test asserting
     the right behavior, or is the spec different from what you assumed?
   - Check `.context-index/adrs/` for known constraints or trade-offs
     in the affected area.
   - Check the Feature Charter's behavioral contract — the bug may be
     "working as specified" (spec problem, not code problem).
   If the context says the test is correct, fix the code. If the context
   says the behavior is correct, the spec or test needs updating (escalate).

2. KEEP ASSERTIONS STRICT. Never loosen a matcher to make a test pass:
   - Do not change `getByText("Submit")` to `getByText(/submit/i)`.
   - Do not change `toEqual(expected)` to `toContain(partial)`.
   - Do not change `toBe(false)` to `toBeFalsy()`.
   If the exact value is wrong, fix the code that produces it.

3. NO CONDITIONAL SKIPS. Never write:
   - `if (element.isVisible()) { ... } else { skip }`
   - `try { assert(...) } catch { /* ignore */ }`
   - `expect(items.length).toBeGreaterThanOrEqual(0)` (always passes)
   If the element should be visible, assert it. If the data should exist, assert it.
   A test that cannot fail is not a test.

4. FIX THE APP, NOT THE TEST. When a test reveals a real issue:
   - The test is doing its job. Do not punish it.
   - Fix the application code so the test passes as originally written.
   - Only change the test if the REQUIREMENT changed (and update the spec too).

5. SEED BEFORE YOU ASSERT. Every test must control its own data:
   - Set up deterministic seed data (fixtures, factories, builders) at the start
     of the test. Do not rely on data left by other tests or existing in the DB.
   - Assert against the exact seed values, not against "whatever came back."
   - Bad: `expect(users.length).toBeGreaterThan(0)` (passes if DB has any row).
   - Good: seed 3 users → `expect(users).toHaveLength(3)` and check names.
   If you cannot assert exact values, you did not control the input.
```

7. **Specialist context** (if routed). Load the specialist prompt template from `.context-index/specialists/<name>.md` (for `invoke: subagent`) or note the skill to invoke (for `invoke: skill`). Include domain-specific guidelines.
8. **Blocker flag protocol.** If the subagent encounters an unresolvable issue, it must write a structured blocker file to `.context-index/hygiene/blockers/<task-slug>.md` using the blocker template (category, description, what was tried, what is needed) and STOP. The blocker file triggers `/adev-recover` for diagnosis. Never loop on a problem — file a blocker and halt.
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

**Spec traceability.** If Entire.io integration is configured (`integrations.session_capture.provider: entire` in `manifest.yaml`), prepend a traceability marker:

```
<!-- entire:spec-trace spec=".context-index/specs/features/<module>/<task>.md" task="N" -->
```

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
- The user can: provide guidance (re-dispatch with new info), modify the spec (back to `/adev-specify`), or skip the task.
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

The code quality reviewer checks:
- Single responsibility per file, well-defined interfaces
- Test quality: tests verify real behavior, not mock behavior
- Test integrity: no loosened assertions, no conditional skips, no try/catch swallowing failures, no assertions against unseeded runtime data. Compare test assertions against spec requirements — if the assertion is weaker than the requirement, flag it. If any test was changed to fix a failure, verify the fix was grounded in spec/charter context, not just "make it green."
- TDD was followed: test files exist, tests are meaningful, test-first evidence
- Naming, readability, maintainability
- Adherence to constitutional coding standards
- No unnecessary complexity (YAGNI)
- File sizes: did this task create large files or significantly grow existing ones?

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
1. Mark the task complete in TodoWrite.
2. Record: specialist used (or "generic"), review cycles needed, concerns noted.
3. Move to the next task.

### Step 3: Final Review

After all tasks are complete, dispatch a final code quality reviewer subagent that reviews the entire implementation across all tasks:

- Cross-task consistency (shared types, naming conventions, import patterns)
- Integration between tasks (do components connect correctly?)
- Overall architecture coherence (does the whole thing match the charter's scope?)

If `governance/boundaries.yaml` exists, run final boundary compliance check: grep all changed files against boundary patterns, report violations.

### Step 4: Completion

Clear `.context-index/hygiene/.active-plan` (scope guard deactivates).

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

Next step: run /adev-validate for full post-implementation validation.
```

If merge_policy is "pr" (or target is a protected branch), append:

```
When validation passes, open a PR: gh pr create --base <target-branch>
Do NOT merge directly to <target-branch>.
```

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
