<!-- partial_schema: spec@1 -->

---
charter: implementation
kind: skill
status: review-pending
risk_level: high
milestone:
revision: 1
charter-revision: 1
created: 2026-08-17
updated: 2026-08-17
research-ref: .context-index/research/tdd-cycle-graduation-design-analysis.md
depends-on:
  - .context-index/specs/features/implementation/review-provenance.spec.md
  - .context-index/specs/features/implementation/batched-task-dispatch.spec.md
relates-to: .context-index/specs/cross-cutting/graduated-rigor-tiers.spec.md
source-manifest:
  files:
    - lib/governance/rigor-mode.mjs
    - lib/implement/review-depth.mjs
    - lib/manifest.mjs
    - skills/implement/SKILL.md
    - skills/implement/synthesized-reviewer-prompt.md
    - skills/build/SKILL.md
    - templates/risk-policies-template.yaml
drift_detected: true
---

# Skill Spec: Graduated Review Depth in /adev:implement

<!-- Skill Spec within the implementation charter.
     Parent Charter: .context-index/specs/features/implementation/charter.md
     Source research: .context-index/research/tdd-cycle-graduation-design-analysis.md
     (Recommendations 3b, 4, 5, 6a). -->

<!-- SCOPE NOTE. The parent charter's Skills section already names "2-stage review"
     as a documented behavior of adev:implement, so graduating that review's depth
     modifies an in-charter behavior rather than extending charter scope. No
     `charter-extension: true` is set. The charter carries no Capability Map table
     (it is still an /adev:init draft), so no capability row is flipped to
     `specified` by this spec — recorded because /adev:specify Step 5 would
     normally perform that update.

     THIS SPEC SHIPS LAST OF THREE, and the ordering is a safety property rather
     than a convenience:
       1. review-provenance.spec.md    — makes review-round yield observable
       2. batched-task-dispatch.spec.md — cuts dispatch cost with every review intact
       3. this spec                     — thins the review layer itself
     Batching and review collapse are both dispatch reductions, and stacking them
     blind is the real hazard: five tasks at (1 implementer + 2 reviewers) is 15
     dispatches, which becomes 6 under collapse alone and 2 under both. Batching
     goes first because it never touches the defect-catching layer, so quality
     stays observable while cost falls. This spec touches exactly that layer, so
     it goes last, after provenance can show what changed. -->

<!-- MEASUREMENT HONESTY. The source research performed no yield measurement:
     research finding F-I9 established that no artifact this framework writes
     records how many review cycles a task consumed or what each cycle found, so
     "which rounds actually find things" is unanswerable from stored data today.
     Six research claims are tagged [NEEDS-YIELD].

     Consequently NO threshold in this spec is justified by unmeasured yield. The
     graduation trigger is set to the tightest predicate the routing schema can
     express, not to a value chosen to hit a cost target, and widening it is
     explicitly deferred until review-provenance.spec.md has produced a corpus.
     A spec that thinned review on the strength of an unmeasured guess would be
     the precise failure mode the originating issue warned about: succeeding at
     lower cost while silently losing catches. -->

## Invocation Modes

`/adev:implement` gains no new required flags. Review depth is resolved per
task, automatically, from artifacts that already exist on disk
(`<plan-stem>.routing.json`, the spec's `risk_level`, and
`.context-index/governance/risk-policies.yaml`).

### Existing behavior, unchanged under `full`

Under `full` — the default, and the outcome whenever any input is missing,
unusable, or contested — Step 2f (Stage 1: Spec Compliance) and Step 2g
(Stage 2: Code Quality) dispatch as two sequential fresh subagents exactly as
they do today. This spec adds no check and removes no check from the `full`
path.

### `quick`: one reviewer, both lenses

Under `quick`, Steps 2f and 2g **collapse into a single dispatch** carrying
**both** lenses. The synthesized reviewer receives the union of both stages'
inputs — task requirements, the implementer's report, the acceptance criteria
from the Live Spec, **and** the git diff, the constitution's Coding Standards,
any `DONE_WITH_CONCERNS` notes, and the secondary specialist matches — and
answers both stages' questions: Stage 1's missing-requirements / extra-work /
misunderstandings triad *and* every item in `code-quality-checklist.md`.

It remains a fresh subagent, still instructed to verify by reading code rather
than trusting the report, and still required to tag Critical/Important findings
with stable `cq-<n>` ids reused across cycles, so `lib/loop-convergence.mjs`
keeps working unchanged.

**`quick` never means skip.** This mirrors the invariant
`graduated-rigor-tiers.spec.md` already establishes for `/adev:review-specs` and
`/adev:validate`: the check set is preserved verbatim; only the dispatch count
changes, from two subagents to one. Dropping a stage is out of scope and would
be unsound for a specific reason — research finding F-I7 found that neither
stage's checks are uniquely covered anywhere (Stage 1 has an analogue in
`/adev:validate` Check 2, Stage 2's constitution half in Check 4). A dropped
stage therefore does not remove a check, it silently **defers** it to
`/adev:validate` at whole-spec scope, after a bad task-1 foundation has already
compounded through every later task. Deferral is rework cost wearing the costume
of a saving.

### One structural gap this collapse must not inherit

Stage 2 requires stable finding ids and runs them through
`evaluateStopCondition`; Stage 1 has only a bare "maximum 3 review cycles, then
escalate" with no id tracking and no convergence check. So Stage 1 can loop
three times on drifting findings today and nothing detects it.

The synthesized reviewer applies the id-tagging discipline and the convergence
check to **both** lenses. Collapsing the stages therefore closes that gap rather
than propagating it, and this is a coverage *increase* under `quick` — worth
stating because it partially offsets the dispatch reduction and is testable.

### `--tier` propagation

`/adev:implement` accepts `--tier full|quick`, matching the axis `/adev:route`,
`/adev:work`, and `/adev:build` already propagate to the other gate skills.
`/adev:build` passes its resolved `--tier` through to its `/adev:implement`
dispatch.

An explicit `--tier quick` is **not** absolute: it loses to the floor pass
(Output Contract E). This diverges deliberately from `resolveRigorMode()`'s
existing precedence, where `tierOverride` wins over everything, and is called
out so review reads it as intent rather than drift. The reasoning: the floor
legs are the cases where thinning review is least defensible, and
`resolveTestDepth()` — the in-repo precedent this spec ports — applies its floor
last and unconditionally for that reason. The escape hatch for a floored task is
to change a reviewable artifact (the spec's `risk_level`, or `boundaries.yaml`),
not to pass a flag that leaves no trace in any reviewed file.

## Arguments

| Argument | Required | Description |
|---|---|---|
| `--tier full\|quick` | No | Operator override for review depth across the run. Absent → resolved per task by the precedence chain in Output Contract A. Loses to the floor pass. Invalid values are rejected by the existing `isValidTier()` with `INVALID_TIER` — no new validator. |
| `--review-cycles <n>` | No | Per-run override of `implement.max_review_cycles`. Non-negative integer. |

| Surface | Location | Default | Validation |
|---|---|---|---|
| `implement_mode: full \| quick` | `.context-index/governance/risk-policies.yaml`, per risk level | `full` for `high` and `medium`, `quick` for `low` — mirroring the `review_mode` / `validate_mode` rows already in `templates/risk-policies-template.yaml` | Existing `isValidTier()`. An out-of-enumeration value resolves to `full` rather than throwing, matching how `resolveRigorMode()` already treats a malformed policy value |
| `implement.max_review_cycles` | `.context-index/manifest.yaml` | `3` — preserving today's hardcoded cap exactly | New `validateMaxReviewCycles()` in `lib/manifest.mjs`, a structural copy of the existing `validateMaxReviewRetries()`, throwing `INVALID_MAX_REVIEW_CYCLES` on non-integer / non-finite / negative |

## Output Contract

### A. Depth resolution

Resolved once per task, at dispatch time, in `lib/implement/review-depth.mjs`
(new; wraps existing helpers rather than reimplementing them).

Precedence, **lowest** to **highest** — every later stage may only make review
*deeper*, never shallower:

1. **Policy baseline** — `implement_mode` for the spec's `risk_level`, read via
   the existing `loadRigorPolicies()`. Absent file, absent key, or malformed
   value → `full`.
2. **Operator override** — `--tier`, when supplied.
3. **Quick-grant predicate** — a task may be granted `quick` only by
   affirmatively matching every row of (B). Anything else keeps the value from
   stages 1–2.
4. **Floor pass** — forces `full`, unconditionally, overriding stages 1–3.

The asymmetry is the safety property: stage 3 *grants* `quick` and must match
affirmatively to do so, while stage 4 *revokes* it and needs a single leg to
hold. Every failure mode — unreadable sidecar, unparseable expression,
out-of-range score, missing frontmatter — therefore lands on `full`.

### B. The quick-grant predicate

A task is granted `quick` only when **all** of the following hold:

| Condition | Source | Rationale |
|---|---|---|
| `selected_agent == "auto-agent"` | `.routing.json` | Necessary, nowhere near sufficient |
| All four dimensions `== 1.0` | `.routing.json` `scores` | Every dimension scored 5/5 by `/adev:route`: fully specified, fully pattern-covered, minimal blast radius, zero novelty |
| No governance boundary crossed | `boundaries.yaml` for the task's target paths | Same input the depth floor already consumes |
| Additive-only file changes | task's declared target files | A task that only adds files cannot regress an existing caller |

**The predicate is deliberately far tighter than `/adev:route`'s "easy" signal,
and MUST NOT reuse it.** Research finding F-I10 measured that predicate at
**69% of 373 routing entries** repo-wide (277 of 385 task entries routed
`auto-agent`, ~72%). As a first cut into review depth on the framework's most
load-bearing skill that is unacceptably wide. Requiring all four dimensions at
`1.0` is the tightest conjunction the sidecar schema can express. Widening it is
a follow-up gated on `review-provenance.spec.md`'s data, not a judgment call
available at implementation time.

Scale and direction are pinned by `/adev:route`: sidecar dimensions are `0..1`
fractions produced by dividing the Step-2 integer `1..5` by 5, and **higher means
more agent-suitable** (low novelty and low blast radius both score *high*). A
predicate written against the wrong direction would invert the whole mechanism,
so (D) validates before comparing.

**Consequently `resolveRigorMode()`'s existing `routingEasy === true → "quick"`
short-circuit MUST NOT apply when `skill === "implement"`.** That leg sits above
policy in the current precedence and would otherwise hand `quick` to exactly the
69% this predicate exists to exclude. Its behavior for `review-specs` and
`validate` is unchanged.

### C. Key derivation must become explicit

`resolveRigorMode()` currently derives its policy key as
`skill === "validate" ? "validate_mode" : "review_mode"`. Passing
`skill: "implement"` through it **today silently resolves against `review_mode`**
— inheriting `/adev:review-specs`' tier for an unrelated gate, with no error.
This spec replaces the ternary with an explicit map:

| `skill` | Policy key |
|---|---|
| `"validate"` | `validate_mode` |
| `"implement"` | `implement_mode` |
| anything else | `review_mode` (unchanged) |

An unrecognized `skill` keeps today's `review_mode` fallback, so no existing
caller changes behavior.

### D. Score-scale validation (fail-closed)

Before any dimension is compared, each of the four scores is validated as a
finite number within `0..1` inclusive.

`adev route emit-sidecar` already rejects out-of-range values with
`INVALID_ROUTING_ENTRY`, yet research finding F-I10 found a sidecar on disk
carrying un-normalized `1..5` scores — so upstream validation cannot be assumed.
On such a sidecar an unvalidated `== 1.0` comparison merely never matches, which
is fail-safe *for this predicate*; but the same scores feed threshold rules where
a `<=` comparison would match everything, which is a fail-open. Validation is
therefore specified at the read boundary, once, for every consumer of this
module:

- Any score outside `0..1`, non-finite, or non-numeric → the task resolves
  `full`, and a `ROUTING_SCORE_OUT_OF_RANGE` advisory names the task, the
  dimension, and the offending value.
- Scores are **never coerced or rescaled**. Silently dividing a `1..5` score by 5
  would paper over a corrupt artifact that `/adev:route` should be made to
  rewrite.

Expression evaluation reuses the pinned `when:` grammar from
`lib/test-strategies/depth.mjs` (one comparator followed by a `0..1` float,
evaluated by regex and comparison — never `eval` or `new Function`). That
evaluator returns `false` on an unparseable expression, which composes correctly
here: a parse failure fails to *grant* `quick`, leaving `full`.

### E. Floor legs

The floor pass ports `resolveFloor()` from `lib/test-strategies/depth.mjs`
verbatim in structure — applied last, in every resolution path, escalating only —
with its three legs preserved and one added:

| Leg | Condition |
|---|---|
| `risk-level` | Spec frontmatter `risk_level: high` |
| `boundary` | The task crosses a governance boundary |
| `sensitive-path` | A target path matches the effective sensitive-path set (leg skipped when the target-path set is empty, matching the existing degraded mode) |
| `critical-finding` | **New.** Any cycle on this task has produced a Critical finding |

The `critical-finding` leg implements the originating issue's own proposed rule —
a task that produced a Critical finding earns another round — as an explicit
floor leg rather than a special case. Once it holds it holds for the remainder of
the task: a task that has demonstrated it can produce a Critical finding does not
get a thinner reviewer for its fix.

Whenever any leg holds, a `REVIEW_DEPTH_FLOOR_APPLIED` advisory names the legs,
emitted **whether or not the floor changed the resolved value** — exactly as
`DEPTH_FLOOR_APPLIED` already does — so a run that was never eligible for `quick`
is distinguishable from one floored back to `full`. A graduated run must be
auditable, never invisible.

### F. Cycle cap becomes configurable

The hardcoded "Maximum 3 review cycles per task" in Steps 2f and 2g is replaced
by `implement.max_review_cycles` (default `3`, so shipped behavior is unchanged).
`lib/loop-convergence.mjs` already consumes the remaining-cycle count and is
unchanged; only the source of the number moves, from a literal in SKILL.md prose
to the manifest. `skills/implement/SKILL.md` names this exact follow-up today.

Under `quick` the cap applies to the single synthesized loop rather than to two
separate loops, so worst-case reviewer dispatches per task fall from `2 × cap` to
`1 × cap`.

### G. Provenance and batching interaction

A task reviewed by the synthesized reviewer records that fact on its **single
task commit** — commit granularity is one commit per task, authored after review
passes, so there is no separate per-fix commit — via
a `Review-round: synthesized=<cycles>` trailer and a `review_round` event whose
`stage` is `synthesized`, per `review-provenance.spec.md`, which enumerates
that value ahead of this spec precisely so collapsed rounds are never conflated
with full ones in later analysis.

Depth resolution is **per task** and therefore orthogonal to batching: within a
batch, each task resolves its own depth, and a batch may mix `full` and `quick`
tasks. Batching does not relax any floor leg, and no group-level review is
dispatched under either tier — that remains out of scope per
`batched-task-dispatch.spec.md`.

## Failure Modes

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| `risk-policies.yaml` absent or unreadable | `loadRigorPolicies()` returns null; every task resolves `full`. | None needed — this is the safe default. |
| `implement_mode` holds a value outside `full \| quick` | Resolves `full`; advisory names the offending value. Consistent with `resolveRigorMode()`'s existing treatment of malformed policy values. | Fix `risk-policies.yaml`. |
| `--tier` holds an invalid value | Existing `InvalidTierError` / `INVALID_TIER`; the run stops. | Pass `full` or `quick`. |
| Routing sidecar missing | Unchanged: `ROUTING_SIDECAR_MISSING`, the skill stops, no fallback. | Run `/adev:route --plan <path>`, re-invoke. |
| A dimension score is out of range, non-finite, or non-numeric | Task resolves `full`; `ROUTING_SCORE_OUT_OF_RANGE` names task, dimension, value. Never coerced. | Re-run `/adev:route` to rewrite the sidecar. |
| Spec frontmatter has no `risk_level` | Treated as `medium` by the existing `RISK_LEVELS` fallback in `resolveRigorMode()`, whose default `implement_mode` is `full`. | Optionally declare `risk_level`. |
| Target-path set is empty (sensitive-path leg not evaluable) | That leg is skipped, matching `resolveFloor()`'s existing degraded mode; the other legs still evaluate. | None. Degraded-mode parity with test depth is intentional. |
| A Critical finding appears mid-task on a `quick` task | The `critical-finding` floor leg holds from that point; subsequent cycles run at `full`. Advisory names the leg. | None — this is the designed escalation. |
| `implement.max_review_cycles` non-integer, non-finite, or negative | `INVALID_MAX_REVIEW_CYCLES` from `loadManifest()`; the run stops. | Fix the manifest. |
| A `quick` task's synthesized review does not converge | Identical to today's Stage 2 handling: `LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED`, task not complete, `plan_task` `blocked` emitted, execution state `blocked`. | Fix findings and re-run, or `/adev:recover`. |

## System Constitution Reference

- **Requires Human Approval (constitution, Architecture Boundaries)** — Applies, and is why this spec ships last and behind two others. Thinning the review layer of `/adev:implement` is not covered by the "Autonomous (Agent May Decide)" list. The mechanism is authorized as designed here — collapse rather than cut, floors preserved, trigger at the tightest expressible predicate — and any *widening* of the quick-grant predicate is a separate decision requiring yield data from `review-provenance.spec.md`.
- **Principle 1 (Minimize external dependencies)** — Applies. Everything reuses `lib/governance/rigor-mode.mjs`, the ported structure of `lib/test-strategies/depth.mjs`, `lib/loop-convergence.mjs`, and Node built-ins. No new dependency.
- **Principle 2 (Skills are primarily markdown) and the cli-driver-surface rules** — Applies. Depth resolution lives in `lib/implement/review-depth.mjs` behind a named surface, not in SKILL.md prose; the synthesized reviewer's prompt is a companion file (`skills/implement/synthesized-reviewer-prompt.md`), following the precedent of `review-specs`' `quick-synthesized-reviewer-prompt.md`.
- **Autonomous — "Updating specs/ADRs when code changes affect their assumptions"** — Applies. This spec revises a standing research recommendation (below) rather than leaving it silently contradicted.

**Reconciliation note.** Prior research in this repo
(`review-validation-restructuring.md`, research finding F-I14) explicitly
concluded *"Keep existing 2-stage subagent review in /adev:implement."* This spec
narrows that conclusion rather than reversing it: that artifact predates the
`graduated-rigor-tiers` collapse pattern, and this spec changes the **dispatch
count**, not the **check set** — both lenses survive in the synthesized prompt and
the `full` path is untouched. Recorded explicitly so the divergence is reviewable
instead of appearing as unacknowledged drift.

**Dependency note.** `graduated-rigor-tiers.spec.md`, which introduced
`resolveRigorMode()` and the `full | quick` vocabulary this spec extends, is
itself still `status: review-pending`. If its review changes the tier semantics,
Output Contract A and C must be revised to match before implementation.

## Acceptance Criteria

- [ ] Under `full`, dispatch is byte-identical to today: two sequential reviewers, same inputs, same checks.
- [ ] Under `quick`, exactly one reviewer is dispatched, and its prompt contains both Stage 1's questions and every item of `code-quality-checklist.md`.
- [ ] The synthesized reviewer applies `cq-<n>` id tagging and `evaluateStopCondition` convergence to findings from **both** lenses; a test asserts a spec-compliance finding is id-tracked across cycles (the Stage 1 gap this collapse closes).
- [ ] A task failing any single row of the quick-grant predicate resolves `full`; a test covers each row independently.
- [ ] `routingEasy === true` does **not** yield `quick` when `skill === "implement"`, and a regression test asserts `review-specs` and `validate` still honour it.
- [ ] `resolveRigorMode({skill: "implement"})` resolves against `implement_mode`, never `review_mode`; a test asserts the explicit key map across all three branches.
- [ ] Out-of-range, non-finite, and non-numeric scores each resolve `full` with `ROUTING_SCORE_OUT_OF_RANGE`, and a test asserts no coercion or rescaling occurs.
- [ ] Each floor leg independently forces `full`, including over an explicit `--tier quick`; a test covers all four legs.
- [ ] `REVIEW_DEPTH_FLOOR_APPLIED` is emitted whenever a leg holds, including when the resolved value was already `full`.
- [ ] The `critical-finding` leg persists for the remainder of a task once triggered.
- [ ] `implement.max_review_cycles` defaults to `3`, validates per the Arguments table, and governs both the `full` stages and the `quick` synthesized loop.
- [ ] A task reviewed by the synthesized reviewer records the `synthesized` stage in both provenance channels defined by `review-provenance.spec.md` — the `Review-round:` trailer and the `review_round` event — and `findings` is populated for it, since the synthesized reviewer applies id tagging across both lenses.
- [ ] Depth resolves per task inside a batch; a test asserts a batch containing both a `full` and a `quick` task dispatches accordingly.
- [ ] No threshold in the shipped implementation is wider than this spec states; widening requires a new revision citing provenance data.
- [ ] All quality gates pass; no constitutional violations introduced.
