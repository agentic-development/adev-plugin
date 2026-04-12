# Architecture Review: retro-consolidation

> **Date:** 2026-04-12
> **Spec:** .context-index/specs/features/heuristics/retro-consolidation.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 1
file-sha: 55794fb27dba3f58b4d9e31a2c4a3035c3b7dc0e

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning, **FIXED**): Direct file scan bypassed readHeuristics API. Updated to iterate over manifest module slugs using the validated API.
- **SA-2** (suggestion): Duplicate detection is recommendation-only — appropriate given charter constraint that merges require human judgment.
- **SA-3** (suggestion): Auto-apply scope deliberately narrow. Good safety boundary.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-10** (warning): Bulk `--auto-apply` archival is unbounded. Implementation should log progress. Acceptable for local CLI.
- **SEC-11** (suggestion): Retro "shared pattern summary" could paraphrase sensitive content. Agent should use generalized descriptions.
- **SEC-12** (suggestion): `staleness_days` has no lower/upper bound. `0` would mass-archive. Implementation should validate as positive integer.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-13** (warning, **FIXED**): Raw directory scan replaced with `readHeuristics` API calls per manifest module slug.
- **CON-14** (warning): `heuristics.staleness_days` manifest key should be added to charter's Consumed APIs table. Charter addendum needed.
- **CON-15** (suggestion): Missing metric for heuristics auto-archived by contradiction during the period. Consider adding.
- **CON-16** (suggestion): Sub-step decimal notation (1.7, 2.8) is new. Verify retro SKILL.md convention before implementing.

---

## Summary

**Total findings:** 9 (0 blockers, 3 warnings (2 fixed), 6 suggestions)
**Action required:** SA-1 and CON-13 fixed. CON-14 charter addendum is non-blocking. Spec ready for planning.
