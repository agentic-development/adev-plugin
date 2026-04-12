---
name: adev:recover
description: "Structured diagnosis-correction-resume cycle when agents get stuck. Classifies root causes into six categories. In Codex, invoke with $adev:recover"
---

# Agent Recovery Workflow

When a subagent gets stuck during `$adev:implement`, provide structured diagnosis and recovery.

## Arguments

- `--task <N>`: recover specific stuck task
- `--blocker <path>`: recover from specific blocker
- No arguments: interactive mode

## Prerequisites

`.context-index/` initialized with constitution and manifest.

## Process

### Step 1: Detect

**With `--task <N>`:**
1. Find active plan
2. Load task N
3. Check blocker file at `.context-index/hygiene/blockers/`
4. Check subagent report with BLOCKED/NEEDS_CONTEXT status

**With `--blocker <path>`:**
1. Read blocker file
2. Extract task reference and error
3. Locate plan and task

**Interactive:**
1. Scan recent blockers
2. Present or ask which task is stuck

### Step 2: Gather Evidence

1. Context packet: `.context-index/packets/<task-slug>.md`
2. Subagent report with status
3. Plan entry
4. Spec
5. Git state: `git status`, `git diff`

### Step 3: Diagnose

Classify root cause:

#### MISSING_CONTEXT
Subagent lacked info that exists in `.context-index/`.

**Indicators:** NEEDS_CONTEXT, answer exists in ADR/charter/sample

#### AMBIGUOUS_SPEC
Spec language unclear or criteria vague.

**Indicators:** DONE_WITH_CONCERNS citing "unclear requirement"

#### CONSTRAINT_CONFLICT
Two principles or requirements contradict.

**Indicators:** Implementation flagged contradiction

#### NOVEL_PROBLEM
No golden sample or precedent.

**Indicators:** NEEDS_CONTEXT, context does not exist anywhere

#### TOOL_FAILURE
External tool failed.

**Indicators:** BLOCKED with command error

#### BUDGET_EXHAUSTION
Task too large for single dispatch.

**Indicators:** DONE_WITH_CONCERNS, only partial completion

### Step 4: Inject Corrective Context

**MISSING_CONTEXT:** Add missing files to context packet

**AMBIGUOUS_SPEC:** Draft clarification with specific language

**CONSTRAINT_CONFLICT:** Surface requirements, present options

**NOVEL_PROBLEM:** Check for golden sample creation, draft guide

**TOOL_FAILURE:** Diagnose error, suggest/apply fix

**BUDGET_EXHAUSTION:** Propose task split

### Step 5: Resume

1. Summarize corrective action
2. Verify changes saved
3. Suggest: `$adev:implement <plan> --task <N>`

### Step 6: Write Recovery Record

```markdown
# Recovery Record: <task-slug>

> **Date:** YYYY-MM-DD
> **Task:** <reference>
> **Root Cause:** [category]
> **Time to Recovery:** <minutes>
> **Outcome:** resolved | escalated | deferred

## Diagnosis
<What was found>

## Corrective Action
<What was done>

## Prevention
<What should change>
```

### Step 7: Extract Heuristic

After the recovery record is written in Step 6, extract a transferable heuristic from the root-cause diagnosis via `lib/heuristics.mjs`. This step is non-blocking — extraction failures log a warning and allow `$adev:recover` to exit normally.

Derive scope from the active plan path (module slug from `features/<module>/` segment, fall back to `_global`). Initial confidence: `low`.

Map the confirmed diagnosis category to `pattern` and `antiPattern` fields:
- **MISSING_CONTEXT** — pattern: context that should be included in future packets. antiPattern: the assumption that failed.
- **AMBIGUOUS_SPEC** — pattern: the language clarification needed. antiPattern: paraphrased ambiguous phrase (never verbatim).
- **CONSTRAINT_CONFLICT** — pattern: constraint ordering rule. antiPattern: the conflict that triggered the failure.
- **NOVEL_PROBLEM** — pattern: new pattern or tool introduced. antiPattern: empty.
- **TOOL_FAILURE** — pattern: pre-flight check that prevents the failure. antiPattern: the tool state that caused the crash.
- **BUDGET_EXHAUSTION** — pattern: task-splitting rule. antiPattern: the task-size signal that was missed.

#### Contradiction Scan (before write)

Before writing the new heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: call `readHeuristics(projectRoot, { module: scope })` via inline Node.js (importing from `lib/heuristics.mjs`).
2. For each existing entry, compare semantically: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic's `antiPattern` conflict with an existing entry's `pattern`?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<recovery-record-path>', date: '<today>', source: 'recovery' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `$adev:retro` consolidation is the backstop for missed contradictions.

Run extraction via inline Node.js importing `writeHeuristic` from `./lib/heuristics.mjs`, wrapped in try/catch so extraction failures degrade to a stderr warning without blocking the recovery workflow.

## After Recovery

```
Recovery record saved: .context-index/hygiene/recoveries/<date>-<task>.md
Root cause: [category]
Ready to resume: $adev:implement
```
