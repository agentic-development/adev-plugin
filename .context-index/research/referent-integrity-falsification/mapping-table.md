# Mapping Table: Five Closed Defects → Governing Specs and Pre-Fix Commits

Task 1 of the `reviewer-domain-fit` Falsification Gate (Phase 1, Postcondition 2).
For each of `{he2, r5sc, zx5, rftq, ysqd}` this identifies the Live Spec that
governed the defective behaviour, the pre-fix commit (that spec's revision at
the point the codebase still exhibited the defect — computed as the fixing
commit's first parent), and the fixing commit. `br` was unavailable in this
worktree (sync-merge state could not be inspected), so issue text came from
`.beads/issues.jsonl` directly.

## Table

| Id | Spec | Pre-fix SHA | Fixing commit | Status |
|----|------|-------------|----------------|--------|
| he2 | `.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md` | `d5d2d554` | `df11ba5d` | MAPPED |
| r5sc | `.context-index/specs/features/review/configurable-reviewers.spec.md` | `104a06e6` | `0476a7bc`, `8d8d5c5a` | MAPPED |
| zx5 | `.context-index/specs/features/cli-driver-surface/driver-substrate.spec.md` | `c0a43569` | `3f28515c` | MAPPED |
| rftq | — | — | — | UNMAPPED (reason: defect lived only in `skills/eval/SKILL.md` prose; no Live Spec formalizes the Layer 3 default-rubric contract) |
| ysqd | `.context-index/specs/cross-cutting/review-block-auto-retry.spec.md` | `684a677b` | `11b179d7` | MAPPED |

## Reasoning per id

### he2 — MAPPED

Issue (`external_ref: issue-568`): "/adev:build drops --tier: work and route pass
`--tier quick` but build has no `--tier` argument." Close reason names "PR #212
(build --tier propagation, merged)" without a SHA, so the fixing commit was
located via `git log --grep`, which returned nothing for the bare id "he2"
(closed issues in this repo don't reliably carry the short id in commit trailers)
— PR #212 was located instead by searching commit subjects for "212", landing on
merge commit `df11ba5d` ("Merge pull request #212 from
agentic-development/fix/build-tier-arg").

This is the cleanest of the five: `df11ba5d` itself edits
`.context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md`, adding a row
"`build` | Low | Accept `--tier <full|quick>`; propagate it into the Step 1
review-specs and Step 5 validate subagent dispatches... Fixed by issue-568" —
an explicit self-reference to this issue's external_ref. The diff between the
pre-fix revision (`d5d2d554`, `df11ba5d`'s first parent) and `df11ba5d` shows the
spec's `affects:` frontmatter list and source-manifest gaining `build`, plus the
new table row and a new checked acceptance-criterion item. At `d5d2d554` the spec
already specified `--tier` propagation for `review-specs`, `validate`, `route`
and `work` but said nothing about `build` — exactly the referent gap (a spec
implying build-wide `--tier` support without `build` itself being in scope) that
the defect exploited. PR #212 comprises two commits merged into `df11ba5d`
(`d73b2b2b` skill fix, `980d3646` provider-mirror sync); the merge commit is
recorded as the fixing commit since it is what closes the gap in the spec file
itself.

### r5sc — MAPPED

Issue (`external_ref: issue-584`): "Prose/CLI contract mismatch: review-specs
SKILL.md emits `--verdict BLOCK` but `adev report --type step` accepts only
PASS|PASS_WITH_NOTES|FAIL." The close reason names both fixing commits directly:
"Fixed in `0476a7bc` and `8d8d5c5a`." They are direct parent/child commits
(`8d8d5c5a`'s parent is `0476a7bc`), landed ten minutes apart, and jointly
resolve one contradiction: `0476a7bc` widens `lib/cli/report.mjs`'s
`VALID_VERDICTS` to accept `BLOCK` for `--type step`/`--type reviewer` and fixes
a latent aggregation bug in `lib/lifecycle-state.mjs` that silently projected an
unmatched `BLOCK` report as `PASS`; `8d8d5c5a` then fixes the skill prose
contradiction that caused agents to emit `BLOCK` per-reviewer in the first
place.

The governing spec is `configurable-reviewers.spec.md`: its Verdict
Consolidation section (Behaviors 37-38, unchanged by either fixing commit —
confirmed by reading the pre-fix revision directly) already specified BLOCK as
the CONSOLIDATED verdict (`>=1 blocker`), computed from per-reviewer FAIL
reports, not something an individual reviewer emits. `8d8d5c5a`'s own commit
message cites "configurable-reviewers.spec.md behaviors 37-38 settle it" as the
authority for the fix, and its `Spec:` trailer names this same file. At the
pre-fix commit, a referent-integrity review of this spec against the codebase
should have caught two unresolvable referents: the spec's Verdict Consolidation
step implies "`adev report --type step --verdict BLOCK`" is a real, accepted
invocation, but `lib/cli/report.mjs`'s enum did not include it (the `0476a7bc`
half); and `skills/review-specs/SKILL.md` line 244 told a per-reviewer template
to emit a verdict (`BLOCK`) the spec never assigns to an individual reviewer
(the `8d8d5c5a` half). Pre-fix SHA (`104a06e6`) is `0476a7bc`'s first parent —
the commit before either half of the fix landed — verified as an ancestor of
both `0476a7bc` and `8d8d5c5a` (transitively, since `0476a7bc` is `8d8d5c5a`'s
direct parent).

### zx5 — MAPPED

Issue (`external_ref: issue-565`): "Fix two no-op gate mappings in
`lib/cli/gate.mjs`: brainstorm and retro map to steps absent from `STEP_ORDER`,
gate passes unconditionally." The close reason ("Verified done 2026-08-14: ...")
names no SHA, so the fixing commit was located with
`git log --all --oneline -S "isGatedStep" -- lib/cli/gate.mjs`, which returned
exactly one commit: `3f28515c`, "fix(gate): remove two mappings that made gates
pass unconditionally" — a title and description matching the issue verbatim
(same `SKILL_STEP_MAP` entries, same `priorStepOf` off-by-a-missing-index
mechanism, same new `isGatedStep` guard the close reason describes).

The governing spec is `driver-substrate.spec.md`
(`.context-index/specs/features/cli-driver-surface/`), which `3f28515c` itself
names in its `Spec:` trailer and whose `source-manifest` lists
`lib/cli/gate.mjs` directly. The spec's Behaviors 4-5 define `adev gate require
--skill <skill-name>` as loading lifecycle state and calling
`requireGate(state, <step-derived-from-skill>, ...)` — implicitly presupposing
that every dispatchable `--skill` value resolves to a real, gated
`STEP_ORDER` entry. At the pre-fix revision the `brainstorm` and `retro`
mappings violated that presupposition (they resolved to steps absent from
`STEP_ORDER`, so `requireGate` always saw "no prior step" and passed
unconditionally) — an unresolvable referent between what the spec's CLI-surface
behavior implies and what the mapping table actually supported. Pre-fix SHA
(`c0a43569`) is `3f28515c`'s first parent, confirmed as an ancestor.

### rftq — UNMAPPED

Issue (`external_ref: issue-6cmg5q`): "/adev:eval references a default rubric
file that does not exist; Layer 3 is prose-only." The fixing commit was found
directly: `git log --all --oneline --diff-filter=A -- skills/eval/default-rubric.yaml`
returns `4cc0e397`, "feat(eval): ship the default rubric and make Layer 3
binary," whose body opens with "issue-6cmg5q" and whose diff adds
`skills/eval/default-rubric.yaml` plus rewrites `skills/eval/SKILL.md`'s Layer 3
section — an unambiguous match. (A second commit, `649b5232`, carries the
identical message but is not an ancestor of `HEAD`, so it was disregarded as a
diverged/rebased duplicate.)

No governing Live Spec was found for the actual defect, and this was checked
directly rather than assumed. `4cc0e397`'s own `Spec:` trailer names
`.context-index/specs/features/validation/configurable-checks.spec.md`, but
reading that file's full content shows it specifies `/adev:validate`'s
check-registry loading (`loadValidateConfig`, `governance/validate.yaml`
overlay, `kind: deterministic-check` / `quality-gate` / `subagent-review`
dispatch) — it contains no mention of `/adev:eval`, `skills/eval/SKILL.md`,
"rubric," or "Layer 3" anywhere in its text. It governs a parallel but distinct
subsystem (validate's configurable checks, not eval's rubric), so treating it as
the governing spec for this defect would be exactly the "loosely related spec"
substitution the task instructions rule out. A broader search — grepping every
`*.spec.md` for `skills/eval/SKILL.md`, "rubric," "default-rubric," and "Layer
3" — surfaced only `eval-comparison-harness.spec.md` (a different rubric system
entirely: it scores `plain-claude` vs `adev-built` branches of external eval
project repos via `tests/evals/comparison/rubrics/<domain>.yaml`, unrelated to
`/adev:eval`'s own Layer 3 default) and three unrelated specs that mention
`skills/eval/SKILL.md` only in passing dependency lists (`model-routing.spec.md`,
`universal-skill-extensions.spec.md`, `infra-preflight/skill-integration.spec.md`)
without specifying rubric behavior. `/adev:eval`'s Layer 3 rubric-resolution
contract lived only in `skills/eval/SKILL.md` prose at the pre-fix revision, with
no Live Spec formalizing it — the id is recorded `UNMAPPED` rather than pinned to
a spec that does not actually describe the defective behaviour.

### ysqd — MAPPED

Issue (`external_ref: issue-0wh69r`): "Implement Stage-2 review loop is
unbounded (\"Repeat until approved\") while every sibling loop caps at 3." The
close reason names the fixing commit directly: "Fixed in `11b179d7`."

The governing spec is `review-block-auto-retry.spec.md`
(`.context-index/specs/cross-cutting/`), which `11b179d7`'s own `Spec:` trailer
names. That spec's Behaviors define `lib/loop-convergence.mjs`'s convergence
algorithm — partitioning blocker ids across cycles into `addressed` /
`persistent` / `new` sets, and stopping on PASS, `LOOP_BUDGET_EXHAUSTED`,
`LOOP_NO_PROGRESS`, or `LOOP_REGRESSED` — originally written for `/adev:build`'s
review-then-revise loop. `11b179d7`'s own message states the fix explicitly
reuses this machinery ("routed through convergence... Terminal outcomes reuse
build's vocabulary... so one grep finds both loops"): at the pre-fix revision,
`skills/implement/SKILL.md` Step 2g's Stage-2 loop said "Repeat until approved"
without ever calling into this already-specified convergence contract, even
though the spec's stop-condition vocabulary was equally applicable and its
sibling loop (Stage 1) already used it. That is the referent gap: the spec
defines a convergence primitive available to any capped review loop, and
Stage-2 was the one loop in the framework not exercising a referent it should
have. Pre-fix SHA (`684a677b`) is `11b179d7`'s first parent, confirmed as an
ancestor.

## Denominator note

Four of five ids map to a spec (`he2`, `r5sc`, `zx5`, `ysqd`); `rftq` is
`UNMAPPED`. Per Postcondition 4, the denominator for Phase 1 scoring is
therefore **4**, and the bar is `ceil(0.6 × 4) = 3`. This note records the
denominator for Task 4's implementer; it does not itself run or score any
review.
