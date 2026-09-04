# Scenario: build

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:build --full` against a brand-new "calculate a shipping rate" capability and is scored by `rubrics/build.yaml`.

This is the widest before/after window in either tier: `build --full` chains six subagent dispatches (specify, review, plan, route, implement, validate) inside one scenario, so the door predicates below are checked before **and** after the whole run, not once per pass.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `/adev:implement`'s Step 2h.3 (reached mid-pipeline) makes one commit per task, and `/adev:route`'s sidecar write is atomic temp-then-rename — both assume a real git working tree. A copy built with `createTempDir()` performs no `git init` at all, so a step that inspects the copy's git state would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Before the run — capture the pre-run baseline

Anchored at `-C resolveMainRoot(startCwd)` (`lib/worktree.mjs`), **before any chdir into the copy**, enumerate every working-tree root this repository owns via `git worktree list --porcelain`. At each root, capture `git status --porcelain --ignored=traditional --untracked-files=all` and `git rev-parse HEAD`. This is the baseline the post-run check (below) compares against.

Also record, before the run, that no markdown anywhere under the copy carries an `infra_requirements:` key, and that no `.claude/` directory or `.mcp.json` file exists anywhere under the copy at any depth. These are checked again after the run — see Environment, below — because this scenario is the one place in either tier where a step MID-scenario (specify) writes new markdown into the copy, and the `adev preflight run` calls three later steps (write-test dispatched inside implement, implement itself, validate) make against exactly that new file are what the after-check exists to cover. A pre-first-scenario-only check would miss precisely this window.

## Run

From that working directory, invoke `/adev:build --full --spec <a fresh, not-yet-existing spec path under .context-index/specs/features/orders/>`, with `ADEV_NO_INFRA=1` **in this command's own env** — never a shell `export` — per the fixture spec's operator-bypass contract (see Environment, below, for why the env form is primary here rather than secondary).

**Target a brand-new capability, not the fixture's existing shipping-rates.spec.md.** `skills/build/SKILL.md:377`'s Step 0 skip conditions would skip specify entirely against a spec that already exists on disk — defeating the property this scenario exists to exercise. Drive Step 0's dispatched `/adev:specify` the same way `scenarios/specify.md` does: at its Step 3 menu, answer with free text describing **"calculate a shipping rate"**, confirm the ⚠ out-of-scope warning fires, and choose "Proceed anyway". Let the pipeline run to completion through all six stages: Step 0 (Specify) writes the new spec, Step 1 (Review) records a verdict (or completes the BLOCK auto-retry loop), Step 2 (Plan) writes the plan, Step 3 (Route) writes the routing sidecar, Step 4 (Implement) commits each task, Step 5 (Validate) records the final verdict.

Confirm each stage's completion is gated by `requireGate` on its predecessor per `skills/build/SKILL.md`'s "Gate Between Sub-Skill Dispatches" section, and that the build-state file at `.context-index/lifecycle-state/<slug>.json` (`lib/build-state.mjs`) carries all six step entries with monotonically increasing timestamps, written incrementally rather than once at the end.

## Containment

Every file this scenario reads or writes must be isContained under <copy-root>. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring. For this scenario, unlike the tier's other eleven, the `ADEV_NO_INFRA=1 in the step's own env` form is PRIMARY rather than secondary: the default Implement Pipeline never writes a spec mid-scenario, so `--full` is what puts the spec-writing step (and the `adev preflight run` calls that later read it) between this before-check and the after-check below — the exact window the env form exists to cover, per `skills/validate/SKILL.md:55,87` and `skills/eval/SKILL.md:35`'s rule that the agent itself must never set the flag autonomously. It is passed once, per invocation, in the top-level `/adev:build` command's own env, never as a shell `export` that would leak into every later subprocess with nothing to unset it.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison. `implement` (Step 4, mid-pipeline) commits inside the copy, which is the same shape `scenarios/implement.md` documents in full — no `git status` of any kind can see a commit already landed, so the post-run check pairs the status comparison with a `git rev-parse HEAD` equality check at every root `git worktree list --porcelain` printed in the pre-run baseline above, re-run from the same `-C resolveMainRoot(startCwd)` vantage point after the scenario completes.

## After the run — re-check the door predicates and compare

Re-run both door predicates from "Before the run", above, against the finished copy: no `infra_requirements:` anywhere under the copy, and no `.claude/` or `.mcp.json` anywhere under the copy at any depth. Then compare the pre- and post-run captures: `git status --porcelain --ignored=traditional --untracked-files=all` byte-identical, and `git rev-parse HEAD` unchanged, at every worktree root.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
