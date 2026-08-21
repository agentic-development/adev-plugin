# Graduated Review Depth

Full contract for the two `adev implement resolve-depth` calls and the
`full` / `quick` review branch anchored in `SKILL.md` (Steps 2a, 2d, 2f-pre).
Read this file before running either branch.

## 1. Provisional pass (Step 2a, before dispatch)

```bash
adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <task-id> \
  [--tier <t>] [--review-cycles <n>] [--in-batch] --pass provisional
```

Pass `--in-batch` when this task is part of a batch resolved earlier in Step 2
(`adev implement batches`) — batch membership is a static, plan-level fact known
before RED begins, so it is available on the provisional pass too.

The printed `depth` briefs the implementer (whether elevated scrutiny should be
expected) and decides nothing about which reviewer(s) dispatch yet — that
decision uses the **final** pass below.

`--review-cycles`, if the operator passed it to `/adev:implement`, is forwarded
here unchanged on every call (both passes); the CLI verb is the single place its
value is validated (`INVALID_REVIEW_CYCLES`) — the SKILL.md does not re-validate
it. The verb's JSON response's `review_cycles` field is the effective cap for
both Step 2f/2g's `full` loops and the `quick` synthesized loop below.

`declared_files` / `additive_only` are never passed by the caller — the verb
derives them itself from the plan's `Files:` block.

This call reports the `review_depth_resolved` event for the provisional pass.

## 2. Base SHA (Step 2d, before the implementer dispatch)

`git rev-parse HEAD`, captured immediately before dispatch. Used only for this
task's final-pass depth resolution; it is not persisted anywhere and does not
survive past this single dispatch.

## 3. Final pass (Step 2f-pre, after GREEN, against the real diff)

```bash
adev implement resolve-depth --spec <spec-path> --plan <plan-path> --task-id <task-id> \
  [--tier <t>] [--review-cycles <n>] [--in-batch] [--had-critical-finding] \
  --base-sha <captured-sha> --pass final
```

Pass `--had-critical-finding` whenever any prior cycle on this task's own review
loop (tracked in this loop's working state, not read back from disk) produced a
Critical-severity finding — this is what makes the `critical-finding` floor leg
persist for the remainder of the task once triggered. This call also reports the
`review_depth_resolved` event for this pass.

**Floor and warning visibility.** If the JSON response's `floor_applied` is
`true`, echo `REVIEW_DEPTH_FLOOR_APPLIED` naming `floor_legs` to the
operator-facing transcript, in addition to the persisted event the verb already
writes — a graduated run must be auditable in the visible transcript, not only in
the lifecycle log. If any warning in the response carries code
`ROUTING_SCORE_OUT_OF_RANGE`, echo it the same way, naming the task, dimension,
and offending value.

## 4. Branch on the resolved `depth`

### `full` (default, unchanged)

Run Step 2f (Stage 1: Spec Compliance) then Step 2g (Stage 2: Code Quality)
exactly as written in `SKILL.md`. Behavior on this path is byte-identical to the
pre-graduated flow — nothing in this file modifies it.

### `quick`

Skip the two-stage path and dispatch a **single** fresh reviewer subagent
carrying the content of `synthesized-reviewer-prompt.md` from this skill
directory, plus the union of both stages' context:

- Full task requirements from the plan
- The implementer's status report
- The acceptance criteria from the Live Spec
- The git diff (base SHA before task, head SHA after task)
- The Coding Standards section from the constitution
- Any concerns from the implementer (if `DONE_WITH_CONCERNS`)
- Secondary specialist matches from step 2b

Apply the same `cq-<n>` id-tagging and `evaluateStopCondition` convergence
discipline Stage 2 uses (`lib/loop-convergence.mjs`, unchanged) — the verdict
table in 2g applies verbatim, including the terminal `LOOP_NO_PROGRESS` /
`LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` escalation path — capped at the
effective `review_cycles` value returned by the final pass above.

On completion, call `reportReviewRound(..., { stage: "synthesized", cycles: <n> })`
and add the `Review-round: synthesized=<n>` trailer to the task's single commit,
per `review-provenance.spec.md`. The `synthesized` stage replaces both
`spec-compliance` and `code-quality` on this task's provenance record — do not
also record those two stages.

The `quick` path's worst-case dispatch count is `1 × cap` where `full`'s is
`2 × cap`, because both stages read the same resolved cap.
