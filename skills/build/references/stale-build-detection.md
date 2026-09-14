## Stale Build Detection

When `--resume` is invoked, or at the start of a new `--spec` build, query `lib/build-state.mjs` (via `readBuildState` and the helper's listing API) for zombie builds.

**Zombie build:** A state record where `status` is `in_progress` AND all recorded steps have `status: skipped`. This means the orchestrator ran, evaluated all skip conditions (lifecycle log shows `review` and `plan` complete, plan file present, etc.), skipped every step, and exited without doing real work.

**On `--resume`:** Report zombie builds found:
```
Found stale build: `<spec-slug>` (started: <date>, all steps skipped)
Resume with: `/adev:build --resume --spec <path> --from implement`
```

**On new `--spec` build:** If the slug matches an existing zombie build for the same slug, warn and ask:
```
A stale build exists for `<spec-slug>` (started: <date>, all steps skipped).
  - Resume it: /adev:build --resume --spec <path> --from implement
  - Overwrite it: continue (resets build state for this spec)

Proceed? (resume / overwrite)
```
Await user input. "overwrite" resets the build state and proceeds. "resume" applies `--from implement` resume logic. If the user dismisses without choosing, stop and let them decide.

**`--auto` behavior:** When `--auto` is set, skip the prompt and overwrite the stale build automatically. Log: "Auto mode: overwriting stale build for `<spec-slug>`."

---
