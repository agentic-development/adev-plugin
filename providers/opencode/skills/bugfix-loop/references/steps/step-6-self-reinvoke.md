## Step 6: Self-re-invoke (non-terminal turns only)

- **`--worktree-per-bug` worktree teardown (before self-re-invoking):** when `--worktree-per-bug` was active for the bug just attempted this turn, remove its worktree once Step 4.5's commit (or an explicit skip) is confirmed:

  ```bash
  adev worktree remove --slug bugfix-<issue-id>
  ```

  - On success (exit 0): the worktree and its path are gone; continue to self-re-invocation below. `adev worktree remove` (no `--delete-branch`) only removes the worktree directory — it never deletes the `adev/bugfix-<issue-id>` branch itself, so any commit already made on it survives this call regardless of what happened afterward (push/PR).
  - On failure (non-zero exit; stderr carries a `REMOVE_FAILED: <message>` line — same no-JSON-status-field shape as `ADD_FAILED` in Step 3): log this as a non-blocking advisory and self-re-invoke anyway. Never retry the removal, never block the turn on it — an orphaned worktree is cleaned up later by the manual `--resume` sweep below, or by hand.
  - **When to defer removal (`WORKTREE_REMOVAL_DEFERRED`) vs. when it is safe to remove:** the only thing that can be lost by removing a worktree is an uncommitted diff — since the branch (and any commit on it) survives regardless. Defer removal, leaving the worktree in place and logging its path, only when nothing was committed this turn:
    - `PARKED`/`UNREPRODUCIBLE` verdicts, where Step 4.5 never runs at all (nothing was ever attempted to be committed).
    - A `FIXED` verdict where Step 4.5 ran but degraded at the commit stage itself (`COMMIT_PR_SKIPPED` with a `branch resolution failed`/`checkout failed`/`staging failed`/`commit failed` reason — the diff is still sitting uncommitted in the worktree).

    It is safe to proceed with `adev worktree remove` — do **not** defer — when Step 4.5 committed successfully but degraded afterward (`COMMIT_PR_SKIPPED` with a `push failed`/`gh pr create failed` reason): the commit already lives on the branch, so removing the worktree directory loses nothing.

  Without `--worktree-per-bug`, skip this bullet entirely — there is no per-bug worktree to remove.

This is this turn's own last action — no human approval, confirmation, or manual re-entry:

Immediately re-invoke `/adev:bugfix-loop --resume --resume-run-id <run_id>` **plus every other flag the original invocation was given** (`--max-bugs`, `--max-turns`, `--github-sync`, `--worktree-per-bug`, `--auto-commit`, `--max-priority`) via the Skill tool — a self-re-invocation is a continuation of the same run, not a fresh invocation with defaults, so its configuration carries forward unchanged turn to turn. The re-invocation starts a fresh turn with a clean context. **Ending this turn's response without re-invoking (when not terminal) is a loop failure.**
