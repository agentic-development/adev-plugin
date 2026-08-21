---
name: adev:bugfix-loop
description: "Self-re-invoking, one-bug-per-turn loop that drains eligible P2/P3 bugs from the issue board unattended, using /adev:debug --auto for each attempt. In Codex, invoke with $adev:bugfix-loop"
---

# Autonomous Bugfix Loop

**Announce at start:** "I'm using the adev:bugfix-loop skill to drain eligible bugs from the board."

## Arguments

- `--max-bugs <N>`: caps bugs attempted across the whole run (across all self-re-invoked turns). Default: unbounded — the loop drains until no eligible bug remains or `--max-turns` is hit.
- `--max-turns <N>`: caps self-re-invocation turns. Default: 20 — a conservative bound preventing an unbounded run when neither flag is set.
- `--github-sync`: enables the tracker-provider-bridge's inbound pull before each bug selection and outbound writeback after each attempt (`tracker-provider-bridge.spec.md`). Inbound sync runs once per turn in Step 0, before the status/budget guard; outbound writeback runs once per completed attempt in Step 4. Both degrade gracefully (never error the loop) when GitHub or `gh` is unreachable — see Failure Modes below.
- `--resume [--resume-run-id <id>]` (internal): used only by this skill's own self-re-invocation, mirroring `/adev:build --resume`. Not intended for direct user invocation. `--resume-run-id` is always passed explicitly by the re-invocation call — the skill always knows its own `run_id` from the turn that just completed. A manual `--resume` without `--resume-run-id` falls back to `adev bugfix-loop latest` (the rare case of a manual `--resume` after a crash where the exact `run_id` wasn't captured).

**Load Skill Extensions:**

```bash
adev skill-ext load --skill bugfix-loop
```

The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides). If the output is `__NONE__`, continue normally.

## Step 0: Resolve the run

- **Fresh invocation (`--max-bugs`/`--max-turns`/no resume flags):**

  ```bash
  adev bugfix-loop create --max-bugs <N> --max-turns <N> --json
  ```

  Capture `run_id` from the result.
- **`--resume --resume-run-id <id>`:** use `<id>` directly — it was passed explicitly by the prior turn's own self-re-invocation, so no discovery is needed.
- **`--resume` with no `--resume-run-id` (manual crash recovery):**

  ```bash
  adev bugfix-loop latest --json
  ```

  If the result's `run` is `null`, there is nothing to resume — tell the user and stop. Otherwise use the returned `run.run_id`.

- **Freshness guard:** once `run_id` is resolved (fresh or resumed), check branch freshness before the Step 1 status/budget guard:

  ```bash
  adev bugfix-loop check-freshness --json
  ```

  In every branch below, "`BRANCH_STALE_BLOCKED`" and "`FRESHNESS_CHECK_DEGRADED`" are internal behavior-id/log-tags for this table's own rows (BEH-2 and the Error Cases table), not literal `ADEV-BUGFIXLOOP:` values — the only strings ever printed as the final `ADEV-BUGFIXLOOP:` token are `COMPLETE`, `BUDGET_EXHAUSTED`, and `BLOCKED` (Step 5).

  - `{"status": "ok", "ahead": <n>, "behind": <n>}`: continue to the `--github-sync` inbound pull below (or Step 1 if `--github-sync` was not passed).
  - `{"status": "warn", "ahead": <n>, "behind": <n>}`: print a warning naming the ahead/behind counts — `local branch is <behind> commits behind origin/<default-branch> (soft threshold)` — without halting the run (BEH-1). Continue to the `--github-sync` inbound pull below (or Step 1 if `--github-sync` was not passed) — same routing as `ok`.
  - `{"status": "blocked", "ahead": <n>, "behind": <n>}`: halt before bug selection (internal tag `BRANCH_STALE_BLOCKED`). Go straight to Step 5 (Finish) with `--status blocked`, naming the freshness gap in the finish note (e.g. `local branch is <behind> commits behind origin/<default-branch>, exceeding the configured hard threshold`); Step 5 then prints the literal `ADEV-BUGFIXLOOP: BLOCKED` token (BEH-2). Do not select or attempt any bug this turn, and do not run the `--github-sync` inbound pull.
  - `{"status": "degraded", "reason": "<reason>"}`: print a logged warning — `freshness check skipped — <reason>` — (internal tag `FRESHNESS_CHECK_DEGRADED`; this degrade path is total, not limited to the origin-unreachable case) and continue to the `--github-sync` inbound pull below (or Step 1 if `--github-sync` was not passed) — same routing as `ok`/`warn`. A degraded freshness check is not itself a reason to skip inbound sync.

- **`--github-sync` inbound pull:** once `run_id` is resolved (fresh or resumed), and only when `--github-sync` was passed, run inbound sync for this turn before the Step 1 guard:

  ```bash
  adev tracker-sync inbound --run-id <run_id> --json
  ```

  Capture the JSON result. Print any `notices` array entries as-is (each is already a formatted one-line stale-link message). This call degrades gracefully — a non-null `degraded: true` in the result means the turn proceeds with local-board-only candidates (see Failure Modes); it is never a reason to stop the run. Without `--github-sync`, skip this call entirely.

## Step 1: Turn guard (status + budget)

Before selecting a bug, check the status guard and per-turn budget:

```bash
adev bugfix-loop guard --run-id <run_id> --json
```

- `{"proceed": false, "reason": "terminal_status", "status": "<s>"}`: this run already reached a terminal state. Do not call `adev issues next`, do not mutate `bugs_attempted[]`/`turns_completed`, do not re-print a completion token. Exit non-zero with a message naming `<s>` and instructing the operator to start a fresh `/adev:bugfix-loop` invocation (no `--resume-run-id`).
- `{"proceed": false, "reason": "budget_exhausted", "budget_reason": "max_bugs"|"max_turns"}`: go straight to Step 5 (Finish) with `--status budget_exhausted`, distinguishing which cap tripped (`max_bugs` reached vs. `max_turns` reached) in the finish note.
- `{"proceed": true}`: continue to Step 2.

## Step 2: Select a bug

If `--github-sync` was set, inbound sync already ran in Step 0 — candidates below reflect the latest sync for this turn.

```bash
adev issues next --type bug --max-priority P3 --json
```

If the result's `bug` is `null`: the board is drained. Go to Step 5 with `--status complete`.

## Step 3: Claim (bounded 3-retry)

```bash
adev issues claim <id> --owner bugfix-loop --branch "$(git branch --show-current)"
```

`adev issues claim` failures release no lease — a failed bug is not re-eligible within this turn (its lease has not expired). On failure, call Step 2 again for the next-eligible bug and retry claim, **up to 3 total claim attempts in this turn**. If all 3 claim retries fail, this turn ends without an attempt: still call `adev bugfix-loop complete-turn --run-id <run_id>` (this failed-contention turn still counts toward `--max-turns`, per the Failure Modes table), then go to Step 6 (self-re-invoke) — do **not** fall through to Step 5's terminal path, since eligible bugs may remain.

## Step 4: Attempt via /adev:debug --auto

Set `ADEV_ISSUE_OWNER=bugfix-loop` in the environment for this invocation only, then invoke (via the Skill tool, in the current turn — not a background dispatch):

```
/adev:debug --issue <id> --apply --auto
```

`ADEV_ISSUE_OWNER=bugfix-loop` makes `/adev:debug`'s own Phase 1.6 re-claim and Phase 6 release resolve to the same owner this loop claimed with (`skills/debug/SKILL.md` — already shipped, reads `ADEV_ISSUE_OWNER` when set).

Read the resulting `ADEV-DEBUG: FIXED|PARKED|UNREPRODUCIBLE` token from the last line of that turn's output.

- **If `/adev:debug --auto` crashes** (errors out entirely rather than emitting a clean token): treat as `PARKED` with an explanatory note. Do not halt the run.

Write the AttemptRecord, mapping the token onto `per-issue-attempt-cap`'s outcome contract:

```bash
adev issues record-attempt --issue <id> --outcome <FIXED|PARKED|UNREPRODUCIBLE> [--check-ids <csv-from-FAILING-CHECKS-block>] [--raw-output <text-if-no-discrete-ids>]
```

The check-ID data for `PARKED` is read from `IssueManager.get(id).notes`'s `FAILING-CHECKS:` block (`debug-completion-and-auto` BEH-8).

Release the claim, using the same owner the loop claimed with:

```bash
adev issues release <id> --owner bugfix-loop
```

Regardless of outcome:

```bash
adev bugfix-loop record-attempt --run-id <run_id> --issue <id>
adev bugfix-loop complete-turn --run-id <run_id>
```

- **`--github-sync` outbound writeback:** only when `--github-sync` was passed, after the AttemptRecord above is written, post the outcome comment for this attempt:

  ```bash
  adev tracker-sync outbound --local-issue-id <id> --verdict <FIXED|PARKED|UNREPRODUCIBLE> --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --json
  ```

  This is a no-op (`{"posted": false, "reason": "no_link"}`) when the attempted WorkItem has no `TrackerSyncLink` — expected for any bug that did not originate from GitHub sync. Never blocks or retries within this turn on a post failure; the attempt's local state (`AttemptRecord`, `WorkItem`) is already correct regardless of whether the comment posted. Without `--github-sync`, skip this call entirely.

**The skill never marks a bug fixed itself.** `FIXED` is entirely `/adev:debug`'s own Phase 6 confidence gate — this skill only reads the token it already emitted.

## Step 5: Finish (terminal turn only)

```bash
adev bugfix-loop finish --run-id <run_id> --status <complete|budget_exhausted|blocked> --json
```

Read `degraded_sync_note` from the JSON result — this reflects whatever `adev tracker-sync inbound` (Step 0) wrote into the same run-state file over the course of this run, not a placeholder. If non-null, print `GitHub sync degraded during this run: <degraded_sync_note>` as the line immediately before the token — the token itself is still unconditionally the literal last line.

Print `ADEV-BUGFIXLOOP: <token-from-result>` as the **final line** (the last line, verbatim, with no trailing prose) of this turn's output — one of:

- `ADEV-BUGFIXLOOP: COMPLETE` — board drained, no eligible bugs remain
- `ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED` — `--max-bugs`/`--max-turns` hit while eligible bugs remain
- `ADEV-BUGFIXLOOP: BLOCKED` — a structural failure halted the run before any bug was attempted

**Persona-exempt** (like `ADEV-BUILD`/`ADEV-VALIDATE`/`ADEV-DEBUG` — `skills/using-adev/SKILL.md`'s Persona Output Override carve-out names it explicitly). **Excluded from spine-skill chaining** — no "Next Step in the Lifecycle" footer follows this token (`single-front-door.spec.md`).

## Step 6: Self-re-invoke (non-terminal turns only)

This is this turn's own last action — no human approval, confirmation, or manual re-entry:

Immediately re-invoke `/adev:bugfix-loop --resume --resume-run-id <run_id>` via the Skill tool. The re-invocation starts a fresh turn with a clean context. **Ending this turn's response without re-invoking (when not terminal) is a loop failure.**

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
