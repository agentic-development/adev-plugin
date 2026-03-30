---
name: adev-implement
description: "Execute implementation plans using specialist-routed subagents with TDD enforcement and 2-stage review per task. In OpenCode, invoke with skill({ name: 'adev-implement' })"
---

# Implement Plan

Execute an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD, and running 2-stage review (spec compliance then code quality) after each task.

## Arguments

- `<plan-path>`: path to the plan file (required)
- `--task <N>`: execute only task N
- `--dry-run`: show routing decisions and specialist matches without executing

## Prerequisites

Before starting, verify:

1. **Plan exists.** The plan file must exist and be readable.
2. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
3. **Spec review passed.** The plan must reference a spec with a passing `.review.md` file.
4. **Working branch.** The current git branch must not be main or master.

## Step 1: Load Context

Read these files once at the start:

1. The plan file
2. `.context-index/constitution.md`
3. `.context-index/manifest.yaml` (for specialists registry)
4. The Live Spec
5. The Feature Charter
6. Any cross-cutting specs or ADRs listed in the plan
7. **Boundary rules:** `.context-index/governance/boundaries.yaml` if it exists
8. **Routing tags:** If tasks have routing annotations from `adev-route`
9. **Completion policy:** Read `completion.merge_policy` from manifest.yaml

Write the active plan path to `.context-index/hygiene/.active-plan`.

Create a TodoWrite entry for every task.

## Step 2: Per-Task Execution Loop

For each task in dependency order:

### 2a. Context Packet Assembly

Before dispatching:

1. Read the task's `context_packet` section from the plan
2. For each listed file, read and extract the relevant section
3. Write the assembled packet to `.context-index/packets/<task-slug>.md`
4. If no context_packet section exists, assemble a default packet

**Routing tag check:**

- `auto-agent`: proceed with standard dispatch
- `assisted-agent`: pause after RED phase for user review
- `human-only`: generate scaffolding only, present as manual task checklist

### 2b. Specialist Routing

Match scoring algorithm:

1. Collect the task's file list and title/description text
2. For each specialist in `manifest.yaml`:
   - **Pattern score:** 2 points per matching glob + depth bonus
   - **Keyword score:** 1 point per keyword match
3. Route to highest scorer, or use generic implementation if no match

### 2c. Compose Subagent Prompt

Build the implementer subagent prompt:

1. **Role.** "You are implementing Task N: [title]."
2. **Constitution excerpt.** Non-Negotiable Principles and Coding Standards (keep under 60 lines).
3. **Task description.** Full text of the task from the plan.
4. **Scene-setting context.** Where this task fits, what prior tasks produced.
5. **Spec excerpt.** Acceptance criteria from the Live Spec.
6. **TDD mandate:**
   ```
   ## TDD: RED-GREEN-REFACTOR
   
   Every piece of production code requires a failing test first.
   
   1. RED: Write one failing test that captures the next behavior to implement.
   2. VERIFY RED: Run only the specific test file (e.g., `npx vitest run <path-to-test-file>`), not the full suite. Confirm it fails for the expected reason.
   3. GREEN: Write the minimal code to make the test pass.
   4. VERIFY GREEN: Run only the specific test file again. Confirm it passes. The full suite runs at the quality-gate stage, not here.
   5. REFACTOR: Clean up while keeping all tests green.
   
   No production code without a failing test first. No exceptions.
   ```
7. **Specialist context** (if routed)
8. **Report format:**
   ```
   ## Report Format
   
   When done, report:
   - **Status:** DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
   - **What you implemented**
   - **Tests written and results**
   - **Files changed**
   - **Concerns** (if DONE_WITH_CONCERNS)
   - **Missing context** (if NEEDS_CONTEXT)
   - **Blocker** (if BLOCKED)
   ```

### 2d. Dispatch and Handle Status

**DONE.** Proceed to review stages.

**DONE_WITH_CONCERNS.** Note concerns, pass to code quality reviewer.

**NEEDS_CONTEXT.** The subagent lacks information:

1. Check whether the missing context exists in `.context-index/`
2. If found: re-dispatch with additional context
3. If not found: ask the user
4. Maximum 2 re-dispatches per task

**BLOCKED.** Present blocker to user immediately. User can provide guidance or skip the task.

### 2e. Visual Verification (UI tasks)

**Trigger:** If any file matches UI patterns: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss`, `components/**`, `app/**/page.*`

**Playwright MCP required.** Check for browser tools (`browser_navigate`, `browser_snapshot`).

If Playwright is available:

1. Ensure dev server is running
2. Navigate to the affected route
3. Take browser snapshot
4. Verify against Visual Expectations section from spec
5. Responsive check at 375px, 768px, 1280px widths

If no Playwright available and UI files are present, **STOP** and inform user.

### 2f. Stage 1 Review: Spec Compliance

Dispatch a spec reviewer subagent:

- Full task requirements from the plan
- The implementer's status report
- Acceptance criteria from the Live Spec
- Verify by reading actual code, not trusting the report

### 2g. Stage 2 Review: Code Quality

Dispatch a code quality reviewer subagent:

- The implementer's report
- Task requirements
- Git diff
- Coding Standards from constitution
- Any concerns from implementer

Code quality reviewer checks:

- Single responsibility per file
- Test quality and integrity
- TDD was followed
- Naming, readability, maintainability
- Adherence to constitutional coding standards
- No unnecessary complexity

### 2h. Mark Task Complete

After both reviews pass:

1. Mark task complete in TodoWrite
2. Record: specialist used, review cycles needed, concerns noted
3. Move to next task

## Step 3: Final Review

After all tasks complete, dispatch a final reviewer that reviews the entire implementation:

- Cross-task consistency
- Integration between tasks
- Overall architecture coherence

If `governance/boundaries.yaml` exists, run final boundary compliance check.

## Step 4: Completion

Clear `.context-index/hygiene/.active-plan`.

Read `completion.merge_policy` from manifest.yaml:

- **"pr" or protected branch:** Do NOT merge. Suggest opening a PR.
- **"merge" and not protected:** Offer to merge with confirmation.
- **"ask":** Ask user.

Report:

```
Implementation complete.

Tasks: N/N completed
Specialist routing: [list]
Review cycles: [total, highlight any with 3+]
Concerns noted: [list]

Next step: skill({ name: "adev-validate", args: { spec: "<path>" } })
```

## Update Spec Status

After all tasks are complete and before reporting completion:

1. Read the spec file that this plan implements
2. Parse YAML frontmatter
3. Update status: `review-passed` → `implemented`
4. Write the spec file back
5. Log: "Updated spec status: review-passed → implemented"

## Red Flags

**Never:**

- Start implementation on main/master without explicit user consent
- Skip either review stage
- Dispatch multiple subagents in parallel
- Make a subagent read the plan file
- Proceed with unfixed Critical or Important issues
- Skip TDD for any task
- Loosen a test assertion to make it pass
- Add conditional skip logic to tests
- Skip visual verification for UI tasks
- Merge to a protected branch
