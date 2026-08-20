---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: BLOCK
review-round: 3
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 3
aggregator-advisories: LEGACY_REVIEWER_OUTPUT
file-sha: 80aed676b7a5bcccb2910a94be371b115a349dda7eca72704af9856086652492
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** BLOCK
> **Round:** 3 (revision 3; rounds 1 and 2 also BLOCKed)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Aggregator Advisory — LEGACY_REVIEWER_OUTPUT

The round-3 reviewer emitted its blocker **without `blocker_id` and without `section_anchor`**, though the dispatch prompt required both. Per the aggregator contract in `/adev:review-specs` Step 6b-bis, a BLOCK finding missing `blocker_id` is logged as `LEGACY_REVIEWER_OUTPUT` and **excluded from the `.blockers.md` sidecar**; no sidecar was written for this round, and the Step 6b-ter heuristics lookup was skipped (a finding with no valid `blocker_id` has no identity to inherit). An auto-retry caller must fall through to its fail-loud path rather than dispatching `/adev:specify --revise`.

The finding itself is fully preserved below and was independently verified against the source — the missing metadata is a reviewer-output defect, not grounds to discount the finding.

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter, `skills/eval/SKILL.md`, `lib/evals/rubric-schema.mjs`, and `lib/evals/rubric.mjs` from disk; its findings cite all four.

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

- **Location:** Behaviors, BEH-3 / BEH-4, interacting with the Acceptance Criteria
- **blocker_id:** *(not emitted — see the LEGACY_REVIEWER_OUTPUT advisory above)*
- **section_anchor:** *(not emitted)*
- **Finding:** The mutual-exclusivity claim is false at a boundary value the shipped loader accepts.

  `insufficient_evidence_threshold_percent` has **no validated range and no validated type** anywhere in `lib/evals/rubric-schema.mjs` or `lib/evals/rubric.mjs`. It appears only in `REQUIRED_TOP_LEVEL_KEYS`, so it is checked for presence and nothing else. The single numeric guard in the loader (`isPositiveFiniteNumber`, applied by `assertBudgetsValid`) is scoped to keys matching `BUDGET_KEY_PATTERN` — the `budget_max_*` family — and never reaches this key. A rubric declaring `insufficient_evidence_threshold_percent: 100` therefore loads successfully.

  Case analysis for the judged half, with `N_j` the declared `quality_dimensions` count and `U` the `unknown` count:

  - **Both statuses firing (failure mode a): impossible.** BEH-4 fires only when `N_j = 0`; BEH-3 requires `N_j >= 1`. The "by construction" exclusivity claim is correct for this mode — the revision-2 defect is genuinely fixed.
  - **Neither status firing (failure mode b): reachable.** With `N_j >= 1` and `U = N_j`, the `unknown` share is exactly 100. BEH-3 requires the share to strictly **exceed** the threshold; at `threshold = 100`, `100 > 100` is false, so BEH-3 does not fire. BEH-4 does not fire either, because `N_j >= 1` and its second clause ("every *deterministic* entry resolved `not_applicable`") is deterministic-only and cannot apply to the judged half. The judged half falls through to the numeric path with an answered-entry count of `N_j - U = 0` — precisely the zero-denominator/`NaN` outcome BEH-4 exists to prevent.

  The same gap also contradicts the Acceptance Criteria line "a 100% `unknown` judged half carries `INSUFFICIENT_EVIDENCE`", which states unconditionally what BEH-3 conditions on the threshold.
- **Recommendation:** Either constrain `insufficient_evidence_threshold_percent` to `[0,100]` at load time (which closes the boundary by making `threshold = 100` the only edge and still leaves `>` exact at it), or change BEH-3's comparator so a 100% `unknown` share is insufficient evidence regardless of threshold, and reconcile the Acceptance Criteria line's unconditional wording with BEH-3's conditional wording either way.

**Orchestrator verification note (not a reviewer finding).** SA-1's central claim was independently checked against the source and holds: `grep` over `lib/evals/rubric-schema.mjs` confirms `insufficient_evidence_threshold_percent` appears exactly once, in `REQUIRED_TOP_LEVEL_KEYS`, with no range or type constraint; `assertBudgetsValid` in `lib/evals/rubric.mjs:574` filters on `BUDGET_KEY_PATTERN` and cannot reach it.

One clarification on the reviewer's secondary claim about string-typed thresholds. The hazard is real but narrower than stated. `lib/evals/rubric.mjs:590-595` documents that this repo's YAML reader (`lib/profiles/yaml.mjs`) types bare integers only, so a decimal such as `66.7` parses as the string `"66.7"` — and budget keys carry an explicit guard against exactly that, which this key does not. However, a *numeric* string still coerces correctly in a JavaScript relational comparison (`100 > "66.7"` is `true`), so a decimal threshold does not by itself break the guard. The genuine string hazard is a **non-numeric** value: it coerces to `NaN`, every comparison against it is `false`, and BEH-3 silently never fires for any verdict set — a strictly worse version of the same hole. This strengthens rather than weakens the recommendation to validate the field's type and range at load time.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict in the header above, computed from post-cap findings across all reviewers.

## Answers to the Four Verification Points

1. **Is the exclusivity claim sound?** Half-sound, and the failing half is the one the author did not ask about first. Failure mode (a) — both statuses firing — is genuinely impossible by construction, so revision 3 does fix round 2's SA-2 as intended. Failure mode (b) — neither firing, leaving a half undefined — is reachable at `threshold = 100` because BEH-3's comparator is a strict `>` and the shipped loader validates nothing about that field. This is SA-1 and it is what blocks the spec.

2. **Does the `Update skills/eval/SKILL.md Layer 3` row survive planning?** Yes. No finding. The row names both edits (replace the in-prose aggregate formula with the CLI call; replace the whole-layer discard with half-level status reporting) and states why it is required rather than optional — that leaving the discard in place would have the engine's only in-repo consumer contradicting it. A planner reading only the task map has enough to scope it and enough to refuse to drop it as tidy-up. Round-2 CON-1 is closed.

3. **May `SCORE_INVALID_RUBRIC` leave the detection mechanism open?** Yes — the author's position is correct and the reviewer agrees. The spec already fixes the observable contract: the trigger condition, the error code, and the requirement that the error name the expected origin. *How* provenance is detected (a sentinel property, a brand, a `WeakSet` registry) is an implementation strategy with no behavioral consequence, and leaving it to `/adev:plan` is consistent with how the sibling loader spec left `UNSAFE_RUBRIC_PATH`'s resolution algorithm to its implementation. It stays a suggestion; the spec need not decide it.

4. **Regression sweep.** Both prior blockers are genuinely gone rather than relocated. The round-1 defect (a numeric stand-in reduced by a ceiling shared across both halves) is fixed at the root — BEH-3 now yields a closed status, not a number. The round-2 defect (that fix not reaching the Actionable Task Map) is fixed — no `layer3_max_points`-reduction phrasing survives anywhere in the file, and the sweep for `contributes 0` / `reduced attainable` / `a term` returns nothing stale. The rewritten task map is consistent with the behaviors it describes.

   **New problem the rewrite introduced:** the "Not-scored handling" and "Status precedence" rows now assert invariants the behaviors do not actually guarantee — "no `NaN` or division-by-zero value is ever produced" and "resolves to `INSUFFICIENT_EVIDENCE` and never to `NOT_SCORED`". Under SA-1 both assertions are false at `threshold = 100`. This is a different failure shape from rounds 1 and 2: the flaw was carried *into* the rewritten section rather than left behind in one the edit did not reach, so a task-map sweep of the kind that fixed round 2 would not have caught it. Fixing SA-1 in the behaviors makes both rows true again; no separate task-map edit is needed.

## Charter-Constraint Check

Both charter constraints this spec exists to honour remain satisfied at revision 3, and neither is the source of the blocker:

- **Split-delta invariant** — honoured. The halves remain separately addressable, and the number-or-status model keeps "judged half earned nothing" distinguishable from "judged half could not be scored", which is what makes `judge-attributable` classification computable downstream.
- **ScoreComparison outcome set** — not re-opened. `INSUFFICIENT_EVIDENCE` and `NOT_SCORED` remain half-value statuses on the scoring result, not comparison outcomes; no parallel outcome names are introduced.

## Process Note

Three rounds, three BLOCKs, but the trajectory is convergent rather than circular: round 1 found a contradiction in the model, round 2 found that fix incompletely applied, and round 3 found a boundary case in a model that is now otherwise sound. Rounds 2 and 3 each closed the prior round's warnings (SEC-1, then SA-2's both-fire mode and CON-1), and the surviving blocker is narrower each time.

Two process observations worth carrying forward. First, revisions continue to be made by hand because `adev specify revise` does not edit spec body content (open P1 `adev-plugin-revise-loop-no-content-edits-q6q0`), so the auto-retry loop cannot converge on a content blocker — every round here required a human edit. Second, this round's reviewer omitted `blocker_id` and `section_anchor` despite the dispatch prompt requiring them, which is what triggered the `LEGACY_REVIEWER_OUTPUT` path and suppressed the sidecar. Both defects point the same direction: the automated retry path is currently unusable end-to-end for this class of finding, and the review remains reliable only because a human is reading the output.

---

## Summary

**Total findings:** 1 (1 blocker, 0 warnings, 0 suggestions carried forward as findings)
**Action required:** Close SA-1's boundary case, by constraining `insufficient_evidence_threshold_percent` to a validated numeric `[0,100]` at load time, or by making a 100% `unknown` share insufficient evidence regardless of threshold, or both. Reconcile the Acceptance Criteria's unconditional "100% unknown carries `INSUFFICIENT_EVIDENCE`" with BEH-3's conditional wording in the same edit. No `.blockers.md` sidecar was written this round (`LEGACY_REVIEWER_OUTPUT`), so an auto-retry caller must fail loud rather than dispatch a revise. Round-2 CON-1 and the carried `SCORE_INVALID_RUBRIC` suggestion are both resolved — the former fixed, the latter deliberately and acceptably left to `/adev:plan`.
