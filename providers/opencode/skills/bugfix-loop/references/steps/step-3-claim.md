## Step 3: Claim (bounded 3-retry)

- **`--worktree-per-bug` worktree setup (before claim):** when `--worktree-per-bug` is set, before claiming this bug, read `worktree_base_ref` from the Step 1 `guard --json` result (the previous bug's completed branch this run, or the loop's starting branch for the first bug), then:

  ```bash
  adev worktree add --slug bugfix-<issue-id> --base <worktree_base_ref>
  ```

  On success (exit 0, worktree info printed as JSON on stdout): the claim below, the `/adev:debug --auto` attempt (Step 4), and any resulting commit (Step 4.5) all happen inside that worktree's path (`<mainRoot>/.adev/worktrees/bugfix-<issue-id>`, on branch `adev/bugfix-<issue-id>`) — isolated from every other bug's in-flight changes (BEH-3).

  On failure (non-zero exit; stderr carries an `ADD_FAILED: <message>` line — there is no JSON status field to branch on, unlike the freshness guard's `check-freshness`): this bug is not attempted this turn — no lease change, skip straight back to Step 2 for the next-eligible bug (mirrors the claim-retry path below; an `ADD_FAILED` bug does not consume one of the 3 claim-retry attempts, since no claim was ever attempted for it).

  Without `--worktree-per-bug`, skip this bullet entirely — claim, attempt, and any commit all happen in the shared working tree, exactly as before this capability existed.

```bash
adev issues claim <id> --owner bugfix-loop --branch "$(git branch --show-current)"
```

`adev issues claim` failures release no lease — a failed bug is not re-eligible within this turn (its lease has not expired). On failure, call Step 2 again for the next-eligible bug and retry claim, **up to 3 total claim attempts in this turn**. If all 3 claim retries fail, this turn ends without an attempt: still call `adev bugfix-loop complete-turn --run-id <run_id>` (this failed-contention turn still counts toward `--max-turns`, per the Failure Modes table), then go to Step 6 (self-re-invoke) — do **not** fall through to Step 5's terminal path, since eligible bugs may remain.
