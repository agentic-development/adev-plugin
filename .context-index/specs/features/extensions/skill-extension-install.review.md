---
last-reviewed-revision: 1
file-sha: 16ea045f88a06f71876963f180021b0eb73222ae2fe940d8c9c374ed7234ee8a
---

# Architecture Review: skill-extension-install

> **Date:** 2026-05-26
> **Spec:** .context-index/specs/features/extensions/skill-extension-install.spec.md
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Verdict:** PASS_WITH_NOTES
>
> **Note:** The spec declares `risk_level: low`. Per `.context-index/governance/risk-policies.yaml`, low-risk specs have `require_review: false`. This review was conducted because it was explicitly requested by the build pipeline.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

**SA-1**
- **Severity:** warning
- **Location:** Behavioral Contract (intro paragraph)
- **Finding:** The sentence "The installer validates the extension and rejects non-markdown content" appears in the contract prose but has no corresponding Behavior item, Error Case entry, or error code. Without a testable behavior specification, this invariant is unverifiable and may be omitted or inconsistently implemented.
- **Recommendation:** Either add a Behavior entry ("When a source file has a non-`.md` extension, installation fails with `INVALID_FILE_TYPE`") and an Error Case row, or remove the statement from the contract prose if markdown enforcement is not intended as a tested invariant.

**SA-2**
- **Severity:** suggestion
- **Location:** Actionable Task Map
- **Finding:** The function signature of `installSkillExtensions()` is not specified (parameters, return shape). The existing pattern in `content-install.mjs` documents all functions with JSDoc param/return annotations.
- **Recommendation:** Add a one-line function signature and return shape to the Actionable Task Map row, e.g.: `installSkillExtensions(projectRoot, extSourceDir, extName, skillExtensions): { filesWritten: string[] }`.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

**SEC-1**
- **Severity:** suggestion
- **Category:** input-validation
- **Finding:** The spec specifies source path containment validation but does not specify whether `fs.realpathSync` is used (as it is in `installSamples()` in `content-install.mjs`) or whether `path.resolve` + prefix check is sufficient. Without `realpathSync`, a symlink inside the extension could escape the root directory.
- **Recommendation:** Add a note in the Preconditions or Behaviors specifying that source path containment is validated using `fs.realpathSync` (matching the pattern already used in `installSamples()`).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**CON-1**
- **Severity:** warning
- **Category:** pattern
- **This Spec:** Behaviors section uses "**When** … **then** …" bullet prose without numbered items.
- **Conflicts With:** Sibling specs `content-installation.spec.md` and `cli-and-registration.spec.md` both use numbered behavior lists (1, 2, 3…) under `## Behaviors`, enabling direct citation by number.
- **Recommendation:** Number the behavior items for consistency with sibling specs, enabling direct reference (e.g., "Behavior 3 of skill-extension-install").

**CON-2**
- **Severity:** suggestion
- **Category:** pattern
- **This Spec:** No `depends-on` frontmatter field referencing `cli/skill-ext-load.spec.md`, even though the spec explicitly states this is a prerequisite dependency.
- **Conflicts With:** Cross-charter dependency tracking convention used elsewhere in the corpus.
- **Recommendation:** Add `depends-on: [cli/skill-ext-load.spec.md]` (or the format used by this project's spec schema) to the frontmatter so that drift detection tools can trace the dependency.

---

## Summary

**Total findings:** 5 (0 blockers, 2 warnings, 3 suggestions)
**Action required:** The spec is ready for planning. Address SA-1 (unverifiable markdown enforcement claim) and CON-1 (unnumbered behaviors) before or during planning to improve implementer clarity. Suggestions are optional improvements.
