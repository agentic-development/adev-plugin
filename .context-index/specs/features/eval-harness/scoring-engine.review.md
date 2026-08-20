---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: BLOCK
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 1
file-sha: b63bc6e885402a55316b2028ebb4595f004a451eebb3ba8238bbcfe4e805d12b
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter from disk, so the split-delta invariant and the ScoreComparison entity were available to it.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | plugin:review-specs/quick-synthesized-reviewer-prompt.md |

Per the `quick` tier branch, the registry's specialist reviewers (`consistency-analyzer`, `referent-integrity`, `wiring-reviewer`, `boundary-reviewer`, and the keyword-triggered `termination-reviewer`) were NOT dispatched.

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk; still resolvable for any project whose materialized review.yaml already names it. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via adev extension install web-service) where it fits the artifact class. Prompt retained on disk. |

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** FAIL

### SA-1 — severity: blocker

- **Location:** Behaviors, BEH-3 / Acceptance Criteria (INSUFFICIENT_EVIDENCE)
- **blocker_id:** `quick-synthesized-reviewer:ambiguous-postcondition:f841f2d8`
- **section_anchor:** `behaviors-beh-3`
- **Finding:** BEH-3 states that when the `unknown` share exceeds `insufficient_evidence_threshold_percent`, "the reported attainable maximum is reduced by `layer3_max_points`." `layer3_max_points` is the rubric's *total* point ceiling across both the deterministic and judged halves (per the charter's Rubric entity: `required_element_points` + `judged_criterion_points` are the per-unit values that sum to it), not the judged-only portion. Applying the stated reduction literally zeroes (or negatives) the attainable maximum even when the deterministic half remains fully scoreable — directly contradicting this same spec's Behavioral Contract sentence that "the result keeps the deterministic and judged halves separately addressable." BEH-4 (zero-denominator) makes no equivalent attainable-maximum reduction, so the two guards are also inconsistent with each other on this point.
- **Recommendation:** Clarify that the reduction is by the judged half's max-points contribution only, not `layer3_max_points`; state the formula explicitly and align BEH-4's treatment of attainable maximum with BEH-3's.

### SEC-1 — severity: warning

- **Location:** Behaviors BEH-8 / Error Cases (`adev eval score --rubric <path> --input <path>`)
- **Finding:** The charter's Quality Attributes table requires "Rubric and fixture paths are validated against traversal, following the `UNSAFE_TEMPLATE_PATH` precedent," and the sibling rubric-loader spec implements this via `UNSAFE_RUBRIC_PATH` (BEH-7). This spec's CLI verb accepts a `--input <path>` argument but defines no error case for path traversal, a missing file, or a malformed/unreadable verdict file at that path — the Error Cases table only covers in-memory verdict-set validation (`SCORE_*` codes), not the file read that must precede it.
- **Recommendation:** Add an error case (and precondition/behavior) for `--input` path containment and read failure, consistent with `UNSAFE_RUBRIC_PATH`'s precedent.

### SA-2 — severity: suggestion

- **Location:** Error Cases (`SCORE_INVALID_RUBRIC`)
- **Finding:** "Rubric argument is not a Rubric produced by `loadRubric`" gives no detection mechanism (branding vs. duck-typing), leaving the check underspecified.
- **Recommendation:** Note how a valid Rubric is recognized (e.g., a marker property set by `loadRubric`), or defer explicitly to the implementation plan.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header above, computed from post-cap findings across all reviewers.

## Charter-Constraint Check

The two charter constraints this spec exists to honour were both examined and neither is the source of the blocker:

- **Split-delta invariant** — honoured. The Behavioral Contract, BEH-1, the acceptance criteria, and the Postconditions all keep the deterministic and judged halves as distinct addressable fields so a downstream comparison can classify `judge-attributable` movement without re-deriving the element/criterion partition. SA-1 is a *consequence* of that invariant: BEH-3's reduction wording contradicts it.
- **ScoreComparison outcome set** — not re-opened. The spec references `judge-attributable` only as an outcome a downstream comparison computes; it invents no parallel outcome names and defines no comparison verdicts of its own.

---

## Summary

**Total findings:** 3 (1 blocker, 1 warning, 1 suggestion)
**Action required:** Revise the spec to resolve SA-1 before planning. `/adev:specify --revise` against the `.blockers.md` sidecar, then re-run `/adev:review-specs`. SEC-1 (the `--input` path-containment gap) should be addressed in the same revision since it is a charter Quality-Attribute requirement, though it does not itself block.
