---
last-reviewed-revision: 5
file-sha: d034bcb1661abb73c563fb82ef9997c43da73c696f63151fd0ef1d02b54441f5
---

# Architecture Review: bugfix-loop-skill (round 5)

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full
> **Note:** re-review after round-4 BLOCK. Round-4's sole blocker (RI-10 — `charter.md`'s `BugfixLoopRun.status` enum had no `blocked` value for the `BLOCKED` completion-token state) was the specific target of this revision. This round's Referent Integrity Reviewer and Wiring Reviewer independently re-verified that fix against the current charter text and confirmed it clean. This round surfaces three new blockers, all unrelated to RI-10, that round 4 did not catch.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. Prompt retained on disk. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension (opt-in via `adev extension install web-service`). Prompt retained on disk. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** [warning] (naming, `output-contract`): The spec emits completion token `ADEV-BUGFIXLOOP:` for `/adev:bugfix-loop`, but the analogous sibling `/adev:debug` emits `ADEV-DEBUG:` — by that pattern the dashed skill name `bugfix-loop` would map to `ADEV-BUGFIX-LOOP:`, not the concatenated `ADEV-BUGFIXLOOP:`. Recommend verifying against `completion-tokens.spec.md`'s grammar and either renaming or documenting the deviation as intentional.
- No other findings — constitution principles, kebab-case naming, sibling-spec dependency framing, and internal coherence all verified consistent.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1** [**blocker**] (stale-source-citation, `output-contract`): The spec asserts, present-tense, that "`skills/debug/SKILL.md`'s Phase 1.6 hardcodes `--owner \"${USER}/local\"` today" and frames the sibling `debug-completion-and-auto` spec's BEH-9 (making it read `ADEV_ISSUE_OWNER` instead) as still-pending. Verified directly: `skills/debug/SKILL.md:163,168,180` (and provider mirrors) already resolve the owner from `ADEV_ISSUE_OWNER`, falling back to `${USER}/local` only when unset — BEH-9 has already shipped. The spec's dependency framing (outstanding precondition) no longer matches reality (satisfied precondition).
  - **Recommendation:** Rewrite the clause to past/completed tense, citing the correct current lines (`:163,168` for owner resolution, not `:161`), and reframe BEH-9 as a satisfied precondition.
- **RI-2** [warning] (n/a, `output-contract`): `adev issues next --type bug --max-priority P3 --json` is correctly attributed to the sibling `bug-selection-and-eligibility` spec and not yet implemented in `lib/cli/issues.mjs` — attribution is honest, not a referent-integrity failure, but the spec doesn't name the dispatcher/help-banner edit site that will also need updating.
- **RI-3** [warning] (n/a, `output-contract`): "matching the pattern the sibling `per-issue-attempt-cap` and `tracker-provider-bridge` specs already follow" overstates ADR-0015 registration — only `per-issue-attempt-cap`'s artifact is actually registered in ADR-0015's Decision table today; `tracker-provider-bridge` itself frames its own registration as future work, not already-done.
- Verified clean (no finding): `.gitignore` glob, `adev issues claim/release --owner` flags, `ISSUE_ALREADY_CLAIMED`, `ADEV_ISSUE_OWNER` resolution order, `adev skill-ext load`, `/adev:debug --issue/--auto/--apply`, `ADEV-DEBUG:` token grammar, `FAILING-CHECKS:` block, `AttemptRecord` BEH-1/2/3, completion-token grammar conformance, Persona Output Override carve-out citation, `single-front-door.spec.md` Failure Modes citation, **charter Domain Model `BugfixLoopRun.status` four-value enum (`running/complete/budget_exhausted/blocked`) and `degraded_sync_note` (`charter.md:112`) — RI-10 from round 4 re-verified resolved**, `degraded_sync_note` sole-writer claim, `/adev:build --resume` precedent, `/adev:work` routing table and `using-adev` gateway insertion points.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [**blocker**] (write-only-state, `output-contract`): `BugfixLoopRun.bugs_attempted[]` is persisted (necessary because each turn runs in a fresh self-re-invoked context) but no consumer is named anywhere in the spec — the "Each turn:" call sequence never mentions appending to it or reading it back to enforce `--max-bugs`. No Acceptance Criterion exercises `--max-bugs` capping across turns (only `--max-turns`/claim-retry exhaustion is tested). The same gap applies to turn counting for `--max-turns` — no turn-counter field or read-back is named.
  - **Recommendation:** Name the reader of `bugs_attempted[]` (the per-turn budget check), state when it's appended, and add an AC/test forcing `--max-bugs` exhaustion across turns.
- **WR-2** [warning] (n/a, `invocation-modes`): The `--resume` mtime-fallback path has a named consumer and trigger but no AC/test exercises it.
- **WR-3** [warning] (n/a, `output-contract`): The "excluded from spine-skill chaining" claim isn't yet encoded in `single-front-door.spec.md`'s Failure Modes table or the `TERMINAL`/`DOCUMENTED_ROUTES` arrays in `tests/skills/single-front-door-contract.test.mjs` — asserted but not yet registered, and no task tracks the registration.
- **WR-4** [warning] (n/a, `constitution-reference`): `/adev:work` routing table / `using-adev` gateway listing entries are named as a coordination note but no test would fail if the registration is skipped.
- **WR-5** [warning] (n/a, `output-contract`): ADR-0015 Decision-table registration for `bugfix-loop-runs-<run_id>.json` has no corresponding assertion in `tests/adrs/0015-decision-table.test.mjs` (which today only covers the sibling artifact).
- Fully wired, no issue: `AttemptRecord` write-per-turn, `ADEV_ISSUE_OWNER=bugfix-loop` env var (verified consumer at `skills/debug/SKILL.md:163`), Load Skill Extensions block, **`degraded_sync_note` read-and-surface wiring (producer/consumer/trigger/test all present) — round-4's WR-2 fix re-verified clean**.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** [warning] (path-containment, `invocation-modes`, unchanged from round 4): `--resume-run-id <id>` (manual recovery path) still has no stated format validation or containment (e.g. `assertContained`/UUID-shape check) before being used to build a run-state file path.
- **BD-4** [suggestion] (privilege-escalation, `invocation-modes`): The spec doesn't explicitly state that invocation-time consent for `--github-sync`/`--apply` covers the whole run's scope (up to `--max-turns` turns) and is never cached between separate invocations.
- BD-2, BD-3, BD-5, BD-6 — clean, no findings.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1** [**blocker**] (unsafe-unattended-default, `invocation-modes`): The main self-re-invocation loop has a stated iteration cap (`--max-turns`, default 20) and a stated cap-trip verdict (`BUDGET_EXHAUSTED`), but the spec never explicitly states whether self-re-invocation is automatic/programmatic (safe for unattended runs) or requires a human to manually re-invoke — leaving the unattended case unspecified. If re-invocation in fact requires human action, an unattended run could halt mid-stream after turn one rather than reaching a clean terminal state.
  - **Recommendation:** Explicitly state whether self-re-invocation is automatic (name the mechanism) or human-triggered, so the unattended default is unambiguous.
- **TR-2** — the per-turn claim-failure retry loop (3-retry bound) is fully bounded: cap, cap-trip verdict, and unattended default (self-re-invokes normally) are all clearly stated. No issue.

---

## Summary

**Total findings:** 12 (3 blockers, 8 warnings, 1 suggestion)

**Action required:** Address the 3 blockers — RI-1 (stale claim about `skills/debug/SKILL.md`'s current owner-resolution behavior), WR-1 (`bugs_attempted[]` write-only state / no `--max-bugs` enforcement wiring or test), and TR-1 (main loop's unattended-mode behavior unstated) — and, ideally, the 8 warnings, then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` to produce revision 6, and re-review.

**On the round-4 blocker (RI-10, `charter.md`'s `BugfixLoopRun.status` enum missing `blocked`):** Confirmed genuinely resolved, not merely re-labeled. `charter.md:112` (revision 7) now carries the four-value enum `running/complete/budget_exhausted/blocked`, explicitly attributed to revision 7 and cross-referencing this spec's `BLOCKED` completion-token state. Both the Referent Integrity Reviewer (doing a from-scratch pass, explicitly checking the charter enum against the spec's binding claim) and the Wiring Reviewer (verifying the sibling `degraded_sync_note` wiring, which touches the same status-write step) independently found this area clean, with no residual gap. The spec's own Output Contract also now states the completion-token-to-persisted-status mapping explicitly (`COMPLETE`→`complete`, `BUDGET_EXHAUSTED`→`budget_exhausted`, `BLOCKED`→`blocked`), and two new Acceptance Criteria commit to testing all three terminal paths and the `degraded_sync_note` consumer behavior. RI-10 does not recur in this round's findings under any reviewer.

**On the new blockers (RI-1, WR-1, TR-1):** All three are unrelated to RI-10 and to each other. RI-1 exists precisely because a *different* sibling spec's fix (BEH-9 in `debug-completion-and-auto`) shipped between round 4 and round 5, making this spec's present-tense description of `skills/debug/SKILL.md` stale — this is exactly the kind of drift a genuine re-review, re-verifying every referent from scratch rather than trusting prior rounds' characterization, is expected to catch. WR-1 and TR-1 are both latent gaps in the spec's budget/termination story that neither round 3 nor round 4's reviewer panel flagged; they surfaced this round because Wiring and Termination reviewers traced every producer/construct from scratch rather than diffing against prior findings.

**Concurrent-edit note:** `charter.md` was observed being actively edited by a sibling agent during this review (Capability Map status rows for `ADEV-DEBUG Completion Token`, `--auto` Mode, and `Per-Issue Attempt Cap` flipped between `review-passed`/`implementing`/`validated`-family values while this review ran). The `BugfixLoopRun.status` enum line (line 112) that RI-10 depends on was unaffected by those concurrent edits and remained stable and correct throughout — no merge conflict, no regression to the RI-10 fix.

**Note on `blocker_id`:** Per this project's bundled reviewer prompts (all five reviewers dispatched under a read-only, no-shell-execute profile), no reviewer emits a `blocker_id` for its blocker findings — the prompts explicitly instruct reviewers not to fabricate one. RI-1, WR-1, and TR-1 therefore carry no `blocker_id`. Per the aggregator validation rules (`skills/review-specs/SKILL.md`, Step 6b-bis), a BLOCK finding with no `blocker_id` is logged as a `LEGACY_REVIEWER_OUTPUT` advisory and excluded from the `.blockers.md` sidecar — consistent with rounds 2-4 (all of which also produced zero-`blocker_id` findings and no sidecar). No `.blockers.md` was written for this round, matching that precedent.
