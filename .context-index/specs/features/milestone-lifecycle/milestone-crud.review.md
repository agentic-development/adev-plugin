# Architecture Review: milestone-crud

> **Date:** 2026-05-09
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** bc29c2c1347c101625b0fbd2f49439a72dbc3b70

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

No findings.

The spec is well-structured with clear behavioral contracts, properly defined API shapes (`loadMilestones`, `saveMilestones`, `findMilestone`), and comprehensive error cases. Module boundaries are respected -- the spec extends `/adev:issues` as declared in the charter's dependency table. Data flow is linear (CLI args -> validation -> YAML I/O -> issue manager) with no circular dependencies. The constitution reference correctly identifies `parseSimpleYaml()` as a pattern (not an import), and `readManifest()` from `lib/repomap/index.mjs` is exported and available. The idempotency contract for `milestone create` is clearly specified (Behavior 3).

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No findings.

This is a local CLI tool operating on the local filesystem with no network exposure. Input validation is well-specified (name format regex `[a-zA-Z0-9._-]+`, date format `YYYY-MM-DD`, required argument checks). No secrets, credentials, or PII are handled. File operations are scoped to `.context-index/`. The spec does not introduce any attack surface.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **ID:** CON-1
- **Severity:** warning
- **Category:** naming
- **This Spec:** `milestone: v1` in frontmatter
- **Conflicts With:** Sibling specs `milestone-ship.spec.md` and `milestone-validation.spec.md` use `milestone: v1.0.0`
- **Recommendation:** Verify whether `v1` and `v1.0.0` are intentionally different milestone targets. If they reference the same milestone, align the value. If they are different milestones, this is expected and no change is needed. Note: this may be intentional since the crud spec targets the base `v1` milestone while ship/validation are in `v1.0.0`. Confirm with the charter's Capability Map which shows all capabilities in Phase `v1`.

- **ID:** CON-2
- **Severity:** suggestion
- **Category:** pattern
- **This Spec:** Error code `EPIC_CREATE_FAILED` uses a different naming pattern (verb+noun+past) than other error codes in the table (single concept: `MISSING_NAME`, `INVALID_NAME`, `PARSE_ERROR`).
- **Conflicts With:** Error code conventions in sibling spec `milestone-ship.spec.md` which uses shorter codes like `NOT_FOUND`, `TAG_EXISTS`, `DIRTY_WORKTREE`
- **Recommendation:** Minor stylistic note. The code is descriptive and unambiguous, so no change is strictly needed. Consider `EPIC_FAILED` for brevity if desired.

---

## Summary

**Total findings:** 2 (0 blockers, 1 warning, 1 suggestion)
**Action required:** Review the milestone frontmatter inconsistency (CON-1). The spec is ready for planning.
