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
| `seed/` | The project the run starts from. `seed/.context-index/manifest.yaml` sets `implement.max_review_cycles: 1`, so a loop is capped after one review in both modes (`/adev:build` does not forward `--review-cycles`) |
| `preseed/task-1/` | Task 1's finished work, committed with `Spec:`/`Plan-task: 1` trailers before the Stage 1 case runs |

`seed/` and `preseed/task-1/` carry their own `package.json`, so
`scripts/run-tests.mjs` never runs their tests.

## Tasks

| Task | Role (derived by the harness) | Depth under `--lite` | What the reviewer finds |
|---|---|---|---|
| 1 | tripwire-target: it must also edit the undeclared `src/registry.mjs` | `lite`, then `quick` at the final pass | The plan says to use a given implementation as written, and that code has no JSDoc. An acceptance criterion requires a JSDoc block naming `SKU_INVALID`, so the synthesized reviewer has an Important finding |
| 2 | sensitive-path (`src/auth/audit.mjs`, built-in `**/auth/**`) | `full` | The plan's given implementation never checks `secret`. An acceptance criterion requires `AUDIT_SECRET_MISSING`, so Stage 1 spec compliance fails (WR-8) |
| 3 | lite-eligible | `lite` | None. It exists so the run can show that no later task starts |

The trigger is an acceptance criterion that the plan's given code does not
meet. Nothing the implementer reads is contradictory, so it has no reason to
stop and ask. The reviewer checks the criteria, so the first review has a
finding, and with a cap of one cycle the loop ends `LOOP_BUDGET_EXHAUSTED`. An
implementer that meets the criterion anyway makes the loop converge. That run
is recorded as `halted_other`, below.

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
