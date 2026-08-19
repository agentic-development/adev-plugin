<!-- partial_schema: spec@1 -->

---
charter: autonomous-bugfix-loop
kind: skill
status: review-blocked
risk_level: medium
milestone: 1
revision: 1
charter-revision: 2
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
- Optional composition with Claude Code's `/goal` — documented usage (`docs/`), not a skill invocation mode: `/goal /adev:bugfix-loop has run to completion, reading for the ADEV-BUGFIX-LOOP token`. This is Claude-Code-specific and never a dependency of the skill itself (see charter Quality Attributes: Portability).

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--max-bugs <N>` | No | Caps the number of bugs attempted in one run (across all self-re-invoked turns). Default: unbounded — the loop drains until no eligible bug remains or `--max-turns` is hit. |
| `--max-turns <N>` | No | Caps the number of self-re-invocation turns. Default: 20 — a conservative bound preventing an unbounded run when neither flag is set. |
| `--github-sync` | No | Enables the tracker-provider-bridge's inbound pull before each bug selection and outbound writeback after each attempt (sibling `tracker-provider-bridge` spec, Milestone 2). Default: `false` — the loop operates on the local board only unless explicitly enabled. |

## Output Contract

- Writes/updates `.context-index/lifecycle-state/bugfix-loop-runs/<run_id>.json`, tracking `BugfixLoopRun` state (`run_id`, `started_at`, `max_bugs`, `max_turns`, `bugs_attempted[]`, `status`) per the charter's Domain Model.
- Each turn: `adev issues next --type bug --max-priority P3 --json` → `adev issues claim <id>` → `/adev:debug --issue <id> --apply --auto` → reads the resulting `ADEV-DEBUG:` token → `adev issues release <id>`. The skill never marks a bug fixed itself; `FIXED` outcomes are entirely `/adev:debug`'s own Phase 6 confidence gate (charter invariant — restated here as the skill's binding contract, not re-derived).
- When `--github-sync` is set, additionally invokes the tracker-provider-bridge's inbound pull before selection and outbound writeback after each attempt.
- Includes a Load Skill Extensions block invoking `adev skill-ext load --skill bugfix-loop`, per the constitution's requirement that every new skill carry one.
- Emits a terminal `ADEV-BUGFIX-LOOP: <STATE>` completion token as the final chat line, following the grammar pinned in `completion-tokens.spec.md` — states: `COMPLETE` (board drained, no eligible bugs remain), `BUDGET_EXHAUSTED` (`--max-bugs`/`--max-turns` hit while eligible bugs remain), `BLOCKED` (a structural failure, e.g. issue board unreachable, halted the run before any bug was attempted). This is a fourth terminal skill added to that cross-cutting convention, alongside `build`/`validate`/`debug` — coordinate a Task Map addition there rather than fork the grammar.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| Issue board unreachable or `tasks.backend` misconfigured | Loop halts immediately on the first turn; does not silently retry | Fix `manifest.yaml`'s `tasks.backend`, re-run |
| A selected bug's claim fails (lease race — already claimed by another session) | Skip to the next eligible bug within the same turn rather than erroring the whole run | None needed — self-heals on the next selection |
| `/adev:debug --auto` errors out entirely (crashes, rather than reaching a clean `PARKED`/`UNREPRODUCIBLE` token) | Treated as `PARKED` with an explanatory note; the claim is released; the loop continues to the next bug rather than halting the run | Review the crashed bug's issue notes; investigate manually |
| `--github-sync` set but the tracker-provider-bridge capability is not yet implemented | Fails fast on the first turn with a clear "GitHub sync not available" error, rather than silently ignoring the flag | Omit `--github-sync`, or wait for that capability to ship |
| `--max-turns` exhausted with eligible bugs still remaining | Loop stops cleanly, emits `BUDGET_EXHAUSTED`; remaining bugs are left untouched (not parked — simply not attempted this run) | Re-run `/adev:bugfix-loop` to continue, or raise `--max-turns` |

## System Constitution Reference

- **Architecture Boundary:** "Adding new skills to the lifecycle order" (Requires Human Approval) — Applies. This spec introduces `/adev:bugfix-loop` as a new skill; per the charter's Business Intent note, this was approved during brainstorm.
- **Anti-Pattern:** "New skills MUST include a Load Skill Extensions block." — Applies, and is captured directly in this spec's Output Contract.
- **Principle:** "Minimize external dependencies — prefer Node.js built-ins." — Applies because the self-re-invocation mechanism copies `/adev:build`'s existing, already-shipped pattern rather than introducing new orchestration machinery or a dependency on Claude Code's `/goal`.

## Acceptance Criteria

- [ ] `/adev:bugfix-loop` processes exactly one bug per turn and self-re-invokes until the board is drained or a budget is hit
- [ ] The skill never marks a bug fixed except via `/adev:debug`'s own `ADEV-DEBUG: FIXED` token
- [ ] A Load Skill Extensions block is present and invoked
- [ ] `ADEV-BUGFIX-LOOP: COMPLETE | BUDGET_EXHAUSTED | BLOCKED` is emitted correctly as the final line, matching the pinned grammar
- [ ] `--github-sync` fails fast with a clear error when the bridge capability isn't yet available, rather than silently no-op-ing
- [ ] Claim/release discipline holds even when `/adev:debug` crashes mid-attempt — no orphaned claims
- [ ] `BugfixLoopRun` state persists across self-re-invoked turns and survives a process restart mid-run
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
