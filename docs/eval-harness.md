[adev docs](README.md) > Maintainers > Eval Harness

# Eval Harness

How adev scores its **own** skills, for people working *on* adev — authoring or changing a `skills/<name>/SKILL.md`, and wondering whether that change is actually covered by anything before it ships.

**This is not `/adev:eval`.** `/adev:eval` (see [Validate & Debug](validate-debug.md#eval)) scores *your* implementation against *your* spec, in a project that uses adev. This page covers the harness that scores adev's *own* 30 skills against a hermetic fixture — a completely different system that happens to share some vocabulary (rubrics, `required_elements`, `quality_dimensions`) because it reuses the same scoring engine (`adev eval score`).

## The three tiers — what actually runs where

The charter names three tiers. Only one is real today.

| Tier | What it checks | Runs | Status |
|---|---|---|---|
| **A** | Rubric/catalog schema, coverage, pointer-reachability, relocation-fidelity — pure static checks | `npm test` (default bucket), every run | **Live.** `tests/lib/evals/*.test.mjs` — not under `tests/evals/`, so it's in the default bucket, not the opt-in `--evals` one. CI already runs `npm test`, so Tier A is already gating every PR in practice — it's just never been labeled as a named "Tier A" CI job. |
| **B** (charter sense) | Deterministic scoring + read-trace comparison against a *committed* trace fixture, on skill changes, no live dispatch | — | **Not built.** No trace-fixture format or comparison code exists yet; depends on the also-unbuilt "Disclosure fidelity" capability. |
| **C** | Judged (`quality_dimensions`) + cost runs, plus fresh live trace capture, nightly/pre-release | — | **Not built.** No CI secret, no way to drive a live Claude session from a runner, no cron trigger. |

**Separately, "Tier B" also means something else** — the manual, live-dispatch pass a human or agent runs by hand today (`rubric-set-core-lifecycle.spec.md`/`rubric-set-change-imminent.spec.md`'s "operator half" of each scenario). It's an unrelated use of the same label from an earlier, individual eval-harness-tier spec, not a row in the table above. It **does** involve LLM calls — dispatching the real skill live is the whole point — but its own scoring is still deterministic (verdicts are matched directly against `catalog.yaml`'s `detect_when` clauses, never judged by a model). See [Running a manual Tier B pass](#running-a-manual-tier-b-pass) below. When someone says "run Tier B," they almost always mean this, not the charter's automation row.

## Where things live

```
tests/evals/skill-regression/
├── catalog.yaml       # ground truth: every planted defect + its known-clean twin
├── tiers.yaml          # which skills are covered, by which tier group
├── README.md           # the fixture's own hermeticity + authoring rules
├── project/             # the fixture itself — a small "orders-service" project
└── rubrics/*.yaml       # one rubric per skill
└── scenarios/*.md       # one scenario per skill, paired 1:1 with its rubric

tests/lib/evals/         # the harness's OWN unit tests (Tier A) — schema, coverage,
                          # catalog integrity, hermeticity. Runs on default `npm test`.

skills/eval/default-rubric.yaml   # the canonical rubric shape — read this first
```

`tests/evals/skill-regression/project/` is test *data*, never a workspace: every scenario copies it into a fresh temp directory before running anything, and the committed tree is read-only input. Full hermeticity rules live in `tests/evals/skill-regression/README.md` — three of its sentences are pinned verbatim by tests, so don't touch the fixture's authoring rules without reading that file first.

`tiers.yaml` is the exact, current source of truth for coverage:

```
landed:        change_imminent, core_lifecycle
change_imminent: codehealth, repomap, document, deploy, sync, learn, issues, eval, assess, using-adev, prototype
core_lifecycle:  work, brainstorm, specify, review-specs, plan, route, implement, write-test, validate, debug, build, hygiene
remaining:      init, reconcile, recover, research, retro, sample, status   (should-have, v2 — no rubric yet)
uncovered:      bugfix-loop   (no rubric at all)
```

## The rubric shape

Every rubric is flat YAML — no nested maps, since the repo's minimal YAML readers (`lib/profiles/yaml.mjs`) can't parse them; a nested block silently loads as empty instead of erroring. `skills/eval/default-rubric.yaml` is the canonical exemplar with full field-by-field comments — read it before authoring a new rubric, don't re-derive the shape from a peer rubric.

Two verdict classes, never scored twice:

- **`required_elements`** — deterministic. Each has `id`, `description`, `source` (what artifact it reads), `met_when` (the mechanical condition), and `not_applicable_when`. No judge, no subagent — a human or agent reads the artifact and decides.
- **`quality_dimensions`** — judged. Binary `met`/`not_met`/`unknown` (never a 1–5 score — numeric scales are the documented LLM-judge failure mode: position/verbosity/self-enhancement bias). Each has `criterion`, `reference`, `met_when`, `not_met_when`, `unknown_when`.

`met_when`/`not_met_when` should cite `catalog.yaml`'s `detect_when`/`must_not_flag_when` clauses, never the fixture's own in-file answer-key label — the label gets redacted from the committed fixture precisely so a rubric can't cheat by matching it.

The scored *input* is a flat JSON array, `{id, value, evidence}[]`, `value` one of `met | not_met | unknown | not_applicable`:

```json
[
  { "id": "money_stays_integer_cents", "value": "met", "evidence": "src/orders/create-order.mjs:88 sums quantity * unitPriceCents with no float operand." },
  { "id": "spec_and_code_agree", "value": "not_met", "evidence": "shipping-rates.spec.md B7 requires half-up rounding; src/shipping/rates.mjs:64 rounds nothing." }
]
```

## The scenario file

Each `scenarios/<skill>.md` is prose, not code — it tells a human or a forked agent exactly how to build a disposable copy of the fixture (`scripts/eval-scenario-setup.mjs`'s `createScenarioCopy()` / `createOutputsRoot()`), which command to run against it, and what to check at each step, down to specific line numbers and exact expected strings. Scenario and rubric are a matched pair: the scenario produces the transcript, the rubric scores it. Changing one without checking the other is exactly the class of bug this session found four times (routes rubric wording, work's coordination-scan wording, specify's duplicate-detection target, hygiene's fixture manifest) — after editing either file, re-read the other.

## Scoring a run

```bash
adev eval score --rubric tests/evals/skill-regression/rubrics/<skill>.yaml --input <verdicts.json> [--json]
adev eval score --rubric default --input <verdicts.json>   # the literal keyword "default" resolves skills/eval/default-rubric.yaml
```

Default output is a compact table (`id`, `kind`, `verdict`) plus one aggregate line per half (`deterministic: <points>/<max>`, `judged: <points>/<max>`, `total: <points>/<max>`) — evidence is omitted (unbounded width) unless you pass `--json`. Both `--rubric` (path form) and `--input` are containment-checked against the project root before either file opens.

## Adding coverage for a new or changed skill

1. **New skill, no rubric yet** (check `tiers.yaml`'s `remaining`/`uncovered` lists first): author `rubrics/<skill>.yaml` against `skills/eval/default-rubric.yaml`'s shape, and `scenarios/<skill>.md` describing exactly how to exercise it against the fixture. Cite real `catalog.yaml` ids your rubric's elements resolve against — an uncited catalog entry or an unresolvable citation both fail Tier A (`tests/lib/evals/skill-regression-catalog.test.mjs`) automatically.
2. **Existing skill, behavior changed:** re-read the paired scenario *and* rubric together before touching either. If the skill's SKILL.md and the rubric now disagree about how a check is produced, that disagreement is itself a finding — don't silently edit the rubric to match; figure out which one is actually correct first (this is precisely how this session found the `plan`/`.partial`, `brainstorm`/Module Map, and `specify`/duplicate-detection defects).
3. **Run Tier A** — it's just `npm test`; nothing extra to invoke.
4. **Run a manual Tier B pass** if the change is behavioral (see below) — Tier A alone never dispatches the real skill.

## Running a manual Tier B pass

This is what "run Tier B" means in practice today (see the terminology note above). No runner automates it — you (human or forked agent) do:

1. Build a disposable copy per scenario (`createScenarioCopy()`), never against the committed fixture tree.
2. Dispatch the real skill live against the copy, exactly as the scenario file describes — no simulation.
3. Verify the safety properties every scenario asserts: door predicates, before/after `git status`/`git rev-parse HEAD` equality at every real root `git worktree list --porcelain` prints (the write-escape check), board containment when the scenario touches issues, and any splice/round-trip assertions the scenario names.
4. Score the transcript's verdicts deterministically against the rubric's `met_when`/`not_met_when` — never dispatch a judge model for this.
5. Write the pass record to `.context-index/evals/tier-b-<YYYY-MM-DD>-<NN>.md`, following the convention an existing record (e.g. `tier-b-2026-09-07-01.md`) establishes: falsification trips performed once up front, one row per scenario in a results table, real defects found (not fixed inline — filed as board issues), and environment/safety confirmations at the end. The record is written *after* every capture comparison above, never before — writing it first would itself appear as an untracked file and fail the write-escape check it exists to pass.
6. **If the issue board is unreachable when a real defect turns up,** don't leave it only in the markdown record — `adev eval findings queue --title <t> --description <d> [--module <slug>]` durably queues it (`.context-index/evals/pending-findings.jsonl`), and `adev eval findings file <id>` files it as a real bug (setting `--affected-modules` from the finding's module) once the board recovers. `adev eval findings list` shows what's still pending.

## Current gaps

- 7 skills have no rubric at all (`init`, `reconcile`, `recover`, `research`, `retro`, `sample`, `status` — `tiers.yaml`'s `remaining`), plus `bugfix-loop` (`uncovered`, not even queued).
- Tier A isn't labeled as a named CI gate — it passes today only because it happens to sit in the default `npm test` bucket.
- Tier B (charter sense: committed-trace-fixture comparison) and Tier C (judged + cost, live dispatch from CI) have no implementation and, for Tier B, no design beyond one line in the charter.

See `.context-index/specs/features/eval-harness/charter.md` for the full capability map and design rationale, and the individual tier specs (`rubric-set-change-imminent.spec.md`, `rubric-set-core-lifecycle.spec.md`) for the exact behaviors and error cases each rubric/scenario pair is held to.
