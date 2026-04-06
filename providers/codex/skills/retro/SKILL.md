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

## Step 4: Auto-Apply (if --auto-apply)

1. Flag golden sample candidates
2. Flag missing ADR topics
3. Update hygiene report with findings

NOT applied: constitution amendments, specialist creation, spec template changes.

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
