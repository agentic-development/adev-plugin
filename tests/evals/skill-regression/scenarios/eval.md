# Scenario: eval

Run this scenario against a disposable copy of the fixture project, never against the committed tree. It exercises `/adev:eval`'s Layer 3 scoring step and is scored by `rubrics/eval.yaml`.

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

The copy already ships `.context-index/evals/config.yaml` (whose `rubric:` key resolves to `.context-index/evals/orders-rubric.yaml`), `.context-index/evals/orders-rubric.yaml` itself, and `.context-index/evals/orders-verdicts.json` — a verdict set whose six ids already match orders-rubric.yaml's three `required_elements` and three `quality_dimensions` ids exactly. This scenario exercises Layer 3 Step 3 of `skills/eval/SKILL.md` directly against this pre-built verdict set — it never dispatches judge subagents to produce Steps 1-2's verdicts live, since scoring the rendering step needs no fresh judgement of its own.

## Run

From that working directory, invoke:

```
adev eval score --rubric .context-index/evals/orders-rubric.yaml --input .context-index/evals/orders-verdicts.json
```

This prints the verdict table and the aggregate line, and nothing else — `adev eval score` writes no file to disk (`lib/cli/eval.mjs`'s `cmdScore` only ever calls `console.log`). The printed table's six rows read, top to bottom: `money_stays_integer_cents` (met), `public_export_documented` (not_met), `module_is_pure_esm` (not_met), `validation_precedes_pricing` (met), `errors_are_collected_not_short_circuited` (met), `spec_and_code_agree` (not_met). The aggregate line beneath it reads `deterministic: 5/15`, `judged: 10/15`, `total: 15/30` — orders-rubric.yaml declares `required_element_points: 15` and `judged_criterion_points: 15`, and none of the six supplied verdicts is `unknown` or `not_applicable`, so both halves resolve to a plain number.

## Containment

Every file this scenario reads must be isContained under <copy-root> — both `--rubric` and `--input` are relative paths resolved and contained against the copy root before either file is opened. After the run, confirm that every artifact: sources re-resolved under <copy-root> after the run — never against the committed fixture tree. This scenario writes no artifact of its own; its only output is the captured stdout transcript, saved to `outputs/` beside `<copy-root>`.

## Environment

Confirm no infra_requirements: in the copy and no .claude/ or .mcp.json anywhere under <copy-root> — this scenario needs no network, container runtime, installer, or live plugin wiring. `adev eval score` spawns no subprocess and dispatches no subagent.

## Manifest fidelity

Reparse the copy's manifest and confirm tasks.backend: json survives the splice, and the manifest's comments survive it, and that the spliced path is db_path read back as <copy-root>.

## Multi-worktree check

If more than one git worktree is in play, confirm git status and rev-parse HEAD equality at every worktree root before trusting any cross-worktree comparison.

## Teardown

`teardown deletes only the two mkdtempSync-returned roots` — the copy root and the outputs root printed above — and nothing else.
