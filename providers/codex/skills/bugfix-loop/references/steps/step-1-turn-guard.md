## Step 1: Turn guard (status + budget)

Before selecting a bug, check the status guard and per-turn budget:

```bash
adev bugfix-loop guard --run-id <run_id> --json
```

- `{"proceed": false, "reason": "terminal_status", "status": "<s>"}`: this run already reached a terminal state. Do not call `adev issues next`, do not mutate `bugs_attempted[]`/`turns_completed`, do not re-print a completion token. Exit non-zero with a message naming `<s>` and instructing the operator to start a fresh `/adev:bugfix-loop` invocation (no `--resume-run-id`).
- `{"proceed": false, "reason": "budget_exhausted", "budget_reason": "max_bugs"|"max_turns"}`: go straight to Step 5 (Finish) with `--status budget_exhausted`, distinguishing which cap tripped (`max_bugs` reached vs. `max_turns` reached) in the finish note.
- `{"proceed": true}`: continue to Step 2.
