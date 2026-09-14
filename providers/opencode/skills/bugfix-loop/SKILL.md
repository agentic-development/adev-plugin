---
name: adev:bugfix-loop
description: "Self-re-invoking, one-bug-per-turn loop that drains eligible P2/P3 bugs from the issue board unattended, using /adev:debug --auto for each attempt. In OpenCode, invoke with skill({ name: 'adev:bugfix-loop' })"
---

# Autonomous Bugfix Loop

**Announce at start:** "I'm using the adev:bugfix-loop skill to drain eligible bugs from the board."

## Arguments

- `--max-bugs <N>`: caps bugs attempted across the whole run (across all self-re-invoked turns). Default: unbounded — the loop drains until no eligible bug remains or `--max-turns` is hit.
- `--max-turns <N>`: caps self-re-invocation turns. Default: 20 — a conservative bound preventing an unbounded run when neither flag is set.
- `--github-sync`: enables the tracker-provider-bridge's inbound pull before each bug selection and outbound writeback after each attempt (`tracker-provider-bridge.spec.md`). Inbound sync runs once per turn in Step 0, before the status/budget guard; outbound writeback runs once per completed attempt in Step 4. Both degrade gracefully (never error the loop) when GitHub or `gh` is unreachable — see Failure Modes below.
- `--resume [--resume-run-id <id>]` (internal): used only by this skill's own self-re-invocation, mirroring `/adev:build --resume`. Not intended for direct user invocation. `--resume-run-id` is always passed explicitly by the re-invocation call — the skill always knows its own `run_id` from the turn that just completed. A manual `--resume` without `--resume-run-id` falls back to `adev bugfix-loop latest` (the rare case of a manual `--resume` after a crash where the exact `run_id` wasn't captured).
- `--worktree-per-bug`: default OFF. When set, each bug's claim, `/adev:debug --auto` attempt (Step 4), and any resulting commit happen inside a dedicated `adev`-managed worktree (`adev worktree add --slug bugfix-<issue-id> --base <ref>`) instead of the shared working tree — isolating each bug's diff from every other bug's in-flight changes (spec BEH-3).
- `--auto-commit`: default OFF. When set (with or without `--worktree-per-bug`), a `FIXED` verdict triggers Step 4.5's commit/push/PR automation (spec BEH-4). Without either `--worktree-per-bug` or `--auto-commit`, Step 4.5 is skipped entirely and behavior is unchanged from before this capability existed.
- `--max-priority <P0-P4>`: caps the priority band Step 2 selects from. Default: `P3` (covering `P2`/`P3`, identical to today's hardcoded behavior). The full `P0`-`P4` range is accepted — `P0`/`P1` are a deliberate, explicit operator opt-in (BEH-9), not rejected the way they were before the eligibility-floor amendment shipped. Validated fail-fast at Step 0, before any bug selection (BEH-10); malformed values (anything other than `P0`-`P4`) halt the run with `INVALID_PRIORITY_BOUND`. BEH-7's unconditional module-exclusion floor (reserved safety tags, always enforced) is unaffected by this flag at any value, including `P0` — it is the actual, non-configurable safety boundary, not the priority band.

**Load Skill Extensions:**

```bash
adev skill-ext load --skill bugfix-loop
```

The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides). If the output is `__NONE__`, continue normally.

## Step 0: Resolve the run

Resolves the run (fresh, resumed, or manual-recovery), validates `--max-priority`, checks branch freshness, and runs the `--github-sync` inbound pull.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-0-resolve-the-run.md` for the full instructions. Do not act on this section from the summary above.

## Step 1: Turn guard (status + budget)

Checks the status guard and per-turn budget before selecting a bug.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-1-turn-guard.md` for the full instructions. Do not act on this section from the summary above.

## Step 2: Select a bug

Selects the next eligible bug via `adev issues next`, bounded by the resolved priority band.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-2-select-a-bug.md` for the full instructions. Do not act on this section from the summary above.

## Step 3: Claim (bounded 3-retry)

Claims the selected bug (optionally inside a per-bug worktree), retrying up to 3 times on contention.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-3-claim.md` for the full instructions. Do not act on this section from the summary above.

## Step 4: Attempt via /adev:debug --auto

Invokes `/adev:debug --auto` for the claimed bug, records the AttemptRecord, and releases the claim.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-4-attempt.md` for the full instructions. Do not act on this section from the summary above.

## Step 4.5: Commit and open a PR (FIXED verdicts only, gated)

For `FIXED` verdicts when `--worktree-per-bug` or `--auto-commit` was passed, commits the fix and opens a PR.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-4.5-commit-and-pr.md` for the full instructions. Do not act on this section from the summary above.

## Step 5: Finish (terminal turn only)

Prints the running summary table and the final `ADEV-BUGFIXLOOP:` token, on a terminal turn only.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-5-finish.md` for the full instructions. Do not act on this section from the summary above.

## Step 6: Self-re-invoke (non-terminal turns only)

Tears down any per-bug worktree, then self-re-invokes `/adev:bugfix-loop --resume` with the original flags, on a non-terminal turn only.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/bugfix-loop/references/steps/step-6-self-reinvoke.md` for the full instructions. Do not act on this section from the summary above.

## Failure Modes

| Condition | Behavior |
|---|---|
| Issue board unreachable / `tasks.backend` misconfigured | Halt immediately on the first turn, no retry; `adev bugfix-loop finish --status blocked`, then the `BLOCKED` token |
| Claim fails 3 times in one turn (contention) | Turn ends without an attempt, still counts toward `--max-turns` (Step 3), self-re-invokes normally |
| `/adev:debug --auto` crashes | Treated as `PARKED`, claim released, loop continues |
| `--github-sync` set, GitHub/`gh` unreachable during inbound sync | Degrades to local-board-only candidates this turn, no error; bounded to 5 consecutive degraded turns before `degraded_sync_note` is set and `gateCheck()` stops being called for the rest of the run (`tracker-provider-bridge.spec.md` Error Propagation) |
| `--github-sync` set, GitHub/`gh` unreachable during outbound writeback | That attempt's comment post is skipped and logged; local state (`AttemptRecord`, `WorkItem`) is unaffected, not retried automatically within the run |

## Red Flags

**Never:**
- Mark a bug fixed except through `/adev:debug`'s own `ADEV-DEBUG: FIXED` token
- Skip the status guard or budget check before calling `adev issues next`
- Retry a claim more than 3 times within a single turn
- End a non-terminal turn's response without self-re-invoking via the Skill tool
- Leave a claim orphaned when `/adev:debug --auto` crashes — always release
- Print the `ADEV-BUGFIXLOOP:` token anywhere but the literal last line of output
- Halt the run because `--github-sync` degraded — local-board-only operation is the correct degrade path, not a stop condition
