# Live Spec: Lib-Import Control-Flow Extraction

<!-- Live Spec within the cli-driver-surface charter.
     This is a focused follow-up to inline-node-extraction-sweep.spec.md.
     That spec removed EXECUTABLE inline-Node patterns (`node -e`, `Run inline Node:`,
     `--input-type=module -e`) and is implemented. This spec covers a different,
     narrower scope: DESCRIPTIVE fenced JavaScript blocks in skill prose that
     embed agent-side CONTROL-FLOW logic (branching, iteration, lookup) and
     should live inside the corresponding CLI verb's implementation instead. -->

---
charter: cli-driver-surface
kind: refactor
status: review-pending
risk_level: low
milestone: adev-compiler-discipline
revision: 1
charter-revision: 3
created: 2026-05-17
updated: 2026-05-17
---

## Current State

Two skill files embed fenced JavaScript blocks that go beyond "name the lib function this step wraps" — they contain agent-side decision logic that drives the next step. These blocks are NOT in violation of the inline-Node sweep spec (which targets executable `node -e` patterns), but they violate the constitutional rule clarified on 2026-05-17:

> Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive. If a fenced JavaScript block contains control-flow logic (branching, iteration, lookup that drives the next step), that logic belongs inside the CLI verb's implementation, not in skill prose.

Affected sites (this is the full scope of this spec):

1. **`skills/plan/SKILL.md:108-123`** — embeds `state.planTasks[t.id]?.status === 'pending' || …` lookup logic in a `Array.find` to pick the next task. The agent is implicitly being asked to evaluate the predicate.
2. **`skills/plan/SKILL.md:129-151`** — four separate `reportPlanTask({...})` invocations with different status values (in_progress / done / blocked / skipped) and per-status notes guidance embedded as JavaScript object literals.
3. **`skills/plan/SKILL.md:681-701`** — `filterEvents` lookup driving a `console.warn` conditional ("Re-plan detected") plus a `for` loop over `plan.tasks` to emit `pending` events.
4. **`skills/implement/SKILL.md`** mirrors `skills/plan/SKILL.md:108-123` (task-selection lookup) and `:129-151` (status-transition emissions).

These blocks are out of scope for the existing inline-node-extraction-sweep spec (which marks `implemented` and has an empty allowlist in `tests/skills-no-inline-node.test.mjs`). They are in scope here.

## Target State

For each affected site, the JavaScript block is replaced by:

1. A short prose description of what the step does (one or two sentences).
2. The corresponding `adev <verb>` invocation, with arguments expressed declaratively.
3. The control-flow logic moved into the CLI verb's implementation (`lib/cli/<verb>.mjs`) where it already lives or needs to be added.

No new CLI verbs are introduced unless an existing one cannot express the case. For each call site:

- The "next task to dispatch" lookup → covered by `adev state current --spec <p>` which already returns `state.planTasks` (caller picks pending/in_progress/missing tasks in the verb's dispatch logic, not in skill prose).
- The four `reportPlanTask` transition calls → already covered by `adev report --type plan-task --spec <p> --plan <p> --task-id <id> --status <s> [--notes <text>]`.
- The re-plan-detection conditional → covered by `adev state events --spec <p> --event plan_task` (caller checks for non-empty result and prints the advisory in the verb).
- The `for` loop emitting pending events → covered by the existing `adev report --type plan-task --status pending` call invoked once per task.

The skill prose retains a one-line description per call site so a reviewer can understand the step's intent without reading the CLI source.

## Migration Path

Each site is migrated atomically: prose update + verb confirmation + verb-side logic move (if needed) in one PR. Per-skill atomic invariant from the parent sweep spec applies — a SKILL.md never contains both the JavaScript block AND the corresponding `adev <verb>` invocation for the same step.

Step 1: Audit each CLI verb's current implementation to confirm whether the embedded control-flow logic is already present in the verb or needs to be added. Likely findings:
- `adev state current` already returns the full projection; caller-side filtering is the agent's job (acceptable as one-line prose).
- `adev report --type plan-task` already accepts all four status values.
- `adev state events --filter` (or equivalent) already exists per the inline-node-extraction-sweep research.

Step 2: For each of the four sites, replace the JS block with a prose description and the CLI invocation. Preserve the surrounding step prose unchanged.

Step 3: Run `npm test` and confirm the inline-Node test (`tests/skills-no-inline-node.test.mjs`) still passes (this spec does not change its forbidden-pattern list).

Step 4: Update `skills/plan/SKILL.md` and `skills/implement/SKILL.md` source-manifest stamps via the drift hook (automatic).

## Invariants

- The inline-node-extraction-sweep test (`tests/skills-no-inline-node.test.mjs`) continues to pass throughout. This spec does NOT extend its forbidden-pattern regex.
- The lifecycle event schema is unchanged — the same `plan_task` events with the same fields are emitted, just via the CLI verb instead of via direct JavaScript imports in prose.
- PageRank-style invariants and other downstream contracts are unchanged.
- No new CLI verbs are introduced unless an existing one cannot express the case (after Step 1 audit).

## Behavioral Contract

### Preconditions

- `inline-node-extraction-sweep.spec.md` is `status: implemented` (it is, as of 2026-05-15).
- The constitutional clarification "fenced JavaScript in SKILL.md must be descriptive-reference only" is in `.context-index/constitution.md` (added 2026-05-17).
- The CLI verbs `adev state current`, `adev state events`, `adev report --type plan-task` exist (they do, per inline-node-extraction-sweep PR 2 + 3 + 7).

### Behaviors

1. **When** the migration completes **then** `grep -nE "import \{ (currentState|reportPlanTask|filterEvents) \} from '<ADEV_ROOT>" skills/plan/SKILL.md skills/implement/SKILL.md` returns zero matches.
2. **When** an operator reads `skills/plan/SKILL.md` Step 7 (Execution Handoff) **then** they see a prose description of the re-plan-detection and pending-event emission, followed by the corresponding `adev <verb>` invocations — not a fenced `javascript` code block with `filterEvents` and `for` loops.
3. **When** an operator reads `skills/implement/SKILL.md` Task Discovery section **then** they see prose describing how the verb selects the next pending task, followed by the `adev state current` invocation — not a fenced `javascript` block with `Array.find(...)`.
4. **When** the four `reportPlanTask` transition snippets in implement/SKILL.md are migrated **then** each is replaced by a one-line description plus the corresponding `adev report --type plan-task --status <s>` invocation.

### Postconditions

- `skills/plan/SKILL.md` and `skills/implement/SKILL.md` source manifests are re-stamped to reflect the new content.
- No new CLI verbs introduced unless required.
- All quality gates pass.

### Error Cases

| Condition | Expected Behavior |
|---|---|
| A migration replaces a JS block but a needed CLI verb argument is missing | Add the argument to the verb (separate PR) and re-stamp; do not invent a hard-coded fallback in skill prose |
| A migration loses information present in the JS block (e.g., the comment explaining cap-of-one rule) | Preserve that information as inline prose, not as a JS comment in a fenced block |
| An operator re-introduces a JS control-flow block to a migrated SKILL.md | Caught by manual review; the constitutional rule is the contract. Optionally, a future test could grep for `find\|for\s*\(\|filter\|reduce` inside fenced `javascript` in SKILL.md — out of scope for this spec |

## System Constitution Reference

- **Principle 2 ("Skills are primarily markdown — companion code is allowed but must not be required for the skill to function"):** This refactor moves embedded control-flow OUT of skill prose and INTO the CLI verb. The verb is the canonical companion code; the skill prose is descriptive.
- **Anti-Pattern (added 2026-05-17): "Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive":** This spec is the migration path that brings the affected sites into compliance with the new rule.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Audit existing CLI verb coverage | Confirm `adev state current`, `adev state events`, `adev report --type plan-task` all support the cases the JS blocks express. Document any gaps. | Small |
| Migrate `skills/plan/SKILL.md` re-plan-detection + pending-event emission (lines 681-701) | Replace fenced JS block with prose + `adev state events` + `adev report --type plan-task` invocations. | Small |
| Migrate `skills/implement/SKILL.md` task-selection lookup (lines 108-123) | Replace `Array.find` JS block with prose + `adev state current` invocation. | Small |
| Migrate `skills/implement/SKILL.md` four status-transition snippets (lines 129-151) | Replace each `reportPlanTask({...})` JS block with the corresponding `adev report --type plan-task` invocation. | Small |
| Migrate `skills/plan/SKILL.md` mirror sites (108-123, 129-151) if present | Same pattern as implement; confirm whether plan has the same blocks (audit said yes) and migrate. | Small |
| Source-manifest re-stamp | Auto-emitted by the drift hook when the SKILL.md files change. No manual action. | Trivial |
| Update charter Capability Map | Add a new row "Lib-import control-flow extraction" with `Status: implemented` after the migration completes. | Trivial |

## Acceptance Criteria

- [ ] `grep -nE "import \{ (currentState\|reportPlanTask\|filterEvents) \} from '<ADEV_ROOT>" skills/plan/SKILL.md skills/implement/SKILL.md` returns zero matches.
- [ ] The four sites enumerated in Current State are each replaced by prose + CLI invocation.
- [ ] `tests/skills-no-inline-node.test.mjs` continues to pass.
- [ ] `npm test` reports zero failures.
- [ ] No new CLI verbs introduced unless an existing one cannot express the case (audit-confirmed).
- [ ] Charter Capability Map carries a new row reflecting this spec, status set to `implemented` after migration.
