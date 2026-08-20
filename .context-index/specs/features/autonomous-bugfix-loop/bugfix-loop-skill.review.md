---
last-reviewed-revision: 6
file-sha: 032015cda3889a1b3c7700ec455625afc59e805c322d749e398afedb40d2d644
---

# Architecture Review: bugfix-loop-skill (round 6)

> **Date:** 2026-08-20
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full
> **Note:** re-review after round-5 BLOCK. Round 5's three blockers (RI-1 — stale claim about `skills/debug/SKILL.md`'s owner resolution; WR-1 — `bugs_attempted[]` write-only state / no `--max-bugs` enforcement; TR-1 — main loop's unattended-mode behavior unstated) were the specific target of this revision (5 → 6). All three were independently re-verified clean by this round's Referent Integrity, Wiring, and Termination reviewers respectively (see "Verified clean" / TR-1 sections below). This round surfaces three new blockers, all unrelated to round 5's three, that round 5 did not catch.

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

- **CON-1** [**blocker**] (contract, `frontmatter`): The spec's `charter-revision: 7` frontmatter field is stale — the parent `charter.md` is now at `revision: 8` (bumped by a concurrent sibling-agent edit to a different spec under the same charter, observed mid-review; not caused by this spec's own revision-6 content edit). **Orchestrator annotation (independently verified):** the reviewer's cited supporting detail — that the spec's Output Contract (line 40) references "`sync_retry_counts` fields... added in revision 8 to close round-5 review TR-1/TR-2" — does **not** appear anywhere in the spec; this appears to be a fabricated/hallucinated citation from the `reviewer-fast` (haiku-tier) model and should be disregarded. The underlying charter-revision mismatch itself is real, however, and is corroborated independently by Referent Integrity's RI-2 (below), which also flags `sync_retry_counts` as a real, charter-declared field this spec omits from its own field enumeration — a legitimate, non-hallucinated finding distinct from CON-1's fabricated citation. Note also that per `skills/hygiene/SKILL.md` Pass 12, `charter-revision` staleness is that skill's own `CHARTER_STALE` advisory category, not documented as in-scope for `consistency-analyzer`'s stated review scope (naming/pattern/contract/domain-model/terminology/external-ref/cross-cutting/adr-compliance/module-boundary) — this finding is scope-adjacent at best. Retained here as a blocker per the mechanical verdict rule, with this annotation for the human/agent who acts on it.
- **CON-2** [warning] (pattern, `output-contract`): The spec's line-45 claim that `ADEV-BUGFIXLOOP` is "a fourth terminal skill added to that cross-cutting convention, alongside `build`/`validate`/`debug`" overstates `completion-tokens.spec.md`, which documents only `build`/`validate` as terminals; `debug`'s status as a terminal is established by the sibling `debug-completion-and-auto` spec and shipped code (`skills/debug/SKILL.md`, `using-adev/SKILL.md`), not by `completion-tokens.spec.md` itself.
- **CON-3** [suggestion] (terminology, `output-contract`): The spec mixes "completion token" and "terminal token" terminology; `completion-tokens.spec.md` consistently uses "completion token." Standardize.
- Verified clean (no finding): naming, domain-model alignment (aside from CON-1/RI-1's field-enumeration gap), ADR compliance, module boundaries, external-reference compliance.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1** [**blocker**] (undeclared-domain-model-field, `output-contract`): This round's own new `turns_completed` field (added to close round-5's WR-1) is not declared in the charter's `BugfixLoopRun` Domain Model row (`charter.md:113`, which lists exactly `run_id, started_at, max_bugs, max_turns, bugs_attempted[], status, degraded_sync_note, sync_retry_counts`). The spec's field-list bullet closes with "per the charter's Domain Model," which is true for every field it lists except `turns_completed` — the sole invention. Not cosmetic: this is the field `--max-turns` is now checked against, with its own acceptance criterion.
  - **Recommendation:** Add `turns_completed` to the charter's `BugfixLoopRun` attribute list (next charter revision), or reword so the "per the charter's Domain Model" attribution excludes it and states explicitly that this spec extends the entity (mirroring `per-issue-attempt-cap.spec.md`'s pattern for `curr_blockers`).
- **RI-2** [warning] (n/a, `frontmatter`): `charter-revision: 7` is stale; charter is at `revision: 8`. Corroborates CON-1's legitimate half without CON-1's fabricated citation.
- **RI-3** [warning] (n/a, `output-contract`): `/adev:debug --issue <id> --apply --auto` — `--apply` is documented (`skills/debug/SKILL.md:17`) as prompting for confirmation, and nothing verified in `debug-completion-and-auto.spec.md` establishes that `--auto` suppresses that specific prompt. The unattended loop's own contract currently rests on an un-suppressed prompt.
- **RI-4** [warning] (n/a, `output-contract`): `sync_retry_counts` (charter-declared, written into the same run-state file per the sibling `tracker-provider-bridge` spec) is not enumerated in this spec's own field list, unlike `degraded_sync_note`, which received that treatment.
- **RI-5** [suggestion] (n/a, `output-contract`): `completion-tokens.spec.md` itself still enumerates only build/validate; recommends the coordinated Task Map addition also register `ADEV-DEBUG`, not just `ADEV-BUGFIXLOOP`.
- Verified clean (no finding) — round 5's RI-1 re-confirmed genuinely resolved: `skills/debug/SKILL.md:163,168,180` read exactly as the spec now (accurately, past-tense) describes. Also verified clean: `adev issues next/claim/release` flags and usage banners, `ISSUE_ALREADY_CLAIMED`, `ADEV_ISSUE_OWNER` CLI-level honouring, `adev skill-ext load`, `.gitignore` glob, ADR-0015 registration pattern, `degraded_sync_note` sole-writer claim, `per-issue-attempt-cap` BEH-1/2/3 mapping, `FAILING-CHECKS:` block, Persona Output Override carve-out, `single-front-door.spec.md` citation, `/adev:build --resume` precedent, `/adev:work`/`using-adev` insertion points, `tasks.backend`, `crypto.randomUUID()`.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [**blocker**] (write-only-state, `output-contract`): `BugfixLoopRun.status` (the 4-value terminal-state enum written immediately before the completion token) has no named consumer anywhere in the spec — the new per-turn budget check (this round's own WR-1 fix) reads back only `bugs_attempted.length` and `turns_completed`, never `status`. No sibling spec or `/adev:status`-style surface reads it either. The corresponding acceptance criterion (line 76) tests only that the write is correct, not any producer→consumer path — because none exists. Unlike `degraded_sync_note` (explicitly given a sole-reader treatment in this same spec) or the tracker-bridge spec's `last_synced_at`/`last_comment_id` (explicitly labeled "audit-only, no programmatic reader, by design"), `status` gets neither an explicit reader nor an explicit audit-only carve-out — its intended role is ambiguous.
  - **Recommendation:** Either name a concrete consumer (e.g., have the manual `--resume`-after-crash path refuse/no-op on an already-terminal `status`, with a test), or explicitly document `status` as audit/inspection-only with no programmatic reader in this charter, the way the tracker-bridge spec does for its own audit fields.
- **WR-2** [warning] (n/a, `invocation-modes`): The `--resume-run-id`-omitted fallback ("most-recently-modified `bugfix-loop-runs-*.json`") has a named consumer and trigger but no test exercises the actual file-selection logic when multiple run-state files exist.
- **WR-3** [suggestion] (n/a, `output-contract`): ADR-0015 registration's enforcement test (`tests/adrs/0015-decision-table.test.mjs`, per the sibling `per-issue-attempt-cap` spec's precedent) is never cited by name in this spec's own acceptance criterion.
- Fully wired, no issue (explicitly re-verified this round): the round-6 fix itself — `bugs_attempted[]`/`turns_completed` per-turn budget check (increment site, consumer, trigger, and dedicated tests for both `--max-bugs` and `--max-turns` no-attempt paths all present); `degraded_sync_note`; `AttemptRecord` write-back; `ADEV_ISSUE_OWNER`/`--owner bugfix-loop` claim parity; the bounded 3-retry claim-failure counter.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** [warning] (path-containment, `invocation-modes`, unchanged from round 5, exposure window widened): `--resume-run-id <id>` still has no stated format validation or containment before being used to build the run-state file path; the new per-turn budget check now dereferences this same file every turn rather than only at resume time.
- **BD-2** [warning] (privilege-escalation, `invocation-modes`, elevated from round-5's BD-4 suggestion): The new explicit "automatic re-invocation" clause removes any ambiguity that a single up-front human invocation authorizes up to `--max-turns` (default 20) sequential autonomous `/adev:debug --apply` attempts with no incremental checkpoint — a qualitatively broader consent model than `exec-consent.mjs`'s per-action posture, though consistent with the already-shipped `/adev:build` precedent and the charter's recorded brainstorm approval.
- Items 2 (subprocess interpolation), 3 (input trust), 5 (artifact leakage), 6 (destructive filesystem operations) — clean, no findings, all explicitly re-considered this round including against the new `turns_completed` field and budget-check text.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

- **TR-1 from round 5 — RESOLVED, independently re-verified.** The new "Re-invocation is automatic, not human-triggered" clause states a concrete, unambiguous, testable mechanism (self-re-invokes via `--resume --resume-run-id`, no human action, stops only by printing the completion token instead of re-invoking), with a matching acceptance criterion.
- Claim-failure retry loop (3-retry bound): iteration cap, cap-trip verdict, and unattended default all clearly stated. No issue.
- The new per-turn budget check (`max_bugs`/`max_turns`): iteration cap, cap-trip verdict (`BUDGET_EXHAUSTED`), and unattended default (automatic, no human intervention) all clearly stated. No issue.
- No other repeating construct identified. No findings.

---

## Summary

**Total findings:** 12 (3 blockers, 7 warnings, 2 suggestions — CON-3 and RI-5, WR-3 not separately double-counted; see per-reviewer sections for exact IDs)
**Action required:** Address the 3 blockers — CON-1 (charter-revision staleness; note the reviewer's supporting citation was independently found to be fabricated, but the underlying staleness is real and corroborated by RI-2/RI-4), RI-1 (`turns_completed` not declared in the charter's `BugfixLoopRun` Domain Model — this round's own WR-1 fix introduced an undeclared field), and WR-1 (`BugfixLoopRun.status` is write-only, no consumer — a *different* write-only gap than round 5's, on a field this revision did not touch) — then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` to produce revision 7, and re-review.

**On round 5's three blockers (RI-1 stale claim, WR-1 bugs_attempted write-only, TR-1 unattended-mode unstated):** All three confirmed genuinely resolved by independent from-scratch verification this round — Referent Integrity re-read `skills/debug/SKILL.md:163,168,180` directly and confirmed the spec's now-past-tense claim is accurate; Wiring Reviewer explicitly re-traced the new `bugs_attempted[]`/`turns_completed` budget-check producer→consumer→trigger→test chain and found it fully wired; Termination Reviewer confirmed the new automatic-re-invocation clause is concrete, unambiguous, and testable. None of round 5's three blockers recur under any reviewer this round.

**On the new blockers:** CON-1/RI-1/WR-1 are unrelated to each other and to round 5's three. RI-1 and WR-1 are notable in that both are latent gaps in the very fix this revision made for round 5 (RI-1: the new `turns_completed` field was never added to the charter; WR-1: `status`, a pre-existing field, was never wired to a consumer, and its absence became more visible once `bugs_attempted[]`/`turns_completed` — the fields WR-1's round-5 fix *did* wire — set the bar for what "wired" looks like in this spec). CON-1 stems from environmental drift (a sibling agent's concurrent edit to `charter.md` mid-review-cycle) rather than a content defect introduced by this revision's edits themselves.

**Note on `blocker_id`:** Per this project's bundled reviewer prompts (all five reviewers dispatched under a read-only, no-shell-execute profile), no reviewer emits a `blocker_id` for its blocker findings — the prompts explicitly instruct reviewers not to fabricate one. CON-1, RI-1, and WR-1 therefore carry no `blocker_id`. Per the aggregator validation rules (`skills/review-specs/SKILL.md`, Step 6b-bis), a BLOCK finding with no `blocker_id` is logged as a `LEGACY_REVIEWER_OUTPUT` advisory and excluded from the `.blockers.md` sidecar — consistent with rounds 2-5 (all of which also produced zero-`blocker_id` findings and no sidecar). No `.blockers.md` was written for this round, matching that precedent.
