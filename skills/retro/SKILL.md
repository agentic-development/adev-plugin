---
name: adev:retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities, and update context artifacts. Sprint retrospective for agentic development. Use when the user says 'run a retro', 'what went well', 'review the sprint', 'delivery metrics', or wants to reflect on recent development work."
---

# Sprint Retrospective

Analyze completed work across a date range to extract patterns, compute delivery metrics, and generate actionable improvement recommendations. The retrospective examines git history, validation reports, recovery records, blocker files, hygiene reports, and plan files to build a comprehensive picture of what happened and what to improve.

**Announce at start:** "I'm using the adev:retro skill to analyze completed work and generate a retrospective."

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill retro
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- `--since <date>`: start date for the analysis period (default: 2 weeks ago from today). Accepts ISO format (YYYY-MM-DD) or relative expressions ("2 weeks ago", "1 month ago").
- `--charter <module>`: scope the retrospective to a specific feature charter module. Only analyzes specs, plans, and validations under `.context-index/specs/features/<module>/`.
- `--auto-apply`: apply low-risk improvements automatically (flag golden sample candidates, flag missing ADR topics, update hygiene report). Does not make destructive changes.

## Prerequisites

The project must have `.context-index/` initialized with at least a `constitution.md` and `manifest.yaml`. If the context index does not exist, suggest running `/adev:init` first.

## Step 1: Gather Data

Collects commits, sessions, and lifecycle events for the period.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/retro/references/steps/step-1-gather-data.md` for the full instructions. Do not act on this section from the summary above.

## Step 2: Analyze Patterns

Derives delivery metrics and recurring patterns from the gathered data.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/retro/references/steps/step-2-analyze-patterns.md` for the full instructions. Do not act on this section from the summary above.

## Step 3: Generate Recommendations

Turns the analysis into concrete, owned actions.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/retro/references/steps/step-3-recommendations.md` for the full instructions. Do not act on this section from the summary above.

## Step 4: Auto-Apply (if --auto-apply)

Applies only with --auto-apply: writes the accepted recommendations back.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/retro/references/steps/step-4-auto-apply.md` for the full instructions. Do not act on this section from the summary above.

## Step 5: Write Report

Renders the retrospective artifact.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/retro/references/steps/step-5-write-report.md` for the full instructions. Do not act on this section from the summary above.

## Step 6: Present to User

The closing summary shown to the user.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/retro/references/steps/step-6-present.md` for the full instructions. Do not act on this section from the summary above.

## Red Flags

**Never:**
- Modify code, specs, or plans during a retrospective (retrospectives are read-only analysis, except `--auto-apply` for hygiene metadata)
- Fabricate metrics when data sources are missing (report "no data" instead of guessing)
- Skip a data source without noting it was skipped
- Generate recommendations without supporting data from the analysis
- Apply constitution amendments or specialist changes via `--auto-apply`
- Overwrite a previous retrospective report (use date-based filenames to preserve history)
- Lump durable framework artifacts (lifecycle-state, sessions, drift stamps, hygiene reports) into a "consider gitignore" recommendation. These have committed homes — the right action is `/adev:reconcile`, not `.gitignore`.
- Treat a `+drift_detected: true` frontmatter diff as a real spec edit. Run `git diff` to distinguish drift stamps from in-progress spec work.
