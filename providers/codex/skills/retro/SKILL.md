---
name: adev:retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities. In Codex, invoke with $adev:retro"
---

# Sprint Retrospective

Analyze completed work to extract patterns, compute metrics, and generate recommendations.

**Announce:** "I'm using the adev:retro skill to analyze completed work."

## Arguments

- `--since <date>`: start date (default: 2 weeks ago)
- `--charter <module>`: scope to specific module
- `--auto-apply`: apply low-risk improvements

## Prerequisites

`.context-index/` initialized with constitution and manifest.

## Step 1: Gather Data

### Git History

```bash
git log --oneline --after="<since>" --stat
```

Extract: commits, files changed, spec references, authors.

### Validation Reports

Read `.context-index/specs/features/**/*-validation.md`:
- Status (PASS/FAIL)
- Failed checks
- Reruns needed

### Recovery Records

Read `.context-index/hygiene/recoveries/`:
- Root cause category
- Time to resolution
- Recovery strategy

### Blocker Files

Read `.context-index/hygiene/blockers/`:
- What was blocked
- Blocker duration

### Hygiene Reports

Read `.context-index/hygiene/drift-report.md`:
- Audit counts
- Priority actions
- Warning patterns

### Plan Files

Read `.context-index/specs/features/**/*.plan.md`:
- Execution status
- Full/partial/abandoned

### 1.7 Heuristics

Read heuristics by iterating over module slugs from `manifest.yaml` `modules[].slug` plus `_global`. For each module, call `readHeuristics(projectRoot, { module: slug })` via inline Node.js (importing from `lib/heuristics.mjs`). Record each entry's `id`, `scope`, `confidence`, `evidence[]` count, `contradicted-by[]` count, `created`, and `updated` dates.

Also scan `.context-index/memory/heuristics/archive/` for recently archived entries (where `archived` date falls within the analysis range). Record their `archivedReason` for the health analysis.

If the heuristics directory does not exist or `readHeuristics` throws, note "No heuristics found" and proceed. The consolidation steps (Heuristic Health in Step 2 and Heuristic Consolidation in Step 3) are skipped when no heuristics are gathered.

## Step 2: Analyze Patterns

### Throughput
- Specs completed vs planned
- Completion rate
- Velocity trend
- Partial completions

### Quality
- First-run pass rate
- Rerun rate
- Common failures
- Auto-fix rate

### Recovery Patterns
- Total recoveries
- Root cause distribution
- MTTR
- Repeat offenders

### Blocker Frequency
- Total blockers
- Per-spec average
- Most blocked areas
- Duration

### Specialist Effectiveness
- Routed vs generic tasks
- Quality comparison
- Missing coverage

### Heuristic Health

If heuristics were gathered in Step 1.7, compute:

- **Total heuristics** by scope and confidence level
- **New heuristics in period:** entries whose `created` date falls within the analysis range
- **Stale heuristics:** entries whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days)
- **Contradicted heuristics:** entries with 1+ items in `contradicted-by[]`
- **Duplicate candidates:** entries within the same scope whose `title` or `pattern` text has high semantic overlap
- **Promotion candidates:** entries with 2+ distinct-path evidence entries that remain at `low` confidence, or 3+ at `medium`

## Step 3: Generate Recommendations

### Golden Sample Candidates
Files used as reference by 3+ tasks.

### Constitution Amendments
Rules violated repeatedly.

### Missing ADRs
Architectural decisions without formal ADR.

### Spec Template Improvements
Criteria types repeatedly missed.

### Specialist Gaps
High-failure domains without specialist.

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

1. Flag golden sample candidates
2. Flag missing ADR topics
3. Update hygiene report with findings
4. **Archive stale heuristics.** For each heuristic whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days), call `archiveHeuristic(projectRoot, id, 'stale')` via inline Node.js (importing from `lib/heuristics.mjs`). Log progress: "Archived N/M stale heuristics". If `archiveHeuristic` throws (e.g., `HEURISTICS_ARCHIVE_CONFLICT`), log a warning per entry and continue.

NOT applied: constitution amendments, specialist creation, spec template changes, duplicate merging, heuristic promotion, contradiction resolution.

## Step 5: Write Report

```markdown
# Retrospective: <start> to <end>

> **Period:** YYYY-MM-DD
> **Specs completed:** N
> **Pass rate:** N%
> **Recoveries:** N (top cause: <category>)

## Throughput
<completed vs planned>

## Quality
<pass rate, reruns, common failures>

## Recovery Analysis
<total, root causes, MTTR>

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
- [ ] <recommendation>

### Medium Priority
- [ ] <recommendation>

## Raw Data
| Metric | Value |
|--------|-------|
| Commits | N |
| Specs | N |
| Recoveries | N |
```

## Step 6: Present

```
Retrospective complete for <start> to <end>.

Key metrics:
- Specs: N completed of M (N% completion)
- Quality: N% first-run pass rate
- Recoveries: N (top cause: <category>)

Top 3 recommendations:
1. <highest priority>
2. <second>
3. <third>

Full report at <path>.
```

If `--auto-apply`:
```
Auto-applied:
- Flagged N golden sample candidates
- Flagged N missing ADR topics
- Updated drift-report.md
```
