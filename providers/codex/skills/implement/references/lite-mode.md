# Lite Mode: Inline Task Execution

Read this file first when `check-flags` printed `lite_authorized: true`. A `lite` task is implemented in your own context, with no `Agent` dispatch and no per-task reviewer; a post-task tripwire can escalate it. `lite` relaxes no hard gate (section 8).

## 1. Which tasks run inline

Every task in the run starts with `adev implement task-begin` (section 2), which runs the provisional pass. The grant and floor rules are those of `adev implement resolve-depth`, stated in `<ADEV_ROOT>/skills/implement/graduated-review-depth.md`. You never decide a task's depth yourself, and you never add `--lite` or `--tier lite` on your own judgment.

- **`depth: lite`:** run section 2's loop for the task.
- **`quick` or `full`** (under the lite cap a `boundary` or `sensitive-path` floor gives `quick` with `floor_cap: "quick"`): read `step-2-per-task-loop.md` at the `<ADEV_ROOT>`-anchored path the body's Step 2 pointer names (repeating that anchor here would close a pointer cycle) and run the task through it, skipping only 2a's provisional call, whose event `task-begin` already wrote. Keep a `lite_denied` value for the run summary (section 5).

**The routing sidecar must be committed at `run_base`.** The verb reads `<plan>.routing.json` from the `run_base` commit, not the working tree, so a sidecar `/adev:route` wrote but nobody committed denies every task with `lite_denied: no-routing-entry` and adds a `ROUTING_SIDECAR_MISSING` warning naming the run base. The run continues at `quick` or `full`. Relay it with the instruction to commit the sidecar before using `lite` again, as Step 2a and `<ADEV_ROOT>/skills/implement/graduated-review-depth.md` §3 state: only when `check-flags` printed `lite_authorized: true`, and once, on the first provisional `resolve-depth` call of this invocation (here, the first `task-begin`) or on the `batches` advisory when `batches` runs, whichever comes first.

## 2. The inline loop

1. **Begin.** `adev implement task-begin --spec <spec> --plan <plan> --task-id <n> --run-base <run_base> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>]`, with `--lite`, `--tier` and `--parallel` exactly as the operator passed them to this invocation and `<n>` the bare plan number. For `depth: lite` it also emits `plan_task` `in_progress`, writes execution state, and prints `snapshot` (the dispatch-time tree, for section 3) and `execution_state`. Echo `REVIEW_DEPTH_FLOOR_APPLIED` by code. `"conflict"` means another build owns the live state: surface the owner stderr names, never pass `--force`, and skip Step 4's `adev execution-state clear`. `"failed"` is a warning. Exit 1 with `TASK_BEGIN_FAILED` stops the task through the Step 2d blocker path: `plan_task` `blocked` with the error, then execution state `status: "blocked"`.
2. **Probe, then implement** (Step 2.pre). If every file the task lists already exists and its tests pass, report that the task appears already implemented and ask whether to skip it. On a confirmed skip, run `adev report --type plan-task --spec <spec> --plan <plan> --task-id <n> --status done --notes "Already implemented (detected by implementation probe)"`, then run the next task's `task-begin`, so the task never stays `in_progress`. Otherwise implement the plan's task text yourself, under the mandate and test-integrity rules below.
3. **Test.** Run the tests relevant to what you changed (`node --test <files>` or the project's test command).
4. **Tripwire, gates, checkpoint, commit:** section 3.

A `lite` task skips the implementer, reviewer and write-test `Agent` dispatches, makes no `adev test-policy resolve` or `assert-assigned` call, emits no `test_depth_assigned` and no `review_round` event, and carries no `Review-round:` trailer. Inline edits run under the session's own permissions and hooks. Keep narration terse: every line stays in context for every later task.

### The `agent-default` mandate

A `lite` task always uses it, whatever `implementation_mode` the project sets. adev imposes no test requirement and no test order on the task.

- Add or change tests where they protect behavior that matters; skip them where they would only restate the implementation.
- Run the tests relevant to what you changed before you commit, so you never commit a red suite.
- Say in the task's summary which tests you added or changed, or why you added none.

### Test integrity

The always-on `test-integrity.md` rules, summarized. Read `<ADEV_ROOT>/skills/implement/references/test-integrity.md` before changing any test, or when a test fails unexpectedly; it is authoritative.

1. **Investigate first.** Before changing an assertion that fails unexpectedly, look at the actual behavior, then check the spec's acceptance criteria and `.context-index/adrs/`. If the test asserts the specified behavior, fix the code; if the spec is wrong, stop and escalate.
2. **Never loosen a matcher** to make a test pass (`toEqual` to `toContain`, an exact string to a case-insensitive regex). Fix the code that produces the wrong value.
3. **No conditional skips:** no `if visible … else skip`, no swallowed assertion errors, no `length >= 0`. A test that cannot fail is not a test.
4. **Fix the app, not the test.** Change a test only when the requirement changed, and update the spec with it.
5. **Seed before you assert.** Each test sets up its own deterministic data and asserts exact seeded values.

## 3. Tripwire, gates and commit

When the task is done and before anything is committed, run the final pass, with `--tier` and `--lite` exactly as the operator passed them on `task-begin`:

```bash
adev implement resolve-depth --spec <spec> --plan <plan> --task-id <n> \
  --pass final --run-base <run_base> --base-sha <snapshot> [--review-cycles <n>] \
  [--tier <t>] [--lite]
```

The tripwire is keyed on the task's provisional `lite` resolution in the lifecycle log, so it always runs for a `lite` task, whatever flags the final call carries. It checks every touched file and always applies the lite cap: a touched `sensitive-path` or `boundary` path escalates the task to `quick` (`floor_cap: "quick"`), as `scope-mismatch` does, and only a `routing` or `critical-finding` leg gives `full`.

Echo the warnings by code (`graduated-review-depth.md` §5): `REVIEW_DEPTH_FLOOR_APPLIED`, and `LITE_TRIPWIRE_ESCALATED` with the task id, `escalated_from` and the holding `floor_legs`. Never announce a `scope-mismatch` escalation as `REVIEW_DEPTH_FLOOR_APPLIED`, even though it sets `floor_applied: true`. A `ROUTING_SIDECAR_MISSING` here repeats one already relayed; do not echo it. Then branch on the returned `depth`:

- **Still `lite`.** Run the Step 2h `post-task` gates: when `governance/gates.yaml` declares gates whose `triggers` include `post-task`, read `step-2-per-task-loop.md` 2h for how to select and run them; a required gate that fails fails the task, and with no such gates there is nothing to run. For a task routed `assisted-agent`, present the diff and any tests you added and wait for approval. The gates and the checkpoint come first, never inside the chain. Then make one commit for the task with Step 5.5's `Spec:` and `Plan-task: <n>` trailers and no `Review-round:` trailer (the final-pass `review_depth_resolved` with `depth: lite` is its review provenance), emit `plan_task` `done`, and start the next task, as one chained command so each step runs only when the previous one succeeded and `done` never precedes the commit:

  ```bash
  git add <task files> && git commit -m "<subject>" --trailer "Spec: <spec>" --trailer "Plan-task: <n>" --trailer "Session: <session>" && adev report --type plan-task --spec <spec> --plan <plan> --task-id <n> --status done && adev implement task-begin --spec <spec> --plan <plan> --task-id <next> --run-base <run_base> \
    [--tier <t>] [--lite] [--parallel] [--review-cycles <n>]
  ```

  Drop the `task-begin` tail after the last task, or when the next task belongs to a batch (section 4). The tail's output is the next task's section 2 step 1. If a hook rejects the commit, fix the cause and re-run the whole chain; if a step fails after the commit, run only the remaining steps and never commit again.
- **Escalated.** Read `step-2-per-task-loop.md` and continue at 2f-pre's branch for the returned depth: `quick` dispatches one synthesized reviewer, and `full` runs both stages (Stage 1, then Stage 2). Do not run the final pass again; the tripwire call was this task's final pass. You are the task's implementer, so you write the status report the reviewers receive (Step 2c's Report Format) and apply each fix pass inline. Every reviewer dispatch for the task carries `Implementation mode: agent-default`, not the project's `implementation_mode`, because a reviewer told `tdd` would demand test-first evidence that cannot exist, and each fix pass stays under the `agent-default` mandate. The loop is capped and halts as in section 7. Once the review passes, Step 2h runs as for any reviewed task, `Review-round:` trailer included.

## 4. Ordering

Tasks run in plan order. Consecutive `lite` tasks run inline, one after another, and `quick` and `full` tasks go through the Step 2 loop between them. Before the first task, run `adev implement batches --plan <plan-path> --run-base <run_base> [--lite] [--tier <t>] [--max-batch <n>] [--no-batch]` once, passing `--lite` and `--tier` only as the operator passed them, and `--max-batch` and `--no-batch` only as the operator passed them to this invocation. Its result holds for the run: when you later read the Step 2 loop for a `quick` or `full` task, do not run `batches` again. It reports each granted task as `solo` with reason `lite` and never places one in a batch. When a batch forms, its first member's turn dispatches the whole batch (`<ADEV_ROOT>/skills/implement/references/batched-mode.md`), and its members are not started with `task-begin`: the batch agent makes their provisional calls. A task reported as `lite-assumed` (with a `LITE_AUTHORIZATION_ASSUMED` advisory) still waits for its own `task-begin` to say whether it runs inline.

## 5. Run summary

Copy these into the run summary verbatim:

- The `lite authorized via <source>` line that `check-flags` produced at the start of the run.
- Each task's `lite_denied` value other than `not-authorized`, with its task id. A `not-authorized` denial is silent.
- Each `LITE_TRIPWIRE_ESCALATED` warning, with the task id and legs.

## 6. End of run

When any task in the run resolved `lite`, the end-of-run gates change. Read `<ADEV_ROOT>/skills/implement/references/integration-gate.md` for the whole-run quality-gate pass, and `<ADEV_ROOT>/skills/implement/references/steps/step-3-final-review.md` for when Step 3's final reviewer runs.

## 7. The halt for an escalated task

An escalated task's review loop that does not converge within its cap (`LOOP_BUDGET_EXHAUSTED`, `LOOP_NO_PROGRESS` or `LOOP_REGRESSED`) takes the same Step 2g halt as any `quick` or `full` task:

- The task gets `plan_task` `blocked` with the loop code, and execution state is written with `status: "blocked"`.
- No later task starts. Commits of tasks that already completed are kept.
- The halt message names the loop code, the task id and the outstanding finding ids.

The halt never waits for input, and emits no `step_failed`. `--lite` changes nothing about it.

## 8. Hard gates that `lite` never relaxes

Each of these applies to a run with `lite` tasks exactly as in `full`:

- The strict `lifecycle.gate_mode` chain.
- `adev gate require` before the step-started event.
- The non-main-branch stop: the skill never implements on `main` or `master`.
- Skill extensions loaded through `adev skill-ext load`.
- `test-integrity.md`, in every mode and for every task.
- Quality-gate fail-fast, per task in Step 2h and over the whole run in Step 2-post.
- Destructive-action gates.
- Constitution checks.
