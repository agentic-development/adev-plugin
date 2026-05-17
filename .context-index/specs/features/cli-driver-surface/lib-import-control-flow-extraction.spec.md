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
status: implemented
risk_level: low
milestone: adev-compiler-discipline
revision: 2
charter-revision: 3
created: 2026-05-17
updated: 2026-05-17
source-manifest:
  sha: "96d4421"
  files:
    - .context-index/specs/features/cli-driver-surface/charter.md
    - skills/implement/SKILL.md
    - skills/plan/SKILL.md
    - tests/lib-import-control-flow-extraction.test.mjs
    - tests/skills/no-stale-format-refs.test.mjs
  computed-at: "2026-05-17T21:45:19.821Z"
---

## Current State

Two skill files embed fenced JavaScript blocks that go beyond "name the lib function this step wraps" — they contain agent-side decision logic that drives the next step. These blocks are NOT in violation of the inline-Node sweep spec (which targets executable `node -e` patterns), but they violate the constitutional rule clarified on 2026-05-17:

> Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive. If a fenced JavaScript block contains control-flow logic (branching, iteration, lookup that drives the next step), that logic belongs inside the CLI verb's implementation, not in skill prose.

Affected sites grouped by the three control-flow **categories** that the charter Capability Map row references. Each category has one canonical owner (the source SKILL.md where the block is authored) and may have mirror(s) in the other SKILL.md. Line ranges are approximate at spec-authoring time; Step 1 of the Migration Path captures the actual ranges per file before any edits:

**Category A — Task-selection lookup** (`Array.find` over `state.planTasks` predicate)
- Canonical owner: `skills/implement/SKILL.md` (lines ~108-123 — this is where the agent dispatches the next task)
- Mirror: `skills/plan/SKILL.md` (lines ~108-123 — same lookup duplicated; may be removable once implement owns the logic)

**Category B — Status-transition emissions** (four `reportPlanTask({...})` invocations for `in_progress` / `done` / `blocked` / `skipped`)
- Canonical owner: `skills/implement/SKILL.md` (lines ~129-151 — implement drives task transitions)
- Mirror: `skills/plan/SKILL.md` (lines ~129-151 — duplicate documentation; may be removable)

**Category C — Re-plan-detection conditional + pending-event emission** (`filterEvents` lookup + `for` loop over `plan.tasks`)
- Canonical owner: `skills/plan/SKILL.md` (lines ~681-701 — only `/adev:plan` seeds `pending` events)
- Mirror: none

Total: 3 categories × ~2 sites avg = ~5 file:line citations across two SKILL.md files. The "~3" framing in the charter Capability Map row refers to the three categories, not the file:line count.

These blocks are out of scope for the existing inline-node-extraction-sweep spec (which marks `implemented` and has an empty allowlist in `tests/skills-no-inline-node.test.mjs`). They are in scope here.

## Target State

For each affected site, the JavaScript block is replaced by:

1. A short prose description of what the step does (one or two sentences).
2. The corresponding `adev <verb>` invocation, with arguments expressed declaratively.
3. The control-flow logic moved into the CLI verb's implementation (`lib/cli/<verb>.mjs`) where it already lives or needs to be added.

The CLI surface this spec **expects to use** (pending Step 1 audit confirmation):

- Category A ("next task to dispatch" lookup) → `adev state current --spec <p>` which already returns `state.planTasks`.
- Category B (four transition calls) → `adev report --type plan-task --spec <p> --plan <p> --task-id <id> --status <s> [--notes <text>]`.
- Category C (re-plan detection + pending emission) → `adev state events --spec <p> --event plan_task` (read) + `adev report --type plan-task --status pending` (write, once per task).

**This list is the audit's expected outcome, not its premise.** If Step 1 (Audit) reveals a gap — e.g., `adev state events` does not yet support `--event` filtering — the affected sub-task either (a) blocks on adding the missing flag in a separate PR before this spec can land, or (b) accepts a wider verb output and filters in the caller. The Invariants section permits verb-argument additions; it forbids only the introduction of **new** verbs.

**Distinguishing acceptable agent-side lookup from a constitutional violation.** A one-line operator-cognitive lookup over a returned projection — e.g., "the agent picks the first pending task from the `planTasks` map" — is descriptive prose and is permitted under the constitution's fenced-JS rule, provided the lookup is *expressed in prose*, not in a fenced ```javascript block with `find`/`for`/`filter`. A control-flow violation is specifically *embedded executable-shape JS in skill prose* — code that a reader can run mentally as a step in the recipe.

The skill prose retains a one-line description per call site so a reviewer can understand the step's intent without reading the CLI source.

## Migration Path

Each site is migrated atomically: prose update + verb confirmation + verb-side logic move (if needed) in one PR. **Per-skill atomic discipline.** The parent sweep's per-step invariant is scoped to inline-Node blocks (per `constitution.md:67-68` and `inline-node-extraction-sweep.spec.md` Behavior 3) and is enforced by the pre-commit hook for those patterns. The same review-time discipline applies to this spec's descriptive-JS migration — a SKILL.md should never contain both the JS control-flow block AND the corresponding `adev <verb>` invocation for the same step at any point in tree — but the discipline is enforced by code review, not by the hook. Extending the hook to the descriptive-JS class is out of scope here; if desired, file a follow-up to `regression-prevention.spec.md`.

Step 1: **Audit existing CLI verb coverage.** For each of the three categories, confirm whether the embedded control-flow logic is already covered by an existing CLI verb (with the right argument surface) or whether a verb argument needs to be added. The audit captures its findings in a short note added to the implementation PR's commit message (or to a Capability Map cell on the charter), so reviewers can verify "no new verbs were silently introduced" at merge time. Audit hypotheses to confirm or refute:
- `adev state current` already returns the full projection; agent-side picking is acceptable as one-line prose.
- `adev report --type plan-task` already accepts all four status values (`in_progress`, `done`, `blocked`, `skipped`).
- `adev state events` exposes `filterEvents` per the inline-node-extraction-sweep research; verify whether it accepts an event-type filter equivalent to `e.event === 'plan_task'`. If not, add `--event <type>` as a one-line verb-argument extension in a separate PR before this spec lands.

Step 2: For each of the four sites, replace the JS block with a prose description and the CLI invocation. Preserve the surrounding step prose unchanged.

Step 3: Run `npm test` and confirm the inline-Node test (`tests/skills-no-inline-node.test.mjs`) still passes (this spec does not change its forbidden-pattern list).

Step 4: Update `skills/plan/SKILL.md` and `skills/implement/SKILL.md` source-manifest stamps via the drift hook (automatic).

## Invariants

- The inline-node-extraction-sweep test (`tests/skills-no-inline-node.test.mjs`) continues to pass throughout. This spec does NOT extend its forbidden-pattern regex.
- The lifecycle event schema is unchanged — the same `plan_task` events with the same fields are emitted, just via the CLI verb instead of via direct JavaScript imports in prose.
- PageRank-style invariants and other downstream contracts are unchanged.
- **No new CLI verbs.** Verb-argument additions (e.g., adding `--event` to `adev state events`) are permitted — they are part of finishing a verb's surface, not a new entry. New entries in `cli/index.mjs` are forbidden by this spec.

## Behavioral Contract

### Preconditions

- `inline-node-extraction-sweep.spec.md` is `status: implemented` (it is, as of 2026-05-15).
- The constitutional clarification "fenced JavaScript in SKILL.md must be descriptive-reference only" is in `.context-index/constitution.md` (added 2026-05-17).
- The CLI verbs `adev state current`, `adev state events`, `adev report --type plan-task` exist (they do, per inline-node-extraction-sweep PR 2 + 3 + 7).

### Behaviors

1. **When** the migration completes **then** the import-shape success signal `grep -nE "import \{ (currentState|reportPlanTask|filterEvents) \} from '<ADEV_ROOT>" skills/plan/SKILL.md skills/implement/SKILL.md` returns zero matches. **Choice of signal:** this regex is the *minimum* migration check — it catches the literal named-import shape for the three known control-flow imports. It does NOT catch renamed re-imports, default-import variants, or fenced JS that drops the `import` line but keeps `find`/`for`/`filter` bodies. Reviewers must additionally scan fenced ```javascript blocks for control-flow tokens during PR review; mechanical detection of control-flow shape inside fenced JS is explicitly out of scope here (track separately under `regression-prevention.spec.md` if desired).
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
| Migrate `skills/plan/SKILL.md` mirror sites (Category A + B duplicates) | Same pattern as implement; the audit said these mirrors exist. Migrate or remove duplication once implement owns the logic. | Small |
| Source-manifest re-stamp | Auto-emitted by the drift hook when the SKILL.md files change. No manual action. | Trivial |
| Update charter Capability Map | Update the existing "Lib-import control-flow extraction" row's `Status` column from `review-passed` (set by `/adev:review-specs`) to `implementing` at start, then `implemented` after migration completes. The row already exists in `charter.md` rev 3; do not add a new row. | Trivial |
| Capture audit findings in commit message | Step 1's audit (which CLI verbs already cover which categories; any verb-argument extensions needed) is recorded inline in the implementation PR's commit message. Reviewers verify "no new verbs were silently introduced." | Trivial |

## Acceptance Criteria

- [ ] `grep -nE "import \{ (currentState|reportPlanTask|filterEvents) \} from '<ADEV_ROOT>" skills/plan/SKILL.md skills/implement/SKILL.md` returns zero matches. (The `|` inside the alternation is the ERE OR operator, not a literal pipe.)
- [ ] The four sites enumerated in Current State are each replaced by prose + CLI invocation.
- [ ] `tests/skills-no-inline-node.test.mjs` continues to pass.
- [ ] `npm test` reports zero failures.
- [ ] No new CLI verbs introduced unless an existing one cannot express the case (audit-confirmed).
- [ ] Charter Capability Map's existing "Lib-import control-flow extraction" row has its `Status` column advanced to `implemented` after migration. (No new row is added; the row was created when this spec was filed.)
- [ ] Step 1 audit findings are captured in the implementation PR's commit message: which existing verbs covered each category; any `--<flag>` arguments added; explicit confirmation that no new CLI verbs were introduced.
