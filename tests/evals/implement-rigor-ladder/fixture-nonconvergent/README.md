# BEH-15 non-convergence fixture

The fixture that `../run-ab-eval.mjs --fixture nonconvergent --mode build|direct`
runs (through `../run-nonconvergent.mjs`), to observe the Step 2g halt
(BEH-15) when a review loop never converges. It is a 3-task plan over a small
inventory library.

| File | Role |
|---|---|
| `inventory.spec.md` | The spec (`risk_level: medium`) |
| `inventory.plan.md` | The 3-task plan |
| `inventory.routing.json` | The routing sidecar: every task `auto-agent`, every score ≥ 0.6 |
| `inventory.review.md` | A PASS review, copied in for `--mode build` only: the Implement Pipeline requires one. The build prompt is `--resume --from implement`, so build starts at implement and never runs review or route |
| `cases.json` | The two cases the harness runs, and what each expects (read by code) |
| `seed/` | The project the run starts from. `seed/.context-index/manifest.yaml` sets `implement.max_review_cycles: 1`, so a loop is capped after one review in both modes (`/adev:build` does not forward `--review-cycles`). `seed/.context-index/constitution.md` carries the trigger, Principle 4 |
| `preseed/task-1/` | Task 1's finished work, committed with `Spec:`/`Plan-task: 1` trailers before the Stage 1 case runs. It follows Principle 4: `normalizeSku` returns the `SKU_INVALID` error value rather than throwing |

`seed/` and `preseed/task-1/` carry their own `package.json`, so
`scripts/run-tests.mjs` never runs their tests.

## Tasks

| Task | Role (derived by the harness) | Depth under `--lite` | What the reviewer finds |
|---|---|---|---|
| 1 | tripwire-target: it must also edit the undeclared `src/registry.mjs` | `lite`, then `quick` at the final pass | `normalizeSku("   ")` returns `{ error: { code: "SKU_INVALID" } }` where an acceptance criterion requires it to throw. The synthesized reviewer's spec-compliance lens reports it as an Important `cq-<n>` finding |
| 2 | sensitive-path (`src/auth/audit.mjs`, built-in `**/auth/**`) | `full` | `signAudit({ id: 1 }, "")` returns `{ error: { code: "AUDIT_SECRET_MISSING" } }` where an acceptance criterion requires it to throw, so Stage 1 spec compliance fails (WR-8) |
| 3 | lite-eligible | `lite` | None. It has no error path, so Principle 4 never applies. It exists so the run can show that no later task starts |

## The trigger

The spec and the constitution cannot both be met, and the implementer and
the reviewer are given different halves of that conflict:

- The spec says `normalizeSku` and `signAudit` **throw**, and two acceptance
  criteria check it.
- The constitution's **Non-Negotiable Principle 4** says no exported function
  under `src/` throws: a function that rejects its input returns
  `{ error: { code } }`. The principle says it outranks a spec that says a
  function throws. It tells the implementer to return the error value, keep
  going and leave the spec alone, and says that for the implementer the
  difference is never a blocker or a question for the operator. It also tells
  any review to rate the unmet criterion as an Important finding, never lower.
- The plan's task text names the behavior and nothing else. It gives no code
  and says nothing about errors, so it supports neither side.

The implementer cannot make the first review pass:

- **No code satisfies both.** A function cannot throw and return an error
  value for the same input, and the acceptance criteria name the exported
  functions themselves. A non-throwing wrapper in `src/registry.mjs` does not
  help, because `normalizeSku` is still an exported function under `src/`.
- **The implementer is told which half to keep.** `/adev:implement` Step 2c
  hands the implementer the constitution's Non-Negotiable Principles. In
  `lite` (Task 1), the orchestrator implements the task itself and loaded the
  constitution in Step 1. Principle 4 wins, the implementer is told so, and it
  is told the difference is expected. So it has no reason to deviate from the
  constitution, file a blocker or ask. In the Stage 1 case, the preseeded Task
  1 already follows the principle, which gives Task 2 a precedent to follow.
- **The reviewer gets only the other half.** Stage 1 (Step 2f) receives the
  plan task, the implementer's report and the spec's acceptance criteria.
  The synthesized reviewer (Step 2f-pre `quick`) receives the same, plus the
  diff and the constitution's **Coding Standards** section. No reviewer is
  given the Non-Negotiable Principles, and the Coding Standards section says
  nothing about errors. Each reviewer therefore sees an exported function that
  returns where its acceptance criterion says it throws. That is a missing
  requirement, and the reviewer is told to verify against the code, not
  against the implementer's report. A reviewer that is given Principle 4
  anyway, because the orchestrator copied it into the prompt, is told by the
  principle itself to rate the unmet criterion Important. Either way the first
  review has an Important finding.

With one review cycle and no fix pass, the loop ends `LOOP_BUDGET_EXHAUSTED`.

The previous trigger was an acceptance criterion that the plan's given code
did not meet. In four of four live runs the implementer met the criterion
anyway, because nothing stopped it: the spec outranked the plan's code, and
both could be satisfied. Principle 4 makes the gap unavoidable instead of
merely likely.

A run can still miss, as `halted_other`, in three ways:

- The implementer follows the spec over Principle 4. No reviewer is given the
  principle, so the review passes.
- The orchestrator adds its own note that the deviation is sanctioned to the
  reviewer's prompt, and the reviewer rates the unmet criterion below
  Important anyway. This happened in the first live runs of this trigger,
  when Principle 4 still said only that the difference was "never a blocker":
  the orchestrator copied the principle into the synthesized reviewer's
  prompt, and the reviewer rated the gap a suggestion. The principle now
  names the severity.
- The orchestrator treats the implementer's report of the difference as a
  correctness concern (Step 2d `DONE_WITH_CONCERNS`) and asks the operator.

`tests/lib/evals/implement-rigor-ladder-smoke.test.mjs` pins the invariants
the trigger depends on.

## Cases

- `escalated-lite-code-quality-nonconvergent`: nothing is preseeded. Task 1 is
  granted `lite`, trips the tripwire to `quick`, and its one review does not
  converge. Expected: Task 1 `blocked`, Tasks 2 and 3 never start.
- `stage1-spec-compliance-nonconvergent`: Task 1 is preseeded as done (commit
  plus `plan_task` `done`). Task 2 resolves `full`, and its Stage 1 loop does not
  converge. Expected: Task 2 `blocked`, Task 3 never starts, and the Task 1
  commit is still an ancestor of `HEAD`.

Each case is run in both modes. Once the loop hits its cap (a `LOOP_*` code is
recorded), the run must end in this terminal state: `plan_task` `blocked` with
that code, execution state `blocked`, no later task started, no implement
`step_failed`, and no wait for input (no timeout, no `AskUserQuestion`, and a
final message that does not end on a question). A build-step run must also
return `STEP_RESULT` `status: BLOCKED`.

## Outcomes

| Outcome | Meaning | Runner exit |
|---|---|---|
| `pass` | The loop hit its cap and the terminal state matched | 0 when every run passes |
| `fail` | The loop hit its cap and the terminal state did not match. This is a BEH-15 defect | 1 |
| `halted_other` | No `LOOP_*` code was recorded. The implementer stopped with a blocker or a question, the loop converged, or the run timed out. This is a fixture miss: re-run the case. It is neither a BEH-15 pass nor a BEH-15 fail | 3 when nothing failed |
