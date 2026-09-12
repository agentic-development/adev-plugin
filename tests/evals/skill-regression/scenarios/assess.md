# Scenario: assess

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:assess --mode adev` and is scored by `rubrics/assess.yaml`.

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

None beyond the copy itself. `/adev:assess` operates entirely through static file inspection (Glob/Grep/Read) — no `.context-index/` layer is strictly required, but the copy carries one, so auto-detect always resolves to adev mode here (see rubric note on mode).

## Run

From that working directory, invoke `/adev:assess --mode adev --output markdown --target .` (or with no `--mode` at all — auto-detect resolves to the same adev mode, since the copy's `.context-index/` is present). This is read-only: Step 3 (Scan codebase) only ever Globs and Greps the copy, and the skill's own Notes section states no external command (`npm test`, `tsc`, etc.) is ever executed.

## Containment

Every file this scenario reads must be isContained under <copy-root> — the scan targets `.` (the copy root itself) and never reaches outside it. This scenario writes no artifact of its own; the scorecard is chat output only (no `--output json` file target is passed), and the only filesystem output is the harness's own transcript capture, written to `outputs/` beside `<copy-root>`. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring. `/adev:assess` spawns no subprocess.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
