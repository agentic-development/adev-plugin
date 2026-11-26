---
partial_schema: spec@1
charter: implementation
kind: skill
status: review-blocked
risk_level: high
milestone:
revision: 2
charter-revision: 1
created: 2026-11-25
updated: 2026-11-26
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

This spec replaces the two-level depth (`full | quick`) with a three-level ladder. Today's default becomes `full`, a reachable `quick` becomes the default, and a new `lite` level runs route-eligible tasks inline with no per-task reviewer.

### Target distribution

**Target, for a project that has opted into `lite`:** about 50% of tasks at `lite` and at most about 20% at `full`. The grant and floor rules in BEH-4, BEH-5 and BEH-7 were calibrated against this repository's corpus to meet that target:

- **Tasks:** 576 tasks across 70 plans, from the routing sidecars present on 2026-11-25.
- **Trip rate:** 405 historical task commits carrying `Spec:` and `Plan-task:` trailers were compared against each task's declared `Files:`.
  - 23% touched a non-bookkeeping file outside the declared set.
  - 17% did once tests and docs were excluded. 26 of the 94 trips were test or doc files only.

| Rule set | `lite` | `quick` | `full` |
|---|---|---|---|
| Today (observed) | 0% | ~0% | ~100% |
| First draft of this spec (scores ≥ 0.8, `assisted-agent` → `full`, high risk → `full`, any out-of-set touch trips) | ~27% | ~27% | ~46% |
| **This spec** (scores ≥ 0.6, `assisted-agent` → `quick`, high-risk `auto-agent` → `quick`, tests and docs exempt from the tripwire) | **~49%** | **~35%** | **~16%** |

The remaining `full` share comes from sensitive-path tasks (49 outside high-risk specs), `human-only` tasks, and high-risk tasks not routed `auto-agent`. The distribution is a property of this corpus. EV-5 recomputes it, and the targets are re-checked at release.

## Invocation Modes

The ladder is resolved **per task**, so one plan can mix levels. Every review loop below is capped at `implement.max_review_cycles` (default 3, or `--review-cycles`), and BEH-15 states what happens at the cap.

| Level | Per-task execution | Per-task review | Resolved when |
|---|---|---|---|
| **`full`** | Fresh implementer subagent (batched or solo) | Stage 1 spec-compliance, then Stage 2 code-quality | `--tier full`, or a floor leg holds (BEH-4): sensitive path, governance boundary, `human-only` routing, a high-risk spec on a task not routed `auto-agent`, or a Critical finding |
| **`quick`** (new default) | Fresh implementer subagent (batched or solo) | One synthesized reviewer | No floor leg holds and the task is not granted `lite`. Includes `assisted-agent` tasks and high-risk `auto-agent` tasks |
| **`lite`** (new) | Inline in the orchestrator's own context; no `Agent` dispatch | None; a post-task tripwire can escalate the task (BEH-7) | Operator authorization **and** route's "easy" signal (auto-agent, no dimension below 3 of 5) **and** spec not high-risk **and** no floor leg (BEH-5) |

`full` and `quick` keep their current per-stage meaning. Existing `risk-policies.yaml` files and `--tier` values need no migration, provided their values are legal (BEH-16). What changes is the fallback, the grant rule and the floor set.

## Arguments

| Argument | Accepted by | Meaning |
|---|---|---|
| `--lite` (new) | `/adev:implement`, `/adev:build`, `/adev:work`; verbs `adev implement check-flags`, `resolve-depth`, `batches` | Operator authorization for `lite`. Equivalent to `--tier lite` on `implement`. `build` and `work` forward it to `implement` only, and only when the operator passed it (BEH-11). Never added by an agent on its own judgment (BEH-13) |
| `--tier lite` (new value) | `/adev:implement`, `/adev:build`, `/adev:review-specs`, `/adev:validate`; verb `adev governance dispatch` | On `implement`: same as `--lite`. On `review-specs`, `validate` and `governance dispatch`: treated as `quick`, with one printed line saying so (BEH-11) |
| `--tier quick` (existing) | as today | Baseline `quick`; floors can still raise a task to `full` |
| `--tier full` (existing) | as today | Absolute: every task `full`, no floor consulted, no `lite` grant |
| `--run-base <sha>` (new) | verbs `adev implement resolve-depth`, `batches` | The commit captured at the implement step-started event; the policy, boundary, sensitive-path and routing inputs are read from it (BEH-5) |
| `--parallel` (new on the verb) | verb `adev implement resolve-depth` | Tells the resolver the run is `--parallel`, which denies `lite` (BEH-5 d) |
| `implement_mode: lite` (new value) | `risk-policies.yaml`, `medium` and `low` levels | Project-level authorization for `lite` at that risk level. Written by `/adev:init` onboarding only on a typed choice or `--mode lite` (BEH-12), or by hand. Rejected for `high` with `LITE_NOT_ALLOWED_FOR_HIGH` (BEH-16) |

Flag conflicts and policy-value errors are raised by `adev implement check-flags`, the skill's first action, before any lifecycle event is written (BEH-16). `--lite` together with `--tier full` or `--tier quick` exits 1 with `CONFLICTING_TIER_FLAGS`.

**Naming.** `implement_mode` (in `risk-policies.yaml`) sets per-task **review depth**: `lite | quick | full`. `implementation_mode` (top-level in `manifest.yaml`) sets **test discipline**: `tdd | test-required | agent-default`. The two are independent, except that a `lite` task always runs under the `agent-default` test mandate (BEH-6). The review-cycle cap is `implement.max_review_cycles` in `manifest.yaml` (default 3), overridable per run with `--review-cycles`.

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** any skill or verb validates a rigor tier **then** the legal set is `full | quick | lite`:
  - `RIGOR_MODES` in `lib/governance/rigor-mode.mjs` gains `lite`, and `isValidTier('lite')` is true.
  - `REVIEW_DEPTHS` in `lib/lifecycle-state.mjs` gains `lite`, so `review_depth_resolved.depth` accepts it.
  - `adev governance dispatch` (`lib/cli/governance.mjs`) accepts `--tier lite` and dispatches it as `quick`.
  - The `adev implement` usage banners list `full|quick|lite`.

  Every other value fails with `INVALID_TIER`, including a malformed policy value (BEH-16).
- **BEH-2** — **When** `adev implement resolve-depth` runs with no `--tier` and the spec's risk level has no `implement_mode` in `risk-policies.yaml` (or the file is absent) **then** the baseline is `quick`, not `full`. The `review_mode` and `validate_mode` fallbacks for `/adev:review-specs` and `/adev:validate` stay `full`.
- **BEH-3** — **When** the baseline is `quick` (policy, fallback or `--tier quick`) **then** the task resolves `quick` unless a floor leg holds. The quick-grant predicate's rows (auto-agent routing, every score ≥ 0.6, additive-only file set, no boundary) are removed as grant conditions. Routing and boundary signals act only through the floor legs in BEH-4.
- **BEH-4** — **When** the floor pass runs **then** each of these legs forces `full`:
  - `risk-level`: the spec is `risk_level: high` and the task is not routed `auto-agent`.
  - `boundary` and `sensitive-path`: evaluated on the declared files at the provisional pass and on every touched file at the final pass.
  - `critical-finding`: final pass only.
  - `routing`: `selected_agent` is `human-only`. `assisted-agent` no longer forces `full`; its human checkpoint still applies.

  The `batched-task` leg is removed. `batched-task-dispatch.spec.md` Output Contract C.3 is amended to match: a batched task is reviewed at its own resolved depth, and batch membership no longer implies two stages (see Output Contract, cross-spec amendments). `scope-mismatch` no longer forces `full`; it survives only as the `lite` tripwire in BEH-7. A high-risk task routed `auto-agent` resolves `quick` and is never granted `lite` (BEH-5 c). `REVIEW_DEPTH_FLOOR_APPLIED` is still echoed to the transcript, and `--tier full` stays absolute. These relaxations are calibrated to the target distribution in the Problem section, and ADR 0020 records them.
- **BEH-5** — **When** `adev implement resolve-depth --pass provisional` runs for a task **then** it resolves `lite` only if all of these hold:
  - (a) the operator authorized `lite`, through `--lite` or `--tier lite` on the verb or through `implement_mode: lite` for the spec's risk level;
  - (b) the routing sidecar entry has `selected_agent: auto-agent` and every one of the four scores is ≥ `LITE_GRANT_THRESHOLD` (0.6 on the sidecar's 0–1 scale, meaning no dimension below 3 of 5, the same rule as route's existing "easy" rigor signal);
  - (c) the spec is not `risk_level: high` and no provisional floor leg holds (`boundary`, `sensitive-path`, `routing`);
  - (d) the verb was not passed `--parallel`.

  Otherwise the task goes through the `quick`/`full` resolution of BEH-3 and BEH-4. The verb's JSON output carries `lite_denied`, set to the first failing condition as one of `not-authorized`, `routing-scores`, `high-risk`, `floor:<leg>` or `parallel`, or `null` when `lite` was granted. The orchestrator copies the non-`not-authorized` values into the run summary verbatim; a failed (a) is silent. The verb reads `risk-policies.yaml`, `boundaries.yaml`, the sensitive-path configuration and the routing sidecar from the run-base commit passed as `--run-base <sha>`. The orchestrator captures that sha once, at the step-started event. An inline `lite` task therefore cannot change the inputs to its own resolution or to a later task's resolution.
- **BEH-6** — **When** a task resolves `lite` **then** the orchestrator implements it in its own context with no `Agent` dispatch, using the `agent-default` mandate (`references/agent-default-mandate.md`) and the always-on `references/test-integrity.md`.
  - **Skipped:** both review stages and the synthesized reviewer. Test-depth resolution is skipped too: as for every task under `agent-default`, it makes no `adev test-policy resolve` call and emits no `test_depth_assigned` event. ADR-0017 makes that verb the sole writer of the assignment event, and nothing writes one here.
  - **Kept:** the dispatch-time working-tree snapshot; one commit per task carrying `Spec:` and `Plan-task:` (plus the hook-injected `Author-type` and `Operator`); and the `plan_task` `in_progress` and `done` events. Both `review_depth_resolved` passes are emitted with `depth: lite`.
  - **No `Review-round:` trailer.** A `lite` commit carries none, and `buildReviewRoundTrailer` is neither called nor changed. The rule in `review-provenance.spec.md` Contract A that every task commit carries one is amended to exempt a task whose final-pass `review_depth_resolved` has `depth: lite`. That event pair is the task's review provenance.
- **BEH-7** — **When** a `lite` task finishes, before its commit **then** the orchestrator runs `adev implement resolve-depth --pass final --base-sha <dispatch-time snapshot>`. The verb computes the touched files from git as normalized repo-relative paths.
  - **`scope-mismatch` → `quick`.** A touched path is outside the declared set and is not exempt. A path is exempt only if all of these hold:
    - it is under `tests/` or `docs/`, has a basename matching `*.test.<ext>` or `*.spec.<ext>` for a source extension (`js`, `mjs`, `cjs`, `ts`, `tsx`, `jsx`, `py`, `go`, `rb`, `rs`), or is a `README.md`;
    - it is not under `.context-index/`, and is not a `*.spec.md`;
    - it is not a symlink (git mode `120000`).

    The task is escalated to `quick`: one synthesized reviewer is dispatched against the task diff under the normal `cq-<n>` loop, capped at `implement.max_review_cycles`.
  - **`sensitive-path` or `boundary` → `full`.** These are evaluated on every touched path, exempt or not.

  Escalation only goes upward and moves at most two levels (`lite` → `quick` → `full`). This is the single statement of that bound. The verb returns the new `depth`, `escalated_from: lite` and the holding `floor_legs`, records a final-pass `review_depth_resolved`, and returns a `LITE_TRIPWIRE_ESCALATED` warning naming the task and legs. The orchestrator echoes that warning to the transcript, as it does `REVIEW_DEPTH_FLOOR_APPLIED`. An escalated task's review loop is bounded as stated in BEH-15.
- **BEH-8** — **When** a plan mixes levels **then** tasks run in plan order. Consecutive `lite` tasks run inline. `quick` and `full` tasks go through the existing Step 2 loop. `adev implement batches --lite --run-base <sha>` evaluates the BEH-5 grant per task and forms batches only from tasks that are not granted `lite`. Under `--parallel`, `lite` is not granted (BEH-5 d), and `adev implement check-flags` prints `LITE_SUPPRESSED_PARALLEL` once (BEH-16).
- **BEH-9** — **When** a run that contained at least one `lite` task reaches Step 2-post **then** the constitution's quality gates run once over the whole run, fail-fast. A failure emits the implement `step_failed` event with `--verdict FAIL` and names the new operator-facing code `QUALITY_GATES_FAILED`. Step 3's final reviewer is skipped only when every task in the run resolved `lite`; otherwise it runs as today.
- **BEH-10** — **When** `/adev:validate` runs **then** it calls `adev implement lite-report --spec <spec-path> --json`. That verb reads the raw `review_depth_resolved` events from the spec's lifecycle log, not the `reviewDepthResolutions` projection, which keeps only the latest event per plan, task and pass across all runs. It takes only events after the most recent implement `lifecycle_step` `started` event, and counts a task as `lite` when its latest final-pass `review_depth_resolved` has `depth: lite`. When the count is non-zero, the validate report lists the count and task ids as an advisory ("implemented without per-task review"), and its spec-compliance check covers the diff of those tasks. `validate` is never skipped and its own tier is unchanged.
- **BEH-11** — **When** `/adev:review-specs` or `/adev:validate` receives `--tier lite` **then** it runs exactly as `--tier quick` and prints one line saying it did. `/adev:build` and `/adev:work` forward only what the operator typed: `--lite` (or `--tier lite`) to `/adev:implement` as `--lite`, and `--tier lite` to `/adev:review-specs` and `/adev:validate`. They never add either on their own.
- **BEH-12** — **When** `/adev:init` onboards a project (any `risk_tier` preset: `prototype`, `standard` or `strict`) or is re-run on an existing project **then** it runs `adev init prompt implement-rigor`.
  - **Interactive choice.** The prompt offers `lite`, `quick` and `full` and requires a typed choice. Only those three literal tokens are accepted, matched exactly and case-sensitively. Blank or any other input is re-prompted interactively. With `--mode`, any other value exits 1 with `INVALID_IMPLEMENT_RIGOR`.
  - **What is written.** The verb writes the matched enum constant, never the raw input, to `risk-policies.yaml` as `implement_mode` for the `medium` and `low` levels, and preserves every other key. `high` keeps its preset value: `quick` for `standard` and `prototype`, `full` for `strict`. Choosing `full` also writes `full` for `high`. Choosing `lite` first prints a warning that per-task review is skipped for route-eligible tasks and deferred to `/adev:validate`.
  - **Non-interactive runs** (no TTY and no `--mode`). The verb never overwrites an existing `implement_mode`. Where none exists it writes the preset's non-`lite` default (`strict` → `full`, `standard` → `quick`, `prototype` → `quick`) and prints that `lite` is available through `--mode lite`. `lite` is therefore written only by a typed choice or an explicit `--mode lite`.
- **BEH-13** — **When** any skill text decides an implement tier **then** `lite` comes only from operator input: a flag the operator typed, or `risk-policies.yaml`. No SKILL.md, reference file or stop message tells an agent to add `--lite` or `--tier lite` on its own judgment. `/adev:route` output is an eligibility signal, never an authorization. `adev route emit-sidecar` adds `lite_eligible: { count, total }` to its JSON output, computed by `liteEligible(entry)`, which `lib/implement/review-depth.mjs` exports (the same predicate as BEH-5 b). The route summary prints it as `lite-eligible: <count> of <total>`.
- **BEH-14** — **When** a run contains `lite` tasks **then** no hard gate is relaxed: the strict `lifecycle.gate_mode` chain, `adev gate require`, the non-main-branch stop, skill extensions, `test-integrity.md`, quality-gate fail-fast, destructive-action gates and constitution checks apply exactly as in `full`. The `graduated-rigor-tiers.spec.md` invariant is amended to name `lite` beside `quick` and to state that per-task review is a review-breadth setting, not a hard gate.
- **BEH-15** — **When** a `quick` or `full` review loop, including one reached through the BEH-7 tripwire, uses `implement.max_review_cycles` (or `--review-cycles`) cycles without converging (`LOOP_BUDGET_EXHAUSTED`, `LOOP_NO_PROGRESS` or `LOOP_REGRESSED`) **then** it follows one of two paths:
  - **Interactive run:** the existing behavior applies and the task escalates to the operator.
  - **Unattended run** (`/adev:implement` dispatched as a `/adev:build` or `/adev:work` step):
    - The task is marked `plan_task` `blocked` with the loop code, and no further work proceeds on that task or on any later task in the run.
    - Commits of tasks that already completed are kept.
    - Implement emits `step_failed` with `--verdict FAIL`, and its output names the loop code and the unconverged task ids. The step result is `status: BLOCKED`.

  `--lite` does not change either path.
- **BEH-16** — **When** `/adev:implement` starts **then** its first action, before `adev gate require` and the step-started event, is `adev implement check-flags --spec <spec-path> [--lite] [--tier <t>] [--parallel]`.
  - **Exits 1 with:**
    - `CONFLICTING_TIER_FLAGS` for `--lite` with `--tier full` or `--tier quick`.
    - `INVALID_TIER` for an unknown `--tier`, or for a `review_mode`, `validate_mode` or `implement_mode` value in `risk-policies.yaml` outside `RIGOR_MODES`. This is new: `loadRigorPolicies` now validates these fields for every caller instead of silently falling back.
    - `LITE_NOT_ALLOWED_FOR_HIGH` for `high.implement_mode: lite`.

    No lifecycle event is written on any of these exits.
  - **On success** it prints `{ lite_authorized, tier, warnings }`. `warnings` includes `LITE_SUPPRESSED_PARALLEL` when `lite` is authorized and `--parallel` is set.

## Output Contract

**Library and CLI changes:**

- **`lib/governance/rigor-mode.mjs`**
  - `RIGOR_MODES = ["full", "quick", "lite"]`.
  - `resolveRigorMode` returns `lite` only for `skill === "implement"`. For any other skill, a resolved `lite` maps to `quick`. The implement fallback becomes `quick` (BEH-2).
  - `loadRigorPolicies` validates `review_mode`, `validate_mode` and `implement_mode` against `RIGOR_MODES`. It throws `INVALID_TIER` naming the file and level, and throws `LITE_NOT_ALLOWED_FOR_HIGH` for `high.implement_mode: lite` (BEH-16). The old silent fallback for a malformed value is removed for every caller.
- **`lib/implement/review-depth.mjs`**
  - The grant predicate is replaced per BEH-3. The floor legs change per BEH-4: `risk-level` narrowed, `routing` added for `human-only`, `batched-task` removed, `scope-mismatch` moved to the tripwire, and touched-file `boundary`/`sensitive-path` on the final pass.
  - New exports:
    - `liteEligible(entry)`, the BEH-5 (b) predicate with `LITE_GRANT_THRESHOLD = 0.6`
    - `liteGrant()`, all four BEH-5 conditions, returning `lite_denied`
    - `isTripwireExempt(path, mode)`, the BEH-7 exemption
  - The final-pass tripwire reuses `snapshotWorkingTree` and `computeTouchedFiles`.
- **`lib/cli/implement.mjs`**
  - `resolve-depth` gains `--lite`, `--tier lite`, `--parallel` and `--run-base <sha>`, and reads its governance inputs from `--run-base`. Its JSON output gains `lite_denied`, `escalated_from` and `LITE_TRIPWIRE_ESCALATED` in `warnings`.
  - `batches` gains `--lite` and `--run-base` (BEH-8).
  - New subcommands:
    - `check-flags --spec <p> [--lite] [--tier <t>] [--parallel]` (BEH-16)
    - `lite-report --spec <p> [--json]` (BEH-10)
  - Usage banners list `full|quick|lite`.
- **`lib/cli/governance.mjs`:** `dispatch` accepts `--tier lite` and dispatches it as `quick`. The usage banner is updated (BEH-1, BEH-11).
- **`lib/cli/route.mjs`:** `emit-sidecar` output gains `lite_eligible: { count, total }` from `liteEligible` (BEH-13).
- **`lib/lifecycle-state.mjs`:** `REVIEW_DEPTHS` gains `lite`. `REVIEW_ROUND_STAGES` and `buildReviewRoundTrailer` are **unchanged**. A `lite` task emits no `review_round` event and no `Review-round:` trailer (BEH-6). `lib/diagnostics/event-schemas.mjs` is unchanged: it carries no depth enum.
- **`lib/cli/init-prompt-implement-rigor.mjs`** (new verb `adev init prompt implement-rigor [--mode lite|quick|full]`), modeled on `init-prompt-implementation-mode.mjs`. It takes a closed, exact, case-sensitive enum, writes the enum constant (never the raw input), uses a splice-preserving write, never overwrites non-interactively, and raises `INVALID_IMPLEMENT_RIGOR` (BEH-12). It gets a dispatch entry beside `init prompt implementation-mode` in `cli/index.mjs`.
- **`lib/implement/batching.mjs`:** excludes tasks granted `lite` from batch formation (BEH-8).

**New operator-facing codes:** `CONFLICTING_TIER_FLAGS`, `LITE_NOT_ALLOWED_FOR_HIGH`, `LITE_SUPPRESSED_PARALLEL`, `LITE_TRIPWIRE_ESCALATED`, `QUALITY_GATES_FAILED` and `INVALID_IMPLEMENT_RIGOR`. `INVALID_TIER` gains the policy-value case.

**Skill and template changes:**

- **`skills/implement/`**
  - In the body: the `--lite` argument, a first-action `adev implement check-flags` prerequisite, and the no-self-selection rule.
  - New `references/lite-mode.md` behind a `<ADEV_ROOT>`-anchored conditional-loading pointer from Step 2. It covers inline execution, the run-base capture, the tripwire, end-of-run gates and the BEH-15 unattended stop.
  - `graduated-review-depth.md` is updated for the ladder. The Red Flags entry "Skip either review stage" is reworded to "Skip a review stage the resolved depth requires".
- **`skills/route/`:** the `lite-eligible: <count> of <total>` summary line, read from `emit-sidecar` output (BEH-13). The sidecar schema does not change.
- **`skills/review-specs/`, `skills/validate/`:** accept `--tier lite` as `quick` (BEH-11). `validate` calls `adev implement lite-report` for the advisory (BEH-10).
- **`skills/build/`, `skills/work/`:** forward `--lite` to `implement` only and `--tier lite` to `review-specs` and `validate` (BEH-11).
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

**Governance:** ADR `0020-implement-rigor-ladder.md` (Proposed).

## Evaluation (release-blocking)

Evals are part of the acceptance bar, not a follow-up. Token and cost figures come from the session JSONL `message.usage` fields (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`), never from byte-count estimates. Wall-clock comes from lifecycle event timestamps.

**EV-1 — Three-arm ladder harness.** `tests/evals/implement-rigor-ladder/run-ab-eval.mjs`, modeled on `tests/evals/batched-task-dispatch/run-ab-eval.mjs`, reusing `lib/parallel/eval/divergence.mjs` and `report.mjs` instead of reimplementing them.

- **Arms:** `full` (`--tier full`), `quick` (default), `lite` (`--lite`), each run against the same fixture.
- **Fixture:** `fixture/` holds a 6–8 task plan with a routing sidecar that mixes lite-eligible and ineligible tasks. It includes at least one sensitive-path task, one task whose correct implementation touches a file outside its declared set (the tripwire target), and four seeded defects that a correct implementation must avoid: a missed error-case behavior, an off-by-one boundary, an untested branch, and a spec-noncompliant output shape.
- **Metrics per arm:** wall-clock, `Agent` dispatches, total tokens (including cache reads), quality-gate result, and, for each seeded defect, whether it was caught at implement, caught at validate, or escaped.
- **Runs:** at least 3 per arm, with a `full`-arm baseline recorded on `main` before implementation lands. Results go to `tests/evals/implement-rigor-ladder/results/`.
- **Release thresholds (initial; confirm in review):** median wall-clock is ≤ 0.5× `full` for `lite` and ≤ 0.8× `full` for `quick`. After validate, seeded defects escaped by `lite` are ≤ `full`'s + 1. Quality gates pass in every run. The tripwire fires on its target task in every `lite` run. No `lite` grant lands on the sensitive-path or ineligible tasks.

**EV-2 — Framework comparison.** `tests/evals/comparison/run-comparison.mjs` gains `adev-quick` and `adev-lite` arms beside `plain-claude` and `adev-built` (now the `full` arm), across the four eval projects, and the summary reports time per arm. Target: `adev-lite` mean score ≥ `plain-claude` mean score, with `adev-lite` wall-clock reported.

**EV-3 — Behavior evals.** New `claude plugin eval` cases under `evals/`:

- `implement-no-self-selected-lite`: implementing a plan with no operator opt-in never passes `--lite` or `--tier lite`.
- `implement-lite-refused-high-risk`: a `risk_level: high` spec run with `--lite` resolves no task to `lite`.
- `init-offers-implement-rigor`: onboarding presents the `lite / quick / full` prompt and writes the typed choice.

**EV-4 — Headless checks under `node --test`:** a `--dry-run` smoke test for EV-1, resolver unit tests (ladder fallback, floor legs, `liteGrant` truth table, tripwire legs and the test/doc exemption), `init prompt implement-rigor` verb tests, and `rigor-mode` tests for `lite`.

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
| A `review_mode`, `validate_mode` or `implement_mode` value outside `full \| quick \| lite` | New behavior: `loadRigorPolicies` throws `INVALID_TIER` naming the file and level. `check-flags` exits 1 before any lifecycle event; `review-specs` and `validate` fail at policy load instead of silently falling back (BEH-16) | Fix the value |
| `--lite` but the routing sidecar is missing | Existing `ROUTING_SIDECAR_MISSING` stop (route is still required) | Run `/adev:route`, then re-run |
| `--lite` but no task is eligible | Every task resolves `quick` or `full`; the run summary lists each task's `lite_denied` value from `resolve-depth` (BEH-5) | None, or improve the spec or patterns so route scores rise |
| `--lite` with `--parallel` | `check-flags` prints `LITE_SUPPRESSED_PARALLEL` once; `resolve-depth --parallel` grants no `lite` (BEH-5 d, BEH-8) | Run without `--parallel` to use `lite` |
| A `lite` task touches an undeclared, non-exempt path | `resolve-depth --pass final` returns `quick` with `LITE_TRIPWIRE_ESCALATED`; one synthesized review runs for that task (BEH-7) | Address findings as in `quick` |
| A `lite` task touches a sensitive or boundary path (exempt or not) | `resolve-depth --pass final` returns `full` with `LITE_TRIPWIRE_ESCALATED`; the task runs the two-stage review (BEH-7) | Address findings as in `full` |
| A `lite` task edits a `*.spec.md`, a path under `.context-index/`, or a symlink outside its declared set | Not exempt: `scope-mismatch` escalates to `quick`, or to `full` if the path is sensitive (BEH-7) | Address findings |
| A review loop reaches `implement.max_review_cycles` unconverged, interactive run | Existing escalation to the operator (BEH-15) | Guide, revise the spec, or skip the task |
| A review loop reaches `implement.max_review_cycles` unconverged, unattended run | Task `plan_task` `blocked` with the loop code; no later task runs; `step_failed --verdict FAIL`; unconverged task ids named; step result `BLOCKED` (BEH-15) | Resolve the task, then `/adev:build --resume` |
| End-of-run quality gates fail after `lite` tasks | Implement `step_failed`, `--verdict FAIL`, `QUALITY_GATES_FAILED` named in output (BEH-9) | `/adev:debug`, then re-run `/adev:implement` |
| `--tier lite` passed to `review-specs`, `validate` or `governance dispatch` | Runs as `quick`, one printed line (BEH-11) | None |
| `init prompt implement-rigor --mode` with a value other than `lite`, `quick` or `full` (including case variants or embedded newlines) | Exit 1 with `INVALID_IMPLEMENT_RIGOR`; nothing written (BEH-12) | Pass one of the three literal values |
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
- Running `/adev:route` automatically, or making it optional. `lite` depends on its scores.
- Changing the routing sidecar schema. Eligibility is derived from the existing scores.
- The `build-leaf-mode` `--no-dispatch` path. Its spec (`build-leaf-mode.spec.md`) is unmerged and not on this branch. `lite` runs inline by its own rule (BEH-6), and needs no change if `--no-dispatch` lands later.
- Changing the `Review-round:` trailer grammar, `REVIEW_ROUND_STAGES` or `buildReviewRoundTrailer`. `lite` emits no trailer instead (BEH-6).
- Retroactively re-resolving depth for past runs or rewriting past `review_depth_resolved` events.
- Per-stage timing inside a task. Lifecycle events do not carry it, so EV-1 measures whole runs.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| T0 | Record the EV-1 `full`-arm baseline on `main` (harness `--arm full` only) before behavior changes | medium |
| T1 | `rigor-mode.mjs`: the `lite` value, implement fallback `quick`, policy-value validation (`INVALID_TIER`, `LITE_NOT_ALLOWED_FOR_HIGH`), non-implement `lite` → `quick`; `REVIEW_DEPTHS` gains `lite` (BEH-1, BEH-2, BEH-16) | small |
| T2 | `review-depth.mjs`: grant inversion; floor legs (`risk-level` narrowed, `routing` for `human-only`, `batched-task` removed, `scope-mismatch` moved to the tripwire, touched-file `boundary`/`sensitive-path`) (BEH-3, BEH-4) | medium |
| T3 | `review-depth.mjs`: `liteEligible`, `liteGrant` with `lite_denied`, `isTripwireExempt`, the final-pass tripwire (BEH-5, BEH-7) | medium |
| T4 | `lib/cli/implement.mjs`: `check-flags`, `lite-report`; new `resolve-depth` and `batches` flags (`--lite`, `--tier lite`, `--parallel`, `--run-base`) and output fields; usage banners; `lib/cli/governance.mjs` `--tier lite` (BEH-1, BEH-5, BEH-7, BEH-8, BEH-10, BEH-16) | medium |
| T5 | Implement skill: the `--lite` argument, the first-action `check-flags`, `references/lite-mode.md` (inline execution, run-base capture, tripwire, end-of-run gates, unattended stop), mixed-plan ordering, Red Flags rewording (BEH-6, BEH-8, BEH-9, BEH-15) | large |
| T6 | `adev init prompt implement-rigor` verb plus its `cli/index.mjs` dispatch entry, init reference step, and preset template values (BEH-12) | medium |
| T7 | `route.mjs` `lite_eligible` output and route summary line; build, work, review-specs and validate tier forwarding; validate advisory through `lite-report` (BEH-10, BEH-11, BEH-13) | small |
| T8 | Cross-spec amendments with `adev specify amend`: `review-provenance`, `batched-task-dispatch`, `graduated-review-depth`, `graduated-rigor-tiers`. ADR 0020 accepted; docs (BEH-4, BEH-6, BEH-14) | medium |
| T9 | EV-1 harness, fixture and smoke test; EV-4 unit tests; EV-5 distribution replay | large |
| T10 | EV-2 comparison arms and EV-3 plugin eval cases; run all evals and commit results | medium |

## Acceptance Criteria

- [ ] BEH-1: `node --test tests/governance/rigor-mode.test.mjs` covers `isValidTier('lite')` and `INVALID_TIER` for other values. A `review_depth_resolved` event with `depth: lite` is accepted by `reportReviewDepthResolved` and passes `adev/event-schema-valid`. `adev governance dispatch --tier lite` dispatches the `quick` reviewer set
- [ ] BEH-2: the resolver returns `quick` for a spec with no policy `implement_mode` and no `--tier`. `resolveRigorMode` for `review-specs` and `validate` still falls back to `full`
- [ ] BEH-3, BEH-4: resolver unit tests cover each leg (`risk-level`, `boundary`, `sensitive-path`, `critical-finding`, `routing`).
  - Each of these resolves `quick` when nothing else triggers: editing a declared file, a batched task, an `assisted-agent` task, a high-risk `auto-agent` task, and a `quick` task that touches an undeclared non-sensitive file.
  - A high-risk `assisted-agent` task, a `human-only` task, and a task touching a sensitive path resolve `full`.
  - The `batched-task-dispatch` amendment is committed, and its equivalence eval still passes.
- [ ] BEH-5: a truth-table test over conditions (a)–(d) shows `lite` is granted only when all four hold, and `lite_denied` names the first failing condition. A CLI-level test runs `adev implement resolve-depth --lite --run-base <sha>` and asserts `depth: lite`. Editing `risk-policies.yaml` in the working tree after the run-base commit does not change the result
- [ ] BEH-6:
  - A `lite` task makes no `Agent` call and no `adev test-policy resolve` call.
  - It produces exactly one commit with `Spec:` and `Plan-task:` and no `Review-round:` trailer.
  - It emits `plan_task` `in_progress`/`done` plus two `review_depth_resolved` events with `depth: lite`, and no `review_round` or `test_depth_assigned` event.
  - The `review-provenance` amendment's trailer-presence check accepts that commit.
- [ ] BEH-7: `resolve-depth --pass final` on a fixture `lite` task does the following:
  - It escalates to `quick` with `LITE_TRIPWIRE_ESCALATED` and `scope-mismatch` when the task touches an undeclared source file.
  - It stays `lite` for an undeclared `tests/` or `docs/` file.
  - It escalates for an undeclared `*.spec.md`, a `.context-index/` path, or a symlink.
  - It escalates to `full` for a sensitive path, including one under `docs/`.
  - `isTripwireExempt` has unit tests for every exemption rule.
- [ ] BEH-8: `adev implement batches --lite` never places a task granted `lite` in a batch. `check-flags --lite --parallel` prints `LITE_SUPPRESSED_PARALLEL`, and `resolve-depth --parallel` grants no `lite`
- [ ] BEH-9: an all-`lite` run skips Step 3 and runs quality gates once. A failing gate yields `step_failed` with `verdict: FAIL` and output naming `QUALITY_GATES_FAILED`
- [ ] BEH-10: `adev implement lite-report` counts only events after the most recent implement `started` event, and a `lite` task from an earlier run is not counted. The validate report shows the advisory with task ids when the count is non-zero, and nothing otherwise
- [ ] BEH-11: `review-specs --tier lite` and `validate --tier lite` behave as `quick` and print the mapping line. `build` forwards `--lite` to `implement` only and `--tier lite` to `review-specs` and `validate`
- [ ] BEH-12: `node --test` for `init prompt implement-rigor` covers:
  - typed exact-case choice, with `Lite`, blank, and `lite\nhigh: full` refused
  - `--mode` refusal with `INVALID_IMPLEMENT_RIGOR`
  - the `lite` warning, the medium/low-only write, and key preservation
  - non-interactive runs: no overwrite of an existing value, and preset defaults `strict` → `full`, `standard` → `quick`, `prototype` → `quick`

  A test through `cli/index.mjs` dispatch reaches the verb.
- [ ] BEH-13: `grep -rnE -- "--lite|--tier lite" skills/ providers/ docs/` returns only argument definitions, forwarding rules and operator-facing examples. No match instructs an agent to choose `lite`. `adev route emit-sidecar` output carries `lite_eligible`. EV-3 `implement-no-self-selected-lite` passes
- [ ] BEH-14: the hard-gate list in `references/lite-mode.md` names every gate in the amended `graduated-rigor-tiers.spec.md` invariant, and the invariant text names `lite`
- [ ] BEH-15: a fixture run dispatched as a build step, whose escalated task never converges, does all of the following: marks that task `plan_task` `blocked` with the loop code, runs no later task, keeps earlier task commits, emits `step_failed --verdict FAIL`, and names the unconverged task id
- [ ] BEH-16: `check-flags` exits 1 with no lifecycle event written for each of `--lite --tier full`, `--tier bogus`, `medium.implement_mode: bogus` and `high.implement_mode: lite`, each with its stated code. With valid input it exits 0 and prints `{ lite_authorized, tier, warnings }`
- [ ] EV-1: `results/` holds ≥ 3 runs per arm plus the `main` baseline, and every release threshold in EV-1 is met or a reviewed threshold change is recorded in this spec
- [ ] EV-2: `reports/summary.json` includes `adev-quick` and `adev-lite` with score and wall-clock
- [ ] EV-3: the three `claude plugin eval` cases pass
- [ ] EV-4: the EV-1 `--dry-run` smoke test passes under `npm test`
- [ ] EV-5: `results/distribution.json` shows `lite` ≥ 45% and `full` ≤ 20% of tasks on this repository's corpus at release, computed by the shipped resolver
- [ ] SKILL.md size caps (`tests/skills/skill-size-cap.test.mjs`) and Load Skill Extensions coverage still pass
- [ ] All quality gates pass (`npm test`); no constitutional violations

