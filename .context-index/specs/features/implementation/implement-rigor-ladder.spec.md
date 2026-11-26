---
partial_schema: spec@1
charter: implementation
kind: skill
status: review-pending
risk_level: high
milestone:
revision: 1
charter-revision: 1
created: 2026-11-25
updated: 2026-11-25
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

The ladder is resolved **per task**, so one plan can mix levels.

| Level | Per-task execution | Per-task review | Resolved when |
|---|---|---|---|
| **`full`** | Fresh implementer subagent (batched or solo) | Stage 1 spec-compliance, then Stage 2 code-quality, each capped at `review_cycles` | `--tier full`, or a floor leg holds (BEH-4): sensitive path, governance boundary, `human-only` routing, a high-risk spec on a task not routed `auto-agent`, or a Critical finding |
| **`quick`** (new default) | Fresh implementer subagent (batched or solo) | One synthesized reviewer, capped at `review_cycles` | No floor leg holds and the task is not granted `lite`. Includes `assisted-agent` tasks and high-risk `auto-agent` tasks |
| **`lite`** (new) | Inline in the orchestrator's own context; no `Agent` dispatch | None; a post-task tripwire can escalate the task (BEH-7) | Operator authorization **and** route's "easy" signal (auto-agent, no dimension below 3 of 5) **and** spec not high-risk **and** no floor leg (BEH-5) |

`full` and `quick` keep their current per-stage meaning. Existing `risk-policies.yaml` files and `--tier` values need no migration; what changes is the fallback, the grant rule, and the floor set.

## Arguments

| Argument | Accepted by | Meaning |
|---|---|---|
| `--lite` (new) | `/adev:implement`, `/adev:build`, `/adev:work` | Operator authorization for `lite`. Equivalent to `--tier lite`. `build` and `work` forward it to `implement` only when the operator passed it. Never added by an agent on its own judgment (BEH-13) |
| `--tier lite` (new value) | `/adev:implement`, `/adev:build` and children | On `implement`: same as `--lite`. On `/adev:review-specs` and `/adev:validate`: treated as `quick`, with one printed line saying so (BEH-11) |
| `--tier quick` (existing) | as today | Baseline `quick`; floors can still raise a task to `full` |
| `--tier full` (existing) | as today | Absolute: every task `full`, no floor consulted, no `lite` grant |
| `implement_mode: lite` (new value) | `risk-policies.yaml`, per risk level | Project-level authorization for `lite` at that risk level. Written by `/adev:init` onboarding (BEH-12) or by hand. Rejected for `high` with `LITE_NOT_ALLOWED_FOR_HIGH` |

`--lite` together with `--tier full` or `--tier quick` exits non-zero with `CONFLICTING_TIER_FLAGS` before the step-started event.

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** any skill or verb validates a rigor tier **then** the legal set is `full | quick | lite`: `RIGOR_MODES` in `lib/governance/rigor-mode.mjs` gains `lite`, `isValidTier('lite')` is true, and `review_depth_resolved.depth` accepts `lite`. Every other value still fails with `INVALID_TIER`.
- **BEH-2** — **When** `adev implement resolve-depth` runs with no `--tier` and the spec's risk level has no `implement_mode` in `risk-policies.yaml` (or the file is absent) **then** the baseline is `quick`, not `full`. The `review_mode` and `validate_mode` fallbacks for `/adev:review-specs` and `/adev:validate` stay `full`.
- **BEH-3** — **When** the baseline is `quick` (policy, fallback or `--tier quick`) **then** the task resolves `quick` unless a floor leg holds. The quick-grant predicate's rows (auto-agent routing, every score ≥ 0.6, additive-only file set, no boundary) are removed as grant conditions. Routing and boundary signals act only through the floor legs in BEH-4.
- **BEH-4** — **When** the floor pass runs **then** each of these legs forces `full`:
  - `risk-level`: the spec is `risk_level: high` and the task is not routed `auto-agent`.
  - `boundary` and `sensitive-path`: evaluated on the declared files at the provisional pass and on the touched files at the final pass.
  - `critical-finding`: final pass only.
  - `routing`: `selected_agent` is `human-only`. `assisted-agent` no longer forces `full`; its human checkpoint still applies.

  The `batched-task` leg is removed. `scope-mismatch` no longer forces `full`; it survives only as the `lite` tripwire in BEH-7. A high-risk task routed `auto-agent` resolves `quick` and is never granted `lite` (BEH-5 c). `REVIEW_DEPTH_FLOOR_APPLIED` is still echoed to the transcript, and `--tier full` stays absolute. These relaxations are calibrated to the target distribution in the Problem section, and ADR 0020 records them.
- **BEH-5** — **When** a task's provisional pass runs **then** it resolves `lite` only if all of these hold: (a) the operator authorized `lite` through `--lite`, `--tier lite` or `implement_mode: lite` for the spec's risk level; (b) the routing sidecar entry has `selected_agent: auto-agent` and every one of the four scores is ≥ `LITE_GRANT_THRESHOLD` (0.6 on the sidecar's 0–1 scale, meaning no dimension below 3 of 5, the same rule as route's existing "easy" rigor signal); (c) the spec is not `risk_level: high` and no provisional floor leg holds (`boundary`, `sensitive-path`, `routing`); (d) the run is not `--parallel`. If any condition fails, the task goes through the `quick`/`full` resolution of BEH-3 and BEH-4. A failed (a) is silent. A failed (b), (c) or (d) under an explicit `--lite` is listed once in the run summary with the failing condition.
- **BEH-6** — **When** a task resolves `lite` **then** the orchestrator implements it in its own context with no `Agent` dispatch, using the `agent-default` mandate (`references/agent-default-mandate.md`) and the always-on `references/test-integrity.md`. It skips test-depth resolution, both review stages and the synthesized reviewer for that task. It keeps the dispatch-time working-tree snapshot, one commit per task carrying `Spec:`, `Plan-task:` and `Review-round: lite=0`, and the `plan_task` `in_progress` and `done` events. Both `review_depth_resolved` passes are emitted with `depth: lite`.
- **BEH-7** — **When** a `lite` task finishes, before its commit **then** the final pass computes touched files against the dispatch-time snapshot.
  - **`scope-mismatch`:** a touched path is outside the declared set and is not a test or doc file. Test or doc means under `tests/` or `docs/`, matching `*.test.*` or `*.spec.*` source-test naming, or a `README.md`. This escalates the task to `quick`: one synthesized reviewer is dispatched against the task diff under the normal `cq-<n>` loop and cap.
  - **`sensitive-path` or `boundary` on a touched path:** this escalates the task to `full`.

  Each escalation is recorded as a final-pass `review_depth_resolved` with the new depth and the holding `floor_legs`, and `LITE_TRIPWIRE_ESCALATED` (task and legs) is echoed to the transcript. Escalation only goes upward.
- **BEH-8** — **When** a plan mixes levels **then** tasks run in plan order. Consecutive `lite` tasks run inline. `quick` and `full` tasks go through the existing Step 2 loop, and batching (`adev implement batches`) forms batches only from non-`lite` tasks. Under `--parallel`, `lite` is not granted (BEH-5 d) and `LITE_SUPPRESSED_PARALLEL` is printed once.
- **BEH-9** — **When** a run that contained at least one `lite` task reaches Step 2-post **then** the constitution's quality gates run once over the whole run, fail-fast. A failure emits the implement `step_failed` event with `--verdict FAIL` and names `QUALITY_GATES_FAILED` in operator output. Step 3's final reviewer is skipped only when every task in the run resolved `lite`; otherwise it runs as today.
- **BEH-10** — **When** `/adev:validate` runs on a spec whose most recent implement run has any final-pass `review_depth_resolved` with `depth: lite` **then** its report lists the count and ids of `lite` tasks as an advisory ("implemented without per-task review"), and its spec-compliance check covers the diff of those tasks. `validate` is never skipped and its own tier is unchanged.
- **BEH-11** — **When** `/adev:review-specs` or `/adev:validate` receives `--tier lite` **then** it runs exactly as `--tier quick` and prints one line saying it did. `/adev:build` and `/adev:work` forward the operator's `--lite` or `--tier lite` unchanged to every child.
- **BEH-12** — **When** `/adev:init` onboards a project (any `risk_tier` preset: `prototype`, `standard` or `strict`) or is re-run on an existing project **then** it runs `adev init prompt implement-rigor`. The prompt offers `lite`, `quick` and `full`, requires a typed choice, and rejects blank input. It writes the choice to `risk-policies.yaml` as `implement_mode` for the `medium` and `low` levels and preserves every other key. `high` keeps its preset value: `quick` for `standard` and `prototype`, `full` for `strict`. Choosing `full` also writes `full` for `high`. Choosing `lite` first prints a warning that per-task review is skipped for route-eligible tasks and deferred to `/adev:validate`. With `--mode <level>`, it writes without prompting. A non-interactive init writes the preset default: `strict` → `full`, `standard` → `quick`, `prototype` → `lite`.
- **BEH-13** — **When** any skill text decides an implement tier **then** `lite` comes only from operator input (a flag the operator typed, or `risk-policies.yaml`). No SKILL.md, reference file or stop message tells an agent to add `--lite` or `--tier lite` on its own judgment, and `/adev:route` output is an eligibility signal, never an authorization. `/adev:route`'s summary adds a `lite-eligible: <n> of <m>` line computed with the BEH-5 (b) rule.
- **BEH-14** — **When** a run contains `lite` tasks **then** no hard gate is relaxed: the strict `lifecycle.gate_mode` chain, `adev gate require`, the non-main-branch stop, skill extensions, `test-integrity.md`, quality-gate fail-fast, destructive-action gates and constitution checks apply exactly as in `full`. The `graduated-rigor-tiers.spec.md` invariant is amended to name `lite` beside `quick` and to state that per-task review is a review-breadth setting, not a hard gate.

## Output Contract

**Library changes:**

- `lib/governance/rigor-mode.mjs`: `RIGOR_MODES = ["full", "quick", "lite"]`. `resolveRigorMode` returns `lite` only for `skill === "implement"`. For any other skill, a resolved `lite` maps to `quick`. The implement fallback becomes `quick` (BEH-2). `loadRigorPolicies` rejects `high.implement_mode: lite` with `LITE_NOT_ALLOWED_FOR_HIGH`.
- `lib/implement/review-depth.mjs`: grant predicate replaced per BEH-3. Floor legs per BEH-4: `risk-level` narrowed to high risk on a task not routed `auto-agent`, `routing` (`human-only` only) added, `batched-task` removed, `scope-mismatch` moved out of the floor, and `boundary`/`sensitive-path` evaluated on touched files at the final pass. New `liteGrant()` per BEH-5, with `LITE_GRANT_THRESHOLD = 0.6`. The final-pass tripwire per BEH-7 reuses `snapshotWorkingTree` and `computeTouchedFiles`, and adds the test/doc exemption as a single exported predicate.
- `lib/lifecycle-state.mjs` and `lib/diagnostics/event-schemas.mjs`: `review_depth_resolved.depth` accepts `lite`. A `lite` task emits no `review_round` event, because no review ran; its provenance is the two `review_depth_resolved` events plus the commit trailer. No new event types or required fields.
- `lib/cli/init-prompt-implement-rigor.mjs` (new verb `adev init prompt implement-rigor [--mode lite|quick|full]`), modeled on `init-prompt-implementation-mode.mjs`: typed choice, blank rejected, splice-preserving write.
- `lib/implement/batching.mjs`: excludes `lite` tasks from batch formation (BEH-8).

**Skill and template changes:**

- `skills/implement/`: `--lite` argument and `CONFLICTING_TIER_FLAGS` prerequisite in the body. New `references/lite-mode.md` behind a `<ADEV_ROOT>`-anchored conditional-loading pointer from Step 2 (inline execution, tripwire, end-of-run gates). `graduated-review-depth.md` updated for the ladder. The Red Flags entry "Skip either review stage" is reworded to "Skip a review stage the resolved depth requires".
- `skills/route/`: `lite-eligible: <n> of <m>` summary line (BEH-13). No sidecar schema change.
- `skills/review-specs/`, `skills/validate/`: accept `--tier lite` as `quick` (BEH-11). `validate` adds the `lite` advisory (BEH-10).
- `skills/build/`, `skills/work/`: forward `--lite` and `--tier lite` (BEH-11).
- `skills/init/references/behavior-by-project-state.md`: new implement-rigor step driven by the verb (BEH-12).
- `templates/risk-policies-template.yaml` (`standard`): `high`, `medium` and `low` set to `quick` (the `risk-level` floor still forces `full` for high-risk tasks not routed `auto-agent`). `templates/risk-tiers/prototype/risk-policies.yaml`: `high` set to `quick`, `medium` and `low` set to `lite`. `templates/risk-tiers/strict/`: unchanged (`full`). This repository's own `.context-index/governance/risk-policies.yaml` is updated to match the `standard` template.
- Provider mirrors under `providers/*/skills/` regenerated.

**Docs:** `docs/skill-reference.md` (implement, route, init, build), `docs/cli-reference.md` (`init prompt implement-rigor`, `implement resolve-depth` output), `docs/configuration.md` (`implement_mode: lite`), `docs/concepts.md` (the ladder).

**Governance:** ADR `0020-implement-rigor-ladder.md` (Proposed), plus an amendment to the `graduated-rigor-tiers.spec.md` invariant (BEH-14).

**Commit trailer:** a `lite` task's commit carries `Review-round: lite=0` in place of the stage records (`review-provenance.spec.md`).

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
| `--lite` with `--tier full` or `--tier quick` | Exit non-zero with `CONFLICTING_TIER_FLAGS` before the step-started event | Drop one flag |
| `high.implement_mode: lite` in `risk-policies.yaml` | `LITE_NOT_ALLOWED_FOR_HIGH` when policies load; the run stops before the step-started event | Set `high` to `full` or `quick` |
| `--lite` but the routing sidecar is missing | Existing `ROUTING_SIDECAR_MISSING` stop (route is still required) | Run `/adev:route`, then re-run |
| `--lite` but no task is eligible | Every task resolves `quick` or `full`, and the summary lists the failing BEH-5 condition per task | None, or raise route scores by improving the spec or patterns |
| `--lite` with `--parallel` | `LITE_SUPPRESSED_PARALLEL` printed once; tasks resolve `quick` or `full` | Run without `--parallel` to use `lite` |
| A `lite` task touches an undeclared non-test, non-doc path | `LITE_TRIPWIRE_ESCALATED`; one synthesized review runs for that task (BEH-7) | Address findings as in `quick` |
| A `lite` task touches a sensitive or boundary path | `LITE_TRIPWIRE_ESCALATED`; the task runs the `full` two-stage review (BEH-7) | Address findings as in `full` |
| End-of-run quality gates fail after `lite` tasks | Implement `step_failed`, `--verdict FAIL`, `QUALITY_GATES_FAILED` named in output (BEH-9) | `/adev:debug`, then re-run `/adev:implement` |
| `--tier lite` passed to `review-specs` or `validate` | Runs as `quick`, one printed line (BEH-11) | None |
| A malformed `implement_mode` value | Existing `INVALID_TIER` | Fix the value |
| A `lite` task's context grows large on a long plan | No special handling; the harness compacts as usual. The task count per `lite` run is measured in EV-1 | Split the plan, or run without `--lite` |

## System Constitution Reference

- **Skills are primarily markdown.** `lite` is expressed in skill text, but the grant, floor and tripwire decisions have runtime semantics, so they live in `adev implement resolve-depth` and `lib/implement/review-depth.mjs`, not in SKILL.md prose or fenced JavaScript.
- **SKILL.md size limits and progressive disclosure.** The inline execution path goes in `skills/implement/references/lite-mode.md` behind a `<ADEV_ROOT>`-anchored pointer. The `--lite` argument, the `CONFLICTING_TIER_FLAGS` prerequisite and the no-self-selection rule stay in the body, because they govern the whole invocation.
- **Minimize external dependencies.** No new dependency. The tripwire reuses the existing git-tree snapshot helpers.
- **Hook protocol compliance.** Hooks are unchanged. Commit trailers (`Author-type`, `Operator`) are still injected on `lite` commits.
- **Architecture boundary: requires human approval.** This lowers the default review rigor for every adev project, so ADR 0020 records the decision and the operator approves it at review.

## Out of Scope

- A `lite` level for `/adev:review-specs` or `/adev:validate` with its own behavior. Both map `lite` to `quick` here.
- Running `/adev:route` automatically, or making it optional. `lite` depends on its scores.
- Changing the routing sidecar schema. Eligibility is derived from the existing scores.
- The `build-leaf-mode` `--no-dispatch` path. `lite` runs inline by its own rule (BEH-6), and if `--no-dispatch` lands later, `lite` tasks need no change under it.
- Retroactively re-resolving depth for past runs or rewriting past `review_depth_resolved` events.
- Per-stage timing inside a task. Lifecycle events do not carry it, so EV-1 measures whole runs.

## Actionable Task Map

| Task | Description | Complexity |
|---|---|---|
| T0 | Record the EV-1 `full`-arm baseline on `main` (harness `--arm full` only) before behavior changes | medium |
| T1 | `rigor-mode.mjs`: `lite` value, implement fallback `quick`, `LITE_NOT_ALLOWED_FOR_HIGH`, non-implement `lite` → `quick` (BEH-1, BEH-2, BEH-11) | small |
| T2 | `review-depth.mjs`: grant inversion; floor legs (`risk-level` narrowed, `routing` for `human-only`, `batched-task` removed, `scope-mismatch` moved to the tripwire, touched-file `boundary`/`sensitive-path`) (BEH-3, BEH-4) | medium |
| T3 | `review-depth.mjs`: `liteGrant()` and the final-pass tripwire; event schema accepts `lite` (BEH-5, BEH-7) | medium |
| T4 | Implement skill: `--lite`, `CONFLICTING_TIER_FLAGS`, `references/lite-mode.md`, mixed-plan ordering, batching exclusion, end-of-run gates, Red Flags rewording (BEH-6, BEH-8, BEH-9) | large |
| T5 | `adev init prompt implement-rigor` verb, init reference step, and preset template values (BEH-12) | medium |
| T6 | Route summary line; build, work, review-specs and validate tier forwarding; validate advisory (BEH-10, BEH-11, BEH-13) | small |
| T7 | ADR 0020 accepted, `graduated-rigor-tiers` invariant amendment, `graduated-review-depth` spec note, docs (BEH-14) | small |
| T8 | EV-1 harness, fixture and smoke test; EV-4 unit tests; EV-5 distribution replay | large |
| T9 | EV-2 comparison arms and EV-3 plugin eval cases; run all evals and commit results | medium |

## Acceptance Criteria

- [ ] BEH-1: `node --test tests/governance/rigor-mode.test.mjs` covers `isValidTier('lite')` and `INVALID_TIER` for other values. `review_depth_resolved` with `depth: lite` passes `adev/event-schema-valid`
- [ ] BEH-2: the resolver returns `quick` for a spec with no policy `implement_mode` and no `--tier`. `resolveRigorMode` for `review-specs` and `validate` still falls back to `full`
- [ ] BEH-3, BEH-4: resolver unit tests cover each leg (`risk-level`, `boundary`, `sensitive-path`, `critical-finding`, `routing`). Each of these resolves `quick` when nothing else triggers: editing a declared file, a batched task, an `assisted-agent` task, a high-risk `auto-agent` task, and a `quick` task that touches an undeclared non-sensitive file. A high-risk `assisted-agent` task, a `human-only` task, and a task touching a sensitive path resolve `full`
- [ ] BEH-5: a truth-table test over conditions (a)–(d) shows `lite` is granted only when all four hold, and the run summary names the failing condition under an explicit `--lite`
- [ ] BEH-6: a `lite` task makes no `Agent` call, produces exactly one commit with `Spec:`, `Plan-task:` and `Review-round: lite=0`, and emits `plan_task` `in_progress`/`done` plus two `review_depth_resolved` events with `depth: lite`
- [ ] BEH-7: a fixture `lite` task that touches an undeclared source file escalates to `quick` with `LITE_TRIPWIRE_ESCALATED`, and its final-pass event carries `scope-mismatch`. One that touches only an undeclared test or doc file stays `lite`. One that touches a sensitive path escalates to `full`
- [ ] BEH-8: `adev implement batches` never places a `lite` task in a batch. `--lite --parallel` prints `LITE_SUPPRESSED_PARALLEL` and grants no `lite`
- [ ] BEH-9: an all-`lite` run skips Step 3 and runs quality gates once. A failing gate yields `step_failed` with `verdict: FAIL`
- [ ] BEH-10: the validate report shows the `lite` advisory with task ids when a `lite` final pass exists, and shows nothing otherwise
- [ ] BEH-11: `review-specs --tier lite` and `validate --tier lite` behave as `quick` and print the mapping line
- [ ] BEH-12: `node --test` for `init prompt implement-rigor` covers typed choice, blank rejection, `--mode`, the `lite` warning, the medium/low-only write, and key preservation. A non-interactive init writes `strict` → `full`, `standard` → `quick`, `prototype` → `lite`
- [ ] BEH-13: `grep -rnE -- "--lite|--tier lite" skills/ providers/ docs/` returns only argument definitions, forwarding rules and operator-facing examples. No match instructs an agent to choose `lite`. EV-3 `implement-no-self-selected-lite` passes
- [ ] BEH-14: the leaf hard-gate list in `references/lite-mode.md` names every gate in the amended `graduated-rigor-tiers.spec.md` invariant, and the invariant text names `lite`
- [ ] EV-1: `results/` holds ≥ 3 runs per arm plus the `main` baseline, and every release threshold in EV-1 is met or a reviewed threshold change is recorded in this spec
- [ ] EV-2: `reports/summary.json` includes `adev-quick` and `adev-lite` with score and wall-clock
- [ ] EV-3: the three `claude plugin eval` cases pass
- [ ] EV-4: the EV-1 `--dry-run` smoke test passes under `npm test`
- [ ] EV-5: `results/distribution.json` shows `lite` ≥ 45% and `full` ≤ 20% of tasks on this repository's corpus at release, computed by the shipped resolver
- [ ] SKILL.md size caps (`tests/skills/skill-size-cap.test.mjs`) and Load Skill Extensions coverage still pass
- [ ] All quality gates pass (`npm test`); no constitutional violations
