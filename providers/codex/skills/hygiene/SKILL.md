---
name: adev:hygiene
description: "Audit all context for staleness, drift, and coverage gaps. Runs eleven audit passes across .context-index/. In Codex, invoke with $adev:hygiene"
---

# Context Hygiene Audit

Audit the health of `.context-index/` and generate actionable reports.

## Arguments

- No arguments: full audit (all passes)
- `--check <type>`: single pass (constitution, charters, adrs, samples, drift, sessions, references, governance, recoveries, blockers, phases)
- `--fix`: auto-fix issues where possible

## Prerequisites

`.context-index/` must exist. If not, suggest `$adev:init` first.

## Process

1. Load manifest
2. Run 11 audit passes
3. Generate report to `.context-index/hygiene/drift-report.md`
4. Print summary
5. Offer fixes

## Audit Pass 1: Constitution Freshness

1. Read constitution
2. Check sync targets exist
3. Compare content
4. Validate routing pointers
5. Check section completeness (6 sections)
6. Check line count

## Audit Pass 2: Charter Coverage

1. List all charters
2. Map to codebase areas
3. Identify uncharted areas
4. Check git change frequency
5. Check charters updated within 90 days

## Audit Pass 3: ADR Currency

1. List all ADRs
2. Check referenced files exist
3. Flag old "proposed" ADRs
4. Scan git for architectural changes without ADRs

## Audit Pass 4: Golden Sample Validity

1. List all samples
2. Check code syntax
3. Compare against constitution standards
4. Flag stale samples (>90 days)

## Audit Pass 5: Spec-to-Code Drift

1. Check repo map exists
2. Read orientation
3. Compare for new symbols, deleted code, new directories

## Audit Pass 6: Session Analysis (conditional)

If session capture configured:
1. Scan session logs for spec reads
2. Identify dead context
3. Identify context gaps

## Audit Pass 7: External Reference Freshness

1. Read manifest external_contexts
2. Check reference files exist
3. Check last_fetched vs refresh_interval

## Audit Pass 8: Governance Policy Health

1. Parse gates.yaml, boundaries.yaml, risk-policies.yaml
2. Validate gate commands exist
3. Compile boundary patterns
4. Verify references

## Audit Pass 9: Recovery Pattern Analysis

1. Read recovery records
2. Compute root cause distribution
3. Identify repeat offenders
4. Flag modules with 3+ recoveries

## Audit Pass 10: Blocker Frequency

1. Read blocker files
2. Count per category and module
3. Flag unresolved blockers (>7 days)

## Audit Pass 11: Phase Coverage

1. Scan charters, parse capabilities
2. Scan specs, parse status
3. Match capabilities to specs
4. Report status per phase

## Report Format

```markdown
# Context Hygiene Report

**Generated:** [timestamp]
**Commit:** [HEAD]

## Summary

| Pass | Status | Issues |
|------|--------|--------|
| Constitution Freshness | WARN | 2 |
| Charter Coverage | WARN | 5 |
...

## Priority Actions

1. [ ] $adev:sync to fix constitution drift
2. [ ] Charter src/lib/auth/ (42 changes, no charter)
```

## After Audit

```
Full report saved to .context-index/hygiene/drift-report.md

Next steps:
- Fix highest-priority items
- $adev:hygiene after fixes
- Schedule monthly audits
```
