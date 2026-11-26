# Lite Mode: Inline Task Execution

A task that resolves `lite` is implemented in your own context, with no implementer subagent and no per-task reviewer. A post-task tripwire can escalate it to `quick` or `full`. Everything else about the run is unchanged: `lite` thins per-task review breadth and relaxes no hard gate (section 8).

## 1. When it applies

Step 2a's provisional call returned `depth: lite` for this task. That call is `adev implement resolve-depth --spec <spec> --plan <plan> --task-id <id> --run-base <run_base> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>] --pass provisional`, with `--lite` and `--tier` exactly as the operator passed them and `run_base` from `check-flags`. Run this file's steps instead of Step 2b-2g for that task. Every other task stays in the Step 2 loop.

The verb grants `lite` only when the operator authorized it (a flag the operator typed, or `implement_mode: lite` in `risk-policies.yaml`), the task is routed `auto-agent` with no score below the threshold, the spec is not high-risk, no provisional floor leg holds, and the run is not `--parallel`. You never decide it yourself, and you never add `--lite` or `--tier lite` on your own judgment.

**The routing sidecar must be committed at `run_base`.** The verb reads `<plan>.routing.json` from the `run_base` commit, not from the working tree. When `/adev:route` wrote the sidecar but it was never committed, every task is denied with `lite_denied: routing-scores` and the response carries a `ROUTING_SIDECAR_MISSING` warning naming the run base. No task then resolves `lite`, so this file never loads for that run. Step 2a relays the warning and tells the operator to commit the sidecar before running with `lite` again (`<ADEV_ROOT>/skills/implement/graduated-review-depth.md` §3): only when `check-flags` printed `lite_authorized: true`, and once, on the first provisional `resolve-depth` call of this invocation or on the `batches` advisory when `batches` runs, whichever comes first. The run itself continues at `quick` or `full`.

## 2. Inline execution

Run these in order:

1. Emit `plan_task` `in_progress` for the task (`reportPlanTask`, see `<ADEV_ROOT>/skills/implement/references/task-transitions.md`), and write execution state as Step 2c's "Update Execution State" describes.
2. Capture the task's base with `adev implement snapshot-base` and keep the printed tree id as `<snapshot>`. Section 3 passes it as `--base-sha`. Never substitute `git rev-parse HEAD`.
3. Read the task text from the plan, then implement it yourself, in your own context, under `<ADEV_ROOT>/skills/implement/references/agent-default-mandate.md` and `<ADEV_ROOT>/skills/implement/references/test-integrity.md`. A `lite` task always uses the `agent-default` mandate, whatever `implementation_mode` the project sets. `test-integrity.md` applies as it does in every mode.

What a `lite` task skips:

- There is no `Agent` dispatch for the implementer, the reviewers or a write-test author.
- There is no `adev test-policy resolve` call, no `assert-assigned` call and no `test_depth_assigned` event, as for every task under `agent-default`.
- There is no `review_round` event.

Inline edits run under the session's own tool permissions, and hooks apply to them exactly as to a subagent's edits. Keep your narration terse while you work. Every line you write stays in the context of every later task in the run.

## 3. Tripwire

When the task is done and before anything is committed, run the final pass:

```bash
adev implement resolve-depth --spec <spec> --plan <plan> --task-id <id> \
  --pass final --run-base <run_base> --base-sha <snapshot> [--review-cycles <n>]
```

Repeat the operator's `--tier` and `--lite` flags from the provisional call. The verb's tripwire is keyed on the task's provisional `lite` resolution, which it reads from the lifecycle log, so it always runs for a `lite` task, whatever flags the final call carries. It compares every touched file against the declared set, and reads governance from `run_base`.

Echo the response's warnings to the operator-facing transcript by code, as the depth contract's final pass states (`graduated-review-depth.md` §5): `REVIEW_DEPTH_FLOOR_APPLIED` and `LITE_TRIPWIRE_ESCALATED`. A `ROUTING_SIDECAR_MISSING` warning here repeats one already handled at Step 2a; do not echo it. When `warnings` carries `LITE_TRIPWIRE_ESCALATED`, echo it with the task id, `escalated_from` and the holding `floor_legs`. Echo by code, never from `floor_applied`: a `scope-mismatch` escalation sets `floor_applied: true` with `floor_legs: ["scope-mismatch"]`, and its only warning is `LITE_TRIPWIRE_ESCALATED`. Never announce a `scope-mismatch` escalation as `REVIEW_DEPTH_FLOOR_APPLIED`. Then branch on the returned `depth`:

- **Still `lite`.** Run the Step 2h `post-task` governance gates. A required gate that fails fails the task, as in Step 2h. Then make one commit for the task, carrying `Spec:` and `Plan-task: <n>` (Step 5.5 of the body), with no `Review-round:` trailer. The final-pass `review_depth_resolved` event with `depth: lite` is the task's review provenance. After the commit, emit `plan_task` `done`.
- **Escalated.** Continue at Step 2f-pre's branch for the returned depth: `quick` dispatches one synthesized reviewer, and `full` runs both stages (Stage 1, then Stage 2). Do not run the final pass again, because the tripwire call was this task's final pass. You are this task's implementer, so you write the status report the reviewers receive (Step 2c's Report Format), and you apply each fix pass inline. Every reviewer dispatch for this task carries `Implementation mode: agent-default`, the mandate the task was implemented under, not the project's `implementation_mode`. A reviewer told `tdd` would demand test-first evidence that cannot exist. Each fix pass stays under the `agent-default` mandate too. The review loop is capped and halts as in Step 2g (section 7). Once the review passes, Step 2h runs as for any reviewed task, `Review-round:` trailer included.

## 4. Ordering

Tasks run in plan order. Consecutive `lite` tasks run inline, one after another, and `quick` and `full` tasks go through the Step 2 loop between them. `adev implement batches` reports each granted task as `solo` with reason `lite`, and never places one in a batch. A batch dispatches when its first member comes up in plan order. A task the verb reports as `lite-assumed` (with a `LITE_AUTHORIZATION_ASSUMED` advisory) still waits for its own provisional call to say whether it runs inline.

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
