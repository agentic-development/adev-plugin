---
last-reviewed-revision: 1
file-sha: 5cbbcac83c31dcc70eb70ffd016067322fe0448afd48582c0aee4724745c4126
---

# Architecture Review: graduated-rigor-tiers

> **Date:** 2026-08-18
> **Spec:** .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md
> **Verdict:** BLOCK

**Rigor tier:** `full` (explicit `--tier full` override on invocation)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity | subagent | reviewer-reasoning | prompts/referent-integrity.md |

No disabled reviewers.

## Structural Architect (structural-architect)

**Verdict:** FAIL

- **SA-1 (blocker)** `structural-architect:adr-registry-bypass:83f712f6` — Quick-tier dispatch hardcodes a single bundled reviewer/check outside `governance/review.yaml` / `governance/validate.yaml`, reintroducing the two-parallel-selection-paths problem ADR-0003 unified away. Section: `review-specs-under-quick`.
- **SA-2 (warning)** — Routing signal (`routingEasy`) can override a declarative high `risk_level` with no correlation/ceiling check, so an `/adev:route` misclassification can silently downgrade scrutiny on a project-declared high-risk spec.
- **SA-3 (suggestion)** — "instead of the three … defaults" hardcodes a reviewer count that's already stale against this project's 4-reviewer `review.yaml`.
- **SA-4 (suggestion)** — The "easy" classification threshold has no declared single owner/cross-reference between `/adev:route` and `/adev:work`.

## Security Reviewer (security-reviewer)

**Verdict:** FAIL

- **SEC-1 (blocker)** `security-reviewer:risk-level-self-declaration:d5d2d554` — `risk_level` is self-declared by the spec's own author in frontmatter, and nothing prevents labeling a security-sensitive change `low` to shed dedicated security review under `quick`. Section: `#invocation-modes`.
- **SEC-2 (blocker)** `security-reviewer:synthesized-reviewer-coverage-gap:d5d2d554` — The quick-mode synthesized reviewer has no mandated security-scope coverage requirement; a spec on the quick path could receive zero explicit security scrutiny with no acceptance criterion catching it. Section: `#output-contract`.
- **SEC-3 (warning)** — `tierOverride` always wins even against `risk_level: high`, with no surfaced warning when an automatic "easy" misclassification silently downgrades a high-risk spec.
- **SEC-4 (warning)** — No failure-mode contract for out-of-range `review_mode`/`validate_mode` values read from `risk-policies.yaml` (only "missing/legacy" is covered).
- **SEC-5 (suggestion)** — `/adev:build`'s propagation path (also flagged by referent-integrity as unimplemented) has no tracked tier-resolution guarantee if/when it lands.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

- **CON-1 (blocker)** `consistency-analyzer:contract-mismatch:d5d2d554` — Output Contract names the bundled quick-reviewer prompt as `templates/review-specs/quick-synthesized.md`; the shipped, SKILL.md-referenced artifact is `skills/review-specs/quick-synthesized-reviewer-prompt.md`. The claimed path does not exist. Section: `## Output Contract`.
- **CON-2 (blocker)** `consistency-analyzer:domain-model-contradiction:d5d2d554` — System Constitution Reference claims "ADR 0003: quick reviewer is a registry entry," but `skills/review-specs/SKILL.md` explicitly skips the registry loop for quick-tier dispatch, and `governance/review.yaml` has no quick/synthesized entry. Section: `## System Constitution Reference`.
- **CON-3 (warning)** — Module Impact Map omits `skills/build/SKILL.md` despite Invocation Modes/Arguments claiming `/adev:build` propagates `--tier quick`; `route`/`work` SKILL.md text already assumes this works, but `build/SKILL.md` at this commit has no such logic.

## Referent Integrity (referent-integrity)

**Verdict:** FAIL

- **RI-1 (blocker)** — Referent: "`/adev:build` … propagated by `/adev:build`" (Invocation Modes item 1; Arguments *(propagated)* row). Verification: read the full `/tmp/rif-he2/skills/build/SKILL.md`; `grep -ni -- "--tier\|quick\|rigor" skills/build/SKILL.md` returned zero matches. Build's actual argument list has no `--tier` flag and no rigor-tier awareness at all. `finding-type`: `missing-cli-flag`. `section_anchor`: `invocation-modes`.
- **RI-2 (blocker)** — Referent: `templates/review-specs/quick-synthesized.md` (Output Contract, review-specs quick bullet). Verification: `find . -iname "*quick-synthesized*"` found only `skills/review-specs/quick-synthesized-reviewer-prompt.md` (+ provider mirrors); `templates/review-specs/` contains only `defaults.yaml`. The path named in the Output Contract does not exist anywhere in the repository. `finding-type`: `stale-file-path`. `section_anchor`: `output-contract`.
- All other named referents (`lib/governance/rigor-mode.mjs` exports, `INVALID_TIER` error code, `skills/review-specs/SKILL.md` / `skills/validate/SKILL.md` / `skills/route/SKILL.md` / `skills/work/SKILL.md` tier logic, `templates/risk-policies-template.yaml`, `.context-index/governance/risk-policies.yaml`, `tests/governance/rigor-mode.test.mjs`) were read directly and verified to exist as described.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict above, computed from post-cap findings across all reviewers — PASS (zero warnings/blockers), PASS_WITH_NOTES (>=1 warning, zero blockers), BLOCK (>=1 blocker, default `blocker_threshold`).

---

## Summary

**Total findings:** 16 (7 blockers, 4 warnings, 3 suggestions, plus 2 additional suggestions from structural-architect)
**Action required:** This spec is BLOCKED. The most load-bearing finding is the referent-integrity pair (RI-1/RI-2): the spec claims `/adev:build` propagates `--tier`, but `skills/build/SKILL.md` at this commit implements no such flag, and the quick-synthesized-reviewer bundled-prompt path it names does not exist on disk. `/adev:specify --revise` should address RI-1/RI-2 and the overlapping CON-1/CON-2/SEC-5 findings before re-review.
