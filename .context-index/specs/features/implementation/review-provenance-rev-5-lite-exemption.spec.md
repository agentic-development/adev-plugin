---
charter: implementation
kind: skill
status: review-pending
risk_level: medium
revision: 1
charter-revision: 1
amends: .context-index/specs/features/implementation/review-provenance.spec.md
target-revision: 5
created: 2026-11-26
updated: 2026-11-26
---

# Amendment: Skill Spec: Review-Round Provenance (targeting rev 5)

> This spec **amends** `.context-index/specs/features/implementation/review-provenance.spec.md` targeting revision 5.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

`.context-index/specs/features/implementation/implement-rigor-ladder.spec.md` (BEH-6) adds a `lite` review depth to `/adev:implement`. A `lite` task runs inline in the orchestrator with no per-task reviewer, so no review stage runs and there is no cycle count to record.

Contract A of the base spec says every task commit carries at least one `Review-round:` trailer, because Step 2h was reached only after both stages passed. That premise no longer holds for a `lite` task. Without this amendment, every `lite` commit would read as a task that bypassed review, which is the finding the base rule exists to raise.

The alternative, widening the trailer grammar to allow `lite=0`, was rejected (ADR 0020). It would loosen a validated, injection-hardened producer for the one path that has no reviewer.

## Behavioral Delta

**Superseded clause.** Contract A's sentence "Every task commit carries at least one `Review-round:` trailer, because 2h is reached only after both stages pass" is replaced by:

> Every task commit carries at least one `Review-round:` trailer, **except** the commit of a task whose final-pass `review_depth_resolved` event has `depth: lite`. That task ran no review stage. Its provenance is the pair of `review_depth_resolved` events (provisional and final pass, both `depth: lite`) on the spec's lifecycle log, and its commit carries no `Review-round:` trailer. Any other task commit with no `Review-round:` trailer still indicates a task that bypassed review, and that is still the finding.

The exemption is keyed to the **final** pass. A `lite` task that the post-task tripwire escalated to `quick` or `full` has a final-pass event with that depth, runs the review that depth requires, and carries trailers as any other reviewed task does.

**Unchanged:**

- `buildReviewRoundTrailer` stays unchanged and is still the only producer of the trailer line. A `lite` task never calls it.
- The trailer grammar (`<stage>=<cycles>`, one pair per line) is unchanged.
- The stage enum (`spec-compliance`, `code-quality`, `synthesized`) is unchanged. No `lite` stage is added.
- The `cycles >= 1` rule is unchanged. No `=0` value is allowed.
- Contract B (`review_round` event) is unchanged. A `lite` task emits no `review_round` event.

**Failure Modes row, amended.** The row "No `Review-round:` trailer on a task commit" now reads: a commit with no trailer indicates review was bypassed **unless** the task's final-pass `review_depth_resolved` has `depth: lite`, in which case the absence is the expected encoding.

## Acceptance Criteria

The base criterion "Every task commit carries one `Review-round: <stage>=<cycles>` trailer per stage that ran" is amended to: every task commit carries one `Review-round:` trailer per stage that ran, and a task whose final-pass `review_depth_resolved` has `depth: lite` ran no stage and carries none.

- [ ] Contract A's every-commit rule names the `depth: lite` exemption, keyed to the final-pass `review_depth_resolved` event.
- [ ] A `lite` task's commit carries `Spec:` and `Plan-task:` and no `Review-round:` trailer, and the task emits no `review_round` event (`implement-rigor-ladder.spec.md` BEH-6).
- [ ] `buildReviewRoundTrailer`, the stage enum and the `cycles >= 1` rule are unchanged; the existing trailer tests pass unmodified.
- [ ] No executable trailer-presence check exists today, so conformance is to this amended text, not to a check's output.
