---
last-reviewed-revision: 2
file-sha: 4036384c1d1472279ded76f486327a53edb7ee27eaec8b120f157501019f9ee2
---

# Architecture Review: equivalence-eval

> **Date:** 2026-07-08
> **Spec:** .context-index/specs/features/worktree-parallelization/equivalence-eval.spec.md
> **Verdict:** PASS_WITH_NOTES (rev 1) → addressed in rev 2

## Structural Architect (structural-architect) — PASS_WITH_NOTES

- [SA-1] warning: Gate strength rests on fixture test coverage, but no precondition requires the fixture's tests to cover each task's behavior. → require it, else "same tests pass" is vacuous.
- [SA-2] warning: Both arms are live agent runs, so "impl diff empty" never holds even serial-vs-serial — no noise-floor control. Add a serial/serial control arm (or frozen golden) to separate parallelism-induced divergence from ordinary LLM variance.
- [SA-3] warning: `OVERLAP_PARALLELIZED` has no owning behavior — `--parallel` consumes already-disjoint plan groups and never re-checks disjointness. Reframe to what `--parallel` actually does (only worktrees `independent` groups; non-independent groups run serial) or remove.
- [SA-4] warning: "Identical pass/fail set" assumes deterministic tests; a flaky test flips the gate. Require order-independent fixture + re-run-to-confirm before declaring divergence.
- [SA-5] suggestion: "0 orphaned state" is only valid on full success — parallel-implement retains a failed group's worktree by design. Scope to successful completion.
- [SA-6] suggestion: Task map should mark pure/unit-testable tasks vs. the live-agent arm.
- [SA-7] suggestion: `NOT_EQUIVALENT` collapses three conditions — add a `divergence_kind` sub-code.

## Consistency Analyzer (consistency-analyzer) — PASS_WITH_NOTES

- [CON-1] suggestion: "public surface" vs charter "public API/surface" — wording drift, semantically aligned.
- [CON-2] suggestion: charter Performance reads as a firm gate but the eval demotes wall-clock/token to WARN — add a one-line note that perf does not block ship (equivalence is the hard gate).
- [CON-3] suggestion: rubric defines only Layer 1 + Layer 3 (50/50); Layers 2/4 come from /adev:eval — spec scopes this correctly, noting the split source.

Error codes disjoint from the sibling's runtime codes; equivalence definition, rubric consumption, and frontmatter all align.

## Summary

**Total findings:** 10 (0 blockers, 4 warnings, 6 suggestions). No blockers — but the 4 warnings are load-bearing for the eval to actually prove equivalence and are addressed in rev 2 (noise-floor control arm, fixture-coverage + determinism preconditions, reframed overlap assertion, success-scoped orphaned-state, divergence sub-codes).

## Re-Review (rev 2)

All 4 structural warnings RESOLVED (control arm / coverage+determinism preconditions / reframed overlap selection / INCONCLUSIVE+reconfirm); noise-floor framing tightened to a determinism gate. Verdict PASS_WITH_NOTES; review-passed at rev 2.
