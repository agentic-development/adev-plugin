# Scenario: implement

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:implement` against `shipping-rates.plan.md`'s Task 2 and is scored by `rubrics/implement.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form. This is load-bearing here, not merely hygienic: `/adev:implement`'s Step 2h.3 makes exactly one commit per task, and a copy built with `createTempDir()` performs no `git init` at all, so that commit would silently land in whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than in the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board. `/adev:implement` is the tier's other board-touching skill — it claims and releases the epic per Step 1 — so this splice is what the board-containment check below actually exercises, not a formality carried for other scenarios' sake.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Before the run — capture the pre-run baseline

Anchored at `-C resolveMainRoot(startCwd)` (`lib/worktree.mjs`), **before any chdir into the copy**, enumerate every working-tree root this repository owns via `git worktree list --porcelain`. At each root, capture `git status --porcelain --ignored=traditional --untracked-files=all` and `git rev-parse HEAD`. This is the baseline the post-run check (below) compares against — captured from the real repository's vantage point, never from inside the disposable copy.

## Run

From the copy's working directory, invoke `/adev:implement --plan .context-index/specs/features/orders/shipping-rates.plan.md --task 2`. Task 2's own checklist opens straight at "Implement" with no red-phase step (this is PV-10's planted defect) — confirm `/adev:implement` enforces the TDD mandate (`skills/implement/tdd-mandate.md`) regardless, dispatching a write-test cycle for B7 before any edit to `src/shipping/rates.mjs`, exactly as the plan's own absence of that step does not excuse it.

Let the task run to completion: both review stages pass, the task's single commit lands in the copy, the `plan_task` `done` event is recorded, and the epic claim from Step 1 is released per Step 4.

## Board containment — and its vacuity trap

State explicitly, and check both ways:

- **With the Setup splice in place** (the normal case): confirm `isContained(lenientRealpath(resolveStorageRoot(loadManifest(<copy-root>), <copy-root>)), lenientRealpath(<copy-root>))` holds, and that the copy's `.context-index/tasks/tasks.json` shows the epic claimed before Task 2's dispatch and released after Step 4.
- **The vacuity trap**: if `tasks.db_path` were absent from the copy's manifest, `resolveStorageRoot` falls through to its git-common-dir branch (`lib/issues/resolve-root.mjs:33`) and returns the copy root anyway, because the copy is its own git repository — so the containment check **passes vacuously** in that configuration, proving nothing about whether the splice is doing any work. Do not treat a containment pass as meaningful unless the splice's presence was confirmed first (Manifest fidelity, below) — a pass that would occur either way is not evidence.

## `implement` commits — why `git status` alone cannot verify this

No `git status` of any kind can see a commit that already landed; a tree left clean by a completed commit and a tree that was never touched both report clean. This is the one scenario in either tier where a commit is the expected, correct outcome of a passing run, so the capture pairs the `git status --porcelain --ignored=traditional --untracked-files=all` comparison with a **`git rev-parse HEAD` equality check at every root** `git worktree list --porcelain` printed in the pre-run baseline above — re-run from the same `-C resolveMainRoot(startCwd)` vantage point, after the scenario completes. Every root's `HEAD` must equal its pre-run value: the one commit this run makes lands inside `<copy-root>`, which is not a root that enumeration ever lists (it is a disposable clone, not a linked worktree of this repository), so every real root's `HEAD` is unmoved. A `HEAD` that moved at any of this repository's own roots means the run committed somewhere it should not have.

## Containment

Every file this scenario reads or writes must be isContained under <copy-root>. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>. This confirmation is the precondition the board-containment vacuity trap (above) depends on — without it, a containment pass cannot be told apart from the vacuous case.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison. For this scenario specifically, this is not a routine hygiene check but the mechanism the `implement` commits section above depends on — see that section for the full pre-run/post-run pairing.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
