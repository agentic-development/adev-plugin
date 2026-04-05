---
name: adev-build
description: "End-to-end build orchestrator. Chains review, plan, route, implement, and validate for one or more specs through a full lifecycle pipeline. Use when the user says 'build', 'end to end', 'full pipeline', 'build the spec', 'build the phase', 'run the whole pipeline', or wants to execute multiple lifecycle steps in sequence without manual handoffs."
---

# Build Pipeline Orchestrator

Chain review, plan, route, implement, and validate into a single end-to-end pipeline for one or more specs. Supports resuming from failure, batch processing by milestone phase, and dry-run preview.

**Announce at start:** "I'm using the adev-build skill to orchestrate a full build pipeline."

## Arguments

- `--spec <path>`: build a single spec end-to-end through all pipeline steps
- `--phase <name>`: discover and build all specs with matching `milestone` frontmatter
- `--resume`: resume an interrupted build from the last successful step
- `--dry-run`: show the pipeline plan without executing any skill or writing any file
- `--no-route`: skip the route step (Step 3) in the pipeline
- `--from <step>`: override resume point — force restart from a specific step (`review`, `plan`, `route`, `implement`, `validate`). Useful if build state is corrupted or stale.

## Prerequisites

Before starting, verify all conditions. If any fails, stop and tell the user what to fix.

1. **Context Index exists.** `.context-index/` must be present with `constitution.md` and `manifest.yaml`.
2. **Spec provided or discoverable.** At least one spec must be specified via `--spec` or discoverable via `--phase`.
3. **Valid arguments.** If `--spec` is provided, the file must exist. If `--phase` is provided, the milestone name must be a non-empty string.

If `.context-index/` does not exist, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev-init` first to set up the context index, then come back to build.

---

## Build Pipeline

The pipeline executes 5 steps per spec, in strict order. Each step invokes an existing skill. The build orchestrator never performs review, planning, routing, implementation, or validation directly -- it delegates to the corresponding skill.

### Step 1: Review

Invoke `/adev-review-specs --spec <path>`.

- **Skip condition:** A `.review.md` file exists adjacent to the spec, contains a PASS or PASS_WITH_NOTES verdict, and is not stale (its modification date is equal to or newer than the spec's modification date).
- **Stop condition:** The review verdict is BLOCK. Save build state with the failure, report the review findings to the user, and stop the build for this spec.
- **On success:** Record step as `completed` in build state.

### Step 2: Plan

Invoke `/adev-plan --spec <path>`.

- **Skip condition:** A `.plan.md` file exists adjacent to the spec.
- **Stop condition:** The plan detects a constitution violation. Save build state with the failure and stop the build for this spec.
- **On success:** Record step as `completed` in build state.

### Step 3: Route

Invoke `/adev-route --plan <plan-path>`.

- **Skip condition:** The `--no-route` flag is set. Mark step as `skipped` in build state.
- **Nature:** Route annotations are advisory. This step does not produce a pass/fail verdict. If `/adev-route` is unavailable or errors, log a warning and continue.
- **On success:** Record step as `completed` in build state.

### Step 4: Implement

Invoke `/adev-implement <plan-path>`.

- **Skip condition:** None. Implementation always runs unless the build was resumed past this step.
- **Stop condition:** Quality gates fail (tests fail, lint errors, etc.). Save build state with the failure, report the failures to the user, and stop the build for this spec.
- **On success:** Record step as `completed` in build state.

### Step 5: Validate

Invoke `/adev-validate --spec <path> --plan <plan-path>`.

- **Skip condition:** None. Validation always runs as the final step.
- **Outcome:** Report PASS or FAIL. A validation FAIL is recorded but does NOT retroactively block the build -- the implementation is already done. Validation is informational, indicating whether all acceptance criteria from the spec are met.
- **On success or failure:** Record step as `completed` (with PASS/FAIL noted) in build state.

---

## Build State

Build state is persisted as JSON at `.context-index/build-state/<slug>.json`, where `<slug>` is derived from the spec filename (lowercase, hyphenated, without extension).

### Directory Creation

If `.context-index/build-state/` does not exist, create it before writing the first build state file.

### State File Format

```json
{
  "spec": ".context-index/specs/features/<module>/<spec>.md",
  "phase": "<milestone-name or null>",
  "status": "in_progress",
  "steps": [
    {
      "name": "review",
      "status": "completed",
      "timestamp": "2026-04-05T10:00:00Z"
    },
    {
      "name": "plan",
      "status": "completed",
      "timestamp": "2026-04-05T10:05:00Z"
    },
    {
      "name": "route",
      "status": "skipped",
      "timestamp": "2026-04-05T10:05:01Z"
    },
    {
      "name": "implement",
      "status": "failed",
      "timestamp": "2026-04-05T10:15:00Z",
      "error": "Quality gate failure: 2 tests failing"
    }
  ],
  "started": "2026-04-05T10:00:00Z",
  "updated": "2026-04-05T10:15:00Z"
}
```

### Incremental Persistence

The build state file is written **after each step completes** (not just at the end). This ensures that if the build is interrupted at any point, the state file reflects exactly which steps finished. Fields:

- `spec`: path to the spec being built
- `phase`: milestone name (if invoked via `--phase`) or `null`
- `status`: `in_progress` while running, `completed` when all steps finish successfully, `failed` if any step fails
- `steps`: array of step records, each with `name`, `status` (`completed`, `failed`, `skipped`), `timestamp` (ISO-8601), and optional `error` (string, only on failure)
- `started`: ISO-8601 timestamp of build start
- `updated`: ISO-8601 timestamp of last state write

On successful completion of all 5 steps, set `status` to `completed`. On any step failure, set `status` to `failed`.

---

## Resume Mode

When `--resume` is invoked, the skill resumes an interrupted or failed build from the last successful step.

### Resume without `--spec` or `--phase`

Scan `.context-index/build-state/` for any JSON file with `"status": "in_progress"` or `"status": "failed"`. If multiple are found, list them and ask the user which to resume. If none are found, print:

> No interrupted build found. Nothing to resume.

### Resume with `--spec <path>`

Read the build state file for the specified spec. Identify the last step with `status: completed` and resume from the next step in the pipeline.

### Resume with `--phase <name>`

Re-discover all specs with `milestone: <name>` in their frontmatter by scanning `.context-index/specs/`. Do NOT rely solely on cached build state files -- specs may have been added or modified between sessions. For each discovered spec, check if a build state file exists:

- If build state exists with `status: in_progress` or `status: failed`, resume from the next step after the last completed one.
- If build state exists with `status: completed`, skip that spec.
- If no build state exists, start a fresh build for that spec.

### The `--from <step>` Override

When `--from <step>` is combined with `--resume`, force the build to restart from the specified step regardless of what the build state file says. Valid step names: `review`, `plan`, `route`, `implement`, `validate`.

This is a safety valve for situations where:
- The build state file is corrupted
- External changes have invalidated a previously-completed step
- The user wants to re-run a step that passed but produced suboptimal results

When `--from` is used, all steps before the specified step are marked `skipped` in the new build state, and execution begins at the specified step.

---

## Phase Mode

When `--phase <name>` is invoked (without `--resume`), the skill discovers and builds multiple specs in batch.

### Spec Discovery

1. Scan all `.md` files under `.context-index/specs/features/` (excluding `charter.md`, `*.plan.md`, `*.review.md`).
2. Parse YAML frontmatter for the `milestone` field.
3. Select specs whose `milestone` matches `<name>` (case-insensitive).
4. Filter to specs with `status` of `review-pending` or later (skip `draft` specs).
5. If no specs are found, print:

   > No specs found for milestone '<name>'. Verify that your specs have `milestone: <name>` in their frontmatter.

   And stop.

### Dependency Ordering

Check each spec's frontmatter for a `depends-on` field (list of spec paths). Build specs in dependency order: specs with no dependencies first, then specs whose dependencies have been built.

If circular dependencies are detected, print a warning and build in discovery order.

### Independent Execution

Each spec is built independently through the full pipeline. **Failure of one spec does not block others** unless they have an explicit `depends-on` referencing the failed spec. If a dependency failed:

- Skip the dependent spec.
- Mark it as `skipped` with reason: "Dependency `<spec>` failed."

### Issue Board Integration

If `tasks.backend` is configured in `manifest.yaml`:

- At the start of phase mode, find the milestone epic on the issue board and mark it as `in_progress`.
- During the build, delegate issue updates to child skills (each skill manages its own issue board interactions).
- At the end of phase mode, do **not** automatically close the milestone epic. That is a manual decision.

If `tasks.backend` is not configured, skip all issue board operations.

### Phase Summary

After all specs are processed, print:

```
Phase '<name>' complete.

  N specs attempted, N passed, N failed, N skipped

  Passed:
    - <spec-path>
    - <spec-path>

  Failed:
    - <spec-path>: <failure reason>

  Skipped:
    - <spec-path>: <skip reason>
```

---

## Dry Run Mode

When `--dry-run` is specified, show the full pipeline plan without executing any skill, writing any file, or modifying any state.

### Dry Run with `--spec <path>`

Show:
1. The spec path and its current status.
2. Which pipeline steps would **execute** vs **skip** (based on existing `.review.md`, `.plan.md`, `--no-route` flag).
3. If a `.plan.md` exists, show the estimated task count from the plan.
4. If a build state file exists, note whether `--resume` would change the pipeline.
5. Flag any `completed_with_warnings` conditions -- specs that may need attention even after previously passing review.

### Dry Run with `--phase <name>`

Show:
1. All discovered specs for the milestone (with their frontmatter status).
2. Dependency order (if applicable).
3. Per-spec step breakdown: which steps would execute vs skip.
4. Total estimated tasks across all specs (from existing plans).
5. Specs that would be skipped entirely (already completed, draft status).

### Output Format

```
Dry Run: Build Pipeline for <spec or phase>

  Spec: .context-index/specs/features/<module>/<spec>.md
    Step 1: Review    — SKIP (review.md exists, current)
    Step 2: Plan      — SKIP (plan.md exists, 5 tasks)
    Step 3: Route     — EXECUTE
    Step 4: Implement — EXECUTE (5 tasks)
    Step 5: Validate  — EXECUTE

  ⚠ completed_with_warnings: <spec> passed review with notes — verify notes are addressed.

  Estimated effort: 5 tasks across 3 active steps.
```

`--dry-run` is strictly read-only. It never invokes a skill, writes a file, or modifies build state.

---

## Single Spec Mode (`--spec`)

When `--spec <path>` is invoked without `--resume`, `--phase`, or `--dry-run`:

1. Verify the spec file exists. If not, print: "Spec not found: `<path>`" and stop.
2. Create or reset the build state file for this spec.
3. If `tasks.backend` is configured, find the matching issue for this spec and mark it `in_progress`.
4. Execute the 5-step pipeline in order (see Build Pipeline above).
5. On completion, print the summary.

### Summary Output

```
Build complete.

  Spec: <path>
  Status: PASSED | FAILED at step <N> (<step-name>)
  Steps:
    1. Review    — completed | skipped | failed
    2. Plan      — completed | skipped | failed
    3. Route     — completed | skipped
    4. Implement — completed | failed
    5. Validate  — PASS | FAIL
```

---

## Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `.context-index/` missing | Print "Run `/adev-init` first" and stop |
| `--spec` file not found | Print "Spec not found: `<path>`" and stop |
| `--phase` finds no matching specs | Print "No specs found for milestone `<name>`" and stop |
| `--resume` with no build state files | Print "No interrupted build found" and stop |
| Review returns BLOCK | Stop build for that spec, save state, report findings |
| Quality gates fail during implement | Stop build for that spec, save state, report failures |
| Validation returns FAIL | Report FAIL but mark build as completed (informational) |
| `--from <step>` with invalid step name | Print "Invalid step: `<name>`. Valid steps: review, plan, route, implement, validate" and stop |
| Circular dependencies in phase mode | Print warning, proceed in discovery order |

---

## Key Principles

1. **Delegate, never duplicate.** The build orchestrator invokes existing skills (`/adev-review-specs`, `/adev-plan`, `/adev-route`, `/adev-implement`, `/adev-validate`). It never performs review, planning, or implementation directly. Each skill owns its own domain.

2. **Fail fast, resume gracefully.** When a step fails, stop immediately for that spec, save state, and report. The user can fix the issue and `--resume` without re-running completed steps.

3. **Incremental state persistence.** Build state is saved after every step, not just at the end. An interrupted build (network failure, timeout, user abort) always has an accurate state file.

4. **Phase independence.** In `--phase` mode, specs are independent units. One spec's failure does not cascade to unrelated specs. Only explicit `depends-on` relationships create blocking dependencies.

5. **Dry run is sacred.** `--dry-run` is strictly read-only. It never invokes a skill, writes a file, or modifies state. It exists to give the user confidence before committing to a potentially long build.

6. **Pipeline order is fixed.** The 5-step order (review, plan, route, implement, validate) is invariant. Steps can be skipped based on conditions, but they are never reordered.

7. **Issue board is optional.** All issue board operations are guarded by `tasks.backend` in the manifest. If unconfigured, the build runs identically but without issue tracking.
