# ADR 0020: A Three-Level Implement Rigor Ladder With `quick` as the Default

## Status

**Proposed**

> Amends the `graduated-rigor-tiers.spec.md` invariant ("quick never weakens hard gates") to name `lite`, and supersedes the quick-grant predicate and the `batched-task` floor leg in `graduated-review-depth.spec.md`. Spec: `.context-index/specs/features/implementation/implement-rigor-ladder.spec.md`.

## Date

2026-11-25

## Context

`/adev:implement` runs a fresh implementer subagent per task (or per batch) followed by a two-stage review: spec compliance, then code quality, each with up to `max_review_cycles` cycles. Across 99 completed runs in this repository, the median run took 22.3 minutes, the median task about 16 minutes, and every task with review data had two review rounds.

`graduated-review-depth.spec.md` introduced a cheaper `quick` depth (one synthesized reviewer), but it is effectively unreachable:

- The quick-grant predicate requires an additive-only file set.
- The `scope-mismatch` floor fires whenever a touched file is anything other than a newly added declared file.
- The `batched-task` floor forces `full` on every batched task, and batching is on by default.

Of 13 recorded final passes, none resolved `quick`. Twelve were floored by `scope-mismatch`. In practice every task runs the full two-stage review, including medium-risk work whose policy already says `implement_mode: quick`.

Meanwhile the framework comparison eval scored plain Claude at a mean of 81 and adev-built at 82. On routine work the per-task review loop costs a large share of implement time for little measured quality.

## Decision

Replace the two-level implement review depth with a three-level ladder, resolved per task:

1. **`full`**: today's two-stage review. Forced by `--tier full` or a floor leg:
   - a sensitive path or governance boundary, on declared files and then on touched files
   - `human-only` routing
   - a high-risk spec on a task not routed `auto-agent`
   - a Critical finding
2. **`quick`**: one synthesized reviewer. It becomes the **default**: what you get unless a floor leg holds. This now includes `assisted-agent` tasks (which keep their human checkpoint) and high-risk tasks routed `auto-agent`. The additive-only grant condition, the `batched-task` leg and the `scope-mismatch` floor are removed.
3. **`lite`**: no per-task reviewer. The task runs inline in the orchestrator's context under the `agent-default` mandate, keeping lifecycle events and per-task commits. It is granted only when all of these hold:
   - **the operator authorized it** (`--lite`, or `implement_mode: lite` for medium or low risk, chosen during `/adev:init` for any preset by a typed choice or `--mode lite`; a non-interactive init never writes `lite` and never overwrites an existing value)
   - **route's existing "easy" signal holds** (auto-agent, no dimension below 3 of 5)
   - the spec is not high-risk, and no floor leg holds

   After the task, a diff check escalates it to `quick` when it touched an undeclared non-test, non-doc file, and to `full` when it touched a sensitive or boundary path. Quality gates run once at the end, and `/adev:validate` reports which tasks ran `lite`.

These thresholds were calibrated against this repository's corpus (576 routed tasks, 405 historical task commits) to a target of about 50% `lite` and at most 20% `full` for a project that opts into `lite`. The calibrated rules give about 49% `lite`, 35% `quick` and 16% `full`. The first draft (scores ≥ 0.8, `assisted-agent` and all high-risk tasks forced to `full`) gave 27% / 27% / 46%.

Agents never choose `lite`. Route output is eligibility, not authorization.

**Provenance and contracts.**

- **No `Review-round:` trailer on `lite` commits.** The trailer builder and its grammar (`buildReviewRoundTrailer`, stage enum, `cycles >= 1`) are left untouched. `review-provenance`'s every-commit-carries-a-trailer rule gains an exemption for tasks whose final-pass `review_depth_resolved` is `lite`, and that event pair becomes their provenance. Widening the trailer grammar to `lite=0` was rejected because it would loosen a validated injection-hardened producer for the one path with no reviewer.
- **Batched tasks are reviewed at their own resolved depth.** `batched-task-dispatch` C.3 is amended accordingly, with no reinterpretation by silence.
- **A single first-action verb (`adev implement check-flags`) owns the up-front errors.** It raises the flag conflicts and policy-value validation before any lifecycle event is written. A malformed policy value is now an error everywhere instead of a silent fallback.
- **Every run stops at the review-cycle cap, attended or not.** A loop that reaches the cap gets the existing Step 2g halt: the task is blocked, no later task starts, and the halt message names the task and findings. The halt never waits for input, so it needs no detection of whether an operator is present. A rule keyed to "dispatched as a build or work step" was rejected because headless and scheduled direct runs would have fallen through to a wait for an operator who is not there.
- **Governance inputs come from one commit per run.** `adev implement check-flags` prints the run's `HEAD` as `run_base`, and every depth resolution reads policies, boundaries, sensitive paths and routing from that commit. Commit ids are validated as hex object ids before git sees them.

All four base specs (`review-provenance`, `batched-task-dispatch`, `graduated-review-depth`, `graduated-rigor-tiers`) are changed through co-located amendments, not edited in place.

## Consequences

**Positive**

- `quick` becomes reachable, which roughly halves reviewer dispatches on routine tasks without any new mode.
- Projects that value speed can opt into `lite` once, at onboarding, and get close to harness-native speed on well-specified, low-blast-radius tasks.
- Rigor stays visible. Every task records its resolved depth, `lite` tasks are listed by `/adev:validate`, and escalation only goes upward.

**Negative**

- Fewer defects are caught per task. In the `batched-task-dispatch` run, reviewers drove fixes on 6 of 7 tasks. Under `quick` some of these move to a single reviewer, and under `lite` they move to `/adev:validate` or escape. The eval in the spec (EV-1) measures this directly with seeded defects, and its thresholds gate release.
- `lite` accumulates the whole run in one context. Per the project's token heuristic, cache reads dominate cost, so long plans may cost more tokens than dispatching. EV-1 measures tokens from session JSONL.
- The default changes for every adev project, not only this one. Projects on the `strict` preset keep `full` everywhere.
- **High-risk specs lose the guaranteed two-stage review.** On the `standard` and `prototype` presets, a high-risk task routed `auto-agent` gets one reviewer instead of two. This is the single largest relaxation: without it, `full` stays at about 24%, above the 20% target. Projects that want every high-risk task at `full` set `high.implement_mode: full` or use the `strict` preset.
- **`assisted-agent` tasks lose the second review stage.** The human checkpoint they already carry is treated as compensating oversight.
- **Batching now stacks with `quick`.** `graduated-review-depth` added the `batched-task` floor leg so that batching and a lighter depth would not compound: 15 reviewer dispatches become 6 under batching alone and 2 under both. Removing the leg accepts that stacking for `quick` tasks. EV-1 seeds defects into batched `quick` tasks to measure the cost, and its thresholds gate release. `lite` tasks are never batched.
- **A committed `implement_mode: lite` is standing authorization.** It applies to every later run on that branch, including unattended ones and runs by other contributors, and a branch can grant itself `lite` by editing `risk-policies.yaml`. This is accepted because the file is operator-authored configuration, like every other governance file. A change to it is visible in review like any other diff. The mitigations are visibility and bounds, not a per-run consent prompt:
  - every run that uses it prints `lite authorized via policy`;
  - `/adev:validate` lists the `lite` tasks;
  - an explicit `--tier quick|full` opts a run out;
  - `high` can never be set to `lite`.

  Honoring the policy only when it matches the default branch was considered. It was deferred because it would break the common case of onboarding directly on a new project's first branch.
- The calibration is specific to this corpus. The distribution replay (EV-5) recomputes it with the shipped resolver at release.

## Alternatives Considered

- **Only fix `scope-mismatch`.** This makes `quick` reachable, but offers no path to harness-native speed. It is included here as one step of the ladder.
- **A whole-plan `--lite` switch without route triage.** Simpler, but it applies to risky tasks too. Per-task grants keep rigor where route and the floors say it matters.
- **Making `lite` reachable only through the `prototype` preset.** Rejected at the operator's direction: any project may choose it during onboarding, because the choice itself is the opt-in.
