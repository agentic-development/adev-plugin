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

  **Orphan-worktree sweep (BEH-13):** when the recovered run had `--worktree-per-bug` active (the crash that necessitated a manual `--resume` may have happened mid-attempt, before Step 6's own teardown ran), perform the same single-attempt sweep Step 6 does: `adev worktree remove --slug bugfix-<issue-id>` for the in-flight bug's worktree, if any. Same failure handling as Step 6 — `REMOVE_FAILED` logs a non-blocking advisory and the turn proceeds anyway; never retried.

- **`--max-priority` fail-fast validation:** once `run_id` is resolved (fresh or resumed — a run must exist before `finish` can be called below), validate `--max-priority <p>` if it was passed: `<p>` must be exactly one of `P0`, `P1`, `P2`, `P3`, `P4`. `P0`/`P1` are legal here — this is not the old rejection; only a value outside `P0`-`P4` is malformed. Omitting the flag resolves to `P3` (BEH-9, identical to today's behavior). On a malformed value (`INVALID_PRIORITY_BOUND`, BEH-10): halt immediately, before selecting any bug — go straight to Step 5 (Finish) with `--status blocked`, naming the rejected value in the finish note; Step 5 then prints the literal `ADEV-BUGFIXLOOP: BLOCKED` token (BEH-10). This check runs on every turn, including resumed ones — `--max-priority` (like `--max-turns`, `--github-sync`, `--worktree-per-bug`, `--auto-commit`) is one of the original invocation's flags Step 6 re-passes on every self-re-invocation (see Step 6).

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
