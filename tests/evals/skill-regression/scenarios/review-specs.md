# Scenario: review-specs

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:review-specs` against `shipping-rates.spec.md` and is scored by `rubrics/review-specs.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `/adev:review-specs` writes `<spec-stem>.review.md` and, on a BLOCK verdict, `<spec-stem>.blockers.md` via a `.tmp`-then-commit rename inside the copy. A copy built with `createTempDir()` performs no `git init` at all, so any git-aware step in that chain would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Prerequisite

`shipping-rates.spec.md` carries frontmatter `status: review-pending`, and its lifecycle JSONL records `specify` completed with no `review` step — exactly the state Step 0's Specify-step gate requires before `/adev:review-specs` may proceed.

## Run

From that working directory, invoke `/adev:review-specs --spec .context-index/specs/features/orders/shipping-rates.spec.md`. Confirm the review lands at `.context-index/specs/features/orders/shipping-rates.review.md` inside the copy, and — because the consolidated verdict is expected to be BLOCK — that `.context-index/specs/features/orders/shipping-rates.blockers.md` is also written.

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
