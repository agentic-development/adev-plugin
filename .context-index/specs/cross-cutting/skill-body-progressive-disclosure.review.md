---
spec: .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md
last-reviewed-revision: 10
file-sha: 467af712b9ab756a733ce44369934111fe8df9ff3086deb12da2a88661e8c081
---

# Architecture Review: skill-body-progressive-disclosure

> **Date:** 2026-09-13
> **Spec:** .context-index/specs/cross-cutting/skill-body-progressive-disclosure.spec.md
> **Charter:** cross-cutting (affects: all-skills, copilot-provider, codex-provider, opencode-provider, cursor-provider, extensions)
> **Rigor tier:** full
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative; scope retargeted to the four active reviewers for this project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative; OWASP-scoped review relocated to the web-service domain extension. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS — no findings.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-1** (`warning`) — "16 named by an actual `plugin:` URI" is off by one; the actual count is 17 (`review-specs/adapters/generic.md` is also a real URI default at `lib/governance/review-config.mjs:609`, beyond its mention in `templates/`).
- **RI-2** (`warning`) — "100 test files modified plus 5 added" mixes scopes: the `diff-source` range (`90fcc8bf..61064c9a`) gives 98/1; the other 4 additions landed in later reconciliation commits.
- **RI-3** (`warning`) — The `CONFLICTING_FLAGS` code cited for the `--from-diff`/`--cross-cutting` exclusion is real but not the actual enforcement mechanism for that pair (it's emitted only for `--revise`/`--amend`); the exclusion rests on unenforced prose.
- **RI-4** (`suggestion`) — A citation points at a docblock comment rather than the resolver code it describes.
- **RI-5** (`suggestion`) — `tests/skills/spec-figures-current.test.mjs` is described at length but missing from the Changes Catalog's ADDED list.

Zero blockers. Every file, symbol, error code, CLI flag, config key, commit SHA, and issue id independently re-verified and confirmed correct, including all previously-corrected figures (381,620 B total, 31 skill dirs, `eval` 46,028 B headroom, all five per-skill figures from the prior round's fix).

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1** (`warning`) — BEH-4's read-before-act contract is structurally tested (pointer resolves) but not behaviorally tested (agent actually reads before acting) — an inherent limit of testing LLM behavior with code, not a defect.
- **WR-3** (`warning`) — BEH-9b's stage-retry counter has no stated storage mechanism; it's an in-context self-count, same LLM-behavior-testing limit as WR-1.
- **WR-4** (`warning`) — The ultimate consumer of `publishSkillsFromCache`'s `failed[]` array (what surfaces it to the operator) is unnamed.
- **WR-2, WR-5, WR-6** (`suggestion`) — Catalog-completeness nits (an unnamed representative test consumer; two added artifacts missing from the Changes Catalog's ADDED list).

Zero blockers. The orphan-companion-detection concern raised as a blocker in the prior round (WR-3 then) was not re-raised — the spec's explicit reclassification of that gap as an accepted permanent risk (Known Gaps) resolved it.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** (`warning`) — The `<ADEV_ROOT>` conditional-loading pointer mechanism has no code-level containment (agent-resolved, prose-driven per the spec's own Known Gaps), and the spec doesn't address whether a `skill-ext`-appended instruction block could introduce its own such pointer with the same reflexive-read trust BEH-4 establishes.
- **BD-2** (`warning`) — Provider-mirror sync and cursor publish's recursive copy semantics (additive vs. delete-then-copy) are unstated.

Zero blockers. Items 2–5 (subprocess interpolation, input trust, privilege posture, artifact leakage) are clean passes or not applicable.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

- **TR-1** (`suggestion`) — The one repeating construct (conductor stage retry, BEH-9/9b/9c) is fully bounded (cap, cap-trip verdict, unattended default all stated); organizational suggestion only (consolidate into one subsection).

---

## Summary

**Total findings:** 14 (0 blockers, 8 warnings, 6 suggestions)
**Action required:** None — spec passes. The 8 warnings and 6 suggestions are optional follow-ups (citation precision, catalog completeness, and two genuinely open design questions — BD-1's skill-ext/pointer-trust interaction and BD-2's sync delete semantics — worth a future amendment but not blocking).

The spec is ready for the next lifecycle step. Since this is a retroactive spec documenting already-shipped work (not a plan for future implementation), the next step is `/adev:validate` against the shipped tree, not `/adev:plan`.
