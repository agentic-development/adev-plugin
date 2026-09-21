# Scenario: hygiene

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:hygiene`'s full audit and is scored by `rubrics/hygiene.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: hygiene's Audit Pass 14 (Code Provenance) runs `git log --format='%(trailers)' -- <file>` over the copy, and Audit Pass 15 (Issue Board Audit) resolves the copy's own manifest and board relative to the copy's git root. A copy built with `createTempDir()` performs no `git init` at all, so those reads would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board — required for Audit Pass 15 (Issue Board Audit) to read the copy's `.context-index/tasks/tasks.json` rather than SKIPping for a missing backend configuration.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Prerequisite

Audit Pass 13 (Code Health) dispatches `/adev:codehealth`, which requires `.context-index/hygiene/dependency-graph.json` and `.context-index/hygiene/symbol-ranks.json`. If the copy does not carry them yet, run `/adev:repomap` first — tree-sitter mode, whether via `--mode tree-sitter` or the default auto-detect when tree-sitter is available, since regex mode alone does not produce either JSON artifact.

## Run

From that working directory, invoke `/adev:hygiene` with no arguments: the full twenty-three-pass audit. Confirm the report lands at `.context-index/hygiene/drift-report.md` inside the copy.

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
