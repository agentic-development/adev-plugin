# Failure-path exit event

Whenever the skill stops after the `--status started` event without reaching the exit event, emit the terminal event before surfacing the error to the operator:

```bash
adev report --type step --spec <spec-path> --step implement --status failed --verdict FAIL
```

`--verdict FAIL` is required, not decorative. The projection's aggregation pass in `lib/lifecycle-state.mjs` only treats a step terminal as explicit when it carries a string verdict; a `step_failed` emitted without one is overwritten by the verdict synthesized from the actor reports already on the log, so a run that died after two green tasks would project as `{verdict: PASS, status: completed}` and open the `validate` gate on work that never finished.

Abort paths in this skill that MUST emit it:

| Step | Abort |
|---|---|
| Prerequisites 4 | The current branch is `main`/`master` — the skill stops and asks the operator for a feature branch. This check runs *after* the `--status started` event, so it strands the step. |
| Step 1 | The epic-claim gate in Step 1 exits `2` — the epic is held by a live lease belonging to another owner, or is closed. That path already says **STOP, do not dispatch a single task**; this event is what records the halt. |
| Step 1.5 | Infrastructure preflight blocks: `report.passed === false`, `lib/infra-preflight.mjs` fails to import, or `runPreflight()` throws `PREFLIGHT_FILE_NOT_FOUND` / `PREFLIGHT_PARSE_ERROR`. |
| Step 2e | Playwright MCP browser tools are unavailable on a UI task — the documented "STOP the entire implementation" path. |
| Step 2.5 | `adev parallel assert-clean` returns `ORCHESTRATOR_POLLUTED` — the whole run aborts before any merge. |
| Step 2.5 | Any group failure that ends the run non-zero (`RERUN_COLLISION` without `--fresh`, `COMMITS_NOT_VERIFIED`, `MERGE_CONFLICT`), after the successful groups have been merged and the failed groups' worktrees retained. |

**Already covered — do not double-emit.** Per-task escalations route through the Step 2d blocker path (`plan_task` `blocked` event plus execution state with `status: "blocked"`), which is the terminal the framework already records for them. That path covers the subagent blocker-flag protocol, `MISSING_DEPTH_ASSIGNMENT` from `adev test-policy assert-assigned`, and the Stage-2 convergence terminals `LOOP_BUDGET_EXHAUSTED` / `LOOP_NO_PROGRESS` / `LOOP_REGRESSED`. Emit the step-level `--status failed` event only when the *whole skill* stops, not once per blocked task.

**Known gap (not this skill's to fix):** `adev report --type step` accepts no `--error` flag, so the abort's error code cannot be carried on the event even though the `step_failed` schema has an `error` field. Name the code in operator-facing output; widening the CLI surface is a follow-up.
