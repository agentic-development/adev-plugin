---
name: adev:retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities, and update context artifacts. Sprint retrospective for agentic development. Use when the user says 'run a retro', 'what went well', 'review the sprint', 'delivery metrics', or wants to reflect on recent development work."
---

# Sprint Retrospective

Analyze completed work across a date range to extract patterns, compute delivery metrics, and generate actionable improvement recommendations. The retrospective examines git history, validation reports, recovery records, blocker files, hygiene reports, and plan files to build a comprehensive picture of what happened and what to improve.

**Announce at start:** "I'm using the adev:retro skill to analyze completed work and generate a retrospective."

## Execution Protocol

**Silent execution (subagent mode):** When this skill is invoked as a subagent (via the Agent tool from a parent orchestrator), execute all steps silently:
- Chain steps continuously without intermediate commentary or narration.
- Do NOT emit confirmations like "Loaded the context" or "Proceeding to step N."
- Do NOT summarize intermediate findings between steps.
- Use parallel tool calls (multiple Read/Grep/Glob in one turn) for context-loading phases.
- Report ONLY the final result in the structured format expected by the parent.

This directive does NOT apply when:
- The skill is invoked interactively by a user.
- The subagent prompt contains `VERBOSE: true` (debug mode — narrate all steps).

**Artifact-to-disk (output protocol):** When this skill writes an artifact to disk (plan file, review file, validation report, retro report), do NOT echo the full artifact content in conversation output. Instead:
1. Write the complete artifact to its target file path.
2. Present ONLY a structured summary to the user/parent:
   - Status line (e.g., PASS/FAIL, task count, coverage)
   - Key metrics (N tasks, M criteria, P findings)
   - File path to the full artifact
   - Actionable next steps
3. The full artifact content must NOT be repeated in conversation after being written to disk.


## Arguments

- `--since <date>`: start date for the analysis period (default: 2 weeks ago from today). Accepts ISO format (YYYY-MM-DD) or relative expressions ("2 weeks ago", "1 month ago").
- `--charter <module>`: scope the retrospective to a specific feature charter module. Only analyzes specs, plans, and validations under `.context-index/specs/features/<module>/`.
- `--auto-apply`: apply low-risk improvements automatically (flag golden sample candidates, flag missing ADR topics, update hygiene report). Does not make destructive changes.

## Prerequisites

The project must have `.context-index/` initialized with at least a `constitution.md` and `manifest.yaml`. If the context index does not exist, suggest running `/adev:init` first.

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

### 1.7 Heuristics

Read heuristics by iterating over module slugs from `manifest.yaml` `modules[].slug` plus `_global`. For each module, call `readHeuristics(projectRoot, { module: slug })` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`, where `<ADEV_ROOT>` is the adev plugin root — derive it from this skill file's base directory by stripping the `skills/<name>/` suffix). Record each entry's `id`, `scope`, `confidence`, `evidence[]` count, `contradicted-by[]` count, `created`, and `updated` dates.

Also scan `.context-index/memory/heuristics/archive/` for recently archived entries (where `archived` date falls within the analysis range). Record their `archivedReason` for the health analysis.

If the heuristics directory does not exist or `readHeuristics` throws, note "No heuristics found" and proceed. The consolidation steps (Heuristic Health in Step 2 and Heuristic Consolidation in Step 3) are skipped when no heuristics are gathered.

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

### Heuristic Health

If heuristics were gathered in Step 1.7, compute:

- **Total heuristics** by scope and confidence level
- **New heuristics in period:** entries whose `created` date falls within the analysis range
- **Stale heuristics:** entries whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days)
- **Contradicted heuristics:** entries with 1+ items in `contradicted-by[]`
- **Duplicate candidates:** entries within the same scope whose `title` or `pattern` text has high semantic overlap (look for entries describing the same lesson in different words)
- **Promotion candidates:** entries with 2+ distinct-path evidence entries that remain at `low` confidence, or 3+ at `medium` (should have been auto-promoted — may indicate a store bug)

## Step 3: Generate Recommendations

Based on the patterns identified in Step 2, generate concrete, actionable improvement recommendations. Each recommendation must reference the specific data that supports it.

### Golden Sample Candidates

Identify files that served as informal references during the period:
- Files read by 3+ different implementation tasks (inferred from git history and plan file references)
- Files in frequently-changed directories that follow patterns other tasks replicated

For each candidate, note: the file path, how many tasks referenced it, and the pattern it represents.

Recommendation: "Add `<file>` as a golden sample with `/adev:sample`. It was used as reference by N tasks this period."

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

### Heuristic Consolidation

If heuristics were gathered in Step 1.7:

**Stale heuristics:** For each stale heuristic found in Step 2:

> Recommendation: "Archive stale heuristic '<id>' in scope '<scope>' — last updated <date>, <N> days ago. Reason: staleness."

**Duplicate candidates:** For each pair of duplicate candidates:

> Recommendation: "Merge duplicate heuristics '<id1>' and '<id2>' in scope '<scope>' — both describe: '<shared pattern summary>'. Keep the one with higher evidence count, archive the other with reason 'merged-duplicate'."

**Contradicted heuristics:** For each heuristic with exactly 1 contradiction:

> Recommendation: "Review contradicted heuristic '<id>' — 1 contradiction recorded. A second contradiction will auto-archive it. Verify whether the contradiction is valid."

**Promotion candidates:** For each promotion anomaly:

> Recommendation: "Heuristic '<id>' has <N> evidence entries but confidence is still '<level>'. Expected auto-promotion to '<expected>'. Investigate whether evidence paths are truly distinct."

## Step 4: Auto-Apply (if --auto-apply)

When `--auto-apply` is passed, apply low-risk improvements that do not modify code or specs. These are informational updates only.

**Actions taken:**

1. **Flag golden sample candidates.** Print the list of candidates and suggest running `/adev:sample` for each. Do NOT extract or create samples automatically.

2. **Flag missing ADR topics.** Print the list of missing ADR topics and suggest running `/adev:brainstorm` to draft them. Do NOT create ADRs automatically.

3. **Update hygiene report.** If `.context-index/hygiene/drift-report.md` exists, append a "Retro Findings" section with the key metrics and top recommendations. This makes retro findings visible to the next `/adev:hygiene` run.

4. **Archive stale heuristics.** For each heuristic whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days), call `archiveHeuristic(projectRoot, id, 'stale')` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`). Log progress: "Archived N/M stale heuristics". If `archiveHeuristic` throws (e.g., `HEURISTICS_ARCHIVE_CONFLICT`), log a warning per entry and continue.

**Actions NOT taken (require explicit user action):**

- Constitution amendments (too impactful for auto-apply)
- Specialist creation (requires design decisions)
- Spec template changes (affects future specs)
- Any file modifications outside `.context-index/hygiene/`
- Duplicate merging (requires human judgment to determine which entry to keep)
- Heuristic promotion (may indicate a legitimate edge case, not a bug)
- Contradiction resolution (requires domain knowledge)

## Step 5: Write Report

Save the retrospective report to `.context-index/hygiene/retros/<end-date>.md` where `<end-date>` is the last day of the analysis period in YYYY-MM-DD format.

If the `retros/` directory does not exist, create it.

If `--charter <module>` was provided, save to `.context-index/hygiene/retros/<end-date>-<module>.md` instead.

### Report Format

**Persona adaptation:** The report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

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

## Heuristic Health

- **Total heuristics:** N (by scope: <scope1>: N, <scope2>: N, _global: N)
- **Confidence distribution:** high: N, medium: N, low: N
- **New in period:** N
- **Stale (>90d):** N (archived: N if --auto-apply)
- **Contradicted:** N
- **Duplicate candidates:** N
- **Promotion anomalies:** N

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
- Run /adev:hygiene to verify context health after applying changes
- Schedule the next retrospective in 2 weeks
```

If `--auto-apply` was used, also report what was applied:

```
Auto-applied:
- Flagged N golden sample candidates (run /adev:sample to extract)
- Flagged N missing ADR topics (run /adev:brainstorm to draft)
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
