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

- **Summary-table row (BEH-6):** immediately before `record-attempt`, compute this attempt's file/test counts via `git diff --stat` against the working tree — already the correct tree (the per-bug worktree when `--worktree-per-bug` is active, else the loop's shared tree), since Step 3 already set `cwd` accordingly; no extra resolution needed here:

  ```bash
  git diff --stat HEAD
  ```

  Each line of `git diff --stat`'s output (except the trailing ` N files changed...` summary line) names one changed file, with a **leading space** before the path — e.g. ` lib/foo.mjs | 12 +++++--` or ` tests/foo.test.mjs | 8 ++++` (that leading space is real; strip it, or use a whitespace-tolerant match, before checking the prefix below — a literal `line.startsWith('tests/')` on the raw line always reads 0). `--files-touched` is the count of those per-file lines; `--tests-added` is the count of those lines whose path, after stripping the leading space, starts with `tests/`. Both are plain line counts from this one `git diff --stat` call, never parsed from `/adev:debug --auto`'s own output.

```bash
adev bugfix-loop record-attempt --run-id <run_id> --issue <id> --verdict <token-from-Step-4> --files-touched <n> --tests-added <n> --priority-bound <resolved-max-priority>
adev bugfix-loop complete-turn --run-id <run_id>
```

`--priority-bound` is the resolved `--max-priority` value already available from Step 2 (Improvement 5) — no new computation, just the same value passed through. `record-attempt` prints the running summary table (one row per attempt so far this run) to stdout as a side effect of this call — no separate print step.

- **`--github-sync` outbound writeback:** only when `--github-sync` was passed, after the AttemptRecord above is written, post the outcome comment for this attempt:

  ```bash
  adev tracker-sync outbound --local-issue-id <id> --verdict <FIXED|PARKED|UNREPRODUCIBLE> --completed-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --json
  ```

  This is a no-op (`{"posted": false, "reason": "no_link"}`) when the attempted WorkItem has no `TrackerSyncLink` — expected for any bug that did not originate from GitHub sync. Never blocks or retries within this turn on a post failure; the attempt's local state (`AttemptRecord`, `WorkItem`) is already correct regardless of whether the comment posted. Without `--github-sync`, skip this call entirely.

**The skill never marks a bug fixed itself.** `FIXED` is entirely `/adev:debug`'s own Phase 6 confidence gate — this skill only reads the token it already emitted.
