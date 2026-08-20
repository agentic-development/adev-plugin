---
spec: .context-index/specs/features/eval-harness/scoring-engine.spec.md
charter: .context-index/specs/features/eval-harness/charter.md
date: 2026-08-20
verdict: PASS_WITH_NOTES
review-round: 4
rigor-tier: quick
tier-source: explicit --tier flag (overrides risk_level medium -> full)
last-reviewed-revision: 4
file-sha: befe009bc7fef507f8f932e358fe9f05a724a40a782063f089dc3d6598b11688
---

# Architecture Review: scoring-engine

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Round:** 4 (revision 4; rounds 1-3 BLOCKed, each on a narrower defect than the last)
> **Rigor tier:** quick (single synthesized reviewer; explicit `--tier quick` overrode the `medium` risk policy's `review_mode: full`)

## Registry Notes

Loader warnings surfaced by `adev governance reviewers --json` (profile-posture advisories, unrelated to the dispatched reviewer):

- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding mcp_server 'playwright'.
- `BROADEN_TOOL` — Profile 'browser-review': allow_add broadens posture by adding category 'web-fetch'.
- `BROADEN_NETWORK` — Profile 'browser-review': network broadened 'deny' -> 'read-only'.

Errors: none. `verdict_rules.blocker_threshold`: 1.

Context-pack note: the parent charter (20258 bytes) exceeded the pack's 16384-byte per-file cap and was truncated in the rendered pack. The reviewer's read-only profile grants Read/Glob/Grep and it was directed to read the full charter, `skills/eval/SKILL.md`, `lib/evals/rubric-schema.mjs`, and `lib/evals/rubric.mjs` from disk.

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

**Verdict:** PASS_WITH_NOTES

No blockers. Four non-blocking findings, all documentation-traceability rather than behaviour.

### SA-1 — severity: warning

- **Location:** Error Cases / Acceptance Criteria / Actionable Task Map (the threshold-validation rule)
- **Finding:** The `SCORE_INVALID_RUBRIC` rule for a non-numeric or out-of-range threshold appears in the Error Cases table, in one Acceptance Criteria line, and in the `Insufficient-evidence guard` task-map row, but no `BEH-n` covers it. That breaks the spec's own pattern: every other error code traces to a behavior (`SCORE_EMPTY_EVIDENCE` -> BEH-5, `SCORE_UNKNOWN_VERDICT_ID` / `SCORE_MISSING_VERDICT` -> BEH-6, `UNSAFE_SCORE_PATH` / `SCORE_INPUT_NOT_FOUND` -> BEH-9), and every other AC line cites a BEH.
- **Recommendation:** Add a `BEH-10` for the threshold-validation rule, or fold it explicitly into BEH-3's preamble and cite that from both the AC line and the Error Cases row.
- **Note on severity:** this is the one finding that is not purely cosmetic. The rule is a *normative engine behaviour* — it rejects input before tallying — and behaviours are what `/adev:plan` decomposes and what tests are written against. A rule living only in a table and a checkbox is materially easier to drop during planning than one carrying a BEH id.

### SA-2 — severity: suggestion

- **Location:** Error Cases, the `unknown share above the rubric threshold` row
- **Finding:** The row documents only BEH-3's threshold-dependent clause as "not an error". BEH-3's new all-`unknown` clause has no parallel row.
- **Recommendation:** Add a second "not an error" row for the all-`unknown` case, or fold both clauses into the existing row.

### CON-1 — severity: suggestion

- **Location:** Error Cases, `SCORE_INVALID_RUBRIC`
- **Finding:** The code now covers two unrelated fault classes — wrong provenance, and a malformed threshold value — while BEH-6 elsewhere splits two comparably related conditions into two distinct codes.
- **Recommendation:** Consider a distinct `SCORE_INVALID_THRESHOLD`, or leave as-is if the two are considered close enough. Not blocking either way.

### SA-3 — severity: suggestion

- **Location:** Actionable Task Map, `Status precedence` row
- **Finding:** The row is named "precedence", but BEH-4 describes the two statuses as exclusive by construction — disjoint preconditions — not resolved by an ordering rule between competing outcomes. The row's *content* is true; its name describes a mechanism the design deliberately does not use.
- **Recommendation:** Rename to `Status exclusivity`.

> A **per-reviewer** verdict is never BLOCK. BLOCK is the *consolidated* verdict computed from post-cap findings across all reviewers. This round produced zero blockers and one warning, giving the consolidated `PASS_WITH_NOTES` in the header.

## Exhaustiveness Analysis (verification point 1)

The defect that survived rounds 1-3 was, in its final form, a region of the input space claimed by no behaviour. The reviewer enumerated both halves region by region. Reproduced here because it is the evidence for the verdict, not a summary of it.

**Judged half** — `N_j` = declared `quality_dimensions` count, `U` = `unknown` count:

| Region | Resolves to | Claimed by |
|---|---|---|
| `N_j = 0` | `NOT_SCORED` | BEH-4 clause 1 |
| `N_j >= 1`, `U = N_j` | `INSUFFICIENT_EVIDENCE` | BEH-3 clause 1 (threshold-independent) |
| `N_j >= 1`, `U < N_j`, share > threshold | `INSUFFICIENT_EVIDENCE` | BEH-3 clause 2 |
| `N_j >= 1`, `U < N_j`, share <= threshold | numeric, denominator `N_j - U >= 1` | BEH-1 |

**Deterministic half** — `N_d` = declared `required_elements` count, `NA` = `not_applicable` count:

| Region | Resolves to | Claimed by |
|---|---|---|
| `N_d = 0` | `NOT_SCORED` | BEH-4 clause 1 |
| `N_d >= 1`, `NA = N_d` | `NOT_SCORED` | BEH-4 clause 2 |
| `N_d >= 1`, `NA < N_d` | numeric, denominator `N_d - NA >= 1` | BEH-1 |

Boundaries checked: at `threshold = 100`, BEH-3 clause 2 is unreachable (share < 100 whenever `U < N_j`), but clause 1 independently catches the all-`unknown` case — this is precisely round 3's fix, and it holds. At `threshold = 0`, any `U >= 1` with `U < N_j` gives share > 0 and routes to `INSUFFICIENT_EVIDENCE`, which is the rubric author's stated intent for that setting.

The two structural asymmetries were checked and leave nothing unclaimed: `ELEMENT_VERDICTS` in `lib/evals/rubric-schema.mjs` has no `unknown` value, so the deterministic half needs no analogue of BEH-3 clause 2 and BEH-3 correctly never applies to it; and BEH-4 clause 2 says "every *deterministic* entry", so it correctly never applies to the judged half.

**Every region is claimed exactly once. No region is unclaimed; no region is doubly claimed.** The statuses are mutually exclusive *and* exhaustive over the zero-denominator case, as BEH-4 now asserts.

## Answers to the Five Verification Points

1. **Exhaustive — confirmed.** See the tables above. The orchestrator independently derived the same partition before dispatch and the two agree region for region, including both boundary values.

2. **No misclassification found.** `N_j = 0` cannot be pulled into `INSUFFICIENT_EVIDENCE` because BEH-3 requires at least one declared entry. A genuine "scored and earned nothing" zero (all `not_met`, so `U = 0`, `N_j >= 1`) always routes numeric: share is 0, which never exceeds a threshold in `[0,100]`, and `U = N_j` is false. The three intended outcomes — numeric `0`, `INSUFFICIENT_EVIDENCE`, `NOT_SCORED` — stay distinct across the whole space, including at `threshold = 0`.

3. **Both task-map rows are true again.** `Not-scored handling`'s "no `NaN` or division-by-zero value is ever produced" is now guaranteed, though jointly by BEH-3 clause 1 and BEH-4 rather than by not-scored handling alone. `Status precedence`'s content is true; only its name overclaims a mechanism the design does not use (SA-3). Round 3's failure mode — a task-map row asserting an invariant the behaviours did not deliver — is not repeated.

4. **The four candidate observations, individually rated.**
   - *No BEH covers the threshold rule* — **confirmed, real gap.** SA-1, warning. The only one of the four with consequences beyond tidiness.
   - *`SCORE_INVALID_RUBRIC` overload* — **valid but minor.** CON-1, suggestion. Defensible as-is: both conditions mean "this rubric is not usable by the engine".
   - *Precondition framing now misleading* — **non-issue, refuted.** The statement stays literally true: the engine still never reads or parses a rubric file. Re-validating one field of a successfully-loaded Rubric is not the same as loading it, and the Error Cases row already states why the engine defends itself rather than trusting the loader.
   - *Error Cases row covers only the threshold-dependent clause* — **confirmed, minor.** SA-2, suggestion.

5. **Regression sweep — all three prior defects gone at the root.** Round 1's numeric stand-in reduced by a shared ceiling: replaced by the closed status set. Round 2's stale task-map phrasing: gone, the rows use current status vocabulary throughout. Round 3's `threshold = 100` exhaustiveness gap: closed by BEH-3's threshold-independent clause, verified region by region above. No new behavioural defect from revision 4's edits — the only new findings are the traceability gaps SA-1 and SA-2.

## Charter-Constraint Check

Both charter constraints this spec exists to honour are satisfied at revision 4:

- **Split-delta invariant** — honoured. The deterministic and judged halves remain separately addressable, and the number-or-status model keeps "earned nothing", "could not be judged", and "nothing to judge" as three distinguishable outcomes. A downstream comparison can classify `judge-attributable` movement without re-deriving the element/criterion partition, which is what the invariant requires.
- **ScoreComparison outcome set** — not re-opened. `INSUFFICIENT_EVIDENCE` and `NOT_SCORED` are half-value statuses on the scoring result, not comparison outcomes. The spec references `judge-attributable` only as something a downstream comparison computes and introduces no parallel outcome names.

## Reviewer-Output Compliance

The dispatch carried a mandatory-output requirement that any blocker-severity finding emit `blocker_id` and `section_anchor`, after round 3's reviewer omitted both from an identical dispatch (tracked as P1 `adev-plugin-quick-reviewer-blocker-id-s0et`). This round produced no blocker, so the requirement was not exercised and the round provides no evidence either way on whether the intermittent omission is fixed. The open question stands.

## Process Note

Four rounds, converging: a contradiction in the model, then that fix incompletely applied, then a boundary case in an otherwise-sound model, and now only traceability gaps. Each round closed the prior round's warnings as well as its blocker. Two framework defects observed across the sequence remain open and are the reason this convergence required a human at every step: `adev specify revise` does not edit spec body content (`adev-plugin-revise-loop-no-content-edits-q6q0`), and `adev report --type step` stamps no revision, so the projection files every round under `byRevision: {"1": ...}` with `lastReviewedRevision` unset (`adev-plugin-gkfv.3`).

---

## Summary

**Total findings:** 4 (0 blockers, 1 warning, 3 suggestions)
**Action required:** None blocking. The spec is ready for `/adev:plan`. Consider addressing SA-1 first — the threshold-validation rule is a normative engine behaviour that currently exists only in a table, a checkbox, and a task row, which makes it the finding most likely to be lost during planning. SA-2, SA-3, and CON-1 are editorial and can be folded into any later revision.
