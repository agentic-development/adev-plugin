---
spec: .context-index/specs/features/cli-driver-surface/driver-substrate.spec.md
charter: cli-driver-surface
date: 2026-08-18
verdict: BLOCK
rigor-tier: full
last-reviewed-revision: 1
file-sha: b6ee699798736e7af9f8c58672ab02d6a78cc38b2da9258aaf142bf6de28ebc3
findings-total: 13
blockers: 2
warnings: 7
suggestions: 4
---

# Architecture Review: driver-substrate

> **Date:** 2026-08-18
> **Spec:** `.context-index/specs/features/cli-driver-surface/driver-substrate.spec.md` (revision 1)
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Rigor tier:** full (explicit `--tier full`)
> **Verdict:** BLOCK

> **Falsification-experiment note.** Run against a scratch worktree checked out at `c0a43569` —
> the commit immediately BEFORE `3f28515c` fixed the `brainstorm`/`retro` no-op gate mappings
> (issue `zx5`). `review.yaml` and the `referent-integrity` prompt were overwritten with their
> CURRENT versions before dispatch. This spec's lifecycle log has the same pre-existing
> verdict-null `specify` `step_completed` gap documented for `r5sc` (confirmed to reproduce on
> the current main tree) — the strict-mode Step-0 self-gate was bypassed via
> `lifecycle.gate_mode: advisory`, set only in this scratch worktree's `manifest.yaml` (discarded
> on teardown). See `run-log.md`.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |
| referent-integrity | Referent Integrity | subagent | reviewer-reasoning | `prompts/referent-integrity.md` |

Registry loaded via `adev governance reviewers --json` from inside this worktree: `referent-integrity` present, `errors: []`.

## Structural Architect (structural-architect)

**Verdict:** FAIL (1 blocker, 5 warnings, 1 suggestion)

- **SA-1 (blocker)** `structural-architect:ambiguous-behavior:d50df318` — Behavior 4 calls `requireGate(state, <step-derived-from-skill>, {mode})` but never defines the skill-name → lifecycle-step mapping anywhere in the spec (not an entity, postcondition, task-map row, or error case for an unmappable `--skill`).
- **SA-2 (warning)** — Postcondition 3 makes `help()` optional; Behavior 9 and the `cli` charter's module contract make it mandatory — self-contradiction.
- **SA-3 (warning)** — `run()`'s parameter contract (`projectRoot`, `argv`, `manifest`) is defined only inside a doc-comment postcondition, not as a normative Behavior.
- **SA-4 (warning)** — `{ mode }` passed to `requireGate` (Behaviors 3-4) has no stated origin (manifest → `resolveGateMode`).
- **SA-5 (warning)** — No behavior or error case covers `adev gate` with no sub-command or an unknown sub-command.
- **SA-6 (warning)** — Acceptance criteria assign dispatcher-level and pattern-test-level behaviors to `tests/cli/gate.test.mjs`, blurring module boundaries.
- **SA-7 (suggestion)** — Precondition 4 ("hard prerequisite, must land first") contradicts the final acceptance criterion ("OR this spec's PR includes that revision").

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES (0 blockers, 1 warning, 2 suggestions)

- **SEC-1 (warning)** — The "uncircumventable gates" claim is enforced only by voluntary `LIFECYCLE_STEP` export self-declaration; a helper that omits it produces no test failure, so the pattern test cannot detect a missing gate, only check correctness of modules that opted in.
- **SEC-2 (suggestion)** — No documented path-containment check on `--spec <path>` before it reaches `currentState`.
- **SEC-3 (suggestion)** — `{ mode }`'s origin should be confirmed as fixed per-verb, not CLI-flag-settable (would let a caller downgrade a required gate to advisory).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS (0 findings)

Full consistency confirmed: module references, charter prerequisite (rev 3), constitution alignment, cross-cutting spec compliance (lifecycle-gate, single-front-door), naming/pattern conventions. No findings.

## Referent Integrity (referent-integrity)

**Verdict:** FAIL (1 blocker, 1 warning, 1 suggestion)

- **RI-1 (blocker)**, `finding-type: nonexistent-lifecycle-step`, `section_anchor: behaviors-4` — Referent: Behavior 4's step-derivation contract as applied to `--skill brainstorm` and `--skill retro`. Verification: `lib/cli/gate.mjs:25-33` (`SKILL_STEP_MAP`) maps both to steps absent from `lib/lifecycle-state.mjs:1563`'s `STEP_ORDER` (`['specify','review','plan','route','implement','validate']`); `priorStepOf()` (`:1615-1621`) returns `null` for unknown steps identically to "first step," so `requireGate` (`:1647-1648`) returns early with no state check — the command exits 0 unconditionally for these two skills. `gate.mjs:106-118`'s `help()` advertises both under "Skills supported," and `tests/cli/gate.test.mjs` never exercises either. **This is the historical defect this falsification-gate run targets (issue `zx5`, fixed in `3f28515c`).**
- **RI-2 (warning)** — Postconditions' final bullet claims `Status: implemented` on two charter capability rows that actually read `validated` (`charter.md:89,93`).
- **RI-3 (suggestion)** — Preconditions' consumed-exports list omits `resolveGateMode`, also imported from the same module.
- No `blocker_id` field emitted on any finding, per `referent-integrity`'s own prompt contract.

> Consolidated verdict computed via `adev report --type step --status completed --verdict BLOCK
> --from-summary`, run for real inside this worktree, from the four `reviewer_report` events
> above: 2 blockers, 7 warnings, 4 suggestions total.
