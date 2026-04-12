---
name: adev:recover
description: "Structured diagnosis-correction-resume cycle when agents get stuck. Classifies root causes into six categories. In OpenCode, invoke with skill({ name: 'adev:recover' })"
---

# Agent Recovery Workflow

When a subagent gets stuck during `adev:implement`, this skill provides structured diagnosis, corrective injection, and resume cycle.

## Arguments

- `--task <N>`: recover a specific stuck task
- `--blocker <path>`: recover from a specific blocker file
- No arguments: interactive mode

## Prerequisites

The project must have `.context-index/` initialized. An active implementation plan should exist.

## Process

### Step 1: Detect

**With `--task <N>`:**

1. Find the active plan
2. Load task N from the plan
3. Check for blocker file at `.context-index/hygiene/blockers/`
4. Check for subagent report with status BLOCKED or NEEDS_CONTEXT

**With `--blocker <path>`:**

1. Read the blocker file
2. Extract task reference and error description
3. Locate corresponding plan and task

**Interactive (no arguments):**

1. Scan `.context-index/hygiene/blockers/` for recent blockers
2. Present them to user or ask which task is stuck

### Step 2: Gather Evidence

1. **Context packet.** Read `.context-index/packets/<task-slug>.md` if exists
2. **Subagent report.** Read last subagent output for status
3. **Plan entry.** Re-read full task entry
4. **Spec.** Read Live Spec
5. **Git state.** Check `git status` and `git diff`

### Step 3: Diagnose

Classify root cause into one of six categories:

#### Category 1: MISSING_CONTEXT
The subagent lacked information that exists in `.context-index/` but was not included.

**Indicators:** Subagent reported NEEDS_CONTEXT, answer exists in ADR/charter/sample

#### Category 2: AMBIGUOUS_SPEC
Spec language unclear or acceptance criteria vague.

**Indicators:** DONE_WITH_CONCERNS or BLOCKED citing "unclear requirement"

#### Category 3: CONSTRAINT_CONFLICT
Two constitutional principles or requirements contradict each other.

**Indicators:** Implementation flagged a contradiction

#### Category 4: NOVEL_PROBLEM
No golden sample, pattern, or prior implementation covers this case.

**Indicators:** NEEDS_CONTEXT but context does not exist anywhere

#### Category 5: TOOL_FAILURE
External tool failed, preventing TDD cycle completion.

**Indicators:** BLOCKED with command error

#### Category 6: BUDGET_EXHAUSTION
Task too large for single subagent dispatch.

**Indicators:** DONE_WITH_CONCERNS, only completed part of task

### Step 4: Inject Corrective Context

Based on confirmed root cause:

**MISSING_CONTEXT:** Add missing file references to context packet

**AMBIGUOUS_SPEC:** Draft clarification addendum with specific, testable language

**CONSTRAINT_CONFLICT:** Surface both requirements, present resolution options

**NOVEL_PROBLEM:** Check for golden sample creation, draft implementation guide

**TOOL_FAILURE:** Diagnose error, suggest/apply fix

**BUDGET_EXHAUSTION:** Propose task split into subtasks

### Step 5: Resume

1. Summarize corrective action taken
2. Verify changes are saved
3. Suggest next command: `adev:implement <plan> --task <N>`

### Step 6: Write Recovery Record

Write to `.context-index/hygiene/recoveries/<date>-<task-slug>.md`:

```markdown
# Recovery Record: <task-slug>

> **Date:** YYYY-MM-DD
> **Task:** <task reference>
> **Root Cause:** [category]
> **Time to Recovery:** <minutes>
> **Outcome:** resolved | escalated | deferred

## Diagnosis
<What was found>

## Corrective Action
<What was done>

## Prevention
<What should change to prevent recurrence>
```

### Step 7: Extract Heuristic

After the recovery record is written in Step 6, extract a transferable heuristic from the root-cause diagnosis via `lib/heuristics.mjs`. This step is non-blocking — extraction failures log a warning and allow `adev:recover` to exit normally.

Map the confirmed diagnosis category to the heuristic's `pattern` and `antiPattern` fields:

- **MISSING_CONTEXT** — `pattern`: the context that should be included in future packets for similar tasks. `antiPattern`: the assumption that failed.
- **AMBIGUOUS_SPEC** — `pattern`: the clarification that resolved the ambiguity. `antiPattern`: the vague phrasing that caused the confusion.
- **CONSTRAINT_CONFLICT** — `pattern`: the resolution rule for this type of conflict. `antiPattern`: attempting to satisfy both constraints without arbitration.
- **NOVEL_PROBLEM** — `pattern`: the approach that solved the novel problem. `antiPattern`: assuming prior art existed.
- **TOOL_FAILURE** — `pattern`: the workaround or diagnostic step that unblocked progress. `antiPattern`: the tool invocation that failed.
- **BUDGET_EXHAUSTION** — `pattern`: the task-splitting rule that should have been applied. `antiPattern`: the task-size signal that was missed.

Derive `scope` from the active plan's spec `charter:` frontmatter field. Fall back to `_global` if absent.

Initial `confidence: low` is used for recovery-extracted heuristics.

#### Contradiction Scan (before write)

Before writing the new heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: call `readHeuristics(projectRoot, { module: scope })` via inline Node.js (importing from `lib/heuristics.mjs`).
2. For each existing entry, compare semantically: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic's `antiPattern` conflict with an existing entry's `pattern`?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<recovery-record-path>', date: '<today>', source: 'recovery' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `adev:retro` consolidation is the backstop for missed contradictions.

Run the extraction via an inline Node invocation that imports `writeHeuristic` from `./lib/heuristics.mjs` and wraps the call in `try`/`catch` so any failure degrades to a stderr warning without blocking the recovery workflow.

## After Recovery

```
Recovery record saved: .context-index/hygiene/recoveries/<date>-<task>.md
Root cause: [category]
Outcome: resolved

Ready to resume: skill({ name: "adev:implement", args: { plan: "<path>", task: <N> } })
```
