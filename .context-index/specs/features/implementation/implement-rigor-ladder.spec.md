---
partial_schema: spec@1
charter: implementation
kind: skill
status: review-passed
risk_level: high
milestone:
revision: 4
charter-revision: 1
created: 2026-11-25
updated: 2026-11-27
relates-to:
  - .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md
  - .context-index/specs/features/implementation/graduated-review-depth.spec.md
  - .context-index/specs/features/implementation/batched-task-dispatch.spec.md
  - .context-index/specs/features/implementation/review-provenance.spec.md
adr: .context-index/adrs/0020-implement-rigor-ladder.md
---

# Skill Spec: Implement Rigor Ladder (lite / quick / full)

<!-- Skill Spec within the implementation charter.
     Parent Charter: .context-index/specs/features/implementation/charter.md
     Decision record: .context-index/adrs/0020-implement-rigor-ladder.md -->

## Problem

`/adev:implement` is slow compared to running the harness directly, and the cheap path it already has almost never runs.

Measured on this repository's lifecycle log (99 completed `implement` runs):

| Measure | Value |
|---|---|
| Median `implement` run | 22.3 min (p75 50.4, p90 151.4) |
| Median minutes per task (runs with review data) | 15.7 |
| Review rounds per task | 2.0 (spec-compliance and code-quality, 1–2 cycles each) |
| `review_depth_resolved` final passes that resolved `quick` | **0 of 13** (12 floored by `scope-mismatch`, 1 by `sensitive-path` + `scope-mismatch`) |

The `quick` depth defined by `graduated-review-depth.spec.md` is gated twice on "additive only": the quick-grant predicate requires an additive-only file set, and the `scope-mismatch` floor fires whenever a touched file is not a newly added declared file. Any task that edits an existing file therefore resolves `full`, so medium-risk work runs the full two-stage review even though `risk-policies.yaml` sets `medium.implement_mode: quick`. Batching makes it worse: the `batched-task` floor forces `full` on every batched task, and batching is on by default.

The only lighter alternative is to skip adev. The prior comparison eval (`tests/evals/comparison/reports/summary.json`) scored plain Claude at a mean of 81 and adev-built at 82. On that evidence the per-task review loop buys little measured quality for its cost on routine work.

This spec replaces the two-level depth (`full | quick`) with a three-level ladder. Today's effective default is `full`. `quick` becomes the reachable default, `full` is reached only through a floor leg or an explicit choice, and a new `lite` level runs route-eligible tasks inline with no per-task reviewer.

### Target distribution

**Target, for a project that has opted into `lite`:** about 50% of tasks at `lite` and at most about 20% at `full`. Revision 3's grant and floor rules were calibrated against this repository's corpus to meet that target. Revision 4 widens the grant past it (see the next subsection), and EV-5 re-measures the shares:

- **Tasks:** 576 tasks across 70 plans, from the routing sidecars present on 2026-11-25.
- **Trip rate:** 405 historical task commits carrying `Spec:` and `Plan-task:` trailers were compared against each task's declared `Files:`.
  - 23% touched a non-bookkeeping file outside the declared set.
  - 17% did once tests and docs were excluded. 26 of the 94 trips were test or doc files only.

| Rule set | `lite` | `quick` | `full` |
|---|---|---|---|
| Today (observed) | 0% | ~0% | ~100% |
| First draft of this spec (scores ≥ 0.8, `assisted-agent` → `full`, high risk → `full`, any out-of-set touch trips) | ~27% | ~27% | ~46% |
| Revision 3 (scores ≥ 0.6, `assisted-agent` → `quick`, high-risk `auto-agent` → `quick`, tests and docs exempt from the tripwire) | ~49% | ~35% | ~16% |
| **Revision 4** (no score check, `assisted-agent` eligible, the lite cap; EV-5 at `e7995db4`, 588 tasks in 71 plans) | **62.3%** | **29.9%** | **7.9%** |

The remaining `full` share comes from sensitive-path tasks (49 outside high-risk specs), `human-only` tasks, and high-risk tasks not routed `auto-agent`. The distribution is a property of this corpus. EV-5 recomputes it, and the targets are re-checked at release.

### Revision 4: why the grant and the floors changed

EV-1's four-arm runs of 2026-11-27 (`results/*-c90fa324e18f-*`) added a plain Claude Code arm with adev disabled. On the same fixture:

| Arm | Wall clock | `Agent` dispatches | Seeded defects caught at implement | Hidden edge checks passed |
|---|---|---|---|---|
| plain Claude Code | 2.0–2.5 min | 0 | 4 of 4 | 53 of 54 |
| `full` | 25.6 min | 23 | 4 of 4 | 53 of 54 |
| `quick` | 24.2 min | 14 | 4 of 4 | 51 of 54 |
| `lite` (revision 3) | 18.9 min | 10 | 4 of 4 | 53 of 54 |

In the `lite` run the three inline tasks took about 30 s each, against plain's ~17 s per task. The other 75% of the run went to the four tasks the revision-3 rules kept out of `lite`, 43% of it on the one sensitive-path task at `full`. About 3 min more was fixed overhead: reference reads, per-task bookkeeping calls and completion.

Revision 4 makes operator-authorized `lite` the rule rather than the exception:

- Route scores and `assisted-agent` routing no longer deny `lite` (BEH-5 b).
- Under `lite` authorization on a spec that is not high-risk, the `boundary` and `sensitive-path` floor legs give `quick`, not `full` (the lite cap, BEH-4).
- An inline task's bookkeeping folds into one verb call, and a `lite` run loads only the references it needs (BEH-17).

A run without `lite` authorization, and any high-risk spec, resolves exactly as in revision 3.

## Invocation Modes

The ladder is resolved **per task**, so one plan can mix levels. Every review loop below is capped at `implement.max_review_cycles` in `manifest.yaml`, overridable per run with `--review-cycles`. Both must be an integer ≥ 1 with no upper bound, and the default is 3. An illegal manifest value fails with the existing `INVALID_MAX_REVIEW_CYCLES`, and an illegal flag value with the existing `INVALID_REVIEW_CYCLES`. BEH-15 states what happens at the cap.

| Level | Per-task execution | Per-task review | Resolved when |
|---|---|---|---|
| **`full`** | Fresh implementer subagent (batched or solo) | Stage 1 spec-compliance, then Stage 2 code-quality | `--tier full`, or a floor leg holds (BEH-4): sensitive path, governance boundary, `human-only` routing, a high-risk spec on a task not routed `auto-agent`, or a Critical finding. Under the lite cap (BEH-4) a sensitive path or boundary gives `quick` instead |
| **`quick`** (new default) | Fresh implementer subagent (batched or solo) | One synthesized reviewer | No floor leg holds and the task is not granted `lite`. Includes high-risk `auto-agent` tasks, `assisted-agent` tasks when `lite` is not authorized, and sensitive-path and boundary tasks under the lite cap |
| **`lite`** (new) | Inline in the orchestrator's own context; no `Agent` dispatch | None; a post-task tripwire can escalate the task (BEH-7) | Operator authorization **and** a routing entry routed `auto-agent` or `assisted-agent` **and** spec not high-risk **and** no floor leg (BEH-5) |

`full` and `quick` keep their current per-stage meaning. Existing `risk-policies.yaml` files and `--tier` values need no migration, provided their values are legal (BEH-16). What changes is the fallback, the grant rule and the floor set.

## Arguments

| Argument | Accepted by | Meaning |
|---|---|---|
| `--lite` (new) | `/adev:implement`, `/adev:build`, `/adev:work`; verbs `adev implement check-flags`, `resolve-depth`, `batches`, `task-begin` | Operator authorization for `lite`. Equivalent to `--tier lite` on `implement`. `build` and `work` forward it to `implement` only, and only when the operator passed it (BEH-11). Never added by an agent on its own judgment (BEH-13) |
| `--tier lite` (new value) | `/adev:implement`, `/adev:build`, `/adev:work`, `/adev:review-specs`, `/adev:validate`; verbs `adev implement check-flags`, `resolve-depth`, `batches`, `task-begin`, `adev governance dispatch` | On `implement` and its verbs: same as `--lite`. On `review-specs`, `validate` and `governance dispatch`: treated as `quick`, with one printed line saying so (BEH-11). `build` and `work` forward it as BEH-11 states |
| `--tier quick` (existing) | `/adev:implement` (now listed in its Arguments section), `/adev:build`, `/adev:work`, `/adev:review-specs`, `/adev:validate`; verb `resolve-depth` | Baseline `quick`; floors can still raise a task to `full` |
| `--tier full` (existing) | the same as `--tier quick` | Absolute: every task `full`, no floor consulted, no `lite` grant |
| `--run-base <sha>` (new) | verbs `adev implement resolve-depth` (both passes), `batches`, `task-begin` | The **governance input** commit: `risk-policies.yaml`, `boundaries.yaml`, the sensitive-path configuration and the routing sidecar are read from it (BEH-5). It is the `run_base` value that `check-flags` prints at the start of the run (BEH-16), and is the same for every task in the run |
| `--base-sha <sha>` (existing) | verb `adev implement resolve-depth`, final pass | The **diff range**: the per-task dispatch-time working-tree snapshot that touched files are computed against (BEH-7). It changes per task and is never used to read governance inputs |
| `--parallel` (new on the verb) | verbs `adev implement resolve-depth`, `task-begin` | Tells the resolver the run is `--parallel`, which denies `lite` (BEH-5 d) |
| `--in-batch` (existing) | verb `adev implement resolve-depth` | Accepted and ignored, because the `batched-task` floor leg it fed is removed (BEH-4). Skill text stops passing it |
| `implement_mode: lite` (new value) | `risk-policies.yaml`, `medium` and `low` levels | Project-level authorization for `lite` at that risk level. Written by `/adev:init` onboarding only on a typed choice or `--mode lite` (BEH-12), or by hand. Rejected for `high` with `LITE_NOT_ALLOWED_FOR_HIGH` (BEH-16) |

Flag conflicts and policy-value errors are raised by `adev implement check-flags`, the skill's first action, before any lifecycle event is written (BEH-16). `--lite` together with `--tier full` or `--tier quick` exits 1 with `CONFLICTING_TIER_FLAGS`.

**Commit-id arguments.** `--run-base` and `--base-sha` are each validated before use:

- The value must be a full lowercase hex object id (40 or 64 characters) and must not begin with `-`.
- It must resolve with `git rev-parse --verify --end-of-options`: `--run-base` to a commit, and `--base-sha` to a commit or a tree.
- It is passed to git only as a separate argv element, never through a shell.

Any other value exits 1 with the new code `INVALID_COMMIT_ID`, naming the flag.

**Naming.** `implement_mode` (in `risk-policies.yaml`) sets per-task **review depth**: `lite | quick | full`. `implementation_mode` (top-level in `manifest.yaml`) sets **test discipline**: `tdd | test-required | agent-default`. The two are independent, except that a `lite` task always runs under the `agent-default` test mandate (BEH-6). The review-cycle cap is `implement.max_review_cycles` in `manifest.yaml`, overridable per run with `--review-cycles` (see Invocation Modes for its range).

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** any skill or verb validates a rigor tier **then** the legal set is `full | quick | lite`:
  - `RIGOR_MODES` in `lib/governance/rigor-mode.mjs` gains `lite`, and `isValidTier('lite')` is true.
  - `REVIEW_DEPTHS` in `lib/lifecycle-state.mjs` gains `lite`, so `review_depth_resolved.depth` accepts it.
  - `adev governance dispatch` (`lib/cli/governance.mjs`) accepts `--tier lite` and dispatches it as `quick`.
  - The `adev implement` usage banners list `full|quick|lite`.

  Every other value fails with `INVALID_TIER`, including a malformed policy value (BEH-16). Every consumer that is not `implement` and receives `lite` treats it as `quick`. `resolveRigorMode` does this mapping for every skill other than `implement`, and the two tier-forwarding paths are `/adev:build` Step 4 (`skills/build/step4-tier-propagation.md`) and `/adev:work`, which follow BEH-11. No consumer rejects `lite` once `check-flags` has accepted it.
- **BEH-2** — **When** `adev implement resolve-depth` runs with no `--tier` and the spec's risk level has no `implement_mode` in `risk-policies.yaml` (or the file is absent) **then** the baseline is `quick`, not `full`. The `review_mode` and `validate_mode` fallbacks for `/adev:review-specs` and `/adev:validate` stay `full`.
- **BEH-3** — **When** the baseline is `quick` (policy, fallback or `--tier quick`) **then** the task resolves `quick` unless a floor leg holds. The quick-grant predicate's rows (auto-agent routing, every score ≥ 0.6, additive-only file set, no boundary) are removed as grant conditions. Routing and boundary signals act only through the floor legs in BEH-4. A task in a run with `lite` authorized that is not granted `lite` keeps its baseline `source` (`policy-baseline` or `default-quick`); a policy `implement_mode: lite` is a `quick` baseline.
- **BEH-4** — **When** the floor pass runs **then** each of these legs forces `full`:
  - `risk-level`: the spec is `risk_level: high` and the task is not routed `auto-agent`.
  - `boundary` and `sensitive-path`: evaluated on the declared files at the provisional pass and on every touched file at the final pass.
  - `critical-finding`: final pass only.
  - `routing`: `selected_agent` is `human-only`. `assisted-agent` no longer forces `full`; its human checkpoint still applies.

  **The lite cap.** When `lite` is authorized for the run (BEH-5 a) and the spec is not `risk_level: high`, a holding `boundary` or `sensitive-path` leg gives `quick` instead of `full`. If any other leg holds as well (`routing`, `critical-finding`), the result is `full`, and `--tier full` stays absolute. `risk-level` cannot hold on a spec that is not high-risk.

  - **Where it applies.** On the provisional pass, on the final pass, and in the BEH-7 tripwire. Authorization is evaluated on each pass from the same inputs, so every `resolve-depth` and `task-begin` call in the run carries the operator's `--lite` and `--tier` flags exactly as typed, the final pass included. A policy authorization needs no flag, because the policy is read at `run_base`. The tripwire always applies the cap: it runs only for a task whose recorded provisional resolution is `lite`, which required authorization.
  - **`floor_cap`.** The verb's JSON output carries `floor_cap: "quick"` whenever the cap lowered a `full` result to `quick`, on either pass, a tripwire escalation through `sensitive-path` or `boundary` included. It is `null` otherwise: no floor leg, a leg the cap does not cover, or a tripwire escalation by `scope-mismatch` alone. A run with `--parallel` is still authorized, so its tasks are capped.
  - **The durable record.** The event's key set is unchanged. A final-pass `review_depth_resolved` with `depth: quick` whose `floor_legs` include `sensitive-path` or `boundary` is a capped resolution, since without the cap those legs give `full`. `lite-report` lists those tasks as `capped` (BEH-10).
  - `REVIEW_DEPTH_FLOOR_APPLIED` still names the legs, and its message names the depth the floor gave.

  The `batched-task` leg is removed. `batched-task-dispatch.spec.md` Output Contract C.3 is amended to match: a batched task is reviewed at its own resolved depth, and batch membership no longer implies two stages (see Output Contract, cross-spec amendments). `scope-mismatch` no longer forces `full`; it survives only as the `lite` tripwire in BEH-7. A high-risk task routed `auto-agent` resolves `quick` and is never granted `lite` (BEH-5 c). `REVIEW_DEPTH_FLOOR_APPLIED` is still echoed to the transcript, and `--tier full` stays absolute.

  **Stacking is accepted deliberately.** `graduated-review-depth.spec.md` warned that stacking batching with a lighter depth compounds the dispatch reduction: 15 dispatches become 6 under batching alone and 2 under both. Removing the `batched-task` leg allows exactly that stacking for `quick` tasks. It is accepted because EV-1 measures its quality cost directly, with seeded defects in batched `quick` tasks, and the release thresholds gate it. `lite` tasks never stack, because they are never batched (BEH-8). These relaxations are calibrated to the target distribution in the Problem section, and ADR 0020 records them.
- **BEH-5** — **When** `adev implement resolve-depth --pass provisional` runs for a task **then** it resolves `lite` only if all of these hold:
  - (a) the operator authorized `lite`, through `--lite` or `--tier lite` on the verb, or through `implement_mode: lite` for the spec's risk level when no `--tier` was passed. An explicit `--tier quick` or `--tier full` outranks the policy, as in `resolveRigorMode`'s precedence, and is the per-run opt-out;
  - (b) `liteEligible(entry)` is true: the task has a routing sidecar entry whose `selected_agent` is `auto-agent` or `assisted-agent`. Routing scores are not consulted. A missing entry, or a routing sidecar not committed at the run base, fails (b) with `no-routing-entry`; a `human-only` entry fails (c) with `floor:routing`. `liteEligible` is the single code definition of route's `lite`-eligibility signal, and `skills/route/SKILL.md` cites it instead of restating the rule. An `assisted-agent` task granted `lite` keeps its human checkpoint: after the tripwire and before the commit, the orchestrator presents the diff and waits for approval, as Step 2a states for `agent-default`;
  - (c) the spec is not `risk_level: high` and no provisional floor leg holds (`boundary`, `sensitive-path`, `routing`);
  - (d) the verb was not passed `--parallel`.

  Otherwise the task goes through the `quick`/`full` resolution of BEH-3 and BEH-4. The verb's JSON output carries:
  - `lite_denied`: the first failing condition, as one of `not-authorized`, `no-routing-entry`, `high-risk`, `floor:<leg>` or `parallel`, or `null` when `lite` was granted. The orchestrator copies the values other than `not-authorized` into the run summary verbatim; a failed (a) is silent.
  - `lite_source`: `flag`, `policy` or `null`.

  When `lite` is authorized at all, the orchestrator prints `lite authorized via <flag|policy>` once at the start of the run (from `check-flags`) and repeats it in the run summary. A policy-sourced authorization is therefore always visible, never only on denial.

  The verb reads `risk-policies.yaml`, `boundaries.yaml`, the sensitive-path configuration and the routing sidecar from the commit passed as `--run-base`, validated as in Arguments. That commit is the `run_base` printed by `check-flags` (BEH-16), which is `HEAD` when the run starts. The orchestrator passes the same value to every `resolve-depth` and `batches` call in the run, on both passes. An inline `lite` task therefore cannot change the inputs to its own resolution or to a later task's resolution.

  The event's `source` field takes these values, which replace the retired `predicate-grant`, `predicate-denied` and `score-out-of-range` values:
  - `tier-full-absolute`
  - `policy-baseline`
  - `default-quick` (the BEH-2 fallback)
  - `lite-grant` (a `lite` resolution on either pass)
  - `lite-tripwire` (a final-pass escalation from `lite`)

  `lite_denied`, `lite_source` and `escalated_from` appear only in the verb's JSON output. The `review_depth_resolved` event's key set (`REVIEW_DEPTH_RESOLVED_KEYS`) is unchanged.
- **BEH-6** — **When** a task resolves `lite` **then** the orchestrator implements it in its own context with no `Agent` dispatch, using the `agent-default` mandate (`references/agent-default-mandate.md`) and the always-on `references/test-integrity.md`.
  - **Skipped:** both review stages and the synthesized reviewer. Test-depth resolution is skipped too: as for every task under `agent-default`, it makes no `adev test-policy resolve` call and emits no `test_depth_assigned` event. ADR-0017 makes that verb the sole writer of the assignment event, and nothing writes one here.
  - **Kept:** the dispatch-time working-tree snapshot; one commit per task carrying `Spec:` and `Plan-task:` (plus the hook-injected `Author-type` and `Operator`); and the `plan_task` `in_progress` and `done` events. Both `review_depth_resolved` passes are emitted with `depth: lite`.
  - **No `Review-round:` trailer.** A `lite` commit carries none, and `buildReviewRoundTrailer` is neither called nor changed. The rule in `review-provenance.spec.md` Contract A that every task commit carries one is amended to exempt a task whose final-pass `review_depth_resolved` has `depth: lite`. That event pair is the task's review provenance.
  - **No new permissions.** Inline execution runs under the orchestrator session's own tool permissions, which the harness and the operator already grant. `lite` adds no tool, profile or permission, and hooks apply to inline edits exactly as to subagent edits.
- **BEH-7** — **When** a `lite` task finishes, before its commit **then** the orchestrator runs `adev implement resolve-depth --pass final --run-base <run_base> --base-sha <dispatch-time snapshot> [--tier <t>] [--lite]`, with `--tier` and `--lite` as the operator typed them.
  - **What each input is for.** Governance inputs (policies, boundaries, sensitive paths, routing) come from `--run-base`. `--base-sha` is used only as the diff range.
  - **Touched files.** They come from `computeTouchedFiles`: tracked changes plus untracked files not excluded by `.gitignore`. The paths are git's own NUL-delimited repo-relative output, never re-derived by joining or resolving strings. Ignored files are outside the tripwire because they cannot enter the task's commit.
  - **`scope-mismatch` → `quick`.** A touched path is outside the declared set and is not exempt. A path is exempt only if all of these hold:
    - it is under `tests/` or `docs/`, has a basename matching `*.test.<ext>` or `*.spec.<ext>` for a source extension (`js`, `mjs`, `cjs`, `ts`, `tsx`, `jsx`, `py`, `go`, `rb`, `rs`), or is a `README.md`. These matches are case-sensitive;
    - it is not under `.context-index/` and is not a `*.spec.md`. These exclusions are matched case-insensitively, so `.Context-Index/` and `X.SPEC.MD` are not exempt either;
    - it is not a symlink (git mode `120000`).

    The task is escalated to `quick`: one synthesized reviewer is dispatched against the task diff under the normal `cq-<n>` loop, capped at `implement.max_review_cycles`.
  - **`sensitive-path` or `boundary` → `quick`.** These are evaluated on every touched path, exempt or not. A `lite` task always runs under the lite cap (BEH-4), so these legs give `quick`, as `scope-mismatch` does.

  Escalation only goes upward. A tripwire escalation is to `quick` unless a leg the lite cap does not cover also holds (`routing` or `critical-finding`, neither of which can hold for a `lite` task in practice), in which case it is `full` (BEH-4). This is the single statement of that bound. The verb returns the new `depth`, `escalated_from: lite` and the holding `floor_legs`, records a final-pass `review_depth_resolved` with `source: lite-tripwire`, and returns a `LITE_TRIPWIRE_ESCALATED` warning naming the task and legs. The orchestrator echoes that warning to the transcript, as it does `REVIEW_DEPTH_FLOOR_APPLIED`. An escalated task's review loop is bounded as stated in BEH-15.
- **BEH-8** — **When** a plan mixes levels **then** tasks run in plan order. Consecutive `lite` tasks run inline. `quick` and `full` tasks go through the existing Step 2 loop. `adev implement batches --lite --run-base <run_base>` evaluates the BEH-5 grant per task and forms batches only from tasks that are not granted `lite`. Under `--parallel`, `lite` is not granted (BEH-5 d), and `adev implement check-flags` prints `LITE_SUPPRESSED_PARALLEL` once (BEH-16).
- **BEH-9** — **When** a run that contained at least one `lite` task reaches Step 2-post **then** the constitution's quality gates run once over the whole run, fail-fast. A failure emits the implement `step_failed` event with `--verdict FAIL` and names the new operator-facing code `QUALITY_GATES_FAILED`. The gate run uses the existing Step 2-post mechanism. It stays skill-driven on purpose, because the gate commands come from the constitution and `gates.yaml`, not from a verb. Step 3's final reviewer is a single pass with no loop. It is skipped only when every task in the run resolved `lite`; otherwise it runs as today.
- **BEH-10** — **When** `/adev:validate` runs **then** it calls `adev implement lite-report --spec <spec-path> --json`. That verb reads the raw `review_depth_resolved` events from the spec's lifecycle log, not the `reviewDepthResolutions` projection, which keeps only the latest event per plan, task and pass across all runs. It takes only events after the most recent implement `lifecycle_step` `started` event, and counts a task as `lite` when its latest final-pass `review_depth_resolved` has `depth: lite`. When the count is non-zero, the validate report lists the count and task ids as an advisory ("implemented without per-task review"), and its spec-compliance check covers the diff of those tasks. The verb also lists, as `capped`, the tasks whose latest final-pass event in that window is a capped resolution (BEH-4), and the advisory names them as "one reviewer under the lite cap". `validate` is never skipped and its own tier is unchanged.
- **BEH-11** — **When** `/adev:review-specs` or `/adev:validate` receives `--tier lite` **then** it runs exactly as `--tier quick` and prints one line saying it did. `/adev:build` and `/adev:work` forward only what the operator typed: `--lite` (or `--tier lite`) to `/adev:implement` as `--lite`, and `--tier lite` to `/adev:review-specs` and `/adev:validate`. They never add either on their own.
- **BEH-12** — **When** `/adev:init` onboards a project (any `risk_tier` preset: `prototype`, `standard` or `strict`) or is re-run on an existing project **then** it runs `adev init prompt implement-rigor`.
  - **Interactive choice.** The prompt offers `lite`, `quick` and `full` and requires a typed choice. Only those three literal tokens are accepted, matched exactly and case-sensitively. Blank or any other input is re-prompted, **at most 3 attempts in total**. After the third invalid answer, when input closes (EOF or Ctrl-D), or when scripted answers run out, the verb exits 1 with `INVALID_IMPLEMENT_RIGOR` and writes nothing. Lines are read through the readline async iterator, as `init-prompt-implementation-mode.mjs` does, so piped input cannot hang the prompt. With `--mode`, any other value exits 1 with `INVALID_IMPLEMENT_RIGOR` and no prompt is shown.
  - **What is written.** The verb writes the matched enum constant, never the raw input, to `risk-policies.yaml` as `implement_mode` for the `medium` and `low` levels, and preserves every other key. `high` keeps its preset value: `quick` for `standard` and `prototype`, `full` for `strict`. Choosing `full` also writes `full` for `high`. Choosing `lite` first prints a warning that per-task review is skipped for route-eligible tasks and deferred to `/adev:validate`.
  - **Non-interactive runs** (no TTY and no `--mode`). No prompt is shown, so no retry loop runs. The verb never overwrites an existing `implement_mode`. Where none exists it writes the preset's non-`lite` default (`strict` → `full`, `standard` → `quick`, `prototype` → `quick`) and prints that `lite` is available through `--mode lite`. `lite` is therefore written only by a typed choice or an explicit `--mode lite`.
- **BEH-13** — **When** any skill text decides an implement tier **then** `lite` comes only from operator input: a flag the operator typed, or `risk-policies.yaml`. No SKILL.md, reference file or stop message tells an agent to add `--lite` or `--tier lite` on its own judgment. `/adev:route` output is an eligibility signal, never an authorization. `adev route emit-sidecar` adds `lite_eligible: { count, total }` to its JSON output, computed by `liteEligible(entry)`, which `lib/implement/review-depth.mjs` exports (the same predicate as BEH-5 b). The route summary prints it as `lite-eligible: <count> of <total>`.
- **BEH-14** — **When** a run contains `lite` tasks **then** no hard gate is relaxed: the strict `lifecycle.gate_mode` chain, `adev gate require`, the non-main-branch stop, skill extensions, `test-integrity.md`, quality-gate fail-fast, destructive-action gates and constitution checks apply exactly as in `full`. The `graduated-rigor-tiers.spec.md` invariant is amended to name `lite` beside `quick` and to state that per-task review is a review-breadth setting, not a hard gate.
- **BEH-15** — **When** a `quick` or `full` review loop, including one reached through the BEH-7 tripwire, uses `implement.max_review_cycles` (or `--review-cycles`) cycles without converging (`LOOP_BUDGET_EXHAUSTED`, `LOOP_NO_PROGRESS` or `LOOP_REGRESSED`) **then** the existing Step 2g halt applies to **every** run, whoever or whatever invoked it:
  - The task is not marked complete. It gets `plan_task` `blocked` with the loop code, and execution state is written with `status: "blocked"`.
  - No later task starts. Commits of tasks that already completed are kept and never rolled back.
  - The halt message names the loop code, the unconverged task id and the outstanding finding ids. When implement runs as a `/adev:build` step, that message is its `STEP_RESULT` with `status: BLOCKED`.

  **No operator is assumed.** The halt never waits for input. It records its terminal state and returns, so it is safe in an interactive session, a headless `claude -p` run, a scheduled job or a build step alike. No detection of who is attending is needed. An operator who is present acts on the halt message afterwards, by re-running `/adev:implement --task <N>` or running `/adev:recover`.

  **No `step_failed` is emitted for this halt.** `plan_task` `blocked` is its recorded terminal, under the existing "do not double-emit" rule in `skills/implement/SKILL.md` and `references/failure-path-exit-event.md`, which this spec leaves unchanged.

  **Batched and parallel runs** use the existing abort rules:
  - In a batch, the batch stops at the halted task. Later tasks in that batch stay open and are re-dispatched solo on re-run (`references/batched-mode.md`).
  - Under `--parallel`, groups already in flight run to their own end, each still capped per task. Successful groups are merged, and the halted group's worktree is retained (Step 2.5).

  `lite` tasks are never batched and never run under `--parallel`, so neither rule involves them. `--lite` does not change any of this.
- **BEH-17** — **When** the orchestrator starts a task in a run where `lite` is authorized **then** it calls `adev implement task-begin --spec <spec-path> --plan <plan-path> --task-id <id> --run-base <run_base> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>]` in place of Step 2a's provisional `resolve-depth` call. The verb:
  - runs the provisional pass exactly as `resolve-depth --pass provisional` does, emits the same `review_depth_resolved` event and prints the same JSON;
  - when the result is `lite`, also emits `plan_task` `in_progress`, writes execution state (`status: active`, the task as the current task) and captures the dispatch-time snapshot. It adds `snapshot` (the tree id `snapshot-base` would print) and `execution_state` (`written`, `conflict` or `failed`) to the output. A conflict or failure is reported and never fatal, as for `adev execution-state write`;
  - otherwise adds nothing. The Step 2 loop runs the rest of Step 2a (the context packet and the routing-tag check, `human-only` handling included) and continues from 2b. It does not repeat the provisional call, whose event `task-begin` already wrote. Members of a batch are not started with `task-begin`; the batch path makes their provisional calls as today.

  Its flags are validated exactly as `resolve-depth`'s: `--run-base` is required and fails with `INVALID_COMMIT_ID` when malformed, `--parallel` denies `lite` as BEH-5 (d) states, and `--review-cycles` is validated and echoed as `review_cycles`, as `resolve-depth` does. If the `plan_task` emit or the snapshot fails after the provisional event was written, the verb exits 1 with the new code `TASK_BEGIN_FAILED` naming the failed step, and the orchestrator stops the task through the Step 2d blocker path.

  A run with `lite` authorized reads `references/lite-mode.md` for its inline tasks, and reads `references/steps/step-2-per-task-loop.md` only when a task first resolves `quick` or `full` or escalates. `lite-mode.md` is self-contained for an inline task: it states the `agent-default` mandate and the `test-integrity.md` rules it needs. The Step 2h `post-task` gates and an `assisted-agent` task's approval checkpoint come after the tripwire and before the commit, never inside the chain. After them, a `lite` task's commit, its `plan_task` `done` event and the next task's `task-begin` may run as one chained shell command, commit first and each step only on the previous one's success, so `done` is never emitted before the commit. `lite-mode.md` cites `resolve-depth` for the grant and floor rules instead of restating them.
- **BEH-16** — **When** `/adev:implement` starts **then** its first action, before `adev gate require` and the step-started event, is `adev implement check-flags --spec <spec-path> [--lite] [--tier <t>] [--parallel]`.
  - **Exits 1 with:**
    - `CONFLICTING_TIER_FLAGS` for `--lite` with `--tier full` or `--tier quick`.
    - `INVALID_TIER` for an unknown `--tier`, for a `review_mode`, `validate_mode` or `implement_mode` value in `risk-policies.yaml` outside `RIGOR_MODES`, or for a `risk-policies.yaml` that exists but does not parse. This is new: `loadRigorPolicies` now validates these fields and the parse, instead of silently returning `null`.
    - `LITE_NOT_ALLOWED_FOR_HIGH` for `high.implement_mode: lite`.

    No lifecycle event is written on any of these exits.
  - **On success** it prints `{ lite_authorized, lite_source, tier, run_base, warnings }`:
    - `run_base` is the full sha of `HEAD` at that moment. It is the single run-base capture, which the orchestrator passes as `--run-base` to every later `resolve-depth` and `batches` call (BEH-5, BEH-7, BEH-8).
    - `warnings` includes `LITE_SUPPRESSED_PARALLEL` when `lite` is authorized and `--parallel` is set.
## Output Contract

**Library and CLI changes:**

- **`lib/governance/rigor-mode.mjs`**
  - `RIGOR_MODES = ["full", "quick", "lite"]`.
  - `resolveRigorMode` returns `lite` only for `skill === "implement"`. For any other skill, a resolved `lite` maps to `quick`. The implement fallback becomes `quick` (BEH-2).
  - `loadRigorPolicies` validates `review_mode`, `validate_mode` and `implement_mode` against `RIGOR_MODES`, as it already validates `test_depth`. It throws `INVALID_TIER` naming the file and level, also throws `INVALID_TIER` for a file that exists but does not parse (today it returns `null`), and throws `LITE_NOT_ALLOWED_FOR_HIGH` for `high.implement_mode: lite` (BEH-16).
  - **Affected callers.** Its code callers are `adev implement` (`check-flags`, `resolve-depth`, `batches`) and `adev test-policy resolve` (`lib/cli/test-policy.mjs`). Both gain the new failures. `/adev:review-specs` and `/adev:validate` resolve their tier in skill prose, call no verb that loads policies, and are unchanged at runtime. A malformed value reaches them only through an implement run, which fails first.
- **`lib/implement/review-depth.mjs`**
  - The grant predicate is replaced per BEH-3. The floor legs change per BEH-4: `risk-level` narrowed, `routing` added for `human-only`, `batched-task` removed, `scope-mismatch` moved to the tripwire, and touched-file `boundary`/`sensitive-path` on the final pass.
  - The lite cap (BEH-4): under `lite` authorization on a spec that is not high-risk, the `boundary` and `sensitive-path` legs give `quick`, and the output gains `floor_cap`.
  - New exports:
    - `liteEligible(entry)`, the BEH-5 (b) predicate: an entry routed `auto-agent` or `assisted-agent`, with no score check
    - `liteGrant()`, all four BEH-5 conditions, returning `lite_denied`
    - `isTripwireExempt(path, mode)`, the BEH-7 exemption
  - The final-pass tripwire reuses `snapshotWorkingTree` and `computeTouchedFiles`.
- **`lib/cli/implement.mjs`**
  - `resolve-depth` gains `--lite`, `--tier lite`, `--parallel` and `--run-base <sha>` (required on both passes), and reads its governance inputs from `--run-base`. `--base-sha` keeps its diff-range role. `--in-batch` is accepted and ignored.
    - Its JSON output gains `lite_denied`, `lite_source`, `escalated_from`, `floor_cap` (revision 4), and `LITE_TRIPWIRE_ESCALATED` in `warnings`.
    - The `source` values change as BEH-5 lists. `REVIEW_DEPTH_RESOLVED_KEYS` is unchanged.
  - `batches` gains `--lite` and `--run-base` (BEH-8).
  - Both commit-id flags are validated as in Arguments and fail with `INVALID_COMMIT_ID`. The validation checks the value against `^[0-9a-f]{40}$|^[0-9a-f]{64}$`, which also rules out a leading `-`, then resolves it with `git rev-parse --verify --end-of-options`.
  - New subcommands:
    - `check-flags --spec <p> [--lite] [--tier <t>] [--parallel]`, printing `{ lite_authorized, lite_source, tier, run_base, warnings }` (BEH-16)
    - `lite-report --spec <p> [--json]` (BEH-10), listing `lite` and, in revision 4, `capped` tasks
    - `task-begin --spec <p> --plan <p> --task-id <id> --run-base <sha> [--tier <t>] [--lite] [--parallel] [--review-cycles <n>]`, the provisional pass plus, for a `lite` result, `plan_task` `in_progress`, execution state and the snapshot (BEH-17)
  - Usage banners list `full|quick|lite`.
- **`lib/cli/governance.mjs`:** `dispatch` accepts `--tier lite` and dispatches it as `quick`. The usage banner is updated (BEH-1, BEH-11).
- **`lib/cli/route.mjs`:** `emit-sidecar` output gains `lite_eligible: { count, total }` from `liteEligible` (BEH-13).
- **`lib/lifecycle-state.mjs`:** `REVIEW_DEPTHS` gains `lite`. `REVIEW_ROUND_STAGES` and `buildReviewRoundTrailer` are **unchanged**. A `lite` task emits no `review_round` event and no `Review-round:` trailer (BEH-6). `lib/diagnostics/event-schemas.mjs` is unchanged: it carries no depth enum.
- **`lib/cli/init-prompt-implement-rigor.mjs`** (new verb `adev init prompt implement-rigor [--mode lite|quick|full]`), modeled on `init-prompt-implementation-mode.mjs`. It takes a closed, exact, case-sensitive enum, writes the enum constant (never the raw input), uses a splice-preserving write, never overwrites non-interactively, and raises `INVALID_IMPLEMENT_RIGOR` (BEH-12). It gets a dispatch entry beside `init prompt implementation-mode` in `cli/index.mjs`.
- **`lib/implement/batching.mjs`:** excludes tasks granted `lite` from batch formation (BEH-8).

**New operator-facing codes:** `TASK_BEGIN_FAILED` (revision 4), `CONFLICTING_TIER_FLAGS`, `LITE_NOT_ALLOWED_FOR_HIGH`, `LITE_SUPPRESSED_PARALLEL`, `LITE_TRIPWIRE_ESCALATED`, `QUALITY_GATES_FAILED`, `INVALID_IMPLEMENT_RIGOR` and `INVALID_COMMIT_ID`. `INVALID_TIER` gains the policy-value and unparseable-file cases.

**Skill and template changes:**

- **`skills/implement/`**
  - In the body:
    - the `--lite` and `--tier full|quick|lite` arguments (`--tier` is not documented there today);
    - a first-action `adev implement check-flags` prerequisite, whose `run_base` and `lite_source` the run keeps;
    - the no-self-selection rule.
  - New `references/lite-mode.md` behind a `<ADEV_ROOT>`-anchored conditional-loading pointer from Step 2. It covers inline execution through `task-begin`, passing `run_base` on, the tripwire, end-of-run gates, and the BEH-15 halt as it applies to an escalated `lite` task. It is self-contained for an inline task, and the body's Step 2 pointer loads `step-2-per-task-loop.md` only when a task resolves `quick` or `full` or escalates (BEH-17).
  - `graduated-review-depth.md` is updated for the ladder, and `references/steps/step-2-per-task-loop.md` stops passing `--in-batch`. The Red Flags entry "Skip either review stage" is reworded to "Skip a review stage the resolved depth requires".
  - `SKILL.md` and `references/failure-path-exit-event.md`, where the "do not double-emit" rule for `LOOP_*` halts lives, are **unchanged** (BEH-15).
- **`skills/route/`:** the `lite-eligible: <count> of <total>` summary line, read from `emit-sidecar` output (BEH-13). The prose "easy" rule at `SKILL.md:118` is replaced with a citation of `liteEligible`. The sidecar schema does not change.
- **`skills/review-specs/`, `skills/validate/`:** accept `--tier lite` as `quick` (BEH-11). `validate` calls `adev implement lite-report` for the advisory (BEH-10).
- **`skills/build/`, `skills/work/`:** forward `--lite` to `implement` only and `--tier lite` to `review-specs` and `validate` (BEH-11). This includes `skills/build/step4-tier-propagation.md` and the `--tier` propagation in `skills/work/SKILL.md`.
- **`skills/init/references/behavior-by-project-state.md`:** a new implement-rigor step driven by the verb (BEH-12).
- **Templates**
  - `templates/risk-policies-template.yaml` (`standard`): `high`, `medium` and `low` are set to `quick`. The `risk-level` floor still forces `full` for high-risk tasks not routed `auto-agent`.
  - `templates/risk-tiers/prototype/risk-policies.yaml`: all three levels are set to `quick`. `lite` arrives only through the BEH-12 typed choice.
  - `templates/risk-tiers/strict/` is unchanged (`full`).
  - This repository's own `.context-index/governance/risk-policies.yaml` is updated to match the `standard` template.
- Provider mirrors under `providers/*/skills/` are regenerated.

**Cross-spec amendments.** Each is authored with `adev specify amend --spec <base>` as a co-located amendment, so no validated base spec is mutated in place. Each names the clauses it supersedes and updates the base's acceptance criteria that this spec contradicts.

| Base spec | Amendment |
|---|---|
| `review-provenance.spec.md` | Contract A: the every-task-commit-carries-a-trailer rule exempts a task whose final-pass `review_depth_resolved` has `depth: lite`. That event pair is its provenance. The trailer grammar, stage enum and `cycles >= 1` rule are unchanged (BEH-6) |
| `batched-task-dispatch.spec.md` | Output Contract C.3 and its equivalence and acceptance text: a batched task is reviewed "at the task's resolved review depth", not "both review stages at today's depth". Tasks granted `lite` are never batched (BEH-4, BEH-8) |
| `graduated-review-depth.spec.md` | The quick-grant predicate (B), the floor set (E), `--tier quick` semantics, the `full` fallback, the `batched-task` and `scope-mismatch` legs, and the acceptance criteria asserting a batched task resolves `full` are superseded by BEH-2–BEH-5 and BEH-7 |
| `graduated-rigor-tiers.spec.md` | `resolveRigorMode` returns `full \| quick \| lite`. The "quick never weakens hard gates" invariant names `lite` and states that per-task review is review breadth, not a hard gate (BEH-14) |

**Docs:**

- `docs/skill-reference.md` (implement, route, init, build)
- `docs/cli-reference.md` (`init prompt implement-rigor`, `implement check-flags`, `implement lite-report`, the new `resolve-depth` flags and output fields)
- `docs/configuration.md` (`implement_mode: lite`, and the `implement_mode` / `implementation_mode` distinction)
- `docs/concepts.md` (the ladder)

**Governance:** ADR `0020-implement-rigor-ladder.md` (Accepted 2026-11-26; revision 4 amendment 2026-11-27).

## Evaluation (release-blocking)

Evals are part of the acceptance bar, not a follow-up. Token and cost figures come from the session JSONL `message.usage` fields (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`), never from byte-count estimates. Wall-clock comes from lifecycle event timestamps.

**EV-1 — Three-arm ladder harness.** `tests/evals/implement-rigor-ladder/run-ab-eval.mjs`, modeled on `tests/evals/batched-task-dispatch/run-ab-eval.mjs`, reusing `lib/parallel/eval/divergence.mjs` and `report.mjs` instead of reimplementing them.

- **Arms:** `full` (`--tier full`), `quick` (default), `lite` (`--lite`), each run against the same fixture. An informational `plain` arm runs Claude Code with adev disabled, timed by process wall clock, and gates nothing.
- **Fixture:** `fixture/` holds a 6–8 task plan with a routing sidecar that mixes `auto-agent` and `assisted-agent` tasks and low and high scores. It includes at least one sensitive-path task, one task whose correct implementation touches a file outside its declared set (the tripwire target), and four seeded defects that a correct implementation must avoid: a missed error-case behavior, an off-by-one boundary, an untested branch, and a spec-noncompliant output shape.
- **Metrics per arm:** wall-clock, `Agent` dispatches, total tokens (including cache reads), quality-gate result, and, for each seeded defect, whether it was caught at implement, caught at validate, or escaped.
- **Runs:** at least 3 per arm, with a `full`-arm baseline recorded on `main` before implementation lands. Results go to `tests/evals/implement-rigor-ladder/results/`.
- **Release thresholds (initial; confirm in review):** median wall-clock is ≤ 0.5× `full` for `lite` and ≤ 0.8× `full` for `quick`. After validate, seeded defects escaped by `lite` are ≤ `full`'s + 1. Quality gates pass in every run. The tripwire fires on its target task in every `lite` run. No `lite` grant lands on the sensitive-path task, which resolves `quick` under the lite cap in the `lite` arm and `full` in the other arms. The `human-only`, missing-entry and uncommitted-sidecar denials are covered by EV-4 unit tests, not the fixture.

**EV-2 — Framework comparison.** `tests/evals/comparison/run-comparison.mjs` gains `adev-quick` and `adev-lite` arms beside `plain-claude` and `adev-built` (now the `full` arm), across the four eval projects, and the summary reports time per arm. Target: `adev-lite` mean score ≥ `plain-claude` mean score, with `adev-lite` wall-clock reported.

**EV-3 — Behavior evals.** New `claude plugin eval` cases under `evals/`:

- `implement-no-self-selected-lite`: implementing a plan with no operator opt-in never passes `--lite` or `--tier lite`.
- `implement-lite-refused-high-risk`: a `risk_level: high` spec run with `--lite` resolves no task to `lite`.
- `init-offers-implement-rigor`: onboarding presents the `lite / quick / full` prompt and writes the typed choice.

**EV-4 — Headless checks under `node --test`:**

- a `--dry-run` smoke test for EV-1;
- resolver unit tests: ladder fallback, floor legs, `liteGrant` truth table, tripwire legs and the test/doc exemption;
- a parity test: `liteEligible` agrees with route's documented eligibility signal (an entry routed `auto-agent` or `assisted-agent`, scores ignored) on a table of sidecar entries, including low and non-numeric scores;
- skill-text tests in the style of `tests/skills/implement*.test.mjs`:
  - `skills/implement/SKILL.md` names `adev implement check-flags` before `adev gate require`;
  - `references/lite-mode.md` passes `run_base` to `resolve-depth` on both passes;
  - `skills/route/SKILL.md` prints the `lite-eligible` line;
- `init prompt implement-rigor` verb tests;
- `rigor-mode` tests for `lite`.

**EV-5 — Distribution replay.** `tests/evals/implement-rigor-ladder/replay-distribution.mjs` is deterministic and makes no model calls.

- **Provisional shares:** it runs the shipped resolver (not a re-implementation) over every routing sidecar in the repository, with `lite` authorized.
- **Final shares:** it applies each task's historical trip outcome, computed from `Spec:` and `Plan-task:` commit trailers against declared `Files:` with the BEH-7 exemption. For tasks with no matching commits, it applies the corpus trip rate.
- **Output:** a `lite / quick / full` table per task and per plan, plus the floor-leg tally, written to `results/distribution.json`.
- **Release target on this corpus:** `lite` ≥ 45% and `full` ≤ 20%. A miss is resolved by a reviewed threshold change recorded in this spec, never by editing routing sidecars.
- **Scope:** the script runs under `npm run test:evals`, not `npm test`, because the corpus changes over time.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `--lite` with `--tier full` or `--tier quick` | `adev implement check-flags` exits 1 with `CONFLICTING_TIER_FLAGS`; no lifecycle event is written (BEH-16) | Drop one flag |
| `high.implement_mode: lite` in `risk-policies.yaml` | `check-flags` exits 1 with `LITE_NOT_ALLOWED_FOR_HIGH`; no lifecycle event is written (BEH-16) | Set `high` to `full` or `quick` |
| A `review_mode`, `validate_mode` or `implement_mode` value outside `full \| quick \| lite`, or a `risk-policies.yaml` that does not parse | New behavior: `loadRigorPolicies` throws `INVALID_TIER` naming the file (and level, for a bad value). `check-flags` exits 1 before any lifecycle event, and `adev test-policy resolve` fails the same way. `review-specs` and `validate` load no policies in code and are unchanged (BEH-16, Output Contract) | Fix the value or the YAML |
| `--run-base` or `--base-sha` is not a full hex object id, begins with `-`, or does not resolve to the required object | `resolve-depth` or `batches` exits 1 with `INVALID_COMMIT_ID` naming the flag; git is never invoked with the raw value (Arguments) | Pass the `run_base` printed by `check-flags`, or the captured snapshot |
| `--lite` but the routing sidecar is missing | Existing `ROUTING_SIDECAR_MISSING` stop (route is still required) | Run `/adev:route`, then re-run |
| A task has no routing sidecar entry, or the sidecar is not committed at the run base | That task is not granted `lite` (`lite_denied: no-routing-entry`) (BEH-5 b) | Re-run `/adev:route` and commit the sidecar |
| `--lite` but no task is eligible | Every task resolves `quick` or `full`; the run summary lists each task's `lite_denied` value from `resolve-depth` (BEH-5) | None: only `human-only`, unrouted, floored and high-risk tasks are denied |
| `lite` authorized by `implement_mode: lite` in the policy file | `lite authorized via policy` is printed at the start of the run and in the run summary (BEH-5) | Pass `--tier quick` or `--tier full`, or change the policy value, to opt out |
| `--lite` with `--parallel` | `check-flags` prints `LITE_SUPPRESSED_PARALLEL` once; `resolve-depth --parallel` grants no `lite` (BEH-5 d, BEH-8) | Run without `--parallel` to use `lite` |
| A `lite` task touches an undeclared, non-exempt path | `resolve-depth --pass final` returns `quick` with `LITE_TRIPWIRE_ESCALATED`; one synthesized review runs for that task (BEH-7) | Address findings as in `quick` |
| A `lite` task touches a sensitive or boundary path (exempt or not) | `resolve-depth --pass final` returns `quick` with `LITE_TRIPWIRE_ESCALATED` under the lite cap; one synthesized review runs for that task (BEH-4, BEH-7) | Address findings as in `quick` |
| A `lite` task edits a `*.spec.md`, a path under `.context-index/` (matched case-insensitively), or a symlink outside its declared set | Not exempt: `scope-mismatch` escalates to `quick` (BEH-7) | Address findings |
| A task declares a sensitive or boundary path in a run with `lite` authorized, on a spec that is not high-risk | Not granted `lite` (`floor:<leg>`); the lite cap resolves it `quick` with `floor_cap: quick` (BEH-4) | Pass `--tier full`, which outranks both `--lite` and a policy `lite`, for two-stage review |
| `task-begin` wrote the provisional event but the `plan_task` emit or the snapshot failed | Exit 1 with `TASK_BEGIN_FAILED` naming the step; the task stops through the Step 2d blocker path (BEH-17) | Fix the cause and re-run `/adev:implement --task <N>` |
| A review loop reaches `implement.max_review_cycles` unconverged, in any run (interactive, headless, scheduled or a build step) | The existing Step 2g halt: the task is `plan_task` `blocked` with the loop code and execution state is `blocked`; no later task starts; completed commits are kept; the halt message names the code, task id and outstanding findings; a build step returns `status: BLOCKED`. Nothing waits for input, and no `step_failed` is emitted (BEH-15) | Fix the findings and re-run `/adev:implement --task <N>`, or run `/adev:recover`; after a build, `/adev:build --resume` |
| The same halt in a batch or a `--parallel` run | Batch: later tasks in the batch stay open and are re-dispatched solo on re-run. Parallel: groups already in flight finish, successful groups merge, and the halted group's worktree is retained (BEH-15) | As above |
| End-of-run quality gates fail after `lite` tasks | Implement `step_failed`, `--verdict FAIL`, `QUALITY_GATES_FAILED` named in output (BEH-9) | `/adev:debug`, then re-run `/adev:implement` |
| `--tier lite` passed to `review-specs`, `validate` or `governance dispatch` | Runs as `quick`, one printed line (BEH-11) | None |
| `init prompt implement-rigor --mode` with a value other than `lite`, `quick` or `full` (including case variants or embedded newlines) | Exit 1 with `INVALID_IMPLEMENT_RIGOR`; nothing written (BEH-12) | Pass one of the three literal values |
| Interactive `init prompt implement-rigor` receives three invalid answers, or input closes, or scripted answers run out | Exit 1 with `INVALID_IMPLEMENT_RIGOR`; nothing written; the prompt never loops beyond 3 attempts (BEH-12) | Re-run and type `lite`, `quick` or `full`, or pass `--mode` |
| Non-interactive init on a project that already has `implement_mode` | Existing value kept; nothing overwritten (BEH-12) | Run the prompt interactively or with `--mode` to change it |
| A `lite` task's context grows large on a long plan | No special handling; the harness compacts as usual. The task count per `lite` run is measured in EV-1 | Split the plan, or run without `--lite` |

## System Constitution Reference

- **Skills are primarily markdown.** `lite` is expressed in skill text, but every decision with runtime semantics lives in CLI verbs and `lib/`, never in SKILL.md prose or fenced JavaScript. That covers the flag conflicts, policy validation, grant, floor, tripwire, exemption and lite-report counting (`adev implement check-flags`, `resolve-depth`, `batches`, `lite-report`; `lib/implement/review-depth.mjs`).
- **SKILL.md size limits and progressive disclosure.** The inline execution path goes in `skills/implement/references/lite-mode.md` behind a `<ADEV_ROOT>`-anchored pointer. The `--lite` argument, the first-action `check-flags` call and the no-self-selection rule stay in the body, because they govern the whole invocation.
- **Minimize external dependencies.** No new dependency. The tripwire reuses the existing git-tree snapshot helpers.
- **Hook protocol compliance.** Hooks are unchanged. Commit trailers (`Author-type`, `Operator`) are still injected on `lite` commits, and `Review-round:` stays producible only through `buildReviewRoundTrailer`.
- **Architecture boundary: requires human approval.** This lowers the default review rigor for every adev project, so ADR 0020 records the decision and the operator approves it at review.

## Out of Scope

- A `lite` level for `/adev:review-specs` or `/adev:validate` with its own behavior. Both map `lite` to `quick` here.
- Running `/adev:route` automatically, or making it optional. `lite` depends on its routing entries.
- Changing the routing sidecar schema. Eligibility is derived from the existing `selected_agent` field.
- The `build-leaf-mode` `--no-dispatch` path. Its spec (`build-leaf-mode.spec.md`) is unmerged and not on this branch. `lite` runs inline by its own rule (BEH-6), and needs no change if `--no-dispatch` lands later.
- Changing the `Review-round:` trailer grammar, `REVIEW_ROUND_STAGES` or `buildReviewRoundTrailer`. `lite` emits no trailer instead (BEH-6).
- Retroactively re-resolving depth for past runs or rewriting past `review_depth_resolved` events.
- Per-stage timing inside a task. Lifecycle events do not carry it, so EV-1 measures whole runs.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| T0 | Record the EV-1 `full`-arm baseline on `main` (harness `--arm full` only) before behavior changes | medium |
| T1 | `rigor-mode.mjs`: the `lite` value, implement fallback `quick`, policy-value and parse validation (`INVALID_TIER`, `LITE_NOT_ALLOWED_FOR_HIGH`), non-implement `lite` → `quick`; `REVIEW_DEPTHS` gains `lite`; `test-policy resolve` failure tests (BEH-1, BEH-2, BEH-16) | small |
| T2 | `review-depth.mjs`: grant inversion; floor legs (`risk-level` narrowed, `routing` for `human-only`, `batched-task` removed, `scope-mismatch` moved to the tripwire, touched-file `boundary`/`sensitive-path`); new `source` values (BEH-3, BEH-4, BEH-5) | medium |
| T3 | `review-depth.mjs`: `liteEligible` (with score validation, removed in revision 4 by T11), `liteGrant` with `lite_denied` and `lite_source`, `isTripwireExempt` (case rules), the final-pass tripwire (BEH-5, BEH-7) | medium |
| T4 | `lib/cli/implement.mjs`: `check-flags` (with `run_base`), `lite-report`; new `resolve-depth` and `batches` flags (`--lite`, `--tier lite`, `--parallel`, `--run-base`), `INVALID_COMMIT_ID` validation of both commit-id flags, `--in-batch` ignored, output fields; usage banners; `lib/cli/governance.mjs` `--tier lite` (BEH-1, BEH-5, BEH-7, BEH-8, BEH-10, BEH-16) | medium |
| T5 | Implement skill: the `--lite` and `--tier` arguments, the first-action `check-flags`, `references/lite-mode.md` (inline execution, `run_base` hand-off, tripwire, end-of-run gates, the BEH-15 halt), mixed-plan ordering, `--in-batch` removed from Step 2, Red Flags rewording, skill-text tests (BEH-6, BEH-8, BEH-9, BEH-15) | large |
| T6 | `adev init prompt implement-rigor` verb (3-attempt cap, EOF handling) plus its `cli/index.mjs` dispatch entry, init reference step, and preset template values (BEH-12) | medium |
| T7 | `route.mjs` `lite_eligible` output, route summary line and `liteEligible` citation; build (`step4-tier-propagation.md`), work, review-specs and validate tier forwarding; validate advisory through `lite-report` (BEH-10, BEH-11, BEH-13) | small |
| T8 | Cross-spec amendments with `adev specify amend`: `review-provenance`, `batched-task-dispatch`, `graduated-review-depth`, `graduated-rigor-tiers`. ADR 0020 accepted; docs (BEH-4, BEH-6, BEH-14) | medium |
| T9 | EV-1 harness, fixture and smoke test; EV-4 unit, parity and skill-text tests; EV-5 distribution replay | large |
| T10 | EV-2 comparison arms and EV-3 plugin eval cases; run all evals and commit results | medium |
| T11 | Revision 4 resolver: `liteEligible` without scores, `no-routing-entry`, the lite cap with `floor_cap`, the tripwire's `quick`-only escalation; resolver, CLI, route and parity tests; EV-5 re-run (BEH-4, BEH-5, BEH-7, BEH-13) | medium |
| T12 | Revision 4 overhead: `adev implement task-begin`, `lite-report`'s `capped` list, a self-contained `lite-mode.md`, the Step 2 loop loaded only for `quick` and `full` tasks; skill-text tests, docs and mirrors (BEH-17) | medium |
| T13 | Revision 4 evidence: EV-1 fixture expectations, the `lite` arm re-run ×3, ADR 0020 and cross-spec amendment updates | medium |

## Acceptance Criteria

- [ ] BEH-1: `node --test tests/governance/rigor-mode.test.mjs` covers `isValidTier('lite')`, `INVALID_TIER` for other values, and `resolveRigorMode` mapping `lite` to `quick` for `review-specs` and `validate`. A `review_depth_resolved` event with `depth: lite` is accepted by `reportReviewDepthResolved` and passes `adev/event-schema-valid`. `adev governance dispatch --tier lite` dispatches the `quick` reviewer set
- [ ] BEH-2: the resolver returns `quick` with `source: default-quick` for a spec with no policy `implement_mode` and no `--tier`. `resolveRigorMode` for `review-specs` and `validate` still falls back to `full`
- [ ] BEH-3, BEH-4: resolver unit tests cover each leg (`risk-level`, `boundary`, `sensitive-path`, `critical-finding`, `routing`).
  - Each of these resolves `quick` when nothing else triggers: editing a declared file, a batched task, an `assisted-agent` task, a high-risk `auto-agent` task, and a `quick` task that touches an undeclared non-sensitive file.
  - A high-risk `assisted-agent` task, a `human-only` task, and a task touching a sensitive path resolve `full` when `lite` is not authorized.
  - With `lite` authorized on a spec that is not high-risk, a task declaring or touching a sensitive or boundary path resolves `quick` with `floor_cap: quick` on both passes, when the final pass repeats the operator's flags, and under `--parallel`. A `human-only` task and a Critical finding still resolve `full`, with `floor_cap: null`, as does any task with no floor leg.
  - The `batched-task-dispatch` amendment is committed, and its equivalence eval still passes.
- [ ] BEH-5:
  - A truth-table test over conditions (a)–(d) shows `lite` is granted only when all four hold, `lite_denied` names the first failing condition, and `lite_source` is `flag`, `policy` or `null`.
  - `--tier quick` with `implement_mode: lite` grants no `lite`.
  - Scores are not consulted: an `assisted-agent` entry, and entries with a score of `0.4`, `"0.8"` or `NaN`, are granted `lite`. A missing entry, and a routing sidecar not committed at the run base, yield `lite_denied: no-routing-entry`, and a `human-only` entry `floor:routing`.
  - A CLI-level test runs `adev implement resolve-depth --lite --run-base <sha>` and asserts `depth: lite` and `source: lite-grant`.
  - Editing `risk-policies.yaml` in the working tree after the run-base commit does not change the result.
  - The emitted event carries no key outside `REVIEW_DEPTH_RESOLVED_KEYS`.
- [ ] BEH-6:
  - A `lite` task makes no `Agent` call and no `adev test-policy resolve` call.
  - It produces exactly one commit with `Spec:` and `Plan-task:` and no `Review-round:` trailer.
  - It emits `plan_task` `in_progress`/`done` plus two `review_depth_resolved` events with `depth: lite`, and no `review_round` or `test_depth_assigned` event.
  - The committed `review-provenance` amendment's Contract A text names the `depth: lite` exemption. No executable trailer-presence check exists today, so this criterion is conformance to the amended text, not a check's output.
- [ ] BEH-7: `resolve-depth --pass final --run-base <sha> --base-sha <snapshot>` on a fixture `lite` task does the following:
  - It escalates to `quick` with `LITE_TRIPWIRE_ESCALATED`, `scope-mismatch` and `source: lite-tripwire` when the task touches an undeclared source file, tracked or untracked.
  - It stays `lite` for an undeclared `tests/` or `docs/` file.
  - It escalates for an undeclared `*.spec.md`, `X.SPEC.MD`, a `.context-index/` or `.Context-Index/` path, or a symlink.
  - It escalates to `quick` with `floor_cap: quick`, under the lite cap, for a sensitive path, including one under `docs/`, and for a boundary path. A `scope-mismatch`-only escalation has `floor_cap: null`.
  - It reads governance inputs from `--run-base`, not from the working tree.
  - `isTripwireExempt` has unit tests for every exemption rule.
- [ ] BEH-8: `adev implement batches --lite` never places a task granted `lite` in a batch. `check-flags --lite --parallel` prints `LITE_SUPPRESSED_PARALLEL`, and `resolve-depth --parallel` grants no `lite`
- [ ] BEH-9: an all-`lite` run skips Step 3 and runs quality gates once. A failing gate yields `step_failed` with `verdict: FAIL` and output naming `QUALITY_GATES_FAILED`
- [ ] BEH-10: `adev implement lite-report` counts only events after the most recent implement `started` event, and a `lite` task from an earlier run is not counted. A capped task is listed under `capped` and not counted as `lite`. The validate report shows the advisory with task ids when the count is non-zero, and nothing otherwise
- [ ] BEH-11: `review-specs --tier lite` and `validate --tier lite` behave as `quick` and print the mapping line. `build` (through `step4-tier-propagation.md`) and `work` forward `--lite` to `implement` only and `--tier lite` to `review-specs` and `validate`
- [ ] BEH-12: `node --test` for `init prompt implement-rigor` covers:
  - typed exact-case choice, with `Lite`, blank, and `lite\nhigh: full` refused
  - three invalid answers, closed input, and exhausted scripted answers each exiting 1 with `INVALID_IMPLEMENT_RIGOR` and writing nothing, within a test timeout
  - `--mode` refusal with `INVALID_IMPLEMENT_RIGOR`
  - the `lite` warning, the medium/low-only write, and key preservation
  - non-interactive runs: no overwrite of an existing value, and preset defaults `strict` → `full`, `standard` → `quick`, `prototype` → `quick`

  A test through `cli/index.mjs` dispatch reaches the verb.
- [ ] BEH-13: `grep -rnE -- "--lite|--tier lite" skills/ providers/ docs/` returns only argument definitions, forwarding rules and operator-facing examples. No match instructs an agent to choose `lite`. `adev route emit-sidecar` output carries `lite_eligible`. The EV-4 parity test passes. EV-3 `implement-no-self-selected-lite` passes
- [ ] BEH-14: the hard-gate list in `references/lite-mode.md` names every gate in the amended `graduated-rigor-tiers.spec.md` invariant, and the invariant text names `lite`
- [ ] BEH-15: a fixture run whose escalated task never converges is run twice, once as a build step and once as a direct non-interactive `/adev:implement`. Both runs do all of the following:
  - mark that task `plan_task` `blocked` with the loop code, and write execution state `blocked`;
  - start no later task and keep earlier task commits;
  - emit no `step_failed` event;
  - end without waiting for input, naming the loop code and the unconverged task id.

  The build-step run also returns `status: BLOCKED`.
- [ ] BEH-17: `adev implement task-begin` prints the same JSON and emits the same `review_depth_resolved` event as `resolve-depth --pass provisional`. For a `lite` result it also emits `plan_task` `in_progress` and prints `snapshot` and `execution_state`; for any other result it emits neither. It fails with `INVALID_COMMIT_ID` as `resolve-depth` does, and with `TASK_BEGIN_FAILED` when the snapshot fails after the provisional event. A skill-text test asserts that `references/lite-mode.md` starts each inline task with `task-begin` and that the body loads `step-2-per-task-loop.md` only for a `quick` or `full` task
- [ ] BEH-16:
  - `check-flags` exits 1, with no lifecycle event written, for each of `--lite --tier full`, `--tier bogus`, `medium.implement_mode: bogus`, an unparseable `risk-policies.yaml`, and `high.implement_mode: lite`, each with its stated code.
  - With valid input it exits 0 and prints `{ lite_authorized, lite_source, tier, run_base, warnings }`, where `run_base` equals `git rev-parse HEAD`.
  - `resolve-depth` exits 1 with `INVALID_COMMIT_ID` for `--run-base --output=x`, a short sha, and a sha that does not resolve.
  - `adev test-policy resolve` fails with `INVALID_TIER` on the same malformed policy.
  - A skill-text test asserts that `check-flags` precedes `adev gate require` in `skills/implement/SKILL.md`.
- [ ] EV-1: `results/` holds ≥ 3 runs per arm plus the `main` baseline, and every release threshold in EV-1 is met or a reviewed threshold change is recorded in this spec
- [ ] EV-2: `reports/summary.json` includes `adev-quick` and `adev-lite` with score and wall-clock
- [ ] EV-3: the three `claude plugin eval` cases pass
- [ ] EV-4: the EV-1 `--dry-run` smoke test, the parity test and the skill-text tests pass under `npm test`
- [ ] EV-5: `results/distribution.json` shows `lite` ≥ 45% and `full` ≤ 20% of tasks on this repository's corpus at release, computed by the shipped resolver
- [ ] SKILL.md size caps (`tests/skills/skill-size-cap.test.mjs`) and Load Skill Extensions coverage still pass
- [ ] All quality gates pass (`npm test`); no constitutional violations

