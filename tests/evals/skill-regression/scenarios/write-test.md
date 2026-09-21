# Scenario: write-test

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:write-test` against `shipping-rates.spec.md`'s full Behavioral Contract and is scored by `rubrics/write-test.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `/adev:write-test`'s Step 3 Pre-existing Failure Protocol runs `git stash --include-untracked` / `git stash pop` against the copy's working tree before authoring anything. A copy built with `createTempDir()` performs no `git init` at all, so that stash cycle would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board. This scenario never touches the board — `/adev:write-test` writes no Issue — but the splice is unconditional per `scripts/eval-scenario-setup.mjs`, so it is confirmed below alongside every other scenario in this tier.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Run

From that working directory, invoke `/adev:write-test --red --spec .context-index/specs/features/orders/shipping-rates.spec.md`. This is standalone invocation (not dispatched by `/adev:implement`), so the pre-flight summary appears first — answer "y" to proceed.

The pre-existing test suite (`tests/rates.test.mjs`, covering B1 through B6) passes cleanly on the fresh copy, so Step 3's stash cycle is skipped (`preexisting_check: skipped (clean tree)`) and authoring proceeds straight to Step 4 against all seven Behavioral Contract items — B1 through B7 — including B7, the one behavior `shipping-rates.spec.md`'s own Test Expectations section records as **not covered** by the existing suite.

Confirm the Handoff Block lands at `.context-index/packets/shipping-rates-tests.md` inside the copy, and that its listed test files are new or modified paths under `tests/` inside the copy — never a path under the committed fixture tree.

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
