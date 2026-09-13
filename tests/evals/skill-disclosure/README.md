# Skill disclosure evals

Behavioural regression checks for progressive disclosure. These answer a question the
7,200 unit tests cannot: **after moving prose into `references/`, does an agent still
do the same thing?**

Nearly all existing skill tests assert that a string appears somewhere in a skill's
surface. That is necessary and not sufficient — it stays green when an agent reads the
one-line summary in the body and never opens the companion the summary points at. The
instruction still ships; the step silently stops happening.

Two tiers, both deterministic to *assert* even though one of them dispatches a model:

| Tier | Question | Cost |
|---|---|---|
| 1 — read trace | did the agent open the companions this path requires? | one dispatch per scenario |
| 2 — artifact shape | did the skill produce an artifact with the same structure? | free (static) |

Tier 3 (LLM-as-judge on output quality) is deliberately **not** here. It is expensive
and noisy, and treating it as the entry point is why this kind of testing usually never
ships. Tiers 1 and 2 catch the regressions this refactor actually risks.

## Running

Excluded from `npm test` by the `tests/evals/` rule in `scripts/run-tests.mjs`.

    node --test tests/evals/skill-disclosure/artifact-shape.eval.mjs   # tier 2, free
    ADEV_EVAL_DISPATCH=1 node --test tests/evals/skill-disclosure/read-trace.eval.mjs

Tier 1 skips loudly without `ADEV_EVAL_DISPATCH=1` rather than passing vacuously — a
skipped eval that reports success is the failure mode this whole directory exists to
prevent.

## Baselines can rot

`baselines/*.json` are artifacts like any other. Regenerating one to match a regression
makes it agree with the bug. Before trusting a baseline, delete a companion pointer from
the skill body and confirm the eval goes red. There is a probe for exactly this in
`read-trace.eval.mjs`.
