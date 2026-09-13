### Incremental Persistence

The build state is written **after each step completes** via `recordStepResult()` from `lib/build-state.mjs` (not just at the end). The helper handles atomic writes, timestamp generation, and build status recalculation automatically. This ensures that if the build is interrupted at any point, the recorded state reflects exactly which steps finished. Fields:

- `spec`: path to the spec being built
- `milestone`: milestone name (if invoked via `--milestone`) or `null`
- `status`: `in_progress` while running, `completed` when all steps finish successfully, `failed` if any step fails
- `steps`: array of step records, each with `name`, `status` (`completed`, `failed`, `skipped`), `timestamp` (ISO-8601), and optional `error` (string, only on failure). On tier-specific failures, the `error` field includes tier context: `"Integration gate failure: tier=integration, command='npm run test:integration', severity=error"`
- `started`: ISO-8601 timestamp of build start
- `updated`: ISO-8601 timestamp of last state write

Build status recalculation is handled automatically by `recordStepResult()`: when a step fails, `status` is set to `"failed"`; when all steps are completed or skipped, `status` is set to `"completed"`; otherwise it remains `"in_progress"`.

---
