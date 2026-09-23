---
name: adev:recover
description: "Structured diagnosis-correction-resume cycle when agents get stuck during implementation. Classifies root causes into six categories, injects corrective context, and re-dispatches with enriched prompts. Writes recovery records for retrospective analysis. Use when a subagent is stuck, a task has stalled, an agent failed mid-execution, or the user reports 'the agent is looping' or 'it is not making progress'."
---

# Agent Recovery Workflow

When a subagent gets stuck during `/adev:implement`, this skill provides a structured diagnosis, corrective injection, and resume cycle. Instead of blindly retrying or escalating to the user with vague "it did not work" messages, this skill classifies the root cause, applies the targeted fix, and re-dispatches with enriched context.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill recover
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- `--task <N>`: recover a specific stuck task (references task number from the active plan)
- `--blocker <path>`: recover from a specific blocker file in `.context-index/hygiene/blockers/`
- No arguments: interactive mode (check for recent blockers or ask which task is stuck)
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)

## Prerequisites

The project must have `.context-index/` initialized with `constitution.md` and `manifest.yaml`. An active implementation plan should exist (produced by `/adev:plan`). If no plan is found, ask the user for the plan path.

## Process

**Announce at start:**
```
Starting agent recovery workflow.
Mode: [task N | blocker <path> | interactive]
```

### Step 1: Detect

Recognises that a task has stalled and captures the stall signature.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-1-detect.md` for the full instructions. Do not act on this section from the summary above.

### Step 1.5: Infrastructure Preflight

Runs only when the stalled task declared infra_requirements.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-1.5-infra-preflight.md` for the full instructions. Do not act on this section from the summary above.

### Step 2: Gather Evidence

Collects transcript, logs, and artifacts that explain the stall.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-2-gather-evidence.md` for the full instructions. Do not act on this section from the summary above.

### Step 3: Diagnose

Classifies the stall into one of the six root-cause categories.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-3-diagnose.md` for the full instructions. Do not act on this section from the summary above.

### Step 4: Inject Corrective Context

Builds the enriched context injected before re-dispatch.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-4-inject-context.md` for the full instructions. Do not act on this section from the summary above.

### Step 5: Resume

Re-dispatches the task with the enriched prompt.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-5-resume.md` for the full instructions. Do not act on this section from the summary above.

### Step 6: Enrich

Adds the recovered context back into the project record.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-6-enrich.md` for the full instructions. Do not act on this section from the summary above.

### Step 7: Extract Heuristic

Writes the recovery record and any durable heuristic learned.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/recover/references/steps/step-7-extract-heuristic.md` for the full instructions. Do not act on this section from the summary above.

## Patterns Across Multiple Recoveries

When writing the recovery record, check for patterns in existing records:

1. Read all files in `.context-index/hygiene/recoveries/`.
2. Count root cause frequency. If the same category appears 3+ times, flag it:
   ```
   Pattern detected: MISSING_CONTEXT has occurred 4 times.

   Recurring missing context:
   - error-handling.md (missing from 3 context packets)
   - auth cross-cutting spec (missing from 2 context packets)

   Recommendation: Add these files as default context in the plan template.
   ```
3. Include the pattern observation in the recovery record's Prevention section.

## Red Flags

**Never:**
- Skip the diagnosis step and jump straight to re-dispatching (guessing wastes more time than diagnosing)
- Modify implementation code during recovery (recovery injects context, it does not write code)
- Re-dispatch without user confirmation of the diagnosis
- Ignore the subagent's own assessment (BLOCKED and NEEDS_CONTEXT reports contain valuable signal)
- Apply the same fix twice without investigating why the first fix did not work
- Skip writing the recovery record (the retrospective data is essential for process improvement)
- Blame the subagent (root causes are always context, spec, or tooling problems, not agent capability problems)
