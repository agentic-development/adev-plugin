# Scenario: deploy

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:deploy --dry-run` and is scored by `rubrics/deploy.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Prerequisite

The copy's `.context-index/deploy.yaml` exists (every step `type: manual`, no rollback bodies — see that file's own header comment). No `milestones.json`/`milestones.yaml` ships with the fixture, so `resolveVersion` has no shipped milestone to fall back to: this scenario always supplies `--version` explicitly, never relies on milestone lookup.

## Run

From that working directory, invoke `/adev:deploy --dry-run --version v1.0.0-fixture`. Because `--dry-run` is passed, Step 4 of `skills/deploy/SKILL.md` prints each of the five declared steps with its type and instructions, then exits — it never reaches the execution branch, so no step's `manual` confirmation prompt is ever presented and nothing under `<copy-root>` is written by this run. This scenario's only filesystem output is the harness's own transcript capture, written to `outputs/` beside `<copy-root>`.

## Containment

Every file this scenario reads or writes must be isContained under <copy-root> — `.context-index/deploy.yaml` is read but never modified (the skill's own Security section states it is read-only), and no other file under the copy is touched by a dry run. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring. Every step in deploy.yaml is `type: manual`, so no shell process is ever spawned by this scenario either way.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
