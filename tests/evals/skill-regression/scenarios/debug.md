# Scenario: debug

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:debug` against the planted `shipping-rates.spec.md` B7 drift and is scored by `rubrics/debug.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `/adev:debug`'s Phase 5 fix and Phase 6 quality-gate rerun both operate against the copy's working tree, and Phase 6 step 4 reads `manifest.yaml`'s `tasks.backend` and writes to the copy's own issue board. A copy built with `createTempDir()` performs no `git init` at all, so those writes would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Run

From that working directory, invoke `/adev:debug` with the symptom "shipping rates with a fractional-cent surcharge are not rounded half up, contradicting shipping-rates.spec.md behavior B7" — the observable surface of the planted drift, phrased as a bug report rather than as the fixture's own answer-key label. Follow Phases 1 through 6 against the copy: reproduce, investigate with context (loading `shipping-rates.spec.md` and `src/shipping/rates.mjs`), hypothesize, verify, fix, and validate-and-record.

**REPAIR IS LOAD-BEARING HERE.** A debug run that does its job REWRITES `src/shipping/rates.mjs` to restore half-up rounding, per Phase 5 — this is the scenario's entire point, and it is exactly what destroys the fixture's ground truth for `spec-code-drift`: the moment the rounding rule is corrected, `PV-01`'s anchor no longer names a drifted rule, and every rubric in both tiers that cites `PV-01`/`KC-01` loses its ability to assert against it. Running this scenario against the committed fixture tree would corrupt that ground truth permanently; running it only against the disposable copy `scripts/eval-scenario-setup.mjs` built means the fix, and the drift it repairs, are both discarded at teardown.

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
