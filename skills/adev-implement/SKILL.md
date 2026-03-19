---
name: adev-implement
description: Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. Reads plans produced by /adev-plan and dispatches one fresh subagent per task.
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
4. **Working branch.** The current git branch must not be main or master. If it is, stop and ask the user to create a feature branch.

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

Create a TodoWrite entry for every task extracted from the plan.

### Step 2: Per-Task Execution Loop

For each task in dependency order:

#### 2a. Specialist Routing

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
   - Secondary matches (score > 0 but not highest): record them. Pass the list to the code quality reviewer in step 2e so it knows which additional domains to check.

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

#### 2b. Compose Subagent Prompt

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
```

7. **Specialist context** (if routed). Load the specialist prompt template from `.context-index/specialists/<name>.md` (for `invoke: subagent`) or note the skill to invoke (for `invoke: skill`). Include domain-specific guidelines.
8. **Escalation rules.** The subagent must report one of four status codes. It must never silently produce work it is unsure about. It is always acceptable to stop and escalate.
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

#### 2c. Dispatch and Handle Status

Dispatch the subagent. Handle the returned status:

**DONE.** Proceed to 2-stage review (step 2d).

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

#### 2d. Stage 1 Review: Spec Compliance

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

#### 2e. Stage 2 Review: Code Quality

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
- TDD was followed: test files exist, tests are meaningful, test-first evidence
- Naming, readability, maintainability
- Adherence to constitutional coding standards
- No unnecessary complexity (YAGNI)
- File sizes: did this task create large files or significantly grow existing ones?

**Critical or Important issues:** The implementer fixes them. The reviewer reviews again. Repeat until approved.

**Minor issues:** Noted but do not block progress.

#### 2f. Mark Task Complete

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

Report to the user:

```
Implementation complete.

Tasks: N/N completed
Specialist routing: [list which specialists were used and for which tasks]
Review cycles: [total across all tasks, highlight any task that needed 3+]
Concerns noted: [list any DONE_WITH_CONCERNS items]

Next step: run /adev-validate for full post-implementation validation.
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
- Let implementer self-review replace actual review (both are required)
