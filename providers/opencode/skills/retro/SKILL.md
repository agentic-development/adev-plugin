---
name: adev:retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities. In OpenCode, invoke with skill({ name: 'adev:retro' })"
---

# Sprint Retrospective

Analyze completed work across a date range to extract patterns, compute delivery metrics, and generate actionable improvement recommendations.

**Announce at start:** "I'm using the adev:retro skill to analyze completed work and generate a retrospective."

## Arguments

- `--since <date>`: start date (default: 2 weeks ago)
- `--charter <module>`: scope to a specific feature charter module
- `--auto-apply`: apply low-risk improvements automatically

## Prerequisites

The project must have `.context-index/` initialized with `constitution.md` and `manifest.yaml`.

## Step 1: Gather Data

### 1.1 Git History

```bash
git log --oneline --after="<since-date>" --stat
```

Extract:

- Total commits in period
- Files changed with frequency
- Spec references in commit messages
- Authors and commit counts

### 1.2 Validation Reports

Read `.context-index/specs/features/**/*-validation.md` files:

- Extract overall status (PASS or FAIL)
- Extract which checks failed
- Note multiple validation reports (reruns needed)

### 1.3 Recovery Records

Read `.context-index/hygiene/recoveries/` files:

- Extract root cause category
- Extract time to resolution
- Note recovery strategy used

### 1.4 Blocker Files

Read `.context-index/hygiene/blockers/` files:

- Extract what was blocked and why
- Extract blocker persistence duration

### 1.5 Hygiene Reports

Read `.context-index/hygiene/drift-report.md`:

- Overall audit pass/warn/fail counts
- Priority actions
- Repeated warning patterns

### 1.6 Plan Files

Read `.context-index/specs/features/**/*.plan.md`:

- Determine execution status
- Check for full/partial/abandoned execution

### 1.7 Heuristics

Read heuristics by iterating over module slugs from `manifest.yaml` `modules[].slug` plus `_global`. For each module, call `readHeuristics(projectRoot, { module: slug })` via inline Node.js (importing from `lib/heuristics.mjs`). Record each entry's `id`, `scope`, `confidence`, `evidence[]` count, `contradicted-by[]` count, `created`, and `updated` dates.

Also scan `.context-index/memory/heuristics/archive/` for recently archived entries (where `archived` date falls within the analysis range). Record their `archivedReason` for the health analysis.

If the heuristics directory does not exist or `readHeuristics` throws, note "No heuristics found" and proceed. The consolidation steps (Heuristic Health in Step 2 and Heuristic Consolidation in Step 3) are skipped when no heuristics are gathered.

## Step 2: Analyze Patterns

### Throughput

- Specs completed vs. planned
- Completion rate percentage
- Velocity trend (if previous retros exist)
- Partial completions

### Quality

- First-run validation pass rate
- Rerun rate
- Common failure checks
- Auto-fix rate

### Recovery Patterns

- Total recoveries
- Root cause distribution
- Mean time to recovery (MTTR)
- Repeat offenders

### Blocker Frequency

- Total blockers
- Blockers per spec
- Most blocked areas
- Blocker duration

### Specialist Effectiveness

- Specialist-routed vs. generic tasks
- Specialist task quality comparison
- Missing specialist coverage

### Heuristic Health

If heuristics were gathered in Step 1.7, compute:

- **Total heuristics** by scope and confidence level
- **New heuristics in period:** entries whose `created` date falls within the analysis range
- **Stale heuristics:** entries whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days)
- **Contradicted heuristics:** entries with 1+ items in `contradicted-by[]`
- **Duplicate candidates:** entries within the same scope whose `title` or `pattern` text has high semantic overlap
- **Promotion candidates:** entries with 2+ distinct-path evidence entries that remain at `low` confidence, or 3+ at `medium`

## Step 3: Generate Recommendations

Based on patterns identified:

### Golden Sample Candidates

Files used as reference by 3+ different implementation tasks.

### Constitution Amendments

Rules violated repeatedly across specs.

### Missing ADRs

Architectural decisions made without formal ADR.

### Spec Template Improvements

Acceptance criteria types repeatedly missed.

### Specialist Gaps

Tasks in domain with high failure rates but no specialist.

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

Apply low-risk improvements:

1. Flag golden sample candidates
2. Flag missing ADR topics
3. Update hygiene report with retro findings
4. **Archive stale heuristics.** For each heuristic whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days), call `archiveHeuristic(projectRoot, id, 'stale')` via inline Node.js (importing from `lib/heuristics.mjs`). Log progress: "Archived N/M stale heuristics". If `archiveHeuristic` throws (e.g., `HEURISTICS_ARCHIVE_CONFLICT`), log a warning per entry and continue.

**NOT applied via auto-apply:**

- Constitution amendments
- Specialist creation
- Spec template changes
- Any file modifications outside `.context-index/hygiene/`
- Duplicate merging (requires human judgment to determine which entry to keep)
- Heuristic promotion (may indicate a legitimate edge case, not a bug)
- Contradiction resolution (requires domain knowledge)

## Step 5: Write Report

Save to `.context-index/hygiene/retros/<end-date>.md`:

```markdown
# Retrospective: <start-date> to <end-date>

> **Period:** YYYY-MM-DD to YYYY-MM-DD
> **Specs completed:** N
> **Validation pass rate:** N%
> **Recoveries:** N (top cause: <category>)

## Throughput
<specs completed vs planned>

## Quality
<first-run pass rate, rerun rate, common failures>

## Recovery Analysis
<total recoveries, root cause distribution, MTTR>

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
- [ ] <recommendation with data reference>

### Medium Priority
- [ ] <recommendation>

## Raw Data
| Metric | Value |
|--------|-------|
| Commits | N |
| Specs completed | N |
| Recoveries | N |
| Blockers | N |
```

## Step 6: Present to User

```
Retrospective complete for <start-date> to <end-date>.

Key metrics:
- Specs: N completed of M planned (N% completion rate)
- Quality: N% first-run validation pass rate
- Recoveries: N (top cause: <category>)

Top 3 recommendations:
1. <highest priority>
2. <second>
3. <third>

Full report saved to <path>.
```

If `--auto-apply` was used:

```
Auto-applied:
- Flagged N golden sample candidates
- Flagged N missing ADR topics
- Updated drift-report.md
```
