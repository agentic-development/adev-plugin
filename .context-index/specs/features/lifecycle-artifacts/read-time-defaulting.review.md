---
last-reviewed-revision: 2
file-sha: 5d5be84911109ceaef14bb71d0eda5c6810621925c6e1ca873da0c0a624c8dae
---

# Architecture Review: read-time-defaulting

> **Date:** 2026-05-14
> **Spec:** .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.spec.md
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | single-pass module review |
| security-reviewer | Security Reviewer | subagent | reasoning (claude-opus-4-7) | single-pass module review |
| consistency-analyzer | Consistency Analyzer | subagent | reasoning (claude-opus-4-7) | single-pass module review |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-7** (warning): `kindResolved` field introduced here but not declared in `frontmatter-discriminator.spec.md`. This integration spec is the canonical owner of `kindResolved: 'explicit' | 'default'`, but `frontmatter-discriminator.spec.md` (which defines the parser output contract) does not mention it. Two options: (1) move ownership of `kindResolved` to `frontmatter-discriminator`, or (2) add a cross-reference here noting the integration spec extends the parser output shape. Today it reads as a quiet expansion of the parser API. See also cross-spec finding CON-6.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-2** (warning): Cutover-date-based `MISSING_KIND` vs `LEGACY_DEFAULTED` classification relies on file mtime, which is trivially forgeable. A user (malicious or careless) could `touch -t` an artifact to bypass `MISSING_KIND` warnings, or set mtime in the future to suppress legacy classification. This is a soft-validation gate so the impact is low (only affects hygiene output), but worth noting: mtime is advisory, not authoritative. Consider using `git log --follow --diff-filter=A` for the canonical creation timestamp, or accept the limitation and document it.

## Consistency Analyzer

**Verdict:** PASS

- **CON-2** (suggestion): This integration-kind spec uses an "Interaction Contract" prose format rather than enumerated When/Then. This is correct for integration-kind per `spec-templates.spec.md` — no change needed.

---

## Summary

**Total findings:** 3 (0 blockers, 2 warnings, 1 suggestion)
**Action required:** Spec advances to `review-passed`. Address (a) `kindResolved` ownership (SA-7 / CON-6) and (b) mtime-based classification caveat (SEC-2) before implementation. Does not block /adev:plan.

**Reviewer summary:** Integration-kind shape is right, but ownership of `kindResolved` should be cross-linked back to `frontmatter-discriminator`, and the mtime-based classification needs an explicit caveat.
