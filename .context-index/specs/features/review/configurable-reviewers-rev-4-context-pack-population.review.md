---
spec: .context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.spec.md
charter: .context-index/specs/features/review/charter.md
verdict: PASS_WITH_NOTES
rigor-tier: quick
reviewed: 2026-08-15
last-reviewed-revision: 2
file-sha: 4733b7e487c7e8602d5bf1b1cc28428711f3720a254e8606fb13860d54dc7e48
---

# Architecture Review: configurable-reviewers-rev-4-context-pack-population.spec

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/review/configurable-reviewers-rev-4-context-pack-population.spec.md
> **Charter:** .context-index/specs/features/review/charter.md
> **Rigor tier:** quick (explicit `--tier quick`)
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Reviewer | subagent | reviewer-capable | plugin:review-specs/quick-synthesized-reviewer-prompt.md |

Quick tier dispatches a single synthesized reviewer covering the structural,
security, and consistency lenses in one pass; the three bundled specialists
(`structural-architect`, `security-reviewer`, `consistency-analyzer`) are not
dispatched. Registry load emitted no warnings; domain resolved to `software`
(source level: `default`). Module heuristics for `review` were injected. No
cross-repo `depends-on` references are present, so Step 2b was skipped.

## Disposition of revision 1 findings

Revision 2 was reviewed against the prior `.review.md`. All five prior findings
are addressed:

- **SEC-1 (blocker, `quick-synthesized-reviewer:incomplete-control-scope:bc5b70e4`) — CLOSED.**
  Behavior 22i now specifies the anti-forgery control at the shared `specBlock`
  construction site (`lib/governance/dispatch-shape.mjs:90`, confirmed to be the
  single site feeding all three stages) and names `subagent`, `runner`, and
  `adapter` explicitly. Behavior 22j extends the provenance preamble to the
  empty-pack `adapter` stage. Two acceptance criteria assert zero matches of the
  legacy `## Target Spec:` delimiter across every returned dispatch.
- **SA-1 (warning) — addressed** by the 22o `base` / `review-base` pack split.
  (A residual, narrower concern is re-raised as SA-1 below.)
- **SEC-2 (warning) — addressed** by 22p's enumeration of governance files plus
  22p-bis's skip-with-warning vs hard-error severity split.
- **CON-1 (warning) — addressed** by 22q's stated reconciliation direction
  ("trim the prompt to what the pack can deliver").
- **CON-2 (suggestion) — addressed**; `depends-on` now names
  `execution-profiles.spec.md`, `source-manifest` was extended, and the Tests row
  says "rewrite".

Reviewer verification against the worktree confirmed the spec's code claims:
the shared `specBlock` site is genuine, five checks in
`templates/domains/software/validate.yaml` reference `context_pack: base`, and
all `depends-on` paths exist on disk.

## Quick Synthesized Reviewer (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

### SA-1 — warning — §Populated bundled packs, Behavior 22o

**Finding:** The prose says `base` "stays target-agnostic and kept as-is", but
the YAML immediately below changes `base` from `include: []` to two includes
(constitution, platform-context). Those are two different claims. The change is
not inert: all five checks in `templates/domains/software/validate.yaml`
(lines 26, 41, 60, 69, 83) reference `context_pack: base` and would begin
receiving roughly 8 KB of rendered content. The spec's `source-manifest` does
not list `validate.yaml`, so the blast radius on the checks side is unstated.

**Recommendation:** Rewrite the 22o sentence to say `base` stays *target-agnostic*
rather than unchanged, and state explicitly that `base` gains constitution +
platform-context and that this is an intentional, accepted change for check
consumers.

### SEC-1 — warning — §Nonce-fenced sections (anti-forgery), Behaviors 22h / 22i

**Finding:** Neutralization scope does not line up with the threat model.
Behavior 22h triggers only when a body contains *the literal nonce fence token*
and is written against pack file bodies; Behavior 22i, which wraps the target
spec — the one author-controlled artifact — says nothing about neutralizing its
body. Meanwhile an acceptance criterion requires that a target spec containing a
literal `<<<ADEV-PACK-` line (no nonce) produce "fence collision neutralized +
warning", which 22h as written does not mandate. As specified, an implementer
can satisfy 22h while leaving the target-spec path unscanned.

**Recommendation:** State that neutralization applies to every body inserted into
a fence, target spec included, and pin the detection predicate (prefix
`<<<ADEV-PACK-` / `<<<END-ADEV-PACK-` regardless of nonce match) so the behavior
and the acceptance criterion agree.

### CON-1 — warning — §Populated bundled packs, Behavior 22q

**Finding:** 22q keys on a section literally named `## Input — You will receive:`.
The actual bundled prompt uses `## Input` as the heading with "You will receive:"
as body text on the next line, and it is the only bundled prompt with such a
section at all (`structural-architect-prompt.md` and `security-reviewer-prompt.md`
have none). A test grepping the heading string as written matches nothing and
passes vacuously — defeating the one behavior whose enforcement is test-based.

**Recommendation:** Reference the heading as it exists (`## Input`) or state the
exact matching rule, and note that the assertion is currently scoped to
`consistency-analyzer-prompt.md` only.

### CON-2 — suggestion — §Populated bundled packs, Behavior 22p

**Finding:** The 22p table names `architecture` and `consistency` packs but only
`security` is shown in YAML; the other two are left to inference. A short YAML
block for all three removes ambiguity about whether they `extends: review-base`
and what their include titles are — titles matter for the 22q mapping test.

---

## Summary

**Total findings:** 4 (0 blockers, 3 warnings, 1 suggestion)

**Action required:** None blocking. The spec is ready for planning. The three
warnings are worth folding in — SEC-1 and CON-1 in particular describe places
where an acceptance criterion could pass without the intended control existing —
but they do not gate `/adev:plan`.

No `spec-to-plan` approver role is configured in `.context-index/governance/gates.yaml`
(`transitions: {}`), so no additional human approval gate applies beyond the verdict.
