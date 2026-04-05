---
name: adev:hygiene
description: "Audit all context for staleness, drift, and coverage gaps. Runs eleven audit passes across .context-index/. In OpenCode, invoke with skill({ name: 'adev:hygiene' })"
---

# Context Hygiene Audit

Audit the health of `.context-index/` and generate actionable reports. Eleven audit passes detect staleness, drift, coverage gaps, phase readiness, and operational patterns.

## Arguments

- No arguments: full audit (all eleven passes)
- `--check <type>`: run a single pass (constitution, charters, adrs, samples, drift, sessions, references, governance, recoveries, blockers, phases)
- `--fix`: auto-fix issues where possible

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `adev:init` first.

## Process

1. **Load manifest:** Read `.context-index/manifest.yaml`
2. **Run audit passes:** Execute each of the eleven passes below
3. **Generate report:** Write findings to `.context-index/hygiene/drift-report.md`
4. **Print summary:** Display pass/warn/fail counts
5. **Offer fixes:** For auto-fixable issues, offer to run the appropriate skill

## Audit Pass 1: Constitution Freshness

Verify agent files are in sync with constitution:

1. Read `.context-index/constitution.md`
2. For each sync target in manifest:
   - Check target file exists
   - Compare constitution content
   - Flag drift if differs
3. Validate context routing pointers
4. Check section completeness (6 required sections)
5. Check line count against max_lines in manifest

## Audit Pass 2: Charter Coverage

Identify which codebase areas have charters:

1. List all feature charter directories under `.context-index/specs/features/`
2. Map each charter to its corresponding codebase area
3. Identify source directories NOT covered by any charter
4. Check git change frequency for uncharted areas
5. Check charters updated within last 90 days

## Audit Pass 3: ADR Currency

Verify ADRs reference current code:

1. List all ADR files in `.context-index/adrs/`
2. Check referenced files still exist
3. Flag ADRs marked "proposed" older than 30 days
4. Scan git history for architectural changes lacking ADRs

## Audit Pass 4: Golden Sample Validity

Verify golden samples still compile and match standards:

1. List all sample files in `.context-index/samples/`
2. Check code syntax validity
3. Compare patterns against constitution Coding Standards
4. Flag samples older than 90 days as potentially stale

## Audit Pass 5: Spec-to-Code Drift

Compare repo map against orientation:

1. Check `.context-index/hygiene/repo-map.md` exists
2. Read `.context-index/orientation/architecture.md`
3. Extract module names, key files, relationships
4. Compare against repo map for:
   - New important symbols not in orientation
   - Orientation references to deleted code
   - New top-level directories

## Audit Pass 6: Session Analysis (Conditional)

Only runs if session capture is configured in manifest.yaml.

1. Scan session logs for spec file reads
2. Identify dead context (never referenced)
3. Identify high-failure areas
4. Identify context gaps

## Audit Pass 7: External Reference Freshness

Verify external references are up-to-date:

1. Read `external_contexts` from manifest.yaml
2. Check `.context-index/references/<slug>/` exists
3. Check `last_fetched` date against refresh_interval_days

## Audit Pass 8: Governance Policy Health

Verify governance files are well-formed:

1. Parse each file (`gates.yaml`, `boundaries.yaml`, `risk-policies.yaml`)
2. Validate gate commands exist on PATH
3. Compile boundary regex patterns
4. Verify charter override references
5. Verify transition gate references

## Audit Pass 9: Recovery Pattern Analysis

Identify systemic context gaps from recovery records:

1. Read all recovery records in `.context-index/hygiene/recoveries/`
2. Compute root cause distribution
3. Identify repeat offenders
4. Flag modules with 3+ recoveries

## Audit Pass 10: Blocker Frequency Analysis

Identify patterns in agent blockers:

1. Read all blocker files in `.context-index/hygiene/blockers/`
2. Count blockers per category and module
3. Flag unresolved blockers older than 7 days

## Audit Pass 11: Phase Coverage

Report delivery readiness per phase:

1. Scan all charters, parse Capability Map
2. Scan all specs, parse frontmatter for status
3. Match capabilities to specs
4. Group by phase, report status per capability

## Report Format

```markdown
# Context Hygiene Report

**Generated:** [timestamp]
**Commit:** [HEAD hash]

## Summary

| Pass | Status | Issues |
|------|--------|--------|
| Constitution Freshness | WARN | 2 issues |
| Charter Coverage | WARN | 5 uncharted areas |
| ... | ... | ... |

## Priority Actions

1. [ ] Run skill({ name: "adev:sync" }) to fix constitution drift
2. [ ] Charter src/lib/auth/ (42 changes, no charter)
...
```

## After the Audit

```
Full report saved to .context-index/hygiene/drift-report.md

Next steps:
- Fix the highest-priority items above
- Run skill({ name: "adev:hygiene" }) again after fixes
- Schedule monthly hygiene audits
```
