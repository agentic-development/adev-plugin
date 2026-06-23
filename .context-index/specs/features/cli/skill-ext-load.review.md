---
last-reviewed-revision: 2
file-sha: bbc60553b455ccf851a0ecca312d4087abb85888830d30c44f4392a2e8e491ae
---

# Architecture Review: skill-ext-load

> **Date:** 2026-05-25
> **Spec:** .context-index/specs/features/cli/skill-ext-load.spec.md
> **Charter:** .context-index/specs/features/cli/charter.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

### SA-1

- **Severity:** suggestion
- **Location:** Behaviors section (bullet 3) / Acceptance Criteria (item 3)
- **Finding:** The separator between extension-layer content and project-layer content is described as "a blank-line separator" but is not precisely defined (e.g., `\n\n` vs `\n---\n` vs something else). The acceptance criteria test assumes this works but does not pin the exact byte sequence.
- **Recommendation:** Add a note in the Behaviors section specifying that the separator is exactly one blank line (`\n\n`) between the last extension-layer chunk and the project-layer content. This prevents implementation inconsistency across implementations.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

### SEC-1

- **Severity:** warning
- **Category:** input-validation
- **Location:** Behaviors / Preconditions / Error Cases
- **Finding:** The spec validates the `--skill` argument character set (`[a-zA-Z0-9_-]+`) to prevent path traversal via the argument, but does not specify that the **resolved extension directory path** (`.context-index/skill-extensions/`) itself should be verified via `fs.realpath`-based containment to guard against symlink escape attacks. A malicious symlink inside `.context-index/skill-extensions/` could cause the verb to read files outside the `.context-index/` tree.
- **Recommendation:** Add to Preconditions or Behaviors a requirement that the resolved paths for extension-layer files and the project-layer file must be verified (via `fs.realpath`) to be contained within the project's `.context-index/skill-extensions/` directory. This pattern is already established in ADR-0009 (`UNSAFE_TEMPLATE_PATH` for `lib/template-resolution.mjs`) and should be consistent here.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

### CON-1

- **Severity:** suggestion
- **Category:** pattern
- **Location:** Actionable Task Map — "Create `lib/cli/skill-ext.mjs`"
- **Finding:** The spec does not explicitly state that `lib/cli/skill-ext.mjs` should NOT export `LIFECYCLE_STEP`. The charter's pattern enforcement test (`tests/cli-driver-pattern.test.mjs`) AST-asserts that modules exporting `LIFECYCLE_STEP` must call `requireGate` first in `run()`. Since `skill-ext` is a query primitive (like `gate` and `diagnose`), omitting `LIFECYCLE_STEP` is correct — but the spec should document this explicitly to avoid implementer confusion.
- **Recommendation:** Add to the Actionable Task Map or Preconditions that `lib/cli/skill-ext.mjs` MUST NOT export `LIFECYCLE_STEP` (it is a query primitive, not a lifecycle-step helper).

---

## Summary

**Total findings:** 3 (0 blockers, 1 warning, 2 suggestions)

**Action required:** The spec may proceed to planning. The warning (SEC-1) recommends adding `fs.realpath`-based containment verification for the extension directory — this should be captured as an implementation requirement (either by revising the spec or as an explicit note in the implementation plan). The two suggestions (SA-1, CON-1) improve precision and are optional before planning.
