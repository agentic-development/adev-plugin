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

## Session Activity

<Render the verbatim markdown produced by `adev retro session-activity
--since <since> --until <until> --format text`. Section appears here —
between the period header and Throughput — per Behavior 13 of
retro-session-consumption.spec.md (Stable section position invariant).
Omit this section entirely when the CLI verb's output is empty
(Graceful absence — no sessions in window).>

Subsections rendered by the verb, in order:
  (a) Total + format breakdown line `(hook: N, post-commit: M, unknown: K)`
  (b) Tool-Use Distribution (top 10)
  (c) Per-Spec Session Counts
  (d) Cost & Token Trends (only when at least one session-end has cost frontmatter)
  (e) Sessions ↔ Closed Issues (only when at least one session-end has `issue:`/`epic:`)
  (f) Context Gaps (top 10, frame-anchored — replaces former Step 2 conditional grep)

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

## Uncommitted Artifacts

- **Durable pending commit:** N (lifecycle-state: M, sessions: K, drift stamps: J, hygiene reports: H)
- **Transient present:** N (recommend gitignore)
- **Uncategorized:** N (human review)

(Section omitted entirely if Step 1.8 reported a clean working tree.)

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
