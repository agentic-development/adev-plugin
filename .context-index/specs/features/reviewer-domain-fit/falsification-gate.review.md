---
spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
charter: reviewer-domain-fit
date: 2026-08-18
verdict: PASS_WITH_NOTES
tier: quick
last-reviewed-revision: 3
file-sha: d8785066c47c27ef6222afe0616525cb5aef751cb73a502ef87d0e2c50e5ceca
---

# Architecture Review: falsification-gate (round 3)

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md` (revision 3)
> **Charter:** `.context-index/specs/features/reviewer-domain-fit/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** quick (explicit `--tier quick`; overrode `risk_level: medium` → `review_mode: full`)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

## Mechanism claims — source-verified

Rounds 1 and 2 both blocked on claims about adev's behaviour that turned out false. Round 3
verified each of revision 3's claims against source rather than accepting them.

| Claim | Verdict |
|---|---|
| `review.yaml` is the whole effective reviewer set; no plugin file needed | True — `review-config.mjs:107-115`; relative `prompt:` resolves under `<repoRoot>/.context-index` |
| Empty `errors` does not prove pack resolution | True — loader `continue`s at `:194-199`; `UNKNOWN_CONTEXT_PACK` only in `context-pack.mjs:117` |
| `--tier full` cannot be overridden downstream | True — `SKILL.md:18`, precedence at `:508` |
| Non-empty `errors` aborts the panel | True — `SKILL.md:162,186` |
| `mergeReviewers` not on the load path | True — runs only via `governance materialize` |
| Pre-fix commits predate `a25971e2` | True — `0476a7bc`, `8d8d5c5a`, `11b179d7` all 2026-08-14 |
| Other historical worktree files could skew the run | **Non-issue** — `defaults.yaml` and `profiles.yaml` load from `pluginRoot`, not `repoRoot`; the copied `review.yaml` carries `materialized_at` so `assertMaterialized` passes; a missing project profile surfaces in `errors` and is caught by Step 4 sub-step 3 |

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

### SA-1 — warning — unpinned project root

- **Location:** Procedure Step 4, sub-step 4
- **Finding:** Sub-steps 1-3 are explicitly scoped to the scratch worktree, but sub-step 4 does not
  pin the working directory / project root of the `/adev:review-specs` run. The skill renders each
  pack via `renderPack(..., { repoRoot, targetSpecPath })` and `loadReviewConfig` reads `review.yaml`
  from the run's `repoRoot`. A run launched from the main checkout with only `--spec` pointing into
  the worktree would load the current registry (fine) but render the pack from CURRENT sources
  against a historical spec — silently, with an empty `errors` array, which also defeats Step 3's
  glob assertion ("in the worktree being reviewed").
- **Recommendation:** State in sub-step 4 that the run's project root is the scratch worktree, and
  record the resolved project root per run alongside the glob check.

### SA-2 — warning — INCONCLUSIVE has no successor

- **Location:** Postconditions 4 and 5
- **Finding:** PC5 states "the initiative's next step follows from it" and enumerates only two
  branches. INCONCLUSIVE — now reachable two ways (denominator < 3, scorable runs < 3) — is defined
  as "neither unblocks nor stops Phase 2" with no named successor action, and the charter gates
  Phase 2 on "only if Phase 1 passes", so the state leaves the evidence track parked with no owner.
- **Recommendation:** One clause naming the follow-up — widen the id set and re-run, or escalate the
  mapping to a human decision — so PC5's promise holds for all three terminal states.

### SA-3 — suggestion — plugin currency not checkable

- **Location:** Step 4 preamble
- **Finding:** "the installed plugin must be the CURRENT version" is stated but not made checkable.
  `getPluginRoot()` resolves from the library's own location, so invoking the worktree's own
  `cli/index.mjs` rather than the `adev` on PATH would silently make `templates/` historical.
- **Recommendation:** Record `adev --version` or the resolved plugin root per run.

**No security findings** — reviewers run `execute: deny`; the pack denylist already excludes
`profiles.yaml`, `.env*` and keys; no new trust boundary.

**No consistency findings** — PC4's INCONCLUSIVE refines rather than contradicts the charter's exit
condition, and the spec's `mergeReviewers` correction is more accurate than the charter's Phase 1
prose.

Acceptance criteria are mechanically checkable by a third party, with the single gap named in SA-1.

---

## Summary

**Total findings:** 3 (0 blockers, 2 warnings, 1 suggestion)

**Action required:** None blocking. The spec may proceed to `/adev:plan`. Both warnings describe
silent-failure modes in the same family as the two prior blockers — an unpinned project root and an
unowned terminal state — and are cheap to close in a revision 4 if the operator prefers to eliminate
them before the experiment runs.
