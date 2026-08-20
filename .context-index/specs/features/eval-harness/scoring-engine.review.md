---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: PASS
review-round: 5
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 5
file-sha: ead8a08a239869195e1cdd08521070262685ac22648dfa967089a14d585ad924
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** PASS
> **Round:** 5 (revision 5; rounds 1-3 BLOCKed, round 4 PASS_WITH_NOTES)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Why This Spec Re-Entered the Gate After Passing

Round 4 returned PASS_WITH_NOTES on revision 4, which opened the `plan` gate. Revision 5 addresses that round's warning and three suggestions, and the author chose to re-review rather than edit a passed spec in place. That is the correct call and worth recording: editing a `review-passed` spec without re-review is the pattern `adev-plugin-j7pq.3` measured in this repo — 66 of 164 PASS_WITH_NOTES-terminal specs made substantive edits after passing, none re-reviewed. Adding a behaviour (BEH-10) and splitting an error code are substantive by any reading.

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter, `skills/eval/SKILL.md`, `lib/evals/rubric-schema.mjs`, `lib/evals/rubric.mjs`, and `lib/profiles/yaml.mjs` from disk.

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

**Verdict:** PASS

Zero blockers, zero warnings. One cosmetic suggestion.

### SA-4 — severity: suggestion

- **Location:** Behaviors, BEH-9 / BEH-10
- **Finding:** BEH-10 is engine-level threshold validation but is ordered after BEH-9, which covers CLI-level path containment — a topic break in an otherwise engine-first sequence.
- **Recommendation:** Move BEH-10 adjacent to BEH-2/BEH-3 (tallying) for readability. Cosmetic only; no functional or traceability impact.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict computed from post-cap findings across all reviewers. This round produced zero blockers and zero warnings, so per the verdict table — "all reviewers returned zero findings or only `suggestion` severity" — the consolidated verdict is PASS.

## Exhaustiveness Re-Derivation (verification point 1)

Round 4 established the partition; this round re-derived it rather than carrying it forward, because rounds 3 and 4 each found a defect introduced by the *previous* round's fix. The result is unchanged.

BEH-10 gates the rubric's `insufficient_evidence_threshold_percent` field before tallying. It takes no argument from `(N_j, U, N_d, NA)` and claims no region of that space — it is orthogonal to the partition, not a competitor within it.

**Judged half** — `N_j` = declared `quality_dimensions` count, `U` = `unknown` count:

| Region | Resolves to | Claimed by |
|---|---|---|
| `N_j = 0` | `NOT_SCORED` | BEH-4 clause 1 |
| `N_j >= 1`, `U = N_j` | `INSUFFICIENT_EVIDENCE` | BEH-3 clause 1 (threshold-independent) |
| `N_j >= 1`, `U < N_j`, `U/N_j > threshold` | `INSUFFICIENT_EVIDENCE` | BEH-3 clause 2 |
| `N_j >= 1`, `U < N_j`, `U/N_j <= threshold` | numeric, denominator `N_j - U >= 1` | BEH-1 |

**Deterministic half** — `N_d` = declared `required_elements` count, `NA` = `not_applicable` count:

| Region | Resolves to | Claimed by |
|---|---|---|
| `N_d = 0` | `NOT_SCORED` | BEH-4 clause 1 |
| `N_d >= 1`, `NA = N_d` | `NOT_SCORED` | BEH-4 clause 2 |
| `N_d >= 1`, `NA < N_d` | numeric, denominator `N_d - NA >= 1` | BEH-1 |

Two questions the dispatch asked specifically about BEH-10's interaction, both answered in the negative:

- **Does the `[0,100]` bound change BEH-3 clause 2's reachability at the boundaries?** No. The share is already bounded to `[0,100]` by `U <= N_j`, so constraining the threshold to the same interval removes no reachable comparison. At `threshold = 0`, clause 2 fires for any `U >= 1` with `U < N_j`. At `threshold = 100`, clause 2 is unreachable — the share never strictly exceeds 100 — which is the original round-3 condition.
- **Does BEH-10 make BEH-3 clause 1 redundant?** No, and this matters. Clause 1 is the *sole* path at `threshold = 100`, which BEH-10 explicitly permits as an in-range value. Removing clause 1 on the grounds that BEH-10 now validates the threshold would reopen round 3's defect exactly.

Every region is claimed exactly once; none is unclaimed or doubly claimed. The partition survives revision 5 intact.

## Error-Code Sweep (verification point 2)

Both codes were swept across every section — Behaviors, Acceptance Criteria, Error Cases, Actionable Task Map, Preconditions, Postconditions. The orchestrator ran the same sweep independently before dispatch; the two agree.

| Code | Cited at | Correct for the fault described |
|---|---|---|
| `SCORE_INVALID_THRESHOLD` | BEH-10; its Acceptance Criteria line; its Error Cases row | Yes — all three describe a non-numeric or out-of-`[0,100]` threshold on a well-formed Rubric |
| `SCORE_INVALID_RUBRIC` | Its own Error Cases row only | Yes — wrong-origin Rubric, the fault it was originally introduced for |

No stale or misapplied citation anywhere. The Error Cases row for `SCORE_INVALID_THRESHOLD` also carries an explicit disambiguating clause against `SCORE_INVALID_RUBRIC`, which forecloses the confusion the split was meant to prevent. This is the section that failed in rounds 2 and 3 — a fix landing in the normative prose but not in the tables — and it did not fail here.

## Answers to the Five Verification Points

1. **BEH-10 does not disturb the partition.** Re-derived from scratch; see the tables above. It rejects before tallying rather than claiming a region. Neither of the two interaction risks the dispatch flagged materialises, and clause 1 is confirmed load-bearing rather than redundant.

2. **`SCORE_INVALID_RUBRIC` is not cited anywhere it no longer applies.** See the sweep table. Clean.

3. **The three suggestion-fixes introduced nothing new.** SA-1 -> BEH-10 closes the traceability gap it was raised for. CON-1 -> the code split holds under the full-document sweep. SA-2 -> the new Error Cases row correctly separates clause 1 ("every declared entry resolved `unknown`") from clause 2 ("share above threshold") as two distinct non-error rows rather than conflating them. SA-3 -> the `Status assignment` rewording ("disjoint preconditions rather than an ordered fallback", "no region left unclaimed") now matches what BEH-3 and BEH-4 actually describe.

4. **The three candidate observations, individually rated.**
   - *BEH-10's "non-numeric" wording* — **non-issue, refuted.** BEH-10's own rationale ("a non-numeric threshold coerces to `NaN`") operationally defines the check as coercion-based rather than a strict `typeof` test. A fractional string such as `"66.7"` — which this repo's integer-only YAML reader produces for any decimal — coerces cleanly and passes; only a genuinely non-coercible value fails. That is the same distinction settled in round 3, and it is decided adequately for a behavioural spec: pinning the exact predicate would be an implementation approach, which this spec correctly leaves to `/adev:plan`.
   - *No dedicated task-map row for BEH-10* — **non-issue, refuted.** The `Insufficient-evidence guard` row's first clause already names the work ("Validate the threshold is numeric and within `[0, 100]`"). The asymmetry with round 4's SA-1 is real but not equivalent: SA-1 concerned a normative rule with no behaviour id, and behaviour ids are the traceability contract that tests and plan tasks are written against. The task map is a planning aid, and nothing in it is unclaimed.
   - *BEH-10 ordered after BEH-9* — **cosmetic, filed as SA-4.**

5. **Regression sweep — every prior defect gone at the root.** Round 1's numeric stand-in reduced by a shared ceiling: replaced by the closed status set. Round 2's stale task-map phrasing: gone. Round 3's `threshold = 100` exhaustiveness hole: closed by BEH-3 clause 1, re-verified above. Round 4's SA-1 traceability gap: closed by BEH-10. No relocation observed in any case — this is the first round where the recurring failure mode did not recur. The only new finding is the cosmetic SA-4.

## Charter-Constraint Check

Both charter constraints this spec exists to honour are satisfied at revision 5:

- **Split-delta invariant** — honoured. The deterministic and judged halves remain separately addressable, and the number-or-status model keeps "earned nothing" (`0`), "could not be judged" (`INSUFFICIENT_EVIDENCE`), and "nothing to judge" (`NOT_SCORED`) as three distinguishable outcomes, so a downstream comparison can classify `judge-attributable` movement without re-deriving the element/criterion partition.
- **ScoreComparison outcome set** — not re-opened. `INSUFFICIENT_EVIDENCE` and `NOT_SCORED` remain half-value statuses on the scoring result, not comparison outcomes. `SCORE_INVALID_THRESHOLD` is an error code, not an outcome name. No parallel outcome vocabulary is introduced.

## Reviewer-Output Compliance

The dispatch again carried the mandatory-output requirement that any blocker-severity finding emit `blocker_id` and `section_anchor`. This round produced no blocker, so — as in round 4 — the requirement went unexercised. **P1 `adev-plugin-quick-reviewer-blocker-id-s0et` remains open with no new evidence either way.** Across five rounds the field emission was correct in rounds 1 and 2, absent in round 3, and untested in rounds 4 and 5, which is consistent with the intermittent-failure hypothesis on that issue and is why it is harder to catch than a consistent omission.

## Process Note

Five rounds, converging monotonically: a contradiction in the model, that fix incompletely applied, a boundary case in an otherwise-sound model, a traceability gap, and now only a section-ordering preference. Each round closed the prior round's lower-severity findings as well as its headline one, and no defect was ever reintroduced once fixed at the root.

Two framework defects observed across the sequence remain open and are the reason this convergence needed a human at every step:

- `adev specify revise` does not edit spec body content (`adev-plugin-revise-loop-no-content-edits-q6q0`, P1), so the review-block auto-retry loop cannot converge on a content blocker.
- `adev report --type step` stamps no revision (`adev-plugin-gkfv.3`, P1), so all five rounds project under `byRevision: {"1": ...}` with `lastReviewedRevision` unset. The `plan` gate opens regardless because it reads the step verdict rather than the revision, but this skill's own Step 1 re-review detection — `lastReviewedRevision < spec revision` — cannot function.

Together with `adev-plugin-quick-reviewer-blocker-id-s0et`, all three ends of the automated retry path are currently unreliable: the loop cannot tell rounds apart, cannot always read the sidecar, and cannot edit the spec.

---

## Summary

**Total findings:** 1 (0 blockers, 0 warnings, 1 suggestion)
**Action required:** None. The spec is ready for `/adev:plan`. SA-4 is a section-ordering preference that can be folded into any later revision, or declined.
