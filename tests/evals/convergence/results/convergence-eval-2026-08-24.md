# Review-Block Auto-Retry Convergence Eval

**Date:** 2026-08-24
**Fixture:** tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md
**Spec under test:** review-block-auto-retry.spec.md (base) / review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md (amendment)
**Tier:** full  **Samples/arm:** 2

Real `/adev:build --full --auto` sessions — real reviewer dispatch (referent-integrity, wiring-reviewer, consistency-analyzer, boundary-reviewer, termination-reviewer, matching the project's actual materialized registry), real `/adev:specify --revise`. No mocked output. Ground truth from the fixture's own lifecycle event log, not chat-prose parsing.

## Baseline (`eec2d6e1`) vs Treatment (current branch)

| Arm | Cycles | Reviewer dispatches | Cost | Tokens (median) | DECISION_REQUIRED halts | EXTERNAL_REMEDY exits | Failed trials |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 1.0 (±0.0) | 10.0 (±0.0) | $21.224 (±$1.068) | 40,023,875 | 0 | 0 | 0/2 |
| treatment | 0.5 (±1.0) | 7.5 (±5.0) | $17.203 (±$14.654) | 31,932,201 | 0 | 0 | 0/2 |

Baseline verdicts: BLOCK, BLOCK
Treatment verdicts: BLOCK, BLOCK

**Cycles Δ:** -50%  **Cost Δ:** -19%

## Methodology

- Fixture reset (`git checkout` + lifecycle-log delete, scoped to the fixture only) before every trial.
- Cycle count and reviewer-dispatch count come from the fixture's own `.context-index/lifecycle-state/broken-loop-fixture.jsonl` (`spec_revised` and `reviewer_report` event counts) — never inferred from session transcript text.
- Cost/tokens from the real session JSONL (`analyzeSession`, includes subagent rollup — every dispatched reviewer and authoring subagent).
- `DECISION_REQUIRED`/`EXTERNAL_REMEDY` columns read 0 on an unamended build — that is expected, not a failure, until BEH-2/BEH-3 land.
- Single-run noise is real: read the median over n≥2, not any one trial. The fixture plants four defect classes (a genuine textual contradiction, a mechanism-existence gap, an unresolved design decision, and an externally-owned fix) — which class(es) a given trial's reviewers actually flag is itself non-deterministic and part of what this eval observes.
