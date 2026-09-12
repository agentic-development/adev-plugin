# Scenario: plan

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:plan` against `create-order.spec.md` and is scored by `rubrics/plan.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `/adev:plan` Step 5's atomic `.partial`-then-rename write assumes a real git working tree. A copy built with `createTempDir()` performs no `git init` at all, so a step that inspects the copy's git state would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board. Step 7's optional epic creation writes to this board when `tasks.backend` is configured.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Run

From that working directory, invoke `/adev:plan --spec .context-index/specs/features/orders/create-order.spec.md`: Spec Mode, re-planning an already-reviewed spec.

Step 1's review gate passes without any scenario-side setup — the copy's `create-order.jsonl` lifecycle log already carries `step_completed review PASS` (revision 2) from the fixture's own history. Confirm the Code-Side Drift Check (`hasDrift()`) reports no drift and planning proceeds. Confirm the prior `plan_task` events already on the copy's lifecycle log (from the fixture's own history) produce the "Re-plan detected" advisory at Step 7 — existing events remain as history, new ones append.

Author the plan in full: File Structure, Context Packets, Parallelization, Task Summary, and three tasks mirroring create-order.spec.md's three behaviors (field validation and the error contract; pricing and the discount bound; item-count bound, public surface, and documentation) — each with its own `**Tests:**` field and `Write failing test` step, per Step 5's Task Structure template. Skip the Plan Review Loop's actual subagent dispatch for this scenario (out of scope for this rubric — no reviewer-approval element is scored) and proceed directly to Step 7.

Confirm the freshly authored `create-order.plan.md` overwrites the copy's own pre-existing plan file, that the orders charter's Capability Map Status column for "Validate and price an order payload" reads `planned` after Step 7, and that one `pending` `plan_task` event per task is appended to the copy's lifecycle log.

## Containment

Every file this scenario reads or writes must be isContained under <copy-root>. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
