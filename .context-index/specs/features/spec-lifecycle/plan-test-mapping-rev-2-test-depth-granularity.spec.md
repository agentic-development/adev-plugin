---
charter: spec-lifecycle
kind: behavioral
status: review-pending
risk_level: medium
revision: 1
charter-revision: 1
amends: .context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md
target-revision: 2
created: 2026-08-13
updated: 2026-08-13
---

# Amendment: Live Spec: Plan-Test Mapping (targeting rev 2)

> This spec **amends** `.context-index/specs/features/spec-lifecycle/plan-test-mapping.spec.md` targeting revision 2.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

`test-depth-policy.spec.md` (Behavior 18) introduces test-depth granularity
settings other than `per-task` (e.g. `per-behavior`, `per-file`, `per-spec`),
under which multiple plan tasks share a single test suite path. Behavior 3 of
this base spec assumes a 1:1 mapping between a plan task and its referenced
test file — it counts task completion by checking whether the referenced test
file *exists on disk*. Under shared-suite granularity that check is
meaningless: N tasks pointing at the same suite path all read as "file
exists" the moment any one of them is implemented, so the counting rule
silently over-reports completion. This amendment records the supersession
without mutating the immutable, `validated` base spec.

## Behavioral Delta

**Behavior 3 of the base spec is superseded outright, for all granularities:**

- The shipped implementation (`skills/status/SKILL.md`, Mode `--spec`, step
  8) does **not** branch on resolved test-depth granularity. It
  unconditionally runs `adev state current --spec <path>` and counts task
  completion from the `planTasks` / `testDepthAssignments` projections —
  i.e. from **plan-task lifecycle events** (`plan_task` and
  `test_depth_assigned`, folded with "most recent assignment per
  plan+task_id wins"), per Behavior 18 of `test-depth-policy.spec.md`. The
  skill's own rationale, quoted verbatim: *"This counts lifecycle events
  rather than filesystem presence, since under any granularity other than
  `per-task`, multiple tasks can share one suite path and a raw
  file-existence probe no longer maps 1:1 to per-task completion."*

- This means Behavior 3's file-existence counting rule is **fully
  superseded**, not conditionally retained for `per-task`. Event-based
  counting is a strict superset capability: under `per-task` granularity
  each task still maps to exactly one suite, so counting from the
  `plan_task`/`test_depth_assigned` event trail remains behaviorally
  correct there too (it degenerates to the same 1:1 result Behavior 3's
  file-existence check would have produced). There is no scenario where the
  shipped event-based rule is wrong where the old file-existence rule was
  right, so no branch is needed and none was implemented.

- Behaviors 1, 2, 4, 5, and 6 of the base spec, and its Postconditions and
  Error Cases, are **unaffected** by this amendment except where they too
  are file-existence checks on the same referenced suite path. Behavior 4
  ("unverifiable" when a task has no `tests:` field) is unaffected — it does
  not depend on file existence. Behavior 5 ("test missing" when the
  referenced file does not exist) is, like Behavior 3, superseded outright
  by the same unconditional event-based counting rule, for the same reason.

**Effective rule going forward:** `/adev:status` counts task completion
uniformly from plan-task lifecycle events (`plan_task` /
`test_depth_assigned`, folded via `adev state current --spec <path>`'s
`testDepthAssignments` projection) regardless of the spec's resolved
test-depth granularity. There is no file-existence branch for `per-task`;
base Behavior 3's file-existence rule is superseded for all granularities.

## Acceptance Criteria

- [x] The condition under which Behavior 3's file-existence counting remains
      valid (`per-task` granularity) is stated explicitly.
- [x] The condition under which Behavior 3 is superseded (any non-`per-task`
      granularity) is stated explicitly, with the replacement rule
      (plan-task lifecycle-event counting) named and cross-referenced to
      `test-depth-policy.spec.md` Behavior 18.
- [x] The base spec `plan-test-mapping.spec.md` is not mutated by this
      amendment.
- [x] `/adev:status`'s implementation counts task completion uniformly from
      plan-task lifecycle events (`plan_task` / `test_depth_assigned` via
      the `testDepthAssignments` projection) regardless of resolved
      granularity — no file-existence branch — per
      `skills/status/SKILL.md` Mode `--spec` step 8 (implementation work
      shipped under `test-depth-policy.spec.md`, not this amendment
      artifact).
