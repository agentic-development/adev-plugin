# Scenario: sync

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:sync` and is scored by `rubrics/sync.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Writer mechanism

`/adev:sync` is a project-relative writer: it rewrites `CLAUDE.md` and `AGENTS.md` at the paths `.context-index/manifest.yaml`'s `sync.targets` declares, resolved against `cwd` — never through `resolveStorageRoot` (the board-scoped mechanism `/adev:issues` uses). Confirm cwd as the realpathed copy root, AND that each written path is isContained under it, holds here by this project-relative resolution, distinct from the board's own mechanism.

## Run

From that working directory, invoke `/adev:sync` with no arguments: a full sync of every declared target. The copy's committed `CLAUDE.md` and `AGENTS.md` are deliberately unsynced fixture content (constitution.md's own header comment states they are its hand-restated source, not prior sync output), so this run is expected to rewrite both files in place.

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
