---
spec: .context-index/specs/cross-cutting/spec-behavior-ids.spec.md
date: 2026-08-15
verdict: PASS_WITH_NOTES
rigor-tier: quick
last-reviewed-revision: 2
file-sha: 793793301e51d426d65d68e223b8e9d65def270252f43c5a7db518c984c4d6e8
---

# Architecture Review: spec-behavior-ids

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/cross-cutting/spec-behavior-ids.spec.md`
> **Charter:** (none — cross-cutting spec)
> **Rigor tier:** quick (explicit `--tier quick`; risk_level `medium` would have resolved `full`)
> **Revision reviewed:** 2 (re-review after rev-1 BLOCK)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Review | subagent | reviewer-capable | `plugin:review-specs/quick-synthesized-reviewer-prompt.md` |

Registry note: `.context-index/governance/review.yaml` declares `reviewers: []`; the
`quick` tier bypasses the registry loop by design and dispatches the single bundled
synthesized reviewer.

## Prior-Round Disposition (revision 1 → revision 2)

| rev-1 blocker | Anchor | Status at rev 2 |
|---|---|---|
| `quick-synthesized-reviewer:incomplete-authoring-surface:7994e9c5` | `integration-points` | **Resolved.** Integration Point 1 now enumerates all five mode-scoped `Step 4` sections and which delegate; Task 3 and a matching acceptance criterion cover the two non-delegating sites (`--extract`, `--from-diff`). Verified against `skills/specify/SKILL.md` lines 346 / 586 / 809 / 882. |
| `quick-synthesized-reviewer:internal-contradiction:47a4a4ff` | `postconditions` | **Resolved.** Postcondition 4 deleted; BEH-6 retired and tombstoned in `retired-behavior-ids`; the reviewer-prompt work is now a disclosed prose follow-up in Out of Scope with its consequence stated. The tombstone is internally coherent and is the spec's own first exercise of BEH-4. |

## Quick Synthesized Review (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

### SA-1 — `warning` — Preconditions / Integration Points / Actionable Task Map

**Finding.** Precondition 1 binds the contract to `--amend`, but `--amend` appears in no
row of the Integration Point 1 authoring-site table, has no task, and has no acceptance
criterion. `adev specify amend` renders its amendment body **in code**
(`lib/specify-amend.mjs`, the hardcoded `## Behavioral Delta` section) — it resolves no
template and runs no `Step 4` block, so neither the template edits (Task 4) nor the
SKILL.md edits (Tasks 1-3) reach it. Precondition 2 ("the template resolved for the
spec's `kind:` carries a Behaviors section") arguably excludes amend already, since amend
resolves no template, but the spec never says so — and Postcondition 1 ("every behavior in
a spec authored or revised after this lands") stays formally falsifiable against
amendment artifacts.

**Recommendation.** One sentence resolving it either way: drop `--amend` from the
Precondition 1 flag list, or add it to Out of Scope naming `Behavioral Delta` as the
reason. Do not leave a bound flag with zero covering tasks.

### SA-2 — `warning` — Integration Points, item 1 (table row 5)

**Finding.** The table cites `Step 7: Write Behavioral Contract and Spec` (`--refactor`)
as delegating, quoting *"Same as a standard Live Spec."* That string lives in
`templates/spec-template.refactor.md`, **not** in `skills/specify/SKILL.md`. Step 7 of
the skill references standard-mode Step 3.5 and Step 5 only — never Step 4, where the
convention is to be stated. Refactor-mode coverage therefore rests entirely on the
refactor template's placeholder shape, not on delegation. The row's conclusion is still
reachable; its stated basis is wrong.

**Recommendation.** Correct the row to attribute refactor coverage to the template, or
add refactor `Step 7` to Task 3's cross-reference list.

### CON-1 — `warning` — Problem (¶2) and Out of Scope (reviewer-prompt deferral)

**Finding.** The spec asserts that all four reviewer prompts document `behaviors-3` as the
example anchor and that the follow-up is a "four-line edit." Only
`structural-architect-prompt.md` and `security-reviewer-prompt.md` carry the `behaviors-3`
example. `consistency-analyzer-prompt.md` and `quick-synthesized-reviewer-prompt.md`
define `section_anchor` with **no example at all** — those two need an example *added*,
not edited.

**Recommendation.** Correct the citation in Problem and restate the follow-up as "two
edits plus two additions." Not blocking, but the follow-up's scope estimate is what makes
the deferral defensible.

### Verified accurate — no finding

- **Template survey table is exact.** `spec-template.behavioral.md` and
  `spec-template.refactor.md` carry `1. 2. 3.` ordinals; `domains/software/spec-template.md`
  is a bare `## Behaviors` heading plus comment with no placeholder — Task 4's
  "add, not convert" note is correct. The four Behaviors-less templates are correctly
  characterized (`artifact` explicitly omits them).
- **Five mode-scoped `Step 4` sections confirmed** in `skills/specify/SKILL.md`, plus the
  refactor `Step 7`. `--extract` ("Behaviors are derived from code paths") and
  `--from-diff` ("Behaviors map to changes in the diff") do author independently — Task 3
  and its criterion correctly close revision 1's blocker.
- **Integration Point 3 is accurate.** `parseBlockersSidecar` in `lib/specify-revise.mjs`
  pairs `blocker_id` with `section_anchor` by regex and never resolves the anchor against
  the spec body. "No library change" holds.
- **BEH-6 tombstone is internally coherent.** `retired-behavior-ids: BEH-6` is present,
  BEH-7 is live, and the allocation rule (highest-ever + 1) is satisfied. The spec
  demonstrates its own convention.
- **Security:** no surface introduced. No auth, secret-handling, input-validation, or
  trust-boundary change — the deliverable is markdown authoring guidance plus template
  shape.
- **Consistency:** no conflict with ADR-0019 or `check-id-enum.spec.md`; those govern
  code-emitted check IDs, whereas this convention is authoring-time only. The
  no-runtime-validator choice is justified under constitution principle 2 ("Skills are
  primarily markdown") and disclosed in Out of Scope.

---

## Summary

**Total findings:** 3 (0 blockers, 3 warnings, 0 suggestions)

**Action required:** None blocking. Both revision-1 blockers are resolved and independently
verified against the repository. The three warnings are accuracy corrections to prose that
does not change the deliverable's shape — SA-1 (unbound `--amend` flag in Preconditions),
SA-2 (misattributed refactor-mode delegation basis), CON-1 (reviewer-prompt follow-up
scope is 2 edits + 2 additions, not 4 edits). They may be folded into the plan or fixed in
a later revision. The spec is ready for planning: run
`/adev:plan --spec .context-index/specs/cross-cutting/spec-behavior-ids.spec.md`.

## Post-Review Addendum

After this report was written, the spec was amended in place (same `revision: 2`, no
revision bump — these were warnings, not blockers, so no `--revise` round was required).
All three warnings are now resolved in the spec body:

| Finding | Resolution in the spec |
|---|---|
| SA-1 | Precondition 1 now names only the flags that resolve a template and run an authoring block, and states **`--amend` is excluded**. A new Out of Scope bullet, **`--amend` artifacts**, gives the reason (`lib/specify-amend.mjs` renders `## Behavioral Delta` in code) and states that Postcondition 1 does not range over amendment artifacts. |
| SA-2 | Integration Point 1 table row 5 (`--refactor`) is corrected to **No**, with the real basis recorded: Step 7 references standard-mode Step 3.5 and Step 5 only, and refactor coverage comes from the refactor template's placeholder shape (Task 4), not from delegation. |
| CON-1 | The Out of Scope deferral now splits the four reviewer prompts into two that need the `behaviors-3` example **edited** and two that need an example **added**, and the consequence paragraph restates the follow-up as "two edits plus two additions." |

The `file-sha` in this report's frontmatter is stamped against the amended spec, so
`/adev:plan` will not report drift. The consolidated verdict is unchanged: PASS_WITH_NOTES,
0 blockers.

**Governance footer:** `.context-index/governance/gates.yaml` declares `transitions: {}` —
no `spec-to-plan` approver role is configured. `risk-policies.yaml` sets
`medium.require_review: true` (satisfied). Issue-board writes were suppressed for this
build step.
