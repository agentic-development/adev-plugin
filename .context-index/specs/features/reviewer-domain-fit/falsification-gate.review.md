---
spec: .context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md
charter: reviewer-domain-fit
date: 2026-08-18
verdict: BLOCK
tier: quick
last-reviewed-revision: 1
file-sha: 694581bf6e5ef2ae620071a9198a3247556f0f39496ab9ab90c412cd1821f688
---

# Architecture Review: falsification-gate

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/reviewer-domain-fit/falsification-gate.spec.md`
> **Charter:** `.context-index/specs/features/reviewer-domain-fit/charter.md`
> **Verdict:** BLOCK
> **Rigor tier:** quick (explicit `--tier quick`; overrode `risk_level: medium` → `review_mode: full`)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

Quick tier dispatches one synthesized reviewer covering the structural, security and
consistency lenses in a single pass, in place of the three registry specialists.

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** FAIL

### SA-1 — blocker — procedure-contradiction

- **blocker_id:** `quick-synthesized-reviewer:procedure-contradiction:7e350d4b`
- **section_anchor:** `Procedure/Step 4: Run the review against each mapped spec at its pre-fix revision`
- **Location:** Procedure Step 4, Idempotency
- **Finding:** Step 4 runs `/adev:review-specs` in a scratch worktree checked out at the pre-fix
  commit, and Idempotency reinforces that reading. But the reviewer under test is declared in Step 3
  in the CURRENT branch's `.context-index/governance/review.yaml`, and `loadReviewConfig` reads the
  registry from the project root of the run (`lib/governance/review-config.mjs:79,108`). In a
  worktree at a historical commit that is the HISTORICAL `review.yaml`, which carries no
  `referent-integrity` entry and no `prompts/referent-integrity.md`. Every pre-fix commit predates
  the most recent `review.yaml` change (`a25971e2`, 2026-08-16), so as written the procedure scores
  five runs of the old three-reviewer panel and yields a null result indistinguishable from a
  negative gate. The two sections are also inconsistent about scope: "materialise the pre-fix *spec
  text*" (spec-only) versus "worktree *at that commit*" (whole tree).
- **Recommendation:** State explicitly what is historical (the spec text under review) and what is
  current (reviewer registry, prompt file, context pack, plugin). If a worktree is used, require the
  registry and prompt to be copied into it before the run, and add an acceptance criterion that each
  preserved `.review.md` names `referent-integrity` among the dispatched reviewers.

### SA-2 — warning — threshold-floor

- **Location:** Postcondition 4
- **Finding:** `ceil(0.6 × denominator)` is arithmetically unambiguous (5 → 3, matching "3 of 5"),
  and fixing the denominator before scoring does block post-hoc drift. What it does not bound is the
  FLOOR: with two mappings the bar is 2, with one it is 1, so the gate can be "met" on a single run.
  Because Step 1's `UNMAPPED` classification sets the denominator, weakening happens upstream of the
  guard rather than after it.
- **Recommendation:** Name a minimum viable denominator — below 3 mapped ids the experiment is
  inconclusive and neither unblocks nor stops Phase 2 — and require the mapping table to be
  committed before Step 4 begins.

### CON-1 — warning — contract

- **Location:** Postcondition 1, Step 3
- **Finding:** Step 3 lists the entry fields (`id`, `dispatch`, `profile`, `prompt`, `severity_cap`)
  but omits `context_pack`, while Postcondition 1 requires "a hand-written context pack." An entry
  without `context_pack` silently inherits `base`; an entry naming a pack not declared under
  `context_packs:` in the same `review.yaml` produces a load error and a non-empty `errors` array —
  which Step 3 itself treats as aborting the panel. Since context reachability is precisely the
  hypothesis under falsification, an accidental fall-through to `base` (whose globs resolve only
  under `.context-index/`) would confound the result.
- **Recommendation:** Have Step 3 name the `context_pack` key and require the pack body to be
  declared in `review.yaml`'s `context_packs:` map; add its identity to the acceptance criteria.

### CON-2 — suggestion — rationale

- **Location:** Postcondition 1
- **Finding:** "`mergeReviewers` honours governance-over-domain on matching `id`" is a non-sequitur
  for a NEW id — no domain entry collides. The real reason no plugin change is needed is that
  `review.yaml` is the whole effective reviewer set and the `prompt:` path resolves relative to
  `.context-index/`.
- **Recommendation:** Restate; the current wording invites a reader to look for a merge behaviour
  that is not in play.

**Checked and found sound:** the five ids are consistently treated as issue ids with Step 1 as the
resolution indirection and `UNMAPPED` handled explicitly; the `prompts/…` relative path matches the
documented resolver convention; `adev governance reviewers --json`,
`adev heuristics signature --origin review-specs --blocker-id` and the `reviewer-reasoning` profile
all exist; the hash-computation prohibition in Step 2 correctly reflects `execute: deny`; lifecycle
writes resolve under the run's own project root, so the Rollback claim that worktree deletion
suffices holds.

**Security lens:** no auth, secret, injection or trust-boundary surface — the experiment is
read-only plus two `.context-index/` files. No findings.

---

## Summary

**Total findings:** 4 (1 blocker, 2 warnings, 1 suggestion)

**Action required:** The blocker is self-invalidating rather than cosmetic: as specified, the
experiment cannot dispatch the reviewer it exists to test, and would report that failure as a
negative gate result. Revise Step 4 and Idempotency to separate historical spec text from the
current reviewer registry, then re-review.
