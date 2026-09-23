# Convergence Eval

Tests whether the `/adev:build --full --auto` BLOCK→revise loop
(`review-block-auto-retry.spec.md`, amended by
`review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md`) actually
converges, and how expensively — with **real** reviewer dispatch and
**real** `/adev:specify --revise`, not mocked output or a synthetic blocker
sequence fed directly to `lib/loop-convergence.mjs`.

## Why this isn't a node:test / eval-harness rubric

Two properties of this loop are pure deterministic code (blocker-set
partitioning, the `NOT_CONVERGING` trend check, the mechanism-existence gate)
and belong in `tests/lib/loop-convergence.test.mjs` /
`tests/integration/build-loop-auto-retry.test.mjs` with synthetic fixtures —
cheap, hermetic, part of `npm test`. Nothing here duplicates those.

What those tests *cannot* exercise is the thing that actually determines
whether the loop converges in practice: does a real reviewer subagent
produce a real BLOCK on a real defect, and does a real authoring subagent
produce a real fix for it. `adev-plugin-j7pq.1` found that even hand-authored
real edits didn't guarantee convergence — that's an empirical property of
the live loop, not something a synthetic fixture can tell you. That's what
this eval measures.

The `eval-harness` charter (`.claude/worktrees/eval-suite-effectiveness/`)
doesn't cover this either — its whole model (`Rubric` → `RunRecord` →
`Baseline`) scores one invocation of a skill against a fixture. There's no
entity for a multi-cycle loop; even its planned `build` rubric explicitly
scores routing decisions from one lifecycle-state snapshot, not iterative
loop dynamics (`rubric-set-core-lifecycle.spec.md:233`, "the two
orchestrators score routing, not artifacts").

## The fixture

`tests/evals/integration-sandbox/.context-index/specs/cross-cutting/broken-loop-fixture.spec.md`
plants four distinct defect classes in one small spec about a rate limiter
(`tests/evals/integration-sandbox/lib/loop-fixture/rate-limiter.mjs`):

| Behavior | Defect class | Why |
|---|---|---|
| BEH-2 | `defect` | Contradicts BEH-1's limit outright — genuinely fixable by rewording |
| BEH-3 | mechanism-existence | Names `resetRateLimitWindow`, which does not exist in the companion lib |
| BEH-4 | `decision` | States an unresolved race-condition design choice, not fixable by wording alone |
| BEH-5 | `external` | Its real fix is the orders charter's Capability Map, not this spec |

Which of these a given reviewer panel actually catches, and correctly
classifies, is itself non-deterministic — that's real data this eval
collects, not a guaranteed outcome.

The sandbox's `.context-index/governance/review.yaml` was copied from the
main repo's materialized registry (not freshly `adev governance materialize`d)
so the eval exercises the project's *actual* active reviewer set —
`referent-integrity`, `wiring-reviewer`, `consistency-analyzer`,
`boundary-reviewer` (all `dispatch: always`), plus `termination-reviewer`
(triggered on loop/retry/convergence keywords) — not the domain template's
generic defaults, which still include the now-disabled
`structural-architect`/`security-reviewer`.

## Running it

```bash
# Smoke run against the current branch only (no A/B) — useful now, before
# the amendment's authoring step is implemented, and as a sanity check after.
node tests/evals/convergence/run-convergence-eval.mjs --samples 2

# Real A/B, once review-block-auto-retry-rev-2's plan is implemented:
# compare a pre-implementation commit against the current branch.
node tests/evals/convergence/run-convergence-eval.mjs \
  --baseline-ref <pre-implementation-commit-sha> --samples 3

# See the plan without spawning anything
node tests/evals/convergence/run-convergence-eval.mjs --dry-run
```

**Cost warning.** Each trial is a full, potentially multi-cycle
`/adev:build --full --auto` run against the fixture — real reviewer
subagents (up to 5, per the current registry) and real authoring
subagents per cycle, for as many cycles as `build.max_review_retries`
allows (default 2). This is far more expensive than a single skill
invocation. Default `--samples 2` is deliberately small; do not casually
raise it.

## What it measures, and where the numbers come from

| Metric | Source |
|---|---|
| Cycles | `spec_revised` event count on the fixture's own lifecycle log |
| Reviewer dispatches | `reviewer_report` event count, same log |
| Terminal verdict | Last recorded verdict on the `review` step (`PASS`, `BLOCK`-family, and forward-compatible with `NOT_CONVERGING`/`DECISION_REQUIRED` once implemented) |
| Cost / tokens / duration | Real session JSONL, parsed via `analyzeSession` (reused from `../token-optimization/run-ab-eval.mjs`), including subagent rollup |

Never inferred from chat transcript prose — the lifecycle event log is the
same source of truth `/adev:status` and `/adev:hygiene` read, precisely
because per-attempt review history in the transcript is not reliable
(see ADR-0018).

## Resetting between trials

`resetFixture()` restores the fixture spec and its companion lib file via
`git checkout`, and deletes the run-generated sidecars
(`.review.md`/`.blockers.md`), the fixture's lifecycle-state JSONL, and
the sandbox's `.execution-state.json` — scoped to only these paths, so it
never touches the rest of `tests/evals/integration-sandbox/` (the `orders`
domain fixtures used by the token-optimization eval).
