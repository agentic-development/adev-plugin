---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: BLOCK
review-round: 2
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 2
file-sha: 3b62c1227a979e780a7a2f1bee55df6c678a9102f70dac593ffee40aa2561667
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** BLOCK
> **Round:** 2 (revision 2; revision 1 BLOCKed on `quick-synthesized-reviewer:ambiguous-postcondition:f841f2d8`)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter, `skills/eval/SKILL.md`, and the sibling loader spec from disk; its findings cite all three.

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

- **Location:** Actionable Task Map, "Insufficient-evidence guard" row
- **blocker_id:** `quick-synthesized-reviewer:stale-attainable-maximum:cc4c26c0`
- **section_anchor:** `actionable-task-map`
- **Finding:** The row still reads "produce the `INSUFFICIENT_EVIDENCE` result and reduced attainable maximum." This is unrevised round-1 language and directly contradicts BEH-3, which now states the deterministic half's "attainable maximum unchanged" when the judged half goes `INSUFFICIENT_EVIDENCE`. A reader working from the task map (rather than the behaviors) will implement the wrong contract — the exact hazard round 1 blocked on, now relocated rather than fixed.
- **Recommendation:** Reword the task-map row to match BEH-3/BEH-4 (produce a status for the affected half only; the other half's maximum is untouched).

**Orchestrator verification note (not a reviewer finding).** A `grep` sweep of the spec for round-1 phrasing confirms the reviewer's SA-1 and finds a **second stale row in the same section**, which a revision addressing only the named row would leave behind:

- Line 42 — `Insufficient-evidence guard | ... produce the INSUFFICIENT_EVIDENCE result and reduced attainable maximum` (the reviewer's SA-1).
- Line 43 — `Zero-denominator handling | A term with no answered entries contributes 0 and says so, never NaN` — stale against BEH-4, which now assigns the status `NOT_SCORED` rather than the number `0`. It also still says "term", the revision-1 vocabulary, where the spec now says "half".

Line 44 (`Result assembly ... total, and attainable maximum`) is not stale on its face but should be checked in the same pass, since a half may now carry a status instead of a total.

### SA-2 — severity: warning

- **Location:** BEH-3 / BEH-4
- **Finding:** No precedence is stated for the case where a half has zero answered `quality_dimensions` entries — that simultaneously satisfies BEH-4's "no answered entries" (-> `NOT_SCORED`) and BEH-3's "unknown share exceeds threshold" (-> `INSUFFICIENT_EVIDENCE`, since 0 answered implies 100% unknown). Neither behavior states which guard governs.
- **Recommendation:** State explicit precedence (e.g., zero-answered checked first, `NOT_SCORED` wins) or split the conditions so they are mutually exclusive.

### CON-1 — severity: warning

- **Location:** Behavioral Contract / Actionable Task Map
- **Finding:** The Behavioral Contract commits to updating `skills/eval/SKILL.md`'s Layer 3 reporting as "part of this spec's work, not a follow-up," but the Task Map's eight rows contain no SKILL.md task. This is a completeness gap rather than a documentation-style nit, because the task map is the only place that cross-cutting commitment could be operationalized for planning.
- **Recommendation:** Add an explicit task-map row for the SKILL.md reporting update, or downgrade the in-scope claim to a stated follow-up.

### SA-3 — severity: suggestion

- **Location:** Error Cases table, `SCORE_INVALID_RUBRIC`
- **Finding:** Still no detection mechanism specified for "is a Rubric produced by `loadRubric`" (branding vs. duck-typing). Carried unaddressed from round 1's SA-2. Not blocking.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header above, computed from post-cap findings across all reviewers.

## Round-1 Blocker Disposition

`quick-synthesized-reviewer:ambiguous-postcondition:f841f2d8` (anchor `behaviors-beh-3`) — **resolved in the normative sections, reintroduced in the task map.**

Revision 2's substitute was evaluated on its own terms rather than checked against a chosen number. Replacing the numeric stand-in with a closed status set (`INSUFFICIENT_EVIDENCE` / `NOT_SCORED`, with `0` reserved for "scored, earned nothing") does dissolve the round-1 contradiction: BEH-3 and BEH-4 now both assign a status instead of one silently zeroing, so the two guards no longer disagree. The reviewer confirmed the Behavioral Contract, BEH-1/3/4/8, the Acceptance Criteria, the Postconditions, and the Error Cases table are all internally consistent with that model. The blocker recurs only because the Actionable Task Map was not swept — which is why the new blocker is anchored to `actionable-task-map` rather than to `behaviors-beh-3`, and carries a distinct `blocker_id`.

## Answers to the Three Verification Points

1. **Is the closed status set closed and consistent?** Consistent everywhere *except* the Actionable Task Map. No stale "contributes 0" or "judged half zeroed" phrasing survives in the Behavioral Contract, BEH-1/3/4/8, the Acceptance Criteria, the Postconditions, or the Error Cases table. The task map is the one section the edit did not reach, and it holds two stale rows (SA-1 plus the orchestrator note above), which is what re-blocks the spec.

2. **Is the two-level `INSUFFICIENT_EVIDENCE` overloading a hazard?** The vocabulary reuse itself is coherent, not a naming clash — both levels mean "too many judged unknowns to trust the result," and the per-criterion `unknown` verdict rolling up into a half-level status of that name is the natural extension of the rule the rubric schema already applies. The hazard is downstream and concrete: `skills/eval/SKILL.md` currently treats `INSUFFICIENT_EVIDENCE` as collapsing the *entire* Layer 3 to 0 points with the *whole* `layer3_max_points` deducted — behaviour the new engine no longer produces, since the deterministic half stays numeric. That is a real consumer-facing mismatch, but it is the same gap CON-1 already captures (no task-map entry for the SKILL.md update), not an independent finding. Verdict: **acceptable reuse, conditional on the SKILL.md update actually being scoped.**

3. **Is the SKILL.md work adequately scoped without a task-map row?** No — it is a genuine scoping gap, recorded as CON-1 at **warning**, not blocker: the Behavioral Contract prose still puts a competent implementer on notice even without a line item, so it degrades planning quality rather than guaranteeing wrong output. Note the coupling: CON-1 is also what keeps answer 2 from becoming a blocker in its own right. If the SKILL.md task is dropped rather than added, the `INSUFFICIENT_EVIDENCE` overloading stops being acceptable reuse and becomes a live contract mismatch between the engine and its only in-repo consumer.

## Charter-Constraint Check

Both charter constraints this spec exists to honour remain satisfied at revision 2, and neither is the source of the blocker:

- **Split-delta invariant** — honoured, and strengthened by the revision. Making a half's absence explicit rather than folding it to `0` means a downstream comparison can tell "judged half earned nothing" from "judged half could not be scored," which a blended or zeroed figure would have erased.
- **ScoreComparison outcome set** — not re-opened. `INSUFFICIENT_EVIDENCE` and `NOT_SCORED` are *half-value statuses* on the scoring result, not comparison outcomes; the spec still references `judge-attributable` only as something a downstream comparison computes, and invents no parallel outcome names.

## Round-2 Regression Check

The reviewer was asked to report any new problem the hand edits introduced. SA-2 (the BEH-3/BEH-4 precedence gap at zero answered entries) is new in revision 2 — it did not exist in revision 1, where BEH-4 unconditionally contributed `0`. It is a direct consequence of promoting both cases to statuses without stating which wins when both conditions hold. Round-1 SEC-1 is fully addressed: BEH-9 plus the `UNSAFE_SCORE_PATH` and `SCORE_INPUT_NOT_FOUND` rows now cover traversal, symlink escape, and unreadable input on both `--rubric` and `--input`, following the `UNSAFE_RUBRIC_PATH` precedent.

## Process Note

Revision 2 was produced by hand rather than by `adev specify revise`, because that verb does not edit spec body content (open P1 `adev-plugin-revise-loop-no-content-edits-q6q0`), so the review-block auto-retry loop cannot converge on a content blocker. This round is direct evidence of the cost: the hand edit reached every normative section but missed the task map, producing a second BLOCK on the same underlying defect at a different anchor. A revise implementation that patched the section named by `section_anchor` and swept the spec for the blocker's phrasing would likely have caught both stale rows in one pass.

---

## Summary

**Total findings:** 4 (1 blocker, 2 warnings, 1 suggestion)
**Action required:** Sweep the Actionable Task Map for revision-1 phrasing — both the "Insufficient-evidence guard" row named by SA-1 and the "Zero-denominator handling" row identified in the orchestrator note — then re-review. Address SA-2's precedence gap and CON-1's missing SKILL.md task row in the same revision: CON-1 in particular is load-bearing, since the acceptability of the two-level `INSUFFICIENT_EVIDENCE` vocabulary depends on that update being scoped.
