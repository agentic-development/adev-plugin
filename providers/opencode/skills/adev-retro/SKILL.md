---
name: adev-retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities. In OpenCode, invoke with skill({ name: 'adev-retro' })"
---

# Sprint Retrospective

Analyze completed work across a date range to extract patterns, compute delivery metrics, and generate actionable improvement recommendations.

**Announce at start:** "I'm using the adev-retro skill to analyze completed work and generate a retrospective."

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

## Step 4: Auto-Apply (if --auto-apply)

Apply low-risk improvements:

1. Flag golden sample candidates
2. Flag missing ADR topics
3. Update hygiene report with retro findings

**NOT applied via auto-apply:**

- Constitution amendments
- Specialist creation
- Spec template changes

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
