# ADR 0020: A Three-Level Implement Rigor Ladder With `quick` as the Default

## Status

**Accepted** (2026-11-26)

> Proposed on 2026-11-25 and accepted by the operator on 2026-11-26. Amends the `graduated-rigor-tiers.spec.md` invariant ("quick never weakens hard gates") to name `lite`, and supersedes the quick-grant predicate and the `batched-task` floor leg in `graduated-review-depth.spec.md`. Spec: `.context-index/specs/features/implementation/implement-rigor-ladder.spec.md`.
>
> Co-located amendments: `review-provenance-rev-5-lite-exemption.spec.md`, `batched-task-dispatch-rev-2-resolved-depth.spec.md` and `graduated-review-depth-rev-13-rigor-ladder.spec.md` (all in `.context-index/specs/features/implementation/`), and `.context-index/specs/cross-cutting/graduated-rigor-tiers-rev-4-lite-tier.spec.md`.

## Date

2026-11-25 (proposed); 2026-11-26 (accepted)

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

> **Revision 4 (2026-11-27).** Items 1 and 3 below state the decision as accepted on 2026-11-26. For runs with `lite` authorized on a spec that is not high-risk, the "Amendment: revision 4" section under Consequences supersedes three parts of them: the "easy" signal is no longer required, the sensitive-path and boundary legs give `quick`, and the diff check escalates only to `quick`. So do that section's notes where they name `routing-scores` or a tripwire escalation to `full`.

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

### Amendment: revision 4 widens the `lite` grant (2026-11-27)

Decided by the operator on 2026-11-27, after EV-1's four-arm runs added a plain Claude Code arm. On the EV-1 fixture plain Claude took 2.0–2.5 min, `full` 25.6 min and revision-3 `lite` 18.9 min, and all arms caught the four seeded defects at implement. `lite`'s inline tasks ran at about 30 s each. Most of its run went to the tasks the grant excluded, and 43% to the one sensitive-path task at `full`.

When the operator authorizes `lite`, on a spec that is not high-risk:

- **The grant no longer reads route scores or rejects `assisted-agent`.** Any task with a routing entry that is not `human-only` and no floor leg is granted `lite`. An `assisted-agent` task keeps its human checkpoint before the commit.
- **The lite cap.** The `sensitive-path` and `boundary` floor legs give `quick`, not `full`, on both passes and in the tripwire, so a tripwire escalation is always to `quick`. `human-only` routing, a Critical finding and `--tier full` still give `full`.
- **Less bookkeeping per inline task.** `adev implement task-begin` folds the provisional pass, `plan_task` `in_progress`, execution state and the snapshot into one call, and a `lite` run loads the Step 2 loop reference only for its `quick` and `full` tasks.

Runs without `lite` authorization, and high-risk specs, are unchanged. The cost is that sensitive-path and boundary work gets one synthesized reviewer, not two stages, once the operator opts into `lite`. The operator accepted that trade: `--tier full` and dropping `--lite` remain the per-run way back to two-stage review. EV-1 and EV-5 re-measure the ladder under these rules.

### Notes for implement-rigor-ladder revision 4

These are inputs for a later `/adev:specify --revise` of `implement-rigor-ladder.spec.md` (revision 3). They were decided or found while planning and implementing it and are not yet applied to the spec.

#### Decisions to ratify

The code already behaves as each note says. Revision 4 should state it.

- **CON-3: explicit `--tier quick` records `source: policy-baseline`.** The flag acts as the run's baseline.
- **RI-6: commit-id validation does not reuse `assertSafeArgvToken`.** `--run-base` and `--base-sha` are checked against `^[0-9a-f]{40}$|^[0-9a-f]{64}$`, which also rules out a leading `-`, and then resolved with `git rev-parse --verify --end-of-options`. The Output Contract sentence naming `assertSafeArgvToken` is wrong.
- **BD-13: uncommitted routing sidecar.** Paths read at `run_base` must be repo-relative (no `..`, no leading `-`, not absolute). A routing sidecar that is not committed at `run_base` fails BEH-5 (b) for every task (`lite_denied: routing-scores`) and adds a `ROUTING_SIDECAR_MISSING` warning naming the run base. Quick/full resolution still reads the working-tree sidecar, so non-lite runs do not regress.
- **The final pass keys the tripwire off the recorded provisional resolution.** It reads the task's provisional `review_depth_resolved` with `depth: lite` instead of re-evaluating authorization, because BEH-7's final-pass command line does not repeat `--lite`. Only events after the latest implement `started` event count, so a resolution from an earlier run never decides this run's final pass.
- **BD-11: ignored-path lower bound.** BEH-7 says ignored files are outside the tripwire. The tripwire's sensitive-path and boundary legs, and only those, also see gitignored untracked paths whose mtime is at or after the task's latest `plan_task` `in_progress` event. A gitignored `.env` written by the task therefore escalates it to `full`.
- **TR-6 / TR-7: review-cycle cap.** `max_review_cycles` has no maximum; that is an accepted operator choice. The cap is per loop, so worst-case reviewer dispatches per task are `2 × cap` under `full` and `1 × cap` under `quick`.
- **BEH-9 / BEH-14 post-task gates.** `lite` tasks still run the Step 2h `post-task` governance gates, because BEH-14 relaxes no hard gate. BEH-9 adds one whole-run constitution quality-gate run at Step 2-post whenever any task resolved `lite`, even when `gates.yaml` declares no `post-implement` gate.
- **BEH-9 under `--task <N>`.** The whole-run quality gates also run on a single-task re-run when that task stayed `lite`.
- **"Resolved `lite`" means the final pass kept `depth: lite`.** A task the tripwire escalated does not count. This applies to BEH-9's gate trigger and Step 3 skip, and to BEH-10's count.
- **New operator-facing codes.** Add these to the spec's codes list:
  - `RUN_BASE_UNAVAILABLE`: `check-flags` cannot capture `run_base` (no git repository, or no `HEAD`).
  - `RUN_BASE_READ_FAILED`: a git read at `run_base` failed for a reason other than the path being absent at that commit.
  - `POLICY_UNCOMMITTED_CHANGES`: an advisory `check-flags` warning when the working-tree `risk-policies.yaml` differs from `run_base`, whose copy is the one the run reads.
  - `LITE_AUTHORIZATION_ASSUMED`: a `batches` advisory when the plan's spec cannot be resolved. Eligible tasks go solo with reason `lite-assumed`.

  `INVALID_COMMIT_KINDS`, thrown by `validateCommitId` for a bad `kinds` argument, is a programming error, not an operator-facing code.
- **`check-flags` `tier`.** It is the operator's explicit tier (`--lite` reads as `lite`), or `null`. It is never the policy baseline.
- **RI-10 is reversed.** `adev implement batches` accepts `--tier full|quick|lite` as well as `--lite` and `--run-base`, so the BEH-5 (a) per-run opt-out also holds at batch formation. The Arguments `--tier lite` row already lists `batches`, and the `--tier quick` / `--tier full` rows should list it too.
- **Sequential-group segment split.** `lite`-granted members split a `(sequential)` group into segments, which are contiguous runs of the other members. Each segment is gated and sized on its own and carries a 1-based `segment` number, and batches, solo tasks and inline tasks dispatch in plan order. `batched-task-dispatch-rev-2-resolved-depth.spec.md` states the rule, and BEH-8 should cite it.
- **`batches` requires `--run-base` when `lite` can be authorized**: `--lite`, `--tier lite`, or, with no `--tier`, a policy `implement_mode: lite` at the spec's risk level (any level when the spec cannot be resolved) in the working tree or at `HEAD`.
- **BEH-5 (b) cite plus gloss.** BEH-5 (b) says `skills/route/SKILL.md` "cites `liteEligible` instead of restating the rule", while EV-4 tests parity against route's *documented* rule. Route now cites `liteEligible` as the authority and glosses the rule in route's score units. Amend BEH-5 (b) to "cites it as the authority (a gloss in score units is allowed)".
- **The `liteUnavailable` resolver input.** `liteGrant()` and `resolveImplementReviewDepth()` accept `liteUnavailable`, a `lite_denied` reason the caller already knows holds. One example is `routing-scores` when the sidecar is not committed at `run_base`. It denies an authorized grant right after condition (a), without consulting scores. The Output Contract's `liteGrant()` description should name it. Also state that `lite_denied` and `lite_source` are evaluated on the provisional pass only. On the final pass, `null` means "not evaluated".
- **Task-id normalization covers only the `adev implement` verbs.** They accept `t1`, `1` and `Task 1` through `taskIdKey`. `adev test-policy` and the lifecycle projection do not normalize. Revision 4 should state that scope, or a follow-up should extend it.
- **`init prompt implement-rigor` details (BEH-12).**
  - A missing `risk-policies.yaml` is created with only the `implement_mode` keys.
  - A bad `--preset` reuses `INVALID_IMPLEMENT_RIGOR`.
  - The non-interactive no-overwrite rule applies per level.
  - Typed answers are not trimmed.
- **Governance line.** The spec's Output Contract still says ADR 0020 is Proposed. It should say Accepted.
- **BEH-7 gains a second exemption: exact provider-mirror regenerations.** This is an operator decision made on 2026-11-26 to close the EV-5 gap. Mirror regeneration caused most `quick` trips in the offline replay and held `lite` below target. A touched `providers/<p>/skills/<rest>` is outside `scope-mismatch` when all of these hold:
  - `<p>` is a provider `scripts/sync-provider-skills.mjs` handles, and the sync writes that path (never `agents/`, a nested `SKILL.md` or an `adev-*` skill);
  - `skills/<rest>` is declared or touched;
  - the mirror is a regular file. Its blob equals the blob of the sync's output for `skills/<rest>` as the diff sees it (`isRegeneratedProviderMirror()` reuses the script's transform from `lib/sync/provider-skills.mjs`);
  - its git mode equals the canonical file's mode, for added and changed mirrors alike. The sync gives every mirror it writes its canonical file's executable bit, and a mode-only difference is reported as `updated`.

  A deleted mirror is exempt only when `skills/<rest>` was deleted too. The check fails closed: a missing, unreadable, symlinked or since-changed canonical file, a generator error, or a SHA-256 repository means not exempt. Because the comparison uses git's stored blobs, it also fails closed when `core.autocrlf=true` or `input`, or an `eol=crlf` attribute, applies to CRLF canonical files: on such a checkout mirror regenerations always trip to `quick`. It covers `scope-mismatch` only, never `sensitive-path` or `boundary`, which still see the mirror path. `*.spec.md`, `.context-index/`, symlinks and `.`/`..`/empty segments stay never exempt. Revision 4 must amend three places: BEH-7's exemption list, the acceptance criterion that `isTripwireExempt` has unit tests for every exemption rule (extend it to this rule), and the Failure Modes row for an undeclared, non-exempt path. Add a row for a mirror that is not an exact regeneration.

#### Open decisions

- **The `lite-report` window across a BEH-15 resume.** BEH-10 opens the window at the most recent implement `started` event. A BEH-15 recovery re-run (`/adev:implement --task <N>`, or `/adev:build --resume`) emits a new `started` event. `lite` tasks committed before the halt then drop out of the validate advisory and out of validate's spec-compliance coverage. One option is to open the window at the earliest implement `started` event after the last implement `step_completed`. Decide in revision 4.
- **`failure-path-exit-event.md:23` says "Stage-2 convergence terminals".** Stage 1 now halts through the same Step 2g path with the same `LOOP_*` codes (WR-8). CON-1 pins that line unchanged. Revision 4 should decide whether to lift the pin and reword it to "review-loop convergence terminals", or to record the wording as knowingly stale.

#### Code follow-ups

- **Move `lite` task-id normalization and commit selection into `lite-report`.** Today they live in validate prose (`skills/validate/references/checks-orchestration/check-2-spec-compliance.md`). `adev implement lite-report --json` should return normalized task ids and their commit SHAs, so the runtime decision lives in the verb.
- **`ROUTING_SIDECAR_MISSING` is raised even when `lite` is not authorized.** `loadGovernanceAtRunBase` raises it whenever the sidecar is uncommitted, so quick/full runs get the warning too, harmlessly. Raise it only when `lite` is authorized.
- **A scope-mismatch escalation reports `floor_applied: true`.** A tripwire escalation for scope mismatch returns `floor_applied: true` and `floor_legs: ['scope-mismatch']`, although `scope-mismatch` is no longer a floor leg. Consider a distinct field, such as `tripwire_legs`.
- **`verifyPerTaskReviewRounds` is full-only.** `lib/implement/batch-verify.mjs::verifyPerTaskReviewRounds()` requires both stage records. Make it depth-aware, so that a `quick` task expects `synthesized`.

## Alternatives Considered

- **Only fix `scope-mismatch`.** This makes `quick` reachable, but offers no path to harness-native speed. It is included here as one step of the ladder.
- **A whole-plan `--lite` switch without route triage.** Simpler, but it applies to risky tasks too. Per-task grants keep rigor where route and the floors say it matters.
- **Making `lite` reachable only through the `prototype` preset.** Rejected at the operator's direction: any project may choose it during onboarding, because the choice itself is the opt-in.
