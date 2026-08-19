### Step 4: Completion

Clear `.context-index/hygiene/.active-plan` (scope guard deactivates).

**Clear Execution State:** After all tasks are complete, clear the execution state via the CLI:

```bash
adev execution-state clear
```

This resets the state to `idle` so the next session starts fresh. If the CLI call exits non-zero, log a warning — implementation is still considered complete.

**Release the epic claim** so the next session is not blocked by a lease this one no longer needs:

```bash
adev issues release <epic-id> --owner "${USER}/local"
```

`branch` and `pr` survive the release deliberately — they are the record of where the work went, and `/adev:status` reads them. If no epic was claimed (no `tasks.backend`), skip. A non-zero exit here is a warning, not a failure: an unreleased claim expires on its own rather than blocking forever.

Read the `completion.merge_policy` from manifest.yaml (default: "pr").

If merge_policy is "pr" or the current target branch is in protected_branches:
  Do NOT merge. Do NOT push to the protected branch. Suggest opening a PR.

If merge_policy is "merge" AND target branch is NOT protected:
  Offer to merge. Still confirm with the user before executing.

If merge_policy is "ask":
  Ask the user: "Open a PR or merge directly?"

Report to the user:

```
Implementation complete.

Tasks: N/N completed
Specialist routing: [list which specialists were used and for which tasks]
Review cycles: [total across all tasks, highlight any task that needed 3+]
Concerns noted: [list any DONE_WITH_CONCERNS items]

Next step: run /adev:validate for full post-implementation validation.
```

If merge_policy is "pr" (or target is a protected branch), append:

```
When validation passes, open a PR: gh pr create --base <target-branch>
Do NOT merge directly to <target-branch>.
```
