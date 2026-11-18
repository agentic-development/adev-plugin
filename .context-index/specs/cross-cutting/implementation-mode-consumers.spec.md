---
partial_schema: spec@1
mode: cross-cutting
affects: [planning, implementation, assessment, strategic-planning, setup]
kind: behavioral
status: draft
risk_level: medium
revision: 2
charter-revision: 2
created: 2026-11-17
updated: 2026-11-18
tracker-ref: adev-plugin-8u2a
depends-on:
  - .context-index/specs/cross-cutting/mode-resolution-core.spec.md
  - .context-index/specs/features/test-strategies/test-depth-policy.spec.md
---

# Implementation Mode: Consumers

Charter: `.context-index/specs/cross-cutting/implementation-mode/charter.md`

## Behavioral Contract

`mode-resolution-core.spec.md` shipped the setting: `/adev:init` writes `implementation_mode`,
and `adev implementation-mode resolve` maps it to `{dispatch_red, ordering_enforced,
coverage_check}`. Nothing consumed it. `/adev:plan` wrote every task as
RED → GREEN, its reviewer rejected any task without a test-first step, and `/adev:implement`
inlined `tdd-mandate.md` into every implementer prompt. A project that chose `agent-default`
(listed first in `/adev:init`'s menu) or `test-required` got strict TDD on every task.

This spec makes the consuming skills read the resolved mode.

## Preconditions

- `adev implementation-mode resolve` prints `{ mode, config, source }` for the project
  (`source: default` and `mode: tdd` when the manifest has no `implementation_mode`).

## Behaviors

1. **When** `/adev:plan` loads context **then** it resolves the mode once with
   `adev implementation-mode resolve`, records it in the plan header as
   `> **Implementation mode:** <mode>`, and writes every task with that mode's step list:
   - `tdd`: Write failing test → Verify test fails → Implement → Verify test passes → Commit.
   - `test-required`: Implement → Write or extend tests covering the change → Verify tests pass → Commit.
   - `agent-default`: Implement → Verify (run the relevant tests; add tests where judgment says
     they are needed) → Commit.
   Under `agent-default` the `**Tests:**` field is optional; under the other two it stays required.
2. **When** the plan reviewer checks test structure **then** it checks the step list of the mode
   recorded in the plan header. It never requires a test-first step outside `tdd`.
3. **When** `/adev:implement` loads context **then** it resolves the mode once with
   `adev implementation-mode resolve` and uses that value for every task in the run.
4. **When** `/adev:implement` composes an implementer prompt **then** its test-discipline section
   is chosen by mode: `tdd-mandate.md` under `tdd`, `test-required-mandate.md` under
   `test-required`, `agent-default-mandate.md` under `agent-default`. `test-integrity.md` is
   included under **every** mode (charter: Guardrail integrity). It governs how tests that exist
   or are written may be changed, not whether or when tests are written.
5. **When** the plan's recorded mode differs from the resolved mode, or the plan has no recorded
   mode (plans authored before this spec were written as TDD) **then** the implementer prompt says
   that the resolved mode's discipline supersedes the task's step order.
6. **When** the mode is `tdd` or `test-required` **then** implement resolves test depth per task
   and runs `assert-assigned` after the implementer reports (`test-depth-policy.spec.md` Behaviors
   12-14). **When** the mode is `agent-default` **then** neither verb runs and the prompt carries
   no `## Test Depth` section. This is the trade-off the charter names: the sensitive-path floor
   does not fire under `agent-default`, which `/adev:init` warns about at selection time.
7. **When** Stage 2 (code quality) or the synthesized reviewer reviews a task **then** it receives
   the resolved mode and applies the matching test criterion from `code-quality-checklist.md`:
   test-first evidence under `tdd`; tests exist that cover the change under `test-required`
   (the `coverage_check: post-hoc` row, raised as an Important finding when missing); and under
   `agent-default`, only that any added or changed tests are meaningful.
8. **When** `/adev:status` reports a spec **then** it shows the resolved mode, and under
   `agent-default` it notes that a zero test-depth assignment count is expected.
9. **When** a task is routed `assisted-agent` **then** `/adev:implement` holds one human
   checkpoint, placed by mode: under `tdd`, after the implementer has written the failing tests
   and before any production code; under `test-required` and `agent-default`, which have no
   tests-before-code point, after the implementer reports and before visual verification and
   review. `/adev:route` describes the same placement.

## Postconditions

- No consuming skill describes TDD as unconditional.
- `config.dispatch_red`, `ordering_enforced` and `coverage_check` each have a consumer:
  the mandate selection (Behavior 4) and the review criterion (Behavior 7).

## Deviation from the charter

The charter has `test-required` dispatch `/adev:write-test` after GREEN. `/adev:implement` does
not dispatch write-test in any mode, so this spec does the post-hoc coverage check in Stage 2
review instead (Behavior 7) and adds no new dispatch path. A post-hoc write-test dispatch remains
possible as follow-up work.

## Error Cases

| Condition | Behavior | Code |
|---|---|---|
| `implementation_mode` holds an unknown value | `adev implementation-mode resolve` fails; plan and implement stop and report it | `UNKNOWN_IMPLEMENTATION_MODE` (from the resolver) |
| `adev implementation-mode resolve` cannot run | Fall back to `tdd` and say so in the run output | — |

## Acceptance Criteria

- [ ] Plan resolves the mode, records it in the header, and has a step list per mode (Behavior 1).
- [ ] The plan reviewer's test criterion is mode-conditional (Behavior 2).
- [ ] Implement resolves the mode once and selects the mandate file by mode; `test-integrity.md`
      is included in every mode (Behaviors 3-4).
- [ ] The supersede note is given when plan and resolved modes differ (Behavior 5).
- [ ] Test depth is resolved and asserted only outside `agent-default` (Behavior 6).
- [ ] Reviewers receive the mode; the checklist's test criterion is per mode (Behavior 7).
- [ ] `/adev:status` shows the mode (Behavior 8).
- [ ] The `assisted-agent` checkpoint is placed per mode in implement Step 2a and in route (Behavior 9).
- [ ] `npm test` passes.
