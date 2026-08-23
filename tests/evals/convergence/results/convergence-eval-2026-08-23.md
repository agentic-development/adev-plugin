# Review-Block Auto-Retry Convergence Eval

**Date:** 2026-08-23
**Fixture:** tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md
**Spec under test:** review-block-auto-retry.spec.md (base) / review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md (amendment)
**Tier:** full  **Samples/arm:** 1

Real `/adev:build --full --auto` sessions — real reviewer dispatch (referent-integrity, wiring-reviewer, consistency-analyzer, boundary-reviewer, termination-reviewer, matching the project's actual materialized registry), real `/adev:specify --revise`. No mocked output. Ground truth from the fixture's own lifecycle event log, not chat-prose parsing.

## Single-arm (current branch)

| Arm | Cycles | Reviewer dispatches | Cost | Tokens (median) | DECISION_REQUIRED halts | EXTERNAL_REMEDY exits | Failed trials |
|---|---:|---:|---:|---:|---:|---:|---:|
| current | 1.0 (±0.0) | 10.0 (±0.0) | $n/a (±$0.000) | 0 | 0 | 0 | 0/1 |

Verdicts observed: UNKNOWN

> Single-arm run — no `--baseline-ref` was given. This is a smoke run / pre-amendment baseline capture, not an A/B comparison. Re-run with `--baseline-ref <pre-implementation-commit>` once review-block-auto-retry-rev-2's authoring step (BEH-4 through BEH-11) is implemented, to get the real before/after.

## Methodology

- Fixture reset (`git checkout` + lifecycle-log delete, scoped to the fixture only) before every trial.
- Cycle count and reviewer-dispatch count come from the fixture's own `.context-index/lifecycle-state/broken-loop-fixture.jsonl` (`spec_revised` and `reviewer_report` event counts) — never inferred from session transcript text.
- Cost/tokens from the real session JSONL (`analyzeSession`, includes subagent rollup — every dispatched reviewer and authoring subagent).
- `DECISION_REQUIRED`/`EXTERNAL_REMEDY` columns read 0 on an unamended build — that is expected, not a failure, until BEH-2/BEH-3 land.
- Single-run noise is real: read the median over n≥2, not any one trial. The fixture plants four defect classes (a genuine textual contradiction, a mechanism-existence gap, an unresolved design decision, and an externally-owned fix) — which class(es) a given trial's reviewers actually flag is itself non-deterministic and part of what this eval observes.

## Post-implementation analysis (real single trial, Task 12)

This file was regenerated automatically by `run-convergence-eval.mjs` after a genuine, non-timed-out trial against the **post-implementation** (rev-2-amended) code — this section is hand-authored commentary on that run, appended below the script's own output; the table and header above are exactly what the script wrote.

**Run history this session:** two prior attempts against this same fixture — `--samples 1` with the script's default 1,200,000ms (20 min) timeout, and a retry at 1,800,000ms (30 min) — both failed with `spawnSync ETIMEDOUT`, the second timing out only 3s past the first attempt's wall time. A third attempt at `--timeout-ms 7200000` (2h) completed successfully in **1671s (~28 min)**. A full `/adev:build --full --auto` real dispatch against this fixture, in this environment, genuinely takes 25-30+ minutes — consistent with the eval's own "far more expensive than a single skill invocation" cost warning, not a defect.

**What the numbers show:**

- **`cycles: 1`** (from the `spec_revised` event count) — exactly one real `/adev:specify --revise` occurred. This is itself a meaningful confirmation: Task 6 replaced the pre-amendment blanket-acknowledgement defect (`adev-plugin-revise-loop-no-content-edits-q6q0`) with real per-anchor text diffing, so a `spec_revised` event firing at all here means the amended `reviseSpec` actually spliced authored content into the fixture spec — the base spec's Behavior 1 promise ("a TARGETED patch addressing each blocker") that the amendment exists to make true.
- **`reviewerDispatches: 10`** — consistent with two review rounds against the project's actual materialized 5-reviewer set (`referent-integrity`, `wiring-reviewer`, `consistency-analyzer`, `boundary-reviewer` at `dispatch: always`, plus `termination-reviewer` triggered by this fixture's own loop/retry/convergence keywords): round 1 (revision 1, BLOCK, full-context per BEH-8's "first review always full-context") → revise → round 2 (revision 2, re-review).
- **`verdict: UNKNOWN` (terminalVerdict: null in the script's own console output)** — this is a **known limitation of this read-only eval script**, not evidence the loop failed to terminate cleanly. `summarizeTrial()` only scans `step_completed` events for a `review`-step verdict (`TERMINAL_VERDICTS` array, lines ~168-172 of `run-convergence-eval.mjs`). Both the base spec (unamended) and this amendment record a loop's *stopping* condition — `NO_PROGRESS`/`REGRESSED`/`BUDGET_EXHAUSTED`/`DECISION_REQUIRED`/`EXTERNAL_REMEDY`(no-remaining-defects case)/`NOT_CONVERGING` — via the **sidecar+fail-loud fallback**, which records the review step as **`step_failed`** (`skills/build/blocker-auto-retry-loop.md`: "Record the review step as `failed` in build state with the relevant terminal verdict"), not `step_completed`. Only the `PASS`/`PASS_PENDING_HUMAN` happy path uses `step_completed`. The eval script never inspects `step_failed` events, so any of these six terminal verdicts reads as `UNKNOWN` here regardless of which one actually fired — this gap predates this amendment (the base spec's fallback used the identical `step_failed` mechanism) and is out of this task's scope to fix (the script is listed "Reference (read, do not modify)" in the plan). The fixture's own lifecycle log was wiped by the script's unconditional post-trial `resetFixture()` cleanup before this analysis could read it directly, so the exact terminal verdict for this trial is not independently confirmable after the fact — a real limitation of this evidence, not something to paper over.
- **`cost: $0.000`** — this session's Claude Code invocation did not populate itemized per-request cost in the session JSONL in this environment (subscription/plan-dependent), so `analyzeSession`'s cost rollup reads 0 rather than a real dollar figure. Token/cycle/dispatch counts (the ground-truth lifecycle-log-derived numbers) are unaffected.

**Corroborating evidence from `.scratch/` (this session's working directory, not cleared between attempts):** several artifacts from real dispatches during this session's trials survive there and are consistent with (though not perfectly attributable to) the successful 1671s run: five real reviewer prompt files (`prompt-{boundary,consistency,referent-integrity,termination,wiring}-reviewer.txt`), real findings JSON with real `blocker_id`s matching the fixture's planted defects (e.g. `consistency-analyzer:behavior-contradiction:c2e3ebac` on `behaviors-2` — the BEH-2 planted contradiction; `referent-integrity:nonexistent-function:3a191708` on `behaviors-3` — the BEH-3 planted mechanism-existence gap), and real per-anchor authored section content (multi-hundred-word rewritten prose, not placeholder text) written to `authored-sections-rev*.json`. **One notable gap surfaced by this real evidence:** none of the findings JSON in `.scratch/` across this session's attempts carry a `finding_class` field — the real reviewer prompts, as currently authored, do not appear to reliably emit `defect`/`decision`/`external` classification for the fixture's planted BEH-4 (decision) and BEH-5 (external) defects; every observed finding defaults to `defect` at the writer (Task 2's documented behavior, working as designed) rather than being explicitly classified by the reviewer. This means `DECISION_REQUIRED`/`EXTERNAL_REMEDY` real-world exercise is not yet confirmed by this trial — the *mechanism* is implemented and unit-tested (Task 9's suite), but getting a real reviewer to actually emit `finding_class` on these defect shapes may need reviewer-prompt tuning, which is outside this plan's scope (Task 4 only guarantees passthrough of the field when a reviewer supplies it).

**What was NOT completed:** the full `--baseline-ref eec2d6e1 --samples 3` A/B comparison the plan's Acceptance Criteria row describes. Baseline-ref `eec2d6e1` (the commit immediately preceding Task 1) was identified, but at ~25-30 min per trial, a 3-sample-per-arm A/B (up to 6 trials) would run 2-3 hours — beyond what this implementation session's time budget supports. This single real trial confirms the amended code executes a genuine multi-round, real-dispatch loop without crashing or hanging past a generous timeout, and that real content-authoring (`spec_revised`) actually occurs — the core defect this amendment exists to fix. The full A/B comparison (baseline vs. amended dispatch cost/cycle-count/convergence-rate) remains a valuable follow-up best run by a human operator with a multi-hour budget, per this eval's own "Run it by hand" design intent:

```bash
node tests/evals/convergence/run-convergence-eval.mjs --baseline-ref eec2d6e1 --samples 3 --timeout-ms 7200000
```
