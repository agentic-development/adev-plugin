# Architecture Review: domain-aware-skill-integration

> **Date:** 2026-05-08
> **Spec:** .context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** 9e09b93ebd9a2f544819b7b5e28edcd010ff3e0c

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (suggestion):** Template merge semantics for charter/spec overlays (Behaviors 2, 4) remain underspecified — no definition of what constitutes a "section" or the matching algorithm. Define section-matching criteria (e.g., H2 heading match) for the implementation task.
- **SA-2 (warning):** `verification.yaml` supports a single `type` per domain. If a domain needs both `output` and `visual` verification, the schema cannot express it. Acknowledge as a deliberate v1 limitation or extend to a list.
- **SA-3 (suggestion):** Merge function signatures for `mergeReviewers()` and `mergeGates()` are not specified, unlike the sibling spec's `resolveDomain()` and `loadOverlay()`. Add signatures for parity.
- **SA-4 (suggestion):** Immutability invariant (Behavior 17) does not specify enforcement mechanism (Object.freeze, shallow copy, or convention verified by tests). Clarify which.
- **SA-5 (warning):** `OVERLAY_MERGE_WARN` is used for 6 distinct conditions (unexpected fields, empty overlay, unknown merge_strategy, missing reviewer id, etc.). A single code for all merge-time warnings makes programmatic error handling ambiguous. Consider sub-coding or documenting as intentionally coarse-grained.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1 (warning):** Gate ID override allows project-local overlays (lower trust) to silently replace base gates (higher trust) with only a runtime warning. Consider requiring an `allow_override` sentinel in the base gate definition, or document as an accepted risk.
- **SEC-2 (suggestion):** `trigger_patterns` are file glob patterns with no constraint against `..` or absolute paths. Specify that patterns are always evaluated relative to the project root and reject traversal sequences.
- **SEC-3 (suggestion):** Under `merge_strategy: append`, if a domain reviewer `id` matches an existing base reviewer `id`, behavior is unspecified (double-dispatch or shadowing). Add an error-case row for this condition.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No findings. All previous warnings (CON-2 overlay semantics, CON-5 reviewer schema) are fully resolved. Merge ownership boundary, reviewer entry schema, gate merge semantics, verification config, and error codes are all consistent with charter, sibling specs, and ADR-0003/0004.

---

## Summary

**Total findings:** 8 (0 blockers, 3 warnings, 5 suggestions)
**Action required:** The warnings (SA-2, SA-5, SEC-1) are design clarifications worth addressing but not blocking. You can proceed to `/adev:plan`.
