---
last-reviewed-revision: 1
file-sha: 9f0b8065943773e5e5fa1a4b3833ba0031016c419d0bdafb395a34e7bad4d759
---

# Architecture Review: universal-skill-extensions

> **Date:** 2026-05-30
> **Spec:** .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
> **Charter:** (cross-cutting — no parent charter)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | inline-consolidated | reviewer-capable | plugin:review-specs/reviewers/structural-architect.md |
| security-reviewer | Security Reviewer | inline-consolidated | read-only | plugin:review-specs/reviewers/security-reviewer.md |
| consistency-analyzer | Consistency Analyzer | inline-consolidated | read-only | plugin:review-specs/reviewers/consistency-analyzer.md |

> Note: Risk policy permits skipping review for `risk_level: low` specs (`require_review: false`).
> Build pipeline invoked review explicitly; conducted condensed inline review by aggregator since
> the spec is broad (touches 31 skill files mechanically) and benefits from cross-reference checks.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1 (suggestion):** Insertion Placement Rules state "If the skill has a 'Load Context' step (19 skills): insert the block immediately after the primary context bundle is loaded." A grep across `skills/*/SKILL.md` matches "Load Context" in 8 files, not 19. The fallback rules (numbered setup step, or new H3 sub-step) cover the rest, so coverage is unaffected — but the literal "19" is wrong. Recommend either correcting the count or removing the specific number ("19 skills" → "skills that have a Load Context step" without a count).
- **SA-2 (suggestion):** Postconditions claim "30 added by this spec's implementation" but the Module Impact Map says "All 30 remaining skills". The arithmetic is consistent (31 total − 1 already wired = 30 remaining). Acceptance Criteria's "All 31 skills" framing matches. Recommend keeping the 30/31 framing explicit ("30 added by this sweep; 1 pre-existing in /adev:implement") to prevent off-by-one confusion in implementation.
- The spec is purely additive (no removals, no reorderings, no inline-Node introduced). Constitution Principle 2 (skills primarily markdown) and the inline-Node anti-patterns are respected. The exact form mandates a fenced bash block (verb call) + prose only.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No security findings. The insertion mechanism wraps an existing CLI verb (`adev skill-ext load`) whose security posture was reviewed under `.context-index/specs/features/cli/skill-ext-load.spec.md` (path containment via SKILL_NAME_PATTERN, lexicographic ordering, `__NONE__` sentinel for absence). This spec adds no new code paths, no new file reads, no privileged operations. Extension content is treated as additional prose context — same trust boundary as project-authored skill files. The `_<ext-name>/` namespacing convention already enforces extension provenance.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (suggestion):** The framing prose is defined twice — once in `### Insertion Placement Rules` (the inserted block contains the prose) and once in `### Behaviors` ("the skill incorporates the content as additional standing instructions framed by the uniform prose template defined in Insertion Placement Rules"). The two are consistent, but the cross-reference is only by description, not by anchor. Future edits could drift. Recommend adding an explicit acceptance check that all 31 inserted blocks contain the exact framing sentence byte-for-byte (the task map already mentions a grep-test for the verb invocation; extend it to the framing sentence too).
- The spec correctly defers the existing `/adev:implement` block (`skills/implement/SKILL.md:57-63`) as immutable; the acceptance criterion "unchanged byte-for-byte" is verifiable.
- The Module Impact Map row "All 30 remaining skills" is consistent with the verified count (31 total skills under `skills/` minus the pre-wired `implement`). No drift versus codebase.
- The spec references `cli/skill-ext-load.spec.md` for verb behavior; the file actually lives at `.context-index/specs/features/cli/skill-ext-load.spec.md`. Either form is unambiguous in context, but recommend full-path references for downstream tooling.

---

## Summary

**Total findings:** 4 (0 blockers, 0 warnings, 4 suggestions)
**Action required:** None blocking. Spec is ready for `/adev:plan`. Optional: address SA-1 (the "19" count), SA-2 (30/31 framing), and CON-1 (byte-exact framing assertion in the acceptance test) before or during planning.

## Governance Footer

- Risk policy: `low` (`risk_level: low` in frontmatter) — `require_review: false` per `.context-index/governance/risk-policies.yaml`. Review conducted anyway because the build pipeline invoked it explicitly.
- No `spec-to-plan` transition gate is configured in `.context-index/governance/gates.yaml` (`transitions: {}`); planning may proceed without an approver-role gate.
- No cross-repo `depends-on` references present; workspace-resolution step skipped.
