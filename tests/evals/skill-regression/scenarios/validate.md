# Scenario: validate

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:validate` against `shipping-rates.spec.md` and is scored by `rubrics/validate.yaml`.

## Setup

Build the run copy with `scripts/eval-scenario-setup.mjs`. The helper performs three steps and prints two roots, in this order: the copy root, then the outputs root.

1. `createTempGitRepo` builds a throwaway git repository on `main`, in its zero-argument form — no `branch` override. This is load-bearing here, not merely hygienic: `/adev:validate` writes `<spec-slug>.validate.md` via a `.tmp`-then-commit rename inside the copy, and Check 1.5's source-manifest verification and the git-tracked check in its own postscript both call `git log` against the copy. A copy built with `createTempDir()` performs no `git init` at all, so those calls would silently resolve against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound — rather than against the disposable copy this scenario controls.
2. A flat copy of fixture_root contents into <copy-root> places `tests/evals/skill-regression/project`'s files directly at the new repo's root — never nested under a `project/` subdirectory — so the copy root is simultaneously the git root and the project root.
3. The helper splices `tasks.db_path` into the copy's manifest, pointing the issue board at the copy itself rather than this checkout's real board.
4. The helper also creates `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` — every artifact this scenario writes beyond the copy's own tree goes there.

Before typing any command, confirm the printed copy root matches ^[A-Za-z0-9._/-]+$ before any typed command — an unsanitized path is one shell metacharacter away from disaster.

## Working directory

Every step below runs with `cwd: realpath(<copy-root>)`. The committed `tests/evals/skill-regression/project` tree is read-only test data, never a workspace.

## Prerequisite

The copy's `.context-index/governance/validate.yaml` carries `validate.check-2-spec-compliance` and `validate.check-4-constitution` and declares no gate `command:` at all — Check 1 resolves against an empty gate set on every run of this scenario, which is exactly the honest-empty-set property `rubrics/validate.yaml`'s `gate_section_honest_about_empty_set` element scores.

## Lifecycle gate setup (operator step, copy-only)

`shipping-rates.spec.md`'s committed lifecycle log (`.context-index/lifecycle-state/shipping-rates.jsonl`) carries only a completed `specify` step — no `review`, `plan`, or `implement` event exists, matching its `status: review-pending` frontmatter. `/adev:validate`'s own Step 0a gate (`adev gate require --skill validate --spec <spec-path>`) reads this same log via `requireGate`, whose `priorStepOf('validate')` resolves to `implement` (the only step `OPTIONAL_GATE_STEPS` excuses is `route`) — so a real, unmodified run against this spec in strict mode (the copy's manifest declares no `lifecycle.gate_mode` override, so it defaults to strict) exits 2 before Check 2 ever inspects `src/shipping/rates.mjs`. This is the gate doing its documented job — refusing to validate work its own log says was never implemented — not a defect in `/adev:validate`.

`PV-01`'s own narrative is that an implementation cycle DID happen for this spec (`src/shipping/rates.mjs` and `tests/rates.test.mjs` both exist) and later drifted from the spec text; the committed log simply never recorded that cycle, because the fixture only needed `specify` completed to exercise the `review-pending` status-chain shape elsewhere. Advancing the log is therefore completing an already-true fact about the copy, not inventing one — and it touches only `<copy-root>`'s own log, never the committed fixture that `CATALOG_STATUS_EVENT_MISMATCH` reads.

Before invoking `/adev:validate`, from the working directory above, emit exactly one step pair — no `review` or `plan` events, since `requireGate` for `validate` checks only its immediate prior gated step (`implement`), and `assertStepNotOrphaned` (the copy's manifest declares `lifecycle.step_pairing: strict`) requires only a matching `started` event for the same step, not a fully populated chain:

```bash
adev report --type step --spec .context-index/specs/features/orders/shipping-rates.spec.md --step implement --status started
adev report --type step --spec .context-index/specs/features/orders/shipping-rates.spec.md --step implement --status completed --verdict PASS
```

Confirm the copy's `shipping-rates.jsonl` now carries these two events in addition to the original `specify` completion, and confirm the committed fixture's own `shipping-rates.jsonl` is untouched (it is a different file, under a different root, but the distinction is worth stating explicitly given how load-bearing that log is elsewhere in this fixture).

## Run

From that working directory, invoke `/adev:validate --spec .context-index/specs/features/orders/shipping-rates.spec.md`. Confirm the report lands at `.context-index/specs/features/orders/shipping-rates.validate.md` inside the copy.

**REPAIR IS LOAD-BEARING HERE.** `/adev:validate`'s Check 1 `--fix` mode auto-fixes fast-tier lint/formatting gates in place, and a FAIL report's natural next step — whether an operator's manual edit or a follow-on `/adev:debug`/`/adev:implement` invocation — is exactly what would rewrite `src/shipping/rates.mjs` to restore half-up rounding or `src/orders/legacy-loader.js` to drop its `require()` call. Either edit destroys the fixture's ground truth for `spec-code-drift` or `esm-violation`: the moment either file is corrected, its `PV-01`/`PV-06` anchor no longer names a live defect. Every rubric in both tiers that cites `PV-01`/`KC-01` or `PV-06`/`KC-06` depends on those anchors surviving, so this scenario runs only against the disposable copy `scripts/eval-scenario-setup.mjs` built — never against the committed fixture tree — and any write the run makes is confined to `<copy-root>`, discarded at teardown.

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
