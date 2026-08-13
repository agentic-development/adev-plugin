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

**Behavior 3 of the base spec is superseded, conditionally:**

- **For projects/specs using `per-task` granularity** (the default, and the
  only granularity the base spec's Behavior 3 was originally written
  against), Behavior 3 is **unaffected and remains valid as written**. Under
  `per-task` granularity, each plan task maps to exactly one dedicated test
  suite, so "does the referenced test file exist" is still a sound proxy for
  task completion.

- **For any project/spec using a granularity other than `per-task`**
  (`per-behavior`, `per-file`, `per-spec`, or any future non-per-task value
  defined by `test-depth-policy.spec.md`), Behavior 3's file-existence
  counting rule is **superseded**. Because multiple tasks share one suite
  path, file existence cannot distinguish "task N is done" from "task N is
  merely sharing a suite that some other task in the group already
  completed." `/adev:status` MUST instead count task completion from
  **plan-task lifecycle events** (the `test_depth_assigned` /
  per-task-completion event trail emitted during `/adev:implement`), per
  Behavior 18 of `test-depth-policy.spec.md`. Event-based counting attributes
  completion to the specific task whose lifecycle recorded it, independent of
  how many sibling tasks share the same physical suite file.

- Behaviors 1, 2, 4, 5, and 6 of the base spec, and its Postconditions and
  Error Cases, are **unaffected** by this amendment. Behavior 4
  ("unverifiable" when a task has no `tests:` field) and Behavior 5 ("test
  missing" when the referenced file does not exist) continue to apply as
  written under `per-task` granularity; under non-`per-task` granularity they
  are likewise superseded by event-based counting for the same reason as
  Behavior 3, since they are file-existence checks on the same referenced
  suite path.

**Effective rule going forward:** `/adev:status` selects its task-completion
counting strategy based on the resolved test-depth granularity for the spec
under query — file-existence counting (base Behavior 3) when granularity is
`per-task`; plan-task lifecycle-event counting (`test-depth-policy.spec.md`
Behavior 18) otherwise.

## Acceptance Criteria

- [x] The condition under which Behavior 3's file-existence counting remains
      valid (`per-task` granularity) is stated explicitly.
- [x] The condition under which Behavior 3 is superseded (any non-`per-task`
      granularity) is stated explicitly, with the replacement rule
      (plan-task lifecycle-event counting) named and cross-referenced to
      `test-depth-policy.spec.md` Behavior 18.
- [x] The base spec `plan-test-mapping.spec.md` is not mutated by this
      amendment.
- [ ] `/adev:status`'s implementation branches on resolved granularity to
      select file-existence vs. event-based counting (tracked as
      implementation work under `test-depth-policy.spec.md`, not this
      amendment artifact).
