<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
kind: skill
status: review-pending
risk_level: medium
milestone: 1
revision: 2
charter-revision: 6
created: 2026-08-19
updated: 2026-08-19
---

# Skill Spec: /adev:bugfix-loop

<!-- Skill Spec within the autonomous-bugfix-loop charter.
     A skill spec defines a change to a /adev:* CLI surface — invocation modes,
     arguments, the output contract (files produced, frontmatter written, lifecycle
     events emitted), and failure modes.
     Parent Charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md -->

## Invocation Modes

- `/adev:bugfix-loop [--max-bugs N] [--max-turns N] [--github-sync]` — the user-facing entry point. Selects and attempts one eligible bug, then self-re-invokes with `--resume` (copying `/adev:build`'s proven continuation discipline: fresh context per turn, explicit re-invocation, no shortcut pressure) until the board is drained of eligible bugs or a budget is hit.
- `--resume` (internal) — used only by the skill's own self-re-invocation, mirroring `/adev:build --resume`. Not intended for direct user invocation; carries forward the `BugfixLoopRun` state from the prior turn.
- Optional composition with Claude Code's `/goal` — documented usage (`docs/`), not a skill invocation mode: `/goal /adev:bugfix-loop has run to completion, reading for the ADEV-BUGFIXLOOP token`. This is Claude-Code-specific and never a dependency of the skill itself (see charter Quality Attributes: Portability).

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--max-bugs <N>` | No | Caps the number of bugs attempted in one run (across all self-re-invoked turns). Default: unbounded — the loop drains until no eligible bug remains or `--max-turns` is hit. |
| `--max-turns <N>` | No | Caps the number of self-re-invocation turns. Default: 20 — a conservative bound preventing an unbounded run when neither flag is set. |
| `--github-sync` | No | Enables the tracker-provider-bridge's inbound pull before each bug selection and outbound writeback after each attempt (sibling `tracker-provider-bridge` spec, Milestone 2). Default: `false` — the loop operates on the local board only unless explicitly enabled. |

## Output Contract

- Writes/updates `.context-index/lifecycle-state/bugfix-loop-runs-<run_id>.json` (flat, matching the existing `.gitignore` glob `.context-index/lifecycle-state/*.json` — a one-level-deeper `bugfix-loop-runs/<run_id>.json` path was reviewed and found to fall outside that glob, silently becoming git-trackable; this flat form stays covered without a `.gitignore` edit), tracking `BugfixLoopRun` state (`run_id` generated via `crypto.randomUUID()`, never derived from external input; `started_at`, `max_bugs`, `max_turns`, `bugs_attempted[]`, `status`) per the charter's Domain Model.
- Each turn: `adev issues next --type bug --max-priority P3 --json` → `adev issues claim <id> --owner bugfix-loop --branch <current branch>` (`--owner bugfix-loop` is a fixed literal identifying the automated loop, distinct from any human owner string; `ADEV_ISSUE_OWNER` is not used, so this never silently inherits an interactive session's identity) → `/adev:debug --issue <id> --apply --auto` → reads the resulting `ADEV-DEBUG:` token → **writes/updates the issue's `AttemptRecord` per the sibling `per-issue-attempt-cap` spec's BEH-1/2/3, mapping the token (`FIXED`/`PARKED`/`UNREPRODUCIBLE`) onto that spec's write contract** → `adev issues release <id>`. The skill never marks a bug fixed itself; `FIXED` outcomes are entirely `/adev:debug`'s own Phase 6 confidence gate (charter invariant — restated here as the skill's binding contract, not re-derived). The loop's own `adev issues claim` and `/adev:debug`'s internal Phase 1.6 claim (fired whenever `--issue <id>` is passed) target the same issue and owner — this is intentional, idempotent lease renewal, not a conflict; `/adev:debug` never claims for a different owner than the loop's.
- When `--github-sync` is set, additionally invokes the tracker-provider-bridge's inbound pull before selection and outbound writeback after each attempt.
- Includes a Load Skill Extensions block invoking `adev skill-ext load --skill bugfix-loop`, per the constitution's requirement that every new skill carry one.
- Emits a terminal `ADEV-BUGFIXLOOP: <STATE>` completion token as the final chat line, following the grammar pinned in `completion-tokens.spec.md` — states: `COMPLETE` (board drained, no eligible bugs remain), `BUDGET_EXHAUSTED` (`--max-bugs`/`--max-turns` hit while eligible bugs remain), `BLOCKED` (a structural failure, e.g. issue board unreachable, halted the run before any bug was attempted). This is a fourth terminal skill added to that cross-cutting convention, alongside `build`/`validate`/`debug` — coordinate a Task Map addition there rather than fork the grammar.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| Issue board unreachable or `tasks.backend` misconfigured | Loop halts immediately on the first turn; does not silently retry | Fix `manifest.yaml`'s `tasks.backend`, re-run |
| A selected bug's claim fails (lease race — already claimed by another session) | Skip to the next eligible bug within the same turn, **bounded to at most 3 claim-failure retries per turn**. `adev issues claim` failures release no lease, so the failed bug is not re-eligible until its own lease naturally expires — `adev issues next` will not re-surface it within this turn. If the 3-retry bound is exhausted without a successful claim, the turn ends without an attempt and **counts toward `--max-turns`** (self-re-invokes normally) rather than looping further — this bound exists specifically so contention can never bypass `--max-turns` by spinning inside a single turn | None needed — self-heals across turns as leases expire |
| `/adev:debug --auto` errors out entirely (crashes, rather than reaching a clean `PARKED`/`UNREPRODUCIBLE` token) | Treated as `PARKED` with an explanatory note; the claim is released; the loop continues to the next bug rather than halting the run | Review the crashed bug's issue notes; investigate manually |
| `--github-sync` set but the tracker-provider-bridge capability is not yet implemented | Fails fast on the first turn with a clear "GitHub sync not available" error, rather than silently ignoring the flag | Omit `--github-sync`, or wait for that capability to ship |
| `--max-turns` exhausted with eligible bugs still remaining | Loop stops cleanly, emits `BUDGET_EXHAUSTED`; remaining bugs are left untouched (not parked — simply not attempted this run) | Re-run `/adev:bugfix-loop` to continue, or raise `--max-turns` |
| A `PARKED` bug (`CONTINUE` verdict, under its attempt cap) is re-selected on a later turn or run | Expected, not a failure — per the sibling `per-issue-attempt-cap` spec, only `NO_PROGRESS`/`REGRESSED`/`BUDGET_EXHAUSTED` verdicts exclude an issue from `adev issues next`; a `CONTINUE` verdict means another attempt is exactly what should happen next. "Board drained" (`COMPLETE`) is reachable once every remaining bug has hit one of those three excluding verdicts or `FIXED` | None needed — this is the intended retry-until-cap design |

## System Constitution Reference

- **Architecture Boundary:** "Adding new skills to the lifecycle order" (Requires Human Approval) — Applies. This spec introduces `/adev:bugfix-loop` as a new skill; per the charter's Business Intent note, this was approved during brainstorm.
- **Anti-Pattern:** "New skills MUST include a Load Skill Extensions block." — Applies, and is captured directly in this spec's Output Contract.
- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the self-re-invocation mechanism copies `/adev:build`'s existing, already-shipped pattern rather than introducing new orchestration machinery or a dependency on Claude Code's `/goal`.
- **Coordination note (not a constitution citation, a routing gap flag):** `/adev:work`'s routing table and `using-adev`'s gateway skill listing must add an entry for `/adev:bugfix-loop`, per `single-front-door.spec.md`'s pattern — without it, the skill exists but is undiscoverable through the documented single entry point. This is a required implementation task, tracked here since this spec's template has no separate Task Map section.

## Acceptance Criteria

- [ ] `/adev:bugfix-loop` processes exactly one bug per turn and self-re-invokes until the board is drained or a budget is hit
- [ ] The skill never marks a bug fixed except via `/adev:debug`'s own `ADEV-DEBUG: FIXED` token
- [ ] A Load Skill Extensions block is present and invoked
- [ ] `ADEV-BUGFIXLOOP: COMPLETE | BUDGET_EXHAUSTED | BLOCKED` is emitted correctly as the final line, matching the pinned grammar exactly (verified against the regex, not just visually)
- [ ] `--github-sync` fails fast with a clear error when the bridge capability isn't yet available, rather than silently no-op-ing
- [ ] Claim/release discipline holds even when `/adev:debug` crashes mid-attempt — no orphaned claims
- [ ] `BugfixLoopRun` state persists across self-re-invoked turns and survives a process restart mid-run
- [ ] `bugfix-loop-runs-<run_id>.json` is confirmed git-ignored (`git check-ignore` passes) before implementation is considered complete
- [ ] Claim-failure retries within a single turn are bounded to 3 and the turn still counts toward `--max-turns` on exhaustion — verified with a test that forces repeated claim contention
- [ ] `AttemptRecord` is written after every completed attempt, verified by a test asserting the write actually happens (not just that the sibling spec describes it)
- [ ] `/adev:work` and `using-adev`'s gateway listing include an entry for `/adev:bugfix-loop`
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
