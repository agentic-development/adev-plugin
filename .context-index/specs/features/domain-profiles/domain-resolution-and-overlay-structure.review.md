# Architecture Review: domain-resolution-and-overlay-structure

> **Date:** 2026-05-08
> **Spec:** .context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** c611fafc0bf6885a0b90331b9cd18e9a9535d3c1

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

- **SA-1 (warning):** `resolveDomain()` accepts `pluginRoot` but no behavior references it — it is documented as "reserved for future extensibility." Carrying an unused parameter adds testing surface with no current behavioral justification. Document whether implementations must ignore it, or remove until a behavior requires it.
- **SA-2 (suggestion):** Acceptance criterion "at most 2 file reads per invocation" for `resolveDomain()` is ambiguous — if `manifest` is a pre-parsed object (as the signature suggests), `resolveDomain()` performs zero file reads. Clarify whether it reads from disk or receives a pre-parsed object.
- **SA-3 (suggestion):** `OVERLAY_PARSE_ERROR` requires "file path and line number only" but the line-based YAML parser may not produce line numbers for all error types. Specify that line number is included when available, otherwise omitted.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-5 (warning):** Behavior 6 resolves candidate paths via `fs.realpathSync()` but should also explicitly resolve `repoRoot` and `pluginRoot` themselves to their real paths before using them as the comparison baseline. The acceptance criterion on line 140 implies this but the behavior narrative should be unambiguous.
- **SEC-6 (suggestion):** No aggregate memory budget across all overlay loads (5 types x 512KB = 2.5MB). Consider documenting a cap or noting that the existing line-based YAML parser is inherently depth-limited.
- **SEC-7 (suggestion):** Empty overlay returns `""` (markdown) vs `null` (missing) — consuming skills should treat both `null` and `""` as "no overlay" for markdown types.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No findings. All previous blockers and warnings (CON-1 signature mismatch, CON-2 projectRoot naming, CON-3 manifest schema) are fully resolved in rev 3. Function signatures, parameter names, error codes, and overlay type mappings are consistent across charter, sibling specs, and cross-cutting specs.

---

## Summary

**Total findings:** 6 (0 blockers, 2 warnings, 4 suggestions)
**Action required:** The warnings (SA-1, SEC-5) are minor clarifications that can be addressed during planning or implementation. You can proceed to `/adev:plan`.
