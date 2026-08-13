---
last-reviewed-revision: 2
file-sha: ca28ca210b23e1c7fa0bfbea811a1ef720e3577c1ac97091af0cc120934b6612
---

# Architecture Review: tiered-gates-default

> **Date:** 2026-08-13
> **Spec:** `.context-index/specs/features/unified-gates/tiered-gates-default.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/unified-gates/charter.md` (revision 4)
> **Rigor tier:** `quick` (explicit `--tier quick`; overrides `risk-policies.yaml` `medium.review_mode: full`)
> **Verdict:** PASS_WITH_NOTES

This is a **re-review**. Revision 1 was BLOCKed with two blockers; revision 2 was
produced by `/adev:specify --revise`. The review was scoped primarily to whether
revision 2 closes those blockers.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| quick-synthesized-reviewer | Quick Synthesized Review | subagent | `general-purpose` harness agent with read-only constraints stated in-prompt (NOT a `resolveProfile`-enforced `reviewer-capable` profile — recorded honestly; no profile-level tool restriction was applied) | `plugin:review-specs/quick-synthesized-reviewer-prompt.md`, resolved against `<ADEV_ROOT>=/Users/dpavancini/Development/adev-wave2-554/skills/review-specs/` (the worktree copy, not the plugin cache) |

Quick tier: the three bundled specialists (structural-architect, security-reviewer,
consistency-analyzer) were **not** dispatched. One synthesized reviewer covered all
three lenses in a single pass, per `graduated-rigor-tiers.spec.md`. The gate was not
skipped. `adev domain load-reviewers --module unified-gates` resolved domain
`software` (source level `default`) with zero warnings; `.context-index/governance/review.yaml`
declares `reviewers: []`, so no overlay applied.

Module heuristics were retrieved (`adev heuristics retrieve --module unified-gates`)
and included in the reviewer's context pack. `adev skill-ext load --skill review-specs`
returned `__NONE__`.

## Quick Synthesized Review (quick-synthesized-reviewer)

**Verdict:** PASS_WITH_NOTES

### Prior blocker disposition — both ADDRESSED

| blocker_id | Status | Evidence |
|---|---|---|
| `quick-synthesized-reviewer:unreachable-postcondition:38c90edf` | **ADDRESSED** | Behavior 9 routes `/adev:implement` Step 2-post through `adev domain load-gates --module <slug>` — verified a real verb (`lib/cli/domain.mjs:221`, `docs/cli-reference.md:465`), and the same source `skills/validate/SKILL.md:99` already uses. A task-map row for `skills/implement/SKILL.md`, an acceptance criterion, the new "Defect D" root-cause entry, and a rewritten Postconditions block all now exist. |
| `quick-synthesized-reviewer:unguarded-executor-path:1377c7ba` | **ADDRESSED** | Behavior 10 mandates a non-empty/argv guard at Step 2-post, mirroring a guard that genuinely exists at `skills/implement/SKILL.md:556` — *"For each gate with `kind: deterministic` and non-empty `command`: run it"* / `:557` *"…or no `command` → log 'Skipped'"*. A matching Error-Cases row and acceptance criterion were added. |

**Mechanical feasibility of behavior 9** (the open question flagged for planning in
revision 1's `mergeGates` drop-fields note): `mergeGates` returns
`{id, command, description?, severity?, tier?}` — it drops `triggers`, but it
**preserves `tier`** (`lib/domains/merge-gates.mjs:41-46`), and Step 2-post's filter is
tier-based, not trigger-based (`skills/implement/SKILL.md:594`: "Filter gates where
`tier: integration`"). Behavior 9 is therefore implementable as written; the dropped
`triggers` field does not break it.

### SA-5 — warning (new in revision 2)

- **Location:** behavior 9; behaviors 4 and 5; interaction with `skills/implement/SKILL.md:599`

**Finding.** Step 2-post's existing prose states: *"All commands within the integration
tier share the tier's severity (default: `error`). Individual commands do not have their
own severity."* Behavior 9 now feeds Step 2-post a merged list in which every gate carries
its own `severity` (preserved by `validateGate`), and behaviors 4/5 mandate
`severity: error` on each starter/overlay integration gate. The spec does not say which
model wins after the rewire — tier-uniform severity, or per-gate severity from the merged
list. The implementer editing Step 2-post is left to decide.

**Recommendation.** State in behavior 9 (or a new behavior) whether Step 2-post honors
per-gate `severity` from the merged list or retains the tier-uniform model, so the
fail-fast / WARN semantics of Step 2-post are unambiguous.

### SA-3 — warning (restated from revision 1; unaddressed)

- **Location:** behavior 7; Acceptance Criteria

Confirmed still open: `lib/gates/doctor.mjs:1011 loadGates` reads
`.context-index/governance/gates.yaml` only and never calls `mergeGates`, so the
fresh-scaffold doctor criterion never analyses the new starter integration gate.
Behavior 7's enumerated expected fresh-scaffold warnings still omit `empty-command`,
the direct consequence of the `""` sentinel this spec introduces.

**Recommendation** (unchanged): restate the criterion against a scaffold seeded per
behavior 8 (or against the merged gate set), and add `empty-command` to the enumerated
expected warnings for the unseeded case.

### SA-4 — warning (restated from revision 1; unaddressed)

- **Location:** behavior 6; Postconditions

Confirmed still open: `doctor.mjs:562-567 scriptNameOf` returns the token immediately
after `run` with no `-`-prefix skip, so `npm run --if-present test:integration` yields
`"--if-present"` and `resolveCommandChain` never follows into
`scripts["test:integration"]`. The one-hop chain analysis — gate-doctor's original
motivating case — is defeated by the exact idiom this spec makes the default.

**Recommendation** (unchanged): add a task teaching `scriptNameOf` to skip `-`-prefixed
tokens after `run`, or downgrade the postcondition and record the blind spot as a Known
Limitation.

### CON-2 — warning (restated from revision 1; unaddressed)

- **Location:** "The default this spec chooses, and why"

An error-severity gate that exits 0 because `test:integration` is undefined reports
**PASS**, in tension with the charter's Transparency attribute (*"No silent passes for
unchecked items"*). Behavior 10 now gives skipped-with-reason rendering for *unwired*
gates, but nothing distinguishes a `--if-present` no-op from a genuine pass.

### CON-1 — addressed in revision 2

Revision 2 corrects the citation: it attributes `QUALITY_GATE_COMMAND_SHELL` to the
`validate.yaml` quality-gate runner, cites Recipe 3 (confirmed at `docs/governance.md:377`,
"argv only"), records that `docs/governance.md` carries no `gates.yaml` schema section at
all, and scopes the Docs task-map row to *adding* that section rather than
cross-referencing the existing one.

### SA-6 — suggestion

Behavior 1 requires the template's `integration-test` entry to declare
`triggers: [post-implement]`, but no consumer on the path this spec chooses observes it —
`mergeGates` drops `triggers`, and Step 2-post filters on `tier`. Harmless (the field was
already declarative before this spec), but worth a one-line note so planning does not
treat it as enforced.

### Wording nit (not a finding)

Behavior 10's rationale says it covers "the one consumer where `mergeGates`' own drop
behavior does not apply" — no longer strictly true once behavior 9 routes Step 2-post
through the merged list. The guard remains load-bearing for `command: []` (truthy, an
array, so it survives `validateGate` carrying an empty argv list — reconfirmed), which is
exactly what the Error-Cases row claims.

---

## Scope Notes

Per the invocation's scope guardrails, the following were **not** raised as findings:
the `software` domain starter's pre-existing hardcoded npm (spec Open Question 2) and
this repo's own string-form `gates.yaml` `test` gate (Open Question 1). Both are
pre-existing repo conditions that the spec documents as accepted and routes to a human
via Open Questions — the correct disposition for a defaults-and-templates change.

---

## Summary

**Total findings:** 5 (0 blockers, 4 warnings, 1 suggestion)

**Action required:** None blocking. The spec is ready for planning. Run
`/adev:plan --spec .context-index/specs/features/unified-gates/tiered-gates-default.spec.md`
to proceed. SA-5 is the most useful of the warnings to resolve during planning — it is a
one-sentence disambiguation that the implementer will otherwise have to guess at. SA-3,
SA-4, and CON-2 are carried forward from revision 1 as accepted notes; each is a scoping
or follow-up question rather than a defect in the chosen default.

**Blocker convergence:** both revision-1 blockers
(`quick-synthesized-reviewer:unreachable-postcondition:38c90edf`,
`quick-synthesized-reviewer:unguarded-executor-path:1377c7ba`) are **addressed**. Zero
persistent blockers, zero new blockers. No `.blockers.md` sidecar was written (sidecars
are BLOCK-only).

**Transition note:** `.context-index/governance/gates.yaml` defines no `spec-to-plan`
transition, so no `approver_role` applies to this review.

**Lifecycle-log mapping note.** The lifecycle event enum has no `BLOCK` member
(`PASS | PASS_WITH_NOTES | FAIL`); this review's `PASS_WITH_NOTES` maps directly and
needs no translation. An `UNKNOWN_REVIEWER_DEFAULTED` advisory on the `reviewer_report`
event is expected — `quick-synthesized-reviewer` is not declared in the `software`
domain's `reviewers.yaml`, so its event severity defaults to `warning`. Event severity
does not feed the consolidated verdict.
