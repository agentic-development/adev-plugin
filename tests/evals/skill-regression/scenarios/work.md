# Scenario: work

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:work`'s Step 1-4 triage — the state scan, classification, and route proposal — against both fixture specs and is scored by `rubrics/work.yaml`. This scenario stops at Step 4's route proposal and never proceeds to Step 5 (Invoke Skill): `/adev:work` is scored on the DECISION, and actually invoking a routed-to skill would pull that skill's own artifacts, and its own rubric's territory, into this run.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `adev coordination scan` (Step 1.5) shells out to `git` and `gh`, and a copy built with `createTempDir()` performs no `git init` at all, so those calls would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root. This places both `.context-index/lifecycle-state/shipping-rates.jsonl` and `.context-index/lifecycle-state/create-order.jsonl` directly under the copy, which is what Step 1.2's `currentState()` calls read.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Run

From that working directory, invoke `/adev:work` with no arguments, with `ADEV_NO_INFRA=1` **in this command's own env** — never a shell `export` (see Environment, below) — so Step 1.5's `adev coordination scan` runs its degraded-signal path cleanly rather than attempting a live network call.

Let Step 1 (Project State Scan) run in full: `readExecutionState`, `currentState()` against both `shipping-rates.jsonl` and `create-order.jsonl`, `listLifecycleStates()`, the `.context-index/sessions/*.md` glob, and `adev coordination scan`. Confirm both fixture specs surface as in-progress work, each with its own proposed next step per Step 3's Next-Step Projection table:

- `shipping-rates`: `specify` completed, no `review` step recorded in the log → propose `/adev:review-specs`. Confirm the reasoning **explicitly names the lifecycle log**, not `shipping-rates.spec.md`'s `status: review-pending` frontmatter alone, as the evidence — the fixture spec states the log is the load-bearing half and the frontmatter is the visible half, and an element anchored on the frontmatter would score `met` against a log that disagrees. Confirm neither `/adev:plan` (no review step at all, so the "review passed... no plan" row's precondition is unmet) nor `/adev:implement` (the Resume Override needs an incomplete plan the STATE SCAN found via the log, per Step 1.2's rule against grepping plan-file checkboxes — `shipping-rates.plan.md` sits on disk in the fixture as a planted trap the override must not fire on) is proposed, and that the reasoning names WHY each is withheld rather than silently omitting them.
- `create-order`: `validate` completed with verdict PASS in the log → classify as Done, offering `/adev:deploy`, `/adev:retro`, or new work — never a lifecycle-step route.

Confirm Step 1.5's `adev coordination scan` result — `none detected` in this fixture, since the copy is a fresh, unpushed repository with no remote — is surfaced to the user ahead of, or alongside, both route proposals, never only after the user has already confirmed one.

Confirm the 3 most recent `.context-index/sessions/*.md` files (by filename date, descending) are read and each file's summary line is surfaced alongside the in-progress-work listing, per Step 1.4.

**Stop at Step 4's route proposal.** Do not proceed to Step 5 (Invoke Skill) for either spec.

## Containment

Every file this scenario reads or writes must be isContained under <copy-root>. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring. The `ADEV_NO_INFRA=1 in the step's own env` token is passed once, in `/adev:work`'s own top-level invocation env, never as a shell `export` — `exec-consent.mjs` states consent is per-install and never persisted, and an export would leak into every later subprocess in the same terminal with nothing to unset it. This scenario's `adev coordination scan` call is the one place in this run that would otherwise attempt a live `gh`/network probe.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison. This scenario makes no commits of its own — Step 5 is never reached — so this check is routine hygiene here, not the load-bearing mechanism it is in `scenarios/implement.md` or `scenarios/build.md`.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
