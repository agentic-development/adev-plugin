# Review-Block Auto-Retry Convergence Eval — A/B

**Date:** 2026-10-08
**Fixture:** tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md
**Baseline:** `eec2d6e1` (pre-amendment, v0.27.8)  **Treatment:** this branch at `7b9d2365`
**Model:** `--model sonnet` → `claude-sonnet-5-5` (every turn, both arms)  **Tier:** full  **Samples/arm:** 2

Both arms were checked before any trial to resolve a bare `adev` to their own CLI
(arm-pinned shim). Host on AC power under `caffeinate`. Treatment trial 2 hit the
claude.ai session limit after 82s and was rerun once the limit reset; the rerun is
the sample reported here. Costs are recomputed from each session transcript with the
corrected price table (Sonnet 5.5 had no row when the run started).

## Results

| Arm | Trial | Revise cycles | Reviewer dispatches | Terminal verdict | Cost | Duration |
|---|---|---:|---:|---|---:|---:|
| baseline | 1 | 1 | 10 | `LOOP_REGRESSED` (BLOCK) | $2.99 | 277s |
| baseline | 2 | 1 | 10 | BLOCK | $3.51 | 333s |
| treatment | 1 | 0 | 5 | **`DECISION_REQUIRED`** | $2.01 | 207s |
| treatment | 2 | 0 | 5 | **`DECISION_REQUIRED`** | $2.31 | 184s |

**Median:** baseline $3.25 / 10 dispatches; treatment $2.16 / 5 dispatches
(−34% cost, −50% reviewer dispatches).

## What the treatment did

In both trials a reviewer classed the planted design-decision defect (BEH-4: which
expiry wins when two requests race an expired window) as `finding_class: decision`.
`adev specify group-blockers` returned it in `decision_blocker_ids` and the loop halted
before dispatching any authoring, naming the decision for a human. Trial 2 also
classed the planted externally-owned defect (BEH-5) as `external`, with `remedy_ref`
pointing at the orders charter's Capability Map.

Blockers anchored to list items (`behaviors-N`) were grouped under the `behaviors`
section with its current text, rather than landing in `anchors_not_found` as on
2026-10-04.

The baseline, which has no `finding_class`, spent a full revise cycle authoring
against the whole blocker set, including the unresolvable decision, and ended
BLOCK / `REGRESSED`.

## Verdict for criterion #11

Met. The treatment reached a correct `DECISION_REQUIRED` exit in 2/2 trials, with half
the reviewer dispatches and lower cost than the baseline.

Not exercised: the authoring and convergence path past a decision halt (the
fixture always plants a decision, so a correct run stops there). The splice and
retry-budget findings from 2026-10-04 remain untested by this run.
