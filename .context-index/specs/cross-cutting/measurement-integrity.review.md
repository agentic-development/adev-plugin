---
spec: .context-index/specs/cross-cutting/measurement-integrity.spec.md
date: 2026-08-13
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 2
file-sha: e49f390d76eefd1eadccd1d66444e0450c40c2e85412d087d194dfdffb8f82b1
---

# Architecture Review: measurement-integrity (revision 2)

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/cross-cutting/measurement-integrity.spec.md` (rev 2)
> **Charter:** cross-cutting (no parent charter)
> **Rigor tier:** full (risk_level: medium → review_mode: full)
> **Verdict:** BLOCK — 2 blockers, 9 warnings, 3 suggestions

## Convergence against revision 1

All four revision-1 blockers were addressed; both new blockers land in the same behavior cluster.

| rev 1 blocker | Disposition |
|---|---|
| SA-1 — rotation vs ADR-0012 closed peer set | **Resolved.** Rotation removed and split to `report-rotation.spec.md`; all 8 rotation-specific findings carried over verbatim. Both reviewers confirmed the split is clean with no dangling ownership. |
| SEC-1 — trailer escaping contract | **Resolved at spec level.** Behavior 6 now asserts the trust boundary normatively rather than pointing at a PR. |
| CON-1 — frontmatter diagnostic premise | **Resolved.** Behavior withdrawn rather than argued down; retraction recorded in the study artifact. |
| CON-2 — check-ID enum unresolvable | **Partially resolved.** The form-pinning half is verified correct. The admission-policy half does not survive contact with the corpus (CON-6). |

Loop state: 4 addressed / 0 persistent / 2 new → **CONTINUE**, not `NO_PROGRESS`. This is round 2 of 3 before the escalation cap.

**Signal worth acting on:** both new blockers (SA-9, CON-6) are in behaviors 2–3, the check-ID enum. Revision 1's blocker was concentrated in rotation, which was resolved by splitting it out. The enum is now showing the same shape — deep entanglement with ADR-0010 and with 46 distinct legacy spellings in the live event corpus.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Verdict |
|----|------|------|---------|---------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | BLOCK |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | PASS_WITH_NOTES |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | BLOCK |

> **Process note:** the first dispatch ran only structural-architect and consistency-analyzer. The security reviewer was dispatched separately to complete the full-tier set before this verdict was recorded. All three findings sets are included.

## Structural Architect (structural-architect) — BLOCK

**SA-9** · `blocker` · Behaviors §2, Integration Points §1
`blocker_id: structural-architect:adr-conflict:4b0d72e1` · `section_anchor: behaviors-2`
Behavior 2 makes `governance/validate.yaml` the closed enum and Integration Point 1 calls it "the single authority… one source of truth." That is false against **ADR-0010**, whose §"Surface roles" scopes `validate.yaml` to check overrides for Checks 1.5–13 and whose decision flow routes quality gates to `gates.yaml`. Live consequence at `skills/validate/SKILL.md:399`: Check 1 and Check 1.6 emit `validate.check-1-quality-gates` and `validate.check-1.6-code-drift` with **no registry entry, by design**. Under behaviors 2 and 8 those invocations exit 1 and append nothing — **deleting Check 1's outcome from the event log**, and Check 1 is the only check that ever fails. "Add them to validate.yaml" is closed off by ADR-0010, which makes this structural rather than a config edit.
**Recommendation:** Cite ADR-0010, state which surfaces contribute legal emit-time IDs, and give a disposition for registry-less-by-design IDs. Drop or qualify the "single authority" claim.

**SA-10** · `warning` — the retired-ID read path has no owning module; the real read-side resolver is `_resolveActorSeverity` at `lib/lifecycle-state.mjs:690`, absent from the Module Impact Map.
**SA-11** · `warning` — `VALIDATED_WITHOUT_REPORT` is artifact-verifiability, which ADR-0010 routes to `diagnostics.yaml` Tier 2, not a hygiene pass (carried from SA-7, still unaddressed).
**SA-12** · `warning` — behavior 3 re-enumerates retired IDs in prose while `REMOVED_CHECK_IDS` exists in code, qualified, and additionally contains `validate.check-5-adrs` and `validate.check-6-cross-cutting` that the spec omits. Two drifting copies, and the spec's copy is unqualified two sentences after pinning qualified as canonical.
**SA-13** · `warning` — `lib/reality-check.mjs:323-348` already derives `STATUS_VALIDATED` from `.validate.md` existence; two authorities for the same invariant with no declared owner.
**SA-14** · `warning` — `derivation: partial` is an orphan: no behavior, no postcondition, no owning module for the session-file schema.
**SA-15** · `suggestion` — renumbering residue: Principle 1 still lists "file rotation"; the Commit Trailers entry cites "behavior 6" for what is now behavior 5.

## Security Reviewer (security-reviewer) — PASS_WITH_NOTES

**SEC-1 resolved at the spec level.** Behavior 6 asserts the trust boundary normatively, backed by a postcondition and an acceptance criterion.

**Correction of record:** PR #214 is **merged** (2026-08-12T23:40:23Z), so the citation is to landed code and the "unmerged PR as security contract" concern is moot. However **this review branch is 17 commits behind `origin/main`** — a rebase obligation before the sessions work.

**SEC-6** · `warning` — behavior 6 names three obligations but calls containment "the half," leaving *escaping* unowned. It is absent from the Task Map and unimplemented post-#214: `lib/session-summary.mjs:294-300` `yamlValue()` emits `[${value.join(", ")}]` unquoted. A `]` corrupts frontmatter; a `,` **silently fabricates extra `specs-touched` entries** — a measurement-integrity failure inside the spec meant to fix measurement integrity. Add the escaping task; assert entry-count equality (one trailer → one entry).
**SEC-7** · `warning` — path containment is a deny-list (`..`, absolute) where repo precedent is resolution-based `assertWithin` plus a positive shape match; `.git/hooks/x` passes both checks. No entry-count or value-length cap despite the `MAX_NOTES_BYTES` precedent at `lib/lifecycle-state.mjs:51-53`.
**SEC-8** · `suggestion` — new exposure from the read/emit split: behavior 8 sanitises only *rejected* inputs, while behavior 3 *accepts* retired IDs read from committed, pullable JSONL. Extend sanitisation to any externally-sourced identifier rendered to a terminal, and freeze the retired set as a literal list rather than a `check-12-*` glob.

**SEC-3/SEC-4 survived the split intact** in `report-rotation.spec.md:51-52`, with permissions inheritance added.

## Consistency Analyzer (consistency-analyzer) — BLOCK

**CON-6** · `blocker` · contract
`blocker_id: consistency-analyzer:legacy-id-admission:4b8ae0d7` · `section_anchor: behaviors-3`
Behavior 3 and Postcondition 2 promise retired IDs "remain readable" so replay "never hard-fails," with unqualified→qualified prefixing as the only mapping. The live corpus contains **46 distinct `validator` spellings**, of which roughly 20 normalise to IDs in **neither** `validate.yaml` **nor** `REMOVED_CHECK_IDS`: `check-8-boundary`, `check-11-visual`, `check-5-adr`, `check-9-transitions`, `check-1-5-source-manifest`, `check-1-6-drift`, the whole `check-13-*` family, and others. `check-13-heuristic-extraction` vs registry `validate.check-12-heuristic-extraction` differs in the check *number* — no prefix rule recovers it. The spec cites "four spellings of the same check" as its own motivation, yet fixes only exact-retired IDs.
**Recommendation:** Admit a third class — *unrecognised legacy spelling* — with a stated read-path outcome distinct from *retired*. Import `REMOVED_CHECK_IDS` rather than re-enumerating it in prose.

**CON-7** · `warning` — `REMOVED_CHECK_ID` is explicitly *reserved* at `lib/governance/validate-config.mjs:48-53` and never emitted; the loader emits `RESURRECTED_CHECK_ID`, which `check-set-restructure.spec.md:288,333` has already partitioned deliberately. (The reviewer notes this imprecision originated in their own rev-1 CON-2 wording.)
**CON-8** · `warning` — inserting normalisation before `validate-config.mjs:122` silently changes an existing path: an unqualified removed ID in a project `validate.yaml` passes today and would begin warning and skipping. State the ordering relative to the removed-guard.
**CON-9** · `warning` — behavior 6 claims present-tense satisfaction ("is satisfied") while the Task Map says "sequence after PR #214 merges." Now that #214 is merged the tense is defensible, but the two lines still contradict each other.
**CON-10** · `suggestion` — Principle 1 still lists "file rotation" (stale after the split).

**Explicitly checked and clean:** the split creates no ownership loop or naming conflict in either direction; rotation findings carried over verbatim; behavior 7 remains accurate against `lib/cli/gate.mjs:25-33,82-86`; acceptance-criteria numbering is consistent after the withdrawal.

---

## Summary

**Total findings:** 14 (2 blockers, 9 warnings, 3 suggestions)

**Action required:** Both blockers are in behaviors 2–3 (the check-ID enum). The revision-1 lesson applies again: the behavior that keeps blocking this spec should be split out rather than iterated on. Removing behaviors 2 and 3 to their own spec would leave behaviors 1 (already landed), 4, 5–6, 7 and 8 — none of which drew a blocker in either round — and let five measurement fixes proceed while the enum question is worked against ADR-0010 and the 46-spelling corpus separately.

The alternative is a third revision resolving SA-9 and CON-6 in place, which is permitted (round 3 of 3) but would be iterating on the spec's most entangled behavior for the second time.
