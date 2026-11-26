---
spec: .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 2
file-sha: 55aab08dcb7263bc9f35b1219bb54bb94601ae300c45349ad110de0b56c8cfd6
reviewed: 2026-11-26
---

# Architecture Review: implement-rigor-ladder

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full (spec `risk_level: high` → `policies.high.review_mode: full`)
> **Diff scope:** not scoped (`no-content-changed`: revision 2 was already committed, so the verb found no difference against the prior committed text and failed open to full-context dispatch)
> **Prior review:** revision 1, BLOCK. Every reviewer was given that report and asked to confirm its own prior blockers.
> **Dispatch note:** prompts were assembled by `adev governance dispatch` (worktree CLI) and delivered to each reviewer as a file reference because of their size (82–329 KB). Content is byte-identical to the `buildReviewerDispatches` output.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast (triggered: score 1) | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension. |

## Revision 1 blockers

All 9 revision 1 blockers (6 distinct problems) were confirmed resolved by the reviewer that raised them: CON-1, CON-2, RI-1, RI-2, WR-1, WR-2, WR-3, BD-1 and TR-1.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, contract, `arguments`).** BEH-11 says `/adev:work` forwards `--tier lite` to review-specs and validate, but the Arguments table's `--tier lite` row omits `/adev:work` (which propagates `--tier` today, `skills/work/SKILL.md:93-94`). The spec also does not say what other `isValidTier` consumers, such as the build step-4 tier-propagation handoff, do with `lite`. Add `/adev:work` to the row, and state map-to-`quick` or reject for each other consumer.
- **CON-2 (warning, contract, `behaviors-7`).** The final pass uses the existing `--base-sha` (diff range; `MISSING_DIFF_RANGE` without it), but the Arguments table lists only `--run-base`, and the spec never says where the final pass reads governance inputs from. Add `--base-sha` to Arguments. State that the final pass takes its diff range from `--base-sha` and its governance inputs from `--run-base`, which is also required there.
- **CON-3 (warning, pattern, `behaviors-4`).** Removing the `batched-task` leg does not address the stacking hazard named in `graduated-review-depth.spec.md`'s scope note (15 dispatches become 6 under collapse, and 2 under both). Acknowledge the stacking in BEH-4 or ADR 0020, and say it is accepted because EV-1 measures it.
- **CON-4 (suggestion).** The Problem section's "Today's default becomes `full`, a reachable `quick` becomes the default" should read "Today's effective default is `full`; `quick` becomes the reachable default".
- **CON-5 (suggestion, module-boundary).** `liteEligible` in `lib/implement/review-depth.mjs` duplicates route's prose "easy" rule (`skills/route/SKILL.md:118`). Add an EV-4 parity test, or name the shared predicate's owning module.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

Every referent the spec names as existing was confirmed at its cited location. New referents are marked new.

- **RI-1 (warning, `acceptance-criteria`).** No executable trailer-presence check exists for the review-provenance amendment to relax: `review-provenance.spec.md:156` states the rule as prose only. So the BEH-6 criterion "the check accepts that commit" cannot be tested. Name the check that will be added, with its file, or restate the criterion as conformance to the amended Contract A text.
- **RI-2 (warning, `failure-modes`).** `loadRigorPolicies` has only two code callers, `lib/cli/implement.mjs:478` and `lib/cli/test-policy.mjs:280`, so review-specs and validate have no code path that "fails at policy load". `adev test-policy resolve` gains an unlisted `INVALID_TIER` failure, and a YAML parse error still returns `null` silently (`rigor-mode.mjs:47-50`). List `test-policy resolve` as affected, name the verb through which review-specs and validate would hit validation (or drop the claim), and state the parse-failure behaviour.
- **RI-3 (warning, `behaviors-15`).** `skills/implement/references/failure-path-exit-event.md:22` and `skills/implement/SKILL.md:73` say per-task `LOOP_*` blocks are "Already covered - do not double-emit". The BEH-15 unattended `step_failed` reverses this, but neither file is in the skill change list. Add both, with the unattended exception stated there.
- **RI-4 (suggestion, `output-contract`).** Once the batched-task leg is removed, the fate of `resolve-depth --in-batch` is unstated, and so are the `source` values for `lite` events. `escalated_from` and `lite_denied` must stay out of the event, whose key set is closed (`REVIEW_DEPTH_RESOLVED_KEYS`).
- **RI-5 (suggestion, `arguments`).** "`--tier quick|full` as today" points at an argument the implement SKILL.md Arguments section does not document. Add `--tier` beside `--lite`.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-1 (warning, `behaviors-15`).** The unattended-run signal BEH-15 branches on has no named producer. `skills/build/SKILL.md` dispatches implement with only the plan path. Name how implement learns it is unattended (a flag, or a lifecycle-log field) and who reads it, and add the mechanism to the BEH-15 acceptance fixture. (See the termination TR-2 blocker.)
- **WR-2 (warning, `behaviors-16`).** The first-action `check-flags` call is skill prose only. Add a skill-text test asserting it precedes `adev gate require`.
- **WR-3 (warning, `behaviors-5`).** The `--run-base` capture ("once, at the step-started event") names no command, and its role is easy to conflate with `--base-sha`. State the capture command and where `lite-mode.md` records it, and say the two are distinct per-pass inputs.
- **WR-4 (suggestion).** The route summary line has no skill-text assertion.
- **WR-5 (suggestion).** The end-of-run gate run and its `step_failed` emission are skill prose rather than a verb. This is acceptable, but say it is intentional.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-6 (warning, subprocess-interpolation, `behaviors-5`).** `--run-base` and `--base-sha` reach git with no stated validation. Require a strict hex sha, resolve it with rev-parse to a commit, refuse a leading `-` (the `assertSafeArgvToken` class), and use one flag name per role. State that the final pass reads governance inputs from run-base and uses the dispatch-time snapshot only for the touched-file diff.
- **BD-7 (warning, privilege-escalation, `behaviors-5`).** A committed `implement_mode: lite` is standing authorization for unattended runs and any contributor. A branch that edits `risk-policies.yaml` authorizes itself, because run-base is that branch's own HEAD. Always echo "lite authorized via policy" in the transcript and run summary. Consider accepting policy-sourced `lite` only from the base branch's committed baseline. State that inline execution does not widen tool permissions beyond the implementer subagent's.
- **BD-8 (warning, input-trust, `behaviors-5`).** Routing scores are agent-generated. Require `typeof === 'number'` and `Number.isFinite` before the `>= 0.6` comparison, and fail closed to non-`lite`.
- **BD-9 (suggestion, `behaviors-7`).** State that the touched-file computation includes untracked and ignored paths, or that ignored paths count as sensitive.
- **BD-10 (suggestion, `behaviors-7`).** Specify normalization for `..`, absolute paths and case-insensitive filesystems in the exemption checks.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1 (blocker, missing-iteration-cap, `behaviors-12`).** The interactive implement-rigor re-prompt ("Blank or any other input is re-prompted interactively") has no iteration cap, no exhaustion verdict and no stated stdin-EOF behaviour. State a maximum number of re-prompts, the verdict at exhaustion (exit 1, `INVALID_IMPLEMENT_RIGOR`, nothing written), and that EOF ends the loop with the same verdict. *Orchestrator note:* the sibling `lib/cli/init-prompt-implementation-mode.mjs` already reads lines through an async iterator and raises `InputClosedError` on EOF, so the reviewer's "hangs forever" evidence overstates that module. The gap in this spec's text stands.
- **TR-2 (blocker, unsafe-unattended-default, `behaviors-15`).** The unattended branch is defined by dispatch route (a build or work step) rather than by runtime condition. A headless or scheduled direct `/adev:implement` run falls to the interactive verdict, with no operator present to receive it. Define unattended by runtime condition, state the detection rule, and keep build/work dispatch as one instance.
- **TR-3 (warning, `invocation-modes`).** The legal range of `implement.max_review_cycles` and `--review-cycles` is not stated. `lib/manifest.mjs` enforces an integer `>= 1` with `INVALID_MAX_REVIEW_CYCLES`.
- **TR-4 (warning, `behaviors-15`).** Under batching or `--parallel`, what happens to tasks already in flight when one task hits the unattended stop is unstated.
- **TR-5 (suggestion, `behaviors-9`).** Note that Step 3 is single-pass.

## Heuristics — related prior lessons (signature-ranked)

The following heuristics are lessons learned from past work in this module, ranked with any exact matches for this blocker first. They are not necessarily prior occurrences of this blocker. Use them as guidance, not as hard rules.

- *A universal coverage claim must ship with the predicate that checks it* (medium)
- *Use session JSONL for token measurement, not file-size estimates* (medium)

None is a signature match for either blocker; both are the module's general entries.

---

## Summary

**Total findings:** 25 (2 blockers, 14 warnings, 9 suggestions).

The two blockers are both narrow:

1. **The init re-prompt loop has no cap or EOF verdict** (TR-1, BEH-12).
2. **BEH-15's unattended stop has no runtime detection rule**, so headless direct runs get the interactive verdict (TR-2, with WR-1 the same gap seen from the wiring side).

The warnings cluster on three themes:

- **`--run-base` versus `--base-sha`:** validation, naming and per-pass roles (CON-2, WR-3, BD-6).
- **Policy-sourced `lite` authorization:** standing authorization, and whether it is visible in runs (BD-7).
- **Unlisted callers and skill files:** affected by `loadRigorPolicies` validation and the `LOOP_*` emit rule (RI-2, RI-3).

**Action required:** run `/adev:specify --revise .context-index/specs/features/implementation/implement-rigor-ladder.spec.md` to address the blockers recorded in `implement-rigor-ladder.blockers.md` (and the warnings in the same revision), then re-run `/adev:review-specs`.
