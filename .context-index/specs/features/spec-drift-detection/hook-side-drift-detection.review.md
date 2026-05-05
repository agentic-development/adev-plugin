# Architecture Review: hook-side-drift-detection

> **Date:** 2026-05-02
> **Spec:** .context-index/specs/features/spec-drift-detection/hook-side-drift-detection.spec.md
> **Charter:** .context-index/specs/features/spec-drift-detection/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** c48bb12e53d3d24223359590169167276d64c10c

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning): Session state dependency for NO_MANIFEST suppression — undeclared dependency on `.execution-state.md`. **Fixed:** spec now allows in-process Set or execution state key `drift.no_manifest_warned_specs`.
- **SA-2** (warning): Hook stdout output was bare string with emoji, not valid JSON. **Fixed:** spec now specifies JSON format `{ "type": "warning", "message": "..." }`.
- **SA-3** (suggestion): `scanForDrift()` data transformation from `buildReverseIndex()` output could be clearer.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning): File path from `CLAUDE_TOOL_INPUT_file_path` not validated against project root. **Fixed:** added precondition requiring path resolution and project root validation, added PATH_OUTSIDE_ROOT error case.
- **SEC-2** (suggestion): Advisory warnings expose spec names and file paths — acceptable for local dev tool.
- **SEC-3** (suggestion): Symlink/alias could cause `drift_source` to differ from canonical path. **Fixed:** postcondition now requires `drift_source` stored as project-root-relative canonical path.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning): Error codes use generic SCREAMING_SNAKE_CASE instead of module-prefixed convention (e.g., DRIFT_PARSE_ERROR).
- **CON-2** (suggestion): Emoji in hook stdout. **Fixed:** removed emoji, now JSON format.
- **CON-3** (suggestion): Execution state clarification for NO_MANIFEST suppression. **Fixed:** spec now documents key structure.

---

## Summary

**Total findings:** 8 (0 blockers, 3 warnings, 5 suggestions)
**Action required:** Warnings are advisory. Error code naming (CON-1) can be addressed during implementation. Spec is ready for planning.
