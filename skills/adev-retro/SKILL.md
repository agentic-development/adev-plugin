---
name: adev-retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities, and update context artifacts. Sprint retrospective for agentic development. Use when the user says 'run a retro', 'what went well', 'review the sprint', 'delivery metrics', or wants to reflect on recent development work."
---

# Sprint Retrospective

Analyze completed work across a date range to extract patterns, compute delivery metrics, and generate actionable improvement recommendations. The retrospective examines git history, validation reports, recovery records, blocker files, hygiene reports, and plan files to build a comprehensive picture of what happened and what to improve.

**Announce at start:** "I'm using the adev-retro skill to analyze completed work and generate a retrospective."

## Arguments

- `--since <date>`: start date for the analysis period (default: 2 weeks ago from today). Accepts ISO format (YYYY-MM-DD) or relative expressions ("2 weeks ago", "1 month ago").
- `--charter <module>`: scope the retrospective to a specific feature charter module. Only analyzes specs, plans, and validations under `.context-index/specs/features/<module>/`.
- `--auto-apply`: apply low-risk improvements automatically (flag golden sample candidates, flag missing ADR topics, update hygiene report). Does not make destructive changes.

## Prerequisites

The project must have `.context-index/` initialized with at least a `constitution.md` and `manifest.yaml`. If the context index does not exist, suggest running `/adev-init` first.

## Step 1: Gather Data

Collect data from multiple sources within the analysis period. For each source, note what was found and what was empty. Missing sources are not errors; they reduce the analysis scope but do not block the retrospective.

### 1.1 Git History

```bash
git log --oneline --after="<since-date>" --before="<today>" --stat
```

Extract:
- Total commits in period
- Files changed (with change frequency per file)
- Spec references in commit messages (look for patterns like `feat(<module>):`, spec file names, or charter references)
- Authors and their commit counts (if multi-contributor)

### 1.2 Validation Reports

Read `.context-index/specs/features/**/*-validation.md` files. For each validation report:
- Check the `Date` field in the header. Include only reports within the date range.
- Extract the overall status (PASS or FAIL).
- If FAIL, extract which checks failed and the specific failure reasons.
- Note if a spec has multiple validation reports (indicates reruns were needed).

If `--charter <module>` was provided, only read validation reports under `.context-index/specs/features/<module>/`.

### 1.3 Recovery Records

Read files in `.context-index/hygiene/recoveries/` with dates in the analysis range. For each recovery record:
- Extract the root cause category (if categorized)
- Extract the time to resolution
- Extract which spec or task triggered the recovery
- Note the recovery strategy used

If the directory does not exist or is empty, note "No recovery records found" and continue.

### 1.4 Blocker Files

Read files in `.context-index/hygiene/blockers/` with dates in the analysis range. For each blocker:
- Extract what was blocked and why
- Extract how long the blocker persisted (if resolution date is present)
- Extract which spec or module was affected

If the directory does not exist or is empty, note "No blocker records found" and continue.

### 1.5 Hygiene Reports

Read the latest `.context-index/hygiene/drift-report.md`. Extract:
- Overall audit pass/warn/fail counts
- Priority actions listed (especially any that have been open for multiple cycles)
- Any patterns in repeated warnings

### 1.6 Plan Files

Read `.context-index/specs/features/**/*.plan.md` that were executed in the analysis range. Determine execution status by checking:
- Whether a corresponding validation report exists
- Whether all tasks in the plan have commits referencing them
- Whether the plan was fully executed, partially executed, or abandoned

If `--charter <module>` was provided, only read plans under `.context-index/specs/features/<module>/`.

## Step 2: Analyze Patterns

Compute metrics and identify patterns from the gathered data.

### Throughput

- **Specs completed vs. planned:** Count specs that have a PASS validation report in the period vs. specs that have plan files created in the period.
- **Completion rate:** (completed specs / planned specs) as a percentage.
- **Velocity trend:** If previous retrospective reports exist in `.context-index/hygiene/retros/`, compare current throughput against the last 1-2 periods.
- **Partial completions:** Specs where some but not all tasks were implemented.

### Quality

- **First-run validation pass rate:** Of all validation runs, what percentage passed on the first attempt?
- **Rerun rate:** How many specs required 2+ validation cycles?
- **Common failure checks:** Which of the 9 validation checks failed most often? (e.g., Check 2: Spec Compliance, Check 4: Constitution Compliance)
- **Auto-fix rate:** If `--fix` was used in validations, how often did auto-fix resolve the issue vs. requiring manual intervention?

### Recovery Patterns

- **Total recoveries:** Count of recovery records in the period.
- **Root cause distribution:** Group recoveries by root cause category. Identify the most common cause.
- **Mean time to recovery (MTTR):** Average time from recovery trigger to resolution.
- **Repeat offenders:** Files or modules that triggered multiple recoveries.

### Blocker Frequency

- **Total blockers:** Count of blocker files in the period.
- **Blockers per spec:** Average blockers encountered per spec under development.
- **Most blocked areas:** Modules or components with the highest blocker count.
- **Blocker duration:** Average time from blocker creation to resolution.

### Context Gaps

- **Missing references:** Scan git diffs for patterns where subagents searched context-index directories with no results (grep for file-not-found patterns in session logs if session capture is configured).
- **Frequently referenced files:** Files outside `.context-index/` that were read by multiple implementation tasks. These are de facto reference files that lack formal curation.

### Specialist Effectiveness

- **Specialist-routed vs. generic tasks:** Of all tasks in executed plans, how many had specialist tags vs. `[specialist: none]`?
- **Specialist task quality:** Compare validation pass rates for specialist-routed tasks vs. generic tasks. Did specialist routing correlate with fewer validation failures?
- **Missing specialist coverage:** Tasks that failed validation in domain-specific checks (Check 7) but had no specialist tag.

### Scope Drift

- **Plan adherence:** For each executed plan, compare the files listed in the plan's "File Structure" section against the files actually changed in commits.
- **Unplanned files:** Files changed that were not listed in any plan. High counts indicate scope creep or incomplete planning.
- **Plan accuracy:** Percentage of planned files that were actually touched vs. files touched that were not planned.

## Step 3: Generate Recommendations

Based on the patterns identified in Step 2, generate concrete, actionable improvement recommendations. Each recommendation must reference the specific data that supports it.

### Golden Sample Candidates

Identify files that served as informal references during the period:
- Files read by 3+ different implementation tasks (inferred from git history and plan file references)
- Files in frequently-changed directories that follow patterns other tasks replicated

For each candidate, note: the file path, how many tasks referenced it, and the pattern it represents.

Recommendation: "Add `<file>` as a golden sample with `/adev-sample`. It was used as reference by N tasks this period."

### Constitution Amendments

Identify constitution rules that were violated repeatedly:
- Rules that caused validation failures in 2+ specs
- Architecture boundaries that were crossed with approval (indicating the boundary may be too restrictive or needs clarification)

Recommendation: "Clarify constitution section '<section>' — violated in N validations. Consider whether the rule is too strict or needs better examples."

### Missing ADRs

Identify architectural decisions made during the period that lack formal ADRs:
- New dependencies added (check `package.json`, `requirements.txt`, or equivalent changes)
- New database models or schema changes
- New infrastructure patterns (middleware, auth flows, API versioning changes)
- Significant refactoring that changed module boundaries

Recommendation: "Draft ADR for '<decision>' — implemented in commit <hash> but no ADR exists."

### Spec Template Improvements

If certain acceptance criteria types are repeatedly missed during validation:
- Error handling criteria missing from multiple specs
- Performance criteria absent
- Accessibility criteria overlooked

Recommendation: "Add '<criteria type>' to the spec template — missed in N specs this period."

### Specialist Gaps

If tasks in a particular domain had high failure rates and no specialist exists for that domain:
- Frontend tasks failing accessibility checks with no frontend specialist
- Database tasks causing schema issues with no data-engineering specialist

Recommendation: "Consider creating a '<domain>' specialist — N tasks in this area had validation failures."

## Step 4: Auto-Apply (if --auto-apply)

When `--auto-apply` is passed, apply low-risk improvements that do not modify code or specs. These are informational updates only.

**Actions taken:**

1. **Flag golden sample candidates.** Print the list of candidates and suggest running `/adev-sample` for each. Do NOT extract or create samples automatically.

2. **Flag missing ADR topics.** Print the list of missing ADR topics and suggest running `/adev-brainstorm` to draft them. Do NOT create ADRs automatically.

3. **Update hygiene report.** If `.context-index/hygiene/drift-report.md` exists, append a "Retro Findings" section with the key metrics and top recommendations. This makes retro findings visible to the next `/adev-hygiene` run.

**Actions NOT taken (require explicit user action):**

- Constitution amendments (too impactful for auto-apply)
- Specialist creation (requires design decisions)
- Spec template changes (affects future specs)
- Any file modifications outside `.context-index/hygiene/`

## Step 5: Write Report

Save the retrospective report to `.context-index/hygiene/retros/<end-date>.md` where `<end-date>` is the last day of the analysis period in YYYY-MM-DD format.

If the `retros/` directory does not exist, create it.

If `--charter <module>` was provided, save to `.context-index/hygiene/retros/<end-date>-<module>.md` instead.

### Report Format

```markdown
# Retrospective: <start-date> to <end-date>

> **Period:** YYYY-MM-DD to YYYY-MM-DD
> **Scope:** <all modules | specific charter module>
> **Specs completed:** N
> **Validation pass rate:** N% (first-run)
> **Recoveries:** N (top cause: <category>)
> **Blockers:** N

## Throughput

<specs completed vs planned, completion rate, velocity trend compared to previous period if available>

<partial completions and abandoned plans, if any>

## Quality

<first-run validation pass rate, rerun rate, most common failure checks>

<per-check failure distribution table>

| Check | Failures | Most Common Issue |
|-------|----------|-------------------|
| Quality Gates | N | <issue> |
| Spec Compliance | N | <issue> |
| Charter Consistency | N | <issue> |
| Constitution Compliance | N | <issue> |
| ADR Compliance | N | <issue> |
| Cross-Cutting Specs | N | <issue> |
| Specialist Review | N | <issue> |
| Boundary Compliance | N | <issue> |
| Transition Gates | N | <issue> |

## Recovery Analysis

<total recoveries, root cause distribution, MTTR, repeat offenders>

| Root Cause | Count | Avg MTTR | Affected Modules |
|------------|-------|----------|------------------|
| <category> | N | Xh | <modules> |

## Blocker Analysis

<total blockers, per-spec average, most blocked areas, average duration>

## Scope Drift

<plan adherence percentage, unplanned file count, drift patterns>

## Specialist Effectiveness

<routed vs generic task comparison, quality correlation>

## Recommendations

### High Priority
- [ ] <recommendation with supporting data reference>
- [ ] <recommendation>

### Medium Priority
- [ ] <recommendation>
- [ ] <recommendation>

### Suggested Improvements
- [ ] <golden sample candidate: file path, N references>
- [ ] <constitution clarification: section, N violations>
- [ ] <missing ADR: topic, commit reference>
- [ ] <spec template addition: criteria type, N specs affected>
- [ ] <specialist gap: domain, N failures>

## Raw Data

<summary statistics table for reference>

| Metric | Value |
|--------|-------|
| Commits | N |
| Files changed | N |
| Specs planned | N |
| Specs completed | N |
| Validation runs | N |
| First-run passes | N |
| Recoveries | N |
| Blockers | N |
```

## Step 6: Present to User

After writing the report, present a concise summary and the top 3 recommendations:

```
Retrospective complete for <start-date> to <end-date>.

Key metrics:
- Specs: N completed of M planned (N% completion rate)
- Quality: N% first-run validation pass rate
- Recoveries: N (top cause: <category>)
- Scope drift: N unplanned files changed

Top 3 recommendations:
1. <highest priority recommendation with one-line rationale>
2. <second recommendation>
3. <third recommendation>

Full report saved to <path to retro file>.

Suggested next actions:
- Review the full report for detailed analysis
- Address high-priority recommendations before the next sprint
- Run /adev-hygiene to verify context health after applying changes
- Schedule the next retrospective in 2 weeks
```

If `--auto-apply` was used, also report what was applied:

```
Auto-applied:
- Flagged N golden sample candidates (run /adev-sample to extract)
- Flagged N missing ADR topics (run /adev-brainstorm to draft)
- Updated drift-report.md with retro findings
```

## Red Flags

**Never:**
- Modify code, specs, or plans during a retrospective (retrospectives are read-only analysis, except `--auto-apply` for hygiene metadata)
- Fabricate metrics when data sources are missing (report "no data" instead of guessing)
- Skip a data source without noting it was skipped
- Generate recommendations without supporting data from the analysis
- Apply constitution amendments or specialist changes via `--auto-apply`
- Overwrite a previous retrospective report (use date-based filenames to preserve history)
