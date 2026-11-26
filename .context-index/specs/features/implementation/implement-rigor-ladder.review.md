---
spec: .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
verdict: PASS_WITH_NOTES
rigor-tier: full
last-reviewed-revision: 3
file-sha: 669e10d5948ad0d4e4e72a3078b638ad7fc445ccc797e7423b1dc62799fc6439
reviewed: 2026-11-26
---

# Architecture Review: implement-rigor-ladder

> **Date:** 2026-11-26
> **Spec:** .context-index/specs/features/implementation/implement-rigor-ladder.spec.md
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Verdict:** PASS_WITH_NOTES
> **Rigor tier:** full (spec `risk_level: high` → `policies.high.review_mode: full`)
> **Diff scope:** diff-scoped against the revision 2 committed text. Nine of the ten top-level anchors had changed, so the scoped content was close to the full spec.
> **Prior review:** revision 2, BLOCK (2 blockers). Every reviewer was given that report and asked to confirm its own prior findings.
> **Dispatch note:** prompts were assembled by `adev governance dispatch` (worktree CLI) and delivered to each reviewer as a file reference because of their size (96–345 KB). Content is byte-identical to the `buildReviewerDispatches` output.
> **Charter note:** the implementation charter has no Capability Map, so no capability row was updated.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-capable | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast (triggered: score 2) | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension. |

## Revision 2 findings

Both revision 2 blockers, TR-1 (uncapped init re-prompt) and TR-2 (unattended stop keyed on dispatch route), were confirmed resolved by the termination reviewer.

Every revision 2 warning was confirmed resolved, partly resolved or superseded by the reviewer that raised it. Partial resolutions:
- TR-3 is refined as TR-6.
- BD-7 leaves the BD-12 residual.
- BD-9 and BD-10 leave the BD-11 gap.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning, pattern, `output-contract`).** "`SKILL.md` and `references/failure-path-exit-event.md` … are **unchanged**" contradicts the SKILL.md body edits listed in the same block. Scope "unchanged" to the do-not-double-emit rule text (`SKILL.md:73`, `failure-path-exit-event.md:22`).
- **CON-2 (suggestion, `arguments`).** The `--tier quick|full` rows list only `resolve-depth`, though `check-flags` takes any `--tier`. Give the three values the same verb coverage.
- **CON-3 (suggestion, `behaviors-5`).** State that `source` records the baseline path, not the floor (`floor_applied` and `floor_legs` carry that), and say which value an explicit `--tier quick` takes.
- **CON-4 (suggestion, `output-contract`).** `templates/risk-tiers/prototype/risk-policies.yaml` already has `quick` at all three levels. Mark it unchanged so the plan does not create a no-op task.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-6 (warning, `output-contract`).** `assertSafeArgvToken` permits a leading `-`, accepts `--output=x`, and throws `GOVERNANCE_SCALAR_UNSAFE` (`governance-values.mjs:200-224`). Reusing it adds nothing to the hex and no-leading-dash rule, and it would raise a different code. Drop the reuse claim and rely on the hex regex plus `rev-parse`.
- **RI-7 (warning, `behaviors-7`).** `computeTouchedFiles` returns only `{path, status}` (`diff-tree --name-status -z`), so the symlink rule (mode `120000`) has no mode source. State that it is extended to return the destination mode (e.g. via `--raw`).
- **RI-8 (warning, `behaviors-7`).** `excludeOwnLifecycleLogTouch` (`review-depth.mjs:180-207`) excludes the task's own lifecycle-log touch from `scope-mismatch` today. Read literally, BEH-7's "`.context-index/` is never exempt" would trip every `lite` task on that write. State that the exclusion still applies before the exemption check.
- **RI-9 (warning, `output-contract`).** This is the same "unchanged" wording problem as CON-1.
- **RI-10 (warning, `arguments`).** `adev implement batches` has no `--tier` flag (`implement.mjs:199-204`), and the Output Contract adds none, yet the `--tier lite` row lists `batches`. Remove it from the row, or add the flag.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** PASS_WITH_NOTES

- **WR-6 (warning, `behaviors-10`).** No skill-text test asserts that `skills/validate/SKILL.md` calls `adev implement lite-report`.
- **WR-7 (warning, `behaviors-5`).** The `lite authorized via` line, the `lite_denied` summary and the `LITE_TRIPWIRE_ESCALATED` echo are relayed in prose only, with no skill-text assertion. The BD-7 visibility mitigation therefore has no wiring-level test.
- **WR-8 (warning, `behaviors-15`).** BEH-15 says the existing Step 2g halt covers every review loop, but `skills/implement/references/steps/step-2-per-task-loop.md:322` says Stage 1 "After the last cycle, escalate to the user". *Orchestrator check:* confirmed. The `quick` synthesized loop does use the Stage 2 `cq-<n>` / `evaluateStopCondition` discipline, but Stage 1 does not. List `step-2-per-task-loop.md` as changed, with Stage 1's cap routed to the 2g halt, and add a Stage 1 non-convergence case to the BEH-15 fixture.
- **WR-9 (suggestion).** This is the same "unchanged" wording as CON-1. It also suggests an optional test for the ignored `--in-batch` flag.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-11 (warning, privilege-escalation, `behaviors-7`).** Excluding gitignored files from the tripwire lets an inline `lite` task write a gitignored sensitive file (`.env`, local credentials or config) without the `sensitive-path` or `boundary` legs seeing it. For those two legs only, also enumerate ignored paths written since the snapshot, and keep the exemption logic as is.
- **BD-12 (suggestion, `behaviors-5`).** A branch still authorizes itself by committing `implement_mode: lite`. Consider base-branch-only policy authorization, or a typed `--lite` off the default branch. This is the residual already recorded as an accepted risk in ADR 0020.
- **BD-13 (suggestion, `arguments`).** State that paths read from the run-base commit are validated as repo-relative (no `..`, no leading `-`). State also how a routing sidecar that is not committed at `run_base` is treated. *Orchestrator note:* 73 sidecars are tracked in this repository and route runs usually commit them, but an uncommitted sidecar would silently deny `lite` for the whole run.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS_WITH_NOTES

- **TR-6 (warning, `invocation-modes`).** `implement.max_review_cycles` has no stated maximum. Each value is finite and the halt still fires, so this is not unsafe. State a maximum, or record that an unbounded value is an accepted operator choice.
- **TR-7 (suggestion, `behaviors-15`).** State that the cap applies per review loop (per stage for `full`), so the per-task bound is 2 × cap for `full` and 1 × cap for `quick`.

---

## Summary

**Total findings:** 18 (0 blockers, 11 warnings, 7 suggestions).

Two warnings are worth fixing before `/adev:plan`, because each would otherwise reach implementation as a defect:

1. **WR-8:** Stage 1's cap still escalates to the user, so the BEH-15 guarantee does not yet hold for `full` tasks.
2. **RI-8:** without the existing own-lifecycle-log exclusion, the tripwire would escalate every `lite` task.

Close behind are RI-7 (no mode source for the symlink rule) and BD-11 (ignored sensitive files bypass the tripwire). The rest are wording and test-coverage notes.

**Action required:** none for the gate; the spec may proceed to `/adev:plan`. The recommendation is to fold WR-8, RI-8, RI-7 and BD-11 (and the wording fixes) into a revision 4 first, since each is a few sentences.
