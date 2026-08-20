<!-- partial_schema: plan@1 -->

# Implementation Plan: Review-Round Provenance

> **Methodology:** adev
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Spec:** .context-index/specs/features/implementation/review-provenance.spec.md (revision 4)
> **Review:** PASS_WITH_NOTES (2026-08-18) — 0 blockers, 11 warnings, 4 suggestions after three prior BLOCK rounds
> **Platform:** Node.js (ESM, `.mjs`), zero external dependencies, `node:test`

**Goal:** Record how many review cycles each plan task consumed, per review stage, on two independent channels — a validated `Review-round: <stage>=<cycles>` git trailer on the task's single commit, and a new canonical `review_round` lifecycle event folded into the projection under `reviewRounds`.

**Architecture:** The event side follows the four-step canonical-variant registration process that `lib/diagnostics/event-schemas.mjs` states in its own header (line 18): amend `lifecycle-event-log.spec.md`, extend `CANONICAL_EVENTS` in `lib/lifecycle-events.mjs`, extend `REQUIRED_FIELDS_BY_EVENT` in `lib/diagnostics/event-schemas.mjs`, add producer-test fixtures. This is the same shape `partial_recovery` used (`incremental-artifact-writes.spec.md` Integration Point 6), so `plan_task`'s closed payload is untouched. Two new helpers land in `lib/lifecycle-state.mjs` next to `reportPartialRecovery`: `reportReviewRound()` (write-time validation against a closed key allow-list and closed stage enum, mirroring `validateGateOutcomes()` / `GATE_OUTCOME_KEYS`) and `buildReviewRoundTrailer()` (the sole producer of the trailer line, which **rejects** rather than escapes — `escapeField` normalizes CR/LF instead of refusing, so it is not the mechanism here). The projection gains a `reviewRounds` map keyed `${plan}::${task_id}::${stage}` with last-wins, mirroring `testDepthAssignments`, so the variant never lands in the deprecated `unknownEvents[]`. Scope is strictly record-only per Output Contract D: no threshold, cap, dispatch count, or review behavior changes.

**Review notes carried forward (acknowledged, not fixed by this plan):**
- Tasks that never reach step 2h (blocked or abandoned) produce no provenance at all. Acknowledged design-coverage gap; the contract stays determinate because absence means "not recorded", never "zero".
- The scope is deliberately record-only. Any task that would alter a review threshold, cap, or dispatch count is out of scope and must be refused.
- The spec on disk is one text-pass newer than its `.review.md` (five reviewer-named fixes were applied after the review was written). This plan is authored against the spec on disk, which is authoritative.

**Charter note:** `.context-index/specs/features/implementation/charter.md` is an `/adev:init`-generated draft with no Capability Map table. Tasks trace to the charter's **Key Behaviors** and **Key Files** instead; there is no `Status` column to flip at Step 7.

---

## File Structure

**Create:**
- `tests/specs/review-provenance-amendments.test.mjs` — asserts the two cross-spec amendments landed
- `tests/lifecycle/review-round-event.test.mjs` — `reportReviewRound()` validation + `reviewRounds` projection fold
- `tests/lifecycle/review-round-trailer.test.mjs` — `buildReviewRoundTrailer()` rejection contract
- `tests/cli/report-review-round.test.mjs` — `adev report --type review-round` surface + documented-enum parity
- `tests/skills/implement-review-provenance.test.mjs` — SKILL.md step 2h prose + no-behavior-change guard

**Modify:**
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md:93-119` (Acceptance Criteria — legal projection keys) and `:128-169` (Behaviors — per-variant fold rule)
- `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md:42-46` (Naming Conventions / no-invented-fields clause)
- `lib/lifecycle-events.mjs:36-79` — `CANONICAL_EVENTS` gains `'review_round'`
- `lib/diagnostics/event-schemas.mjs:68-90` (cross-reference block) and `:92-198` (`REQUIRED_FIELDS_BY_EVENT`)
- `lib/lifecycle-state.mjs:1487-1500` (StateProjection typedef), `:1508-1530` (`emptyProjection`), `:1216-1246` (new stage/key consts + the two new helpers, beside `reportPartialRecovery`), `:1808-1818` (fold `switch` — new `case 'review_round'` next to `test_depth_assigned`)
- `lib/cli/report.mjs:72` (`USAGE`), `:180-190` (arg parsing), `:214` (missing-`--type` message), `:352-460` (type dispatch + `:458` unknown-`--type` message), `:570` and `:630-654` (help text)
- `docs/cli-reference.md:306` — `report --type` enum gains a seventh value
- `skills/implement/SKILL.md:618-635` — step 2h item 4 names the two artifacts
- `tests/diagnostics/event-schemas.test.mjs` — producer fixtures for the new variant
- `tests/diagnostics/tier1/event-schema-valid.test.mjs` — producer fixtures for the new variant

**Reference (read, do not modify):**
- `lib/lifecycle-state.mjs:953-1010` — `GATE_OUTCOME_KEYS` / `validateGateOutcomes()`, the closed-allow-list pattern `reportReviewRound()` must mirror
- `lib/lifecycle-state.mjs:1218-1290` — `PARTIAL_RECOVERY_ACTIONS` / `reportPartialRecovery()`, the one-helper-per-variant precedent
- `lib/lifecycle-state.mjs:1808-1818` — the `test_depth_assigned` fold case, the closest precedent for a keyed last-wins projection field
- `lib/issues/render-markdown.mjs:55-160` — `FIELD_CAPS` and `escapeField()`; read to confirm it **normalizes** (does not reject), hence is not the trailer mechanism
- `.context-index/governance/diagnostics.yaml:27-32` — the existing `adev/event-schema-valid` entry, which must gain **no** sibling
- `.context-index/governance/boundaries.yaml` — all rules are `severity: warning`; none match the files above

---

## Context Packets

### Task 1 Context
- Spec: `review-provenance.spec.md` (Output Contract B — "Declared cross-spec amendments" table and the fold-rule/projection-field table)
- Charter: `implementation/charter.md` (Key Behaviors — recovery records feed `/adev:retro`)
- Amendment targets, full read: `agent-reliable-state-artifacts/lifecycle-event-log.spec.md`, `agent-reliable-state-artifacts/plan-task-events.spec.md`
- Precedent, read the `partial_recovery` rows only: `lifecycle-event-log.spec.md` Behaviors + Acceptance Criteria; `incremental-artifact-writes.spec.md` Integration Point 6
- Sibling test for shape: `tests/specs/plan-task-events-con8.test.mjs`
- Constitution: Principle 2 (skills are markdown), "Updating specs/ADRs when code changes affect their assumptions" (required, not optional)

### Task 2 Context
- Spec: `review-provenance.spec.md` (Output Contract B — four-step table, the `adev/event-schema-valid` self-poisoning paragraph)
- Source files, full read: `lib/lifecycle-events.mjs`, `lib/diagnostics/event-schemas.mjs`
- Source files, signatures only: `tests/diagnostics/event-schemas.test.mjs`, `tests/diagnostics/tier1/event-schema-valid.test.mjs`
- Read for the "no new entry" assertions: `.context-index/governance/diagnostics.yaml`, `lib/lifecycle-state.mjs:394-410` (`TIER1_WRITE_TIME_RUNNERS`)
- ADR: ADR-0009 (lifecycle event schema), decision + rationale only. Precedent comments for `spec_amended` / `test_depth_assigned` carry `[BOUNDARY: human-approved]`; match that convention.

### Task 3 Context
- Spec: `review-provenance.spec.md` (Output Contract B — "Write-time validation guard"; Failure Modes rows for forged key / out-of-enum stage / `cycles < 1` / `findings < 0` / `findings` on `spec-compliance`)
- Source file, full read: `lib/lifecycle-state.mjs:940-1010` and `:1180-1300`
- Pattern to mirror: `validateGateOutcomes()` + `GATE_OUTCOME_KEYS`; helper shape from `reportPartialRecovery()`
- Sample: `tests/lifecycle/gate-outcomes.test.mjs` — the closest existing test shape for a closed-allow-list guard
- Constitution: Principle 1 (Node built-ins only), error handling via thrown `EVENT_SCHEMA_INVALID`

### Task 4 Context
- Spec: `review-provenance.spec.md` (Output Contract B — fold-rule/projection-field table; the `unknownEvents[]` deprecation paragraph)
- Source file: `lib/lifecycle-state.mjs:1480-1535` (typedef + `emptyProjection`), `:1793-1835` (fold `switch`)
- Pattern to mirror: `case 'test_depth_assigned'` and `testDepthAssignments`
- Cross-cutting: `lifecycle-event-log.spec.md` Acceptance Criteria — camelCase-only projection keys (CON-2)

### Task 5 Context
- Spec: `review-provenance.spec.md` (Output Contract A in full — the trailer shape, the "validated helper" bullet list, the CWE-93/113/150 rationale; Failure Modes rows for CR/LF, control/ANSI, over-cap)
- Source file: `lib/lifecycle-state.mjs:33` (the existing `escapeField` / `FIELD_CAPS` import), plus the stage enum introduced in Task 3
- Reference: `lib/issues/render-markdown.mjs:55-66` (`FIELD_CAPS`) and `:132-160` (`escapeField` — normalizes, does not reject; reuse is explicitly non-contractual)
- Constitution: "Commit Trailers" section — the existing `Spec:` / `Plan-task:` trailer mechanism this extends

### Task 6 Context
- Spec: `review-provenance.spec.md` (Arguments table — the full verb signature including `--spec`; Failure Modes row "passed a malformed value")
- Source file, full read: `lib/cli/report.mjs`
- Pattern to mirror: the `--type plan-task` block (`lib/cli/report.mjs:352-420`) and the `--gate-outcomes is only valid with --type validator` flag-scoping guard at `:221-232`
- Sample: `tests/cli/report.test.mjs`, `tests/cli/report-gate-outcomes.test.mjs`

### Task 7 Context
- Spec: `review-provenance.spec.md` (Output Contract B — the `docs/cli-reference.md` paragraph)
- Source file: `docs/cli-reference.md:300-330`
- Sample: `tests/docs/test-depth-policy-docs.test.mjs` — the existing shape for a doc-vs-code parity check
- Constitution / CLAUDE.md: `docs/cli-reference.md` is the designated reference agents consult for CLI signatures

### Task 8 Context
- Spec: `review-provenance.spec.md` (Output Contract A "The trailer is constructed by a validated helper"; Output Contract D; Acceptance Criteria rows for step 2h and for unchanged dispatch counts)
- Source file, full read: `skills/implement/SKILL.md:550-640` (steps 2f, 2g, 2h)
- Sample: `tests/skills/implement.test.mjs`, `tests/skills/step-failed-emission.test.mjs`
- Constitution: Anti-Patterns — no inline Node in SKILL.md, no executable logic in SKILL.md; fenced JS is descriptive-reference only

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from `~/.claude/projects/` (`message.usage` fields). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observation

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns).
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost.
- **Evidence:** 1 observation

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.
- **Anti-pattern:** Assume shorter output means lower quality artifacts. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observation

---

## Parallelization

- **Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5.** All five touch the shared registration/emitter surface (`lib/lifecycle-events.mjs`, `lib/diagnostics/event-schemas.mjs`, `lib/lifecycle-state.mjs`) or the spec authority the rest depend on. Task 3, Task 4 and Task 5 all edit `lib/lifecycle-state.mjs`, so they cannot be split.
- **Group B (sequential, may start once Task 3 has landed): Task 6 → Task 7.** Touches `lib/cli/report.mjs` and `docs/cli-reference.md` — no file overlap with Task 4 or Task 5.
- **Group C (single task, requires Task 5 and Task 6): Task 8.** Touches `skills/implement/SKILL.md` only.

Group B can run concurrently with Tasks 4-5 once Task 3 is committed. Group C cannot start until both Group A and Group B are complete, because its assertions name the two helpers and the CLI verb.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Cross-spec amendments (registration step 1) | medium | unit | — | 1 create, 2 modify |
| 2 | Register `review_round` (registration steps 2-4) | medium | unit | Task 1 | 0 create, 4 modify |
| 3 | `reportReviewRound()` write-time guard | large | unit | Task 2 | 1 create, 1 modify |
| 4 | `reviewRounds` projection fold | medium | unit | Task 2, Task 3 | 0 create, 1 modify |
| 5 | `buildReviewRoundTrailer()` | large | unit | Task 3 | 1 create, 1 modify |
| 6 | `adev report --type review-round` | medium | unit | Task 3 | 1 create, 1 modify |
| 7 | `docs/cli-reference.md` enum parity | small | unit | Task 6 | 0 create, 2 modify |
| 8 | `skills/implement/SKILL.md` step 2h | medium | unit | Task 5, Task 6 | 1 create, 1 modify |

**Granularity:** `per-behavior` (source: manifest — `.context-index/manifest.yaml::test_policy.granularity`). Suites map to spec behaviors, not to tasks: Output Contract A → `tests/lifecycle/review-round-trailer.test.mjs`; Output Contract B registration → the two existing diagnostics suites; Output Contract B emitter + projection → `tests/lifecycle/review-round-event.test.mjs` (Task 3 creates, Task 4 extends); Output Contract B CLI + docs → `tests/cli/report-review-round.test.mjs` (Task 6 creates, Task 7 extends); cross-spec amendments → `tests/specs/review-provenance-amendments.test.mjs`; Output Contract D + step 2h → `tests/skills/implement-review-provenance.test.mjs`.

**Strategy:** every task resolves to `unit` (source: fallback — the spec declares no `test_strategy`, and `.context-index/manifest.yaml` declares no `test_strategies` globs). The Strategy Summary and Test Infrastructure Requirements sections are therefore omitted: no non-unit strategy and no `infra_requirements:` in the spec frontmatter.

**Specialist routing:** `.context-index/manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`.

**Boundary check:** every rule in `.context-index/governance/boundaries.yaml` ships at `severity: warning`, and none of the four live rules (`no-commonjs`, `no-inline-node-in-skills`, `no-hardcoded-claude-home`, `no-manual-version-bump` — disabled) matches the planned edits. No blockers, no cross-boundary operations.

**Constitution check:** no new dependencies, all files `.mjs` ESM, no version-manifest edits, no hook-protocol change, no CLI installation-path change, no new skill in the lifecycle order. Adding a discriminator to `CANONICAL_EVENTS` touches the lifecycle event schema governed by ADR-0009; the spec's System Constitution Reference resolves this as autonomous, and the review verdict is PASS_WITH_NOTES, so Task 2 follows the established precedent of stamping the addition `[BOUNDARY: human-approved]` in-source with the review verdict cited (exactly as `spec_amended` and `test_depth_assigned` already do) rather than blocking.

---

## Tasks

> Per-task `- [ ]` checkboxes are authoring guides for human reviewers. They are never flipped by skills — authoritative task state lives in the spec's lifecycle log as `plan_task` events, read via `currentState(projectRoot, specPath).planTasks`.

### Task 1: Cross-spec amendments — registration step 1 [specialist: none]

**Charter capability:** Key Behaviors — "Recovery records feed into `/adev:retro` for trend analysis" (this spec extends the same trace-to-lifecycle-artifact mechanism to review rounds).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/specs/review-provenance-amendments.test.mjs`
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md:93-119` (Acceptance Criteria) and `:128-169` (Behaviors)
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md:42-46`

**Tests:** create `tests/specs/review-provenance-amendments.test.mjs`

**Context to load:**
- `review-provenance.spec.md` Output Contract B — the "Declared cross-spec amendments" table and the fold-rule/projection-field table
- `lifecycle-event-log.spec.md` — the two `partial_recovery` rows (one Behavior, one Acceptance Criterion) as the exact precedent to mirror
- `tests/specs/plan-task-events-con8.test.mjs` — follow this file's shape for a spec-text assertion suite

**Why this is first:** `lib/diagnostics/event-schemas.mjs`'s header designates `lifecycle-event-log.spec.md` as the spec-level authority that wins on divergence, and its four-step process puts the spec amendment at step 1. Registering in code before the spec says so inverts the declared authority.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const EVENT_LOG_SPEC =
  '.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md';
const PLAN_TASK_SPEC =
  '.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md';

test('lifecycle-event-log.spec.md registers review_round in Behaviors with its fold rule', () => {
  const body = read(EVENT_LOG_SPEC);
  const behaviors = body.slice(body.indexOf('## Behaviors'), body.indexOf('## Postconditions'));
  assert.match(behaviors, /review_round/, 'Behaviors must register the review_round variant');
  assert.match(behaviors, /reviewRounds/, 'Behaviors must name the reviewRounds projection field');
  assert.match(behaviors, /task_id[^\n]*stage/, 'Behaviors must state the (plan, task_id, stage) fold key');
  assert.match(behaviors, /last[- ]wins/i, 'Behaviors must state the last-wins collision rule');
  assert.match(behaviors, /unknownEvents/, 'Behaviors must state review_round does NOT land in unknownEvents[]');
});

test('lifecycle-event-log.spec.md Acceptance Criteria enumerates reviewRounds as a legal projection key', () => {
  const body = read(EVENT_LOG_SPEC);
  const ac = body.slice(body.indexOf('## Acceptance Criteria'), body.indexOf('## Preconditions'));
  assert.match(ac, /reviewRounds/, 'the camelCase projection-key criterion must list reviewRounds');
  assert.match(ac, /review_round/, 'Acceptance Criteria must name the review_round variant');
  assert.match(ac, /reportReviewRound/, 'the exported-function criterion must list reportReviewRound');
});

test('plan-task-events.spec.md records that review metadata is carried by review_round', () => {
  const body = read(PLAN_TASK_SPEC);
  assert.match(body, /review_round/, 'the spec must name the review_round variant');
  assert.match(body, /review-provenance\.spec\.md/, 'the spec must cite the follow-up spec that discharges its new-variant clause');
  // Regression guard: the plan_task payload itself stays closed at four fields.
  assert.match(
    body,
    /`plan_task` events carry `plan`[^\n]*`task_id`[^\n]*`status`[^\n]*`notes`/,
    'plan_task payload description must be unchanged',
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/specs/review-provenance-amendments.test.mjs`
Expected: FAIL — neither amendment target mentions `review_round` or `reviewRounds` yet.

- [ ] **Implement**

In `lifecycle-event-log.spec.md`, add one row to `## Behaviors` immediately after the `reportPartialRecovery` bullet, extend the camelCase-projection-keys Acceptance Criterion, extend the exported-function list in the first Acceptance Criterion, and add one new criterion. Both halves that spec owns must land:

```markdown
- **When** a plan task's review stages complete **then** the actor MUST call
  `reportReviewRound(projectRoot, specPath, { plan, task_id, stage, cycles, findings? })`.
  The helper appends a `review_round` event. `stage` is validated against the closed enum
  `{spec-compliance, code-quality, synthesized}`; `cycles` must satisfy
  `Number.isInteger(cycles) && cycles >= 1`; `findings` is optional, must be `>= 0`, and is
  REJECTED for `spec-compliance` (step 2f mandates no stable finding-id convention, so
  "distinct findings" is undefined there). The fold surfaces these events under a new
  projection field `reviewRounds`, a map keyed `` `${plan}::${task_id}::${stage}` `` where the
  fold is **last-wins**: the last event for a key wins — mirroring `testDepthAssignments`.
  `review_round` is NOT folded
  into `unknownEvents[]`. `status` and `currentStep` are unchanged by the fold: provenance is
  observability, not a lifecycle position. Cross-spec contract with
  `.context-index/specs/features/implementation/review-provenance.spec.md`, which defines the
  two-channel provenance design; this spec owns the payload shape and projection field.
```

```markdown
- [ ] `reportReviewRound(projectRoot, specPath, args)` exists with the documented signature and validates against a closed key allow-list (`plan`, `task_id`, `stage`, `cycles`, `findings`) and the closed stage enum, throwing `EVENT_SCHEMA_INVALID` otherwise. The fold surfaces `review_round` events under `reviewRounds` keyed `plan::task_id::stage` with last-wins (NOT under `unknownEvents[]`). Cross-spec contract with `review-provenance.spec.md`.
```

In `plan-task-events.spec.md`, extend the no-invented-fields paragraph (line ~46) so the clause is visibly discharged:

```markdown
Implementers must not invent new fields. If a future skill needs to carry extra metadata, it
goes on `notes` … or, if structured, becomes a new event variant in a follow-up spec. **That
clause is discharged for per-stage review metadata by
`.context-index/specs/features/implementation/review-provenance.spec.md`, which adds the
`review_round` variant (`plan`, `task_id`, `stage`, `cycles`, `findings?`) rather than widening
this one. The `plan_task` payload above is unchanged.**
```

- [ ] **Verify test passes**

Run: `node --test tests/specs/review-provenance-amendments.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/implementation/review-provenance`

Stage the two amended specs plus the new test file, then commit with subject
`feat(implementation): amend event-log and plan-task specs for review_round`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 1
```

---

### Task 2: Register `review_round` — registration steps 2, 3, and 4 [specialist: none]

**Charter capability:** Key Files — `skills/implement/SKILL.md`'s existing "record review cycles needed" instruction needs a schema to land in.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-events.mjs:36-79` — `CANONICAL_EVENTS`
- Modify: `lib/diagnostics/event-schemas.mjs:68-90` (cross-reference block) and `:92-198` (`REQUIRED_FIELDS_BY_EVENT`)
- Modify: `tests/diagnostics/event-schemas.test.mjs` — producer fixtures
- Modify: `tests/diagnostics/tier1/event-schema-valid.test.mjs` — producer fixtures

**Tests:** extend `tests/diagnostics/event-schemas.test.mjs` and `tests/diagnostics/tier1/event-schema-valid.test.mjs`

**Depends on:** Task 1

**Context to load:**
- `review-provenance.spec.md` Output Contract B — the four-step table and the paragraph explaining that step 3 without step 2 self-poisons the log (`adev/event-schema-valid` fires "unknown event type" at severity `error`; under `event_diagnostics: strict`, `appendEvent` throws before the write)
- `lib/lifecycle-events.mjs:36-79` and `lib/diagnostics/event-schemas.mjs` in full
- ADR-0009 decision + rationale

**Boundary note:** adding a `CANONICAL_EVENTS` discriminator touches the lifecycle event schema governed by ADR-0009. Follow the in-source precedent set by `spec_amended` and `test_depth_assigned`: stamp the addition `[BOUNDARY: human-approved]` and cite this spec's PASS_WITH_NOTES review verdict in the comment. Do **not** add an entry to `.context-index/governance/diagnostics.yaml` and do **not** add a runner to `TIER1_WRITE_TIME_RUNNERS` — the spec forbids both and the tests below assert their absence.

- [ ] **Write failing test**

```javascript
// tests/diagnostics/event-schemas.test.mjs — append
test('review_round is a known event type', () => {
  assert.equal(isKnownEventType('review_round'), true);
});

test('review_round requires event, ts, plan, task_id, stage, cycles', () => {
  const fields = getRequiredFields('review_round');
  assert.deepEqual([...fields], ['event', 'ts', 'plan', 'task_id', 'stage', 'cycles']);
  assert.ok(!fields.includes('findings'), 'findings is optional, never required');
});

test('registering review_round adds no diagnostics.yaml entry and no write-time runner', () => {
  const yaml = readFileSync(join(ROOT, '.context-index/governance/diagnostics.yaml'), 'utf8');
  assert.ok(!/review[-_]round/.test(yaml), 'diagnostics.yaml must gain no review-round entry');
  const state = readFileSync(join(ROOT, 'lib/lifecycle-state.mjs'), 'utf8');
  const start = state.indexOf('const TIER1_WRITE_TIME_RUNNERS');
  const block = state.slice(start, state.indexOf('}', start) + 1);
  assert.ok(!/review[-_]round/.test(block), 'TIER1_WRITE_TIME_RUNNERS must gain no runner');
});
```

```javascript
// tests/diagnostics/tier1/event-schema-valid.test.mjs — append (producer fixtures, step 4)
test('event-schema-valid accepts a well-formed review_round event', async () => {
  const findings = await runEventSchemaValid([
    { event: 'review_round', ts: NOW, plan: 'p.plan.md', task_id: 't1',
      stage: 'code-quality', cycles: 2, findings: 1 },
  ]);
  assert.deepEqual(findings, [], 'no diagnostic of any severity');
});

test('event-schema-valid flags a review_round event missing cycles', async () => {
  const findings = await runEventSchemaValid([
    { event: 'review_round', ts: NOW, plan: 'p.plan.md', task_id: 't1', stage: 'code-quality' },
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /cycles/);
});

test('event-schema-valid no longer reports review_round as an unknown event type', async () => {
  const findings = await runEventSchemaValid([
    { event: 'review_round', ts: NOW, plan: 'p.plan.md', task_id: 't1',
      stage: 'spec-compliance', cycles: 1 },
  ]);
  assert.ok(!findings.some((f) => /unknown event type/i.test(f.message)));
});
```

> Adapt the fixture helper names (`runEventSchemaValid`, `NOW`, `ROOT`) to whatever each existing suite already uses — do not introduce a second harness.

- [ ] **Verify test fails**

Run: `node --test tests/diagnostics/event-schemas.test.mjs tests/diagnostics/tier1/event-schema-valid.test.mjs`
Expected: FAIL — `isKnownEventType('review_round')` is `false`, `getRequiredFields('review_round')` is `undefined`, and the tier-1 producer reports "unknown event type".

- [ ] **Implement**

```javascript
// lib/lifecycle-events.mjs — inside CANONICAL_EVENTS, after 'test_depth_assigned'
  // review_round — emitted by `reportReviewRound()` in lib/lifecycle-state.mjs (sole writer),
  // one event per review stage per plan task, at task completion. Payload carries plan,
  // task_id, stage, cycles, findings?. Folded to `reviewRounds` keyed
  // `${plan}::${task_id}::${stage}`, last-wins. Carries no verdict and no lifecycle position.
  // [BOUNDARY: human-approved] Adding a canonical event touches the lifecycle event schema
  // governed by ADR-0009; confirmed intentional by review (PASS_WITH_NOTES, revision 4).
  // See .context-index/specs/features/implementation/review-provenance.spec.md Output Contract B.
  'review_round',
```

```javascript
// lib/diagnostics/event-schemas.mjs — inside REQUIRED_FIELDS_BY_EVENT
  // review_round — emitted by reportReviewRound (lib/lifecycle-state.mjs). `findings` is
  // optional and is REJECTED for the spec-compliance stage (no stable finding-id convention
  // at step 2f). See review-provenance.spec.md Output Contract B.
  // [BOUNDARY: human-approved] — governed by ADR-0009.
  review_round: Object.freeze([
    ...UNIVERSAL_REQUIRED, 'plan', 'task_id', 'stage', 'cycles',
  ]),
```

Also add `review_round → reportReviewRound (lib/lifecycle-state.mjs)` to the cross-reference list in the module docblock (the block at lines 68-90 that names each variant's code authority by function name, never by line number).

- [ ] **Verify test passes**

Run: `node --test tests/diagnostics/event-schemas.test.mjs tests/diagnostics/tier1/event-schema-valid.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage the two lib files and the two extended test suites, then commit with subject
`feat(lifecycle): register review_round as a canonical event variant`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 2
```

---

### Task 3: `reportReviewRound()` with a write-time validation guard [specialist: none]

**Charter capability:** Key Behaviors — per-task observability written to `.context-index/` alongside context packets.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lifecycle/review-round-event.test.mjs`
- Modify: `lib/lifecycle-state.mjs:1216` — insert the new closed-set consts + `reportReviewRound()` immediately **before** `reportPartialRecovery`'s docblock (that docblock starts at `:1223`, its consts at `:1218-1221`, its function at `:1248`). Do not split the existing docblock.

**Tests:** create `tests/lifecycle/review-round-event.test.mjs`

**Depends on:** Task 2

**Context to load:**
- `review-provenance.spec.md` Output Contract B "Write-time validation guard" plus the five Failure Modes rows for the event channel
- `lib/lifecycle-state.mjs:940-1010` (`GATE_OUTCOME_KEYS` / `validateGateOutcomes()`) — the closed-allow-list pattern to mirror
- `lib/lifecycle-state.mjs:1218-1290` (`PARTIAL_RECOVERY_ACTIONS` / `reportPartialRecovery()`) — the one-helper-per-variant shape
- `tests/lifecycle/gate-outcomes.test.mjs` — the existing test shape for a closed-allow-list guard

**Design note:** validation lives in the **lib**, not in `lib/cli/report.mjs`, so a forged or misspelled field cannot reach the append-only log via *any* caller — a test, a future skill, or a later CLI surface. Failing the write is deliberate and differs from the trailer channel: the log is append-only, so a malformed event is permanent, while a malformed trailer is amendable.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportReviewRound, readEvents } from '../../lib/lifecycle-state.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const SPEC = '.context-index/specs/features/demo/thing.spec.md';

function project() {
  const root = createTempDir();
  writeFixture(root, '.context-index/manifest.yaml', 'domain: software\n');
  writeFixture(root, SPEC, '---\ncharter: demo\n---\n# Thing\n');
  return root;
}

test('reportReviewRound writes a well-formed review_round event', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 2, findings: 1,
    });
    const events = readEvents(root, SPEC);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'review_round');
    assert.equal(events[0].stage, 'code-quality');
    assert.equal(events[0].cycles, 2);
    assert.equal(events[0].findings, 1);
    assert.ok(typeof events[0].ts === 'string' && events[0].ts.length > 0);
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound records cycles=1 for a first-pass stage (positive encoding)', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'spec-compliance', cycles: 1,
    });
    const [ev] = readEvents(root, SPEC);
    assert.equal(ev.cycles, 1, 'first-pass is =1, never absence');
    assert.ok(!('findings' in ev), 'findings is omitted, not null, for spec-compliance');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound accepts findings for code-quality and synthesized only', () => {
  const root = project();
  try {
    for (const stage of ['code-quality', 'synthesized']) {
      reportReviewRound(root, SPEC, {
        plan: 'demo.plan.md', task_id: 't1', stage, cycles: 1, findings: 0,
      });
    }
    assert.equal(readEvents(root, SPEC).length, 2);
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound rejects findings for spec-compliance (2f has no stable id convention)', () => {
  const root = project();
  try {
    assert.throws(
      () => reportReviewRound(root, SPEC, {
        plan: 'demo.plan.md', task_id: 't1', stage: 'spec-compliance', cycles: 1, findings: 2,
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID' && /findings/.test(err.message)
        && /spec-compliance/.test(err.message),
    );
    assert.equal(readEvents(root, SPEC).length, 0, 'nothing written on refusal');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound rejects a forged key, an out-of-enum stage, cycles<1 and findings<0', () => {
  const root = project();
  const base = { plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 };
  const bad = [
    [{ ...base, verdict: 'PASS' }, /verdict/],
    [{ ...base, stage: 'sanity-check' }, /stage/],
    [{ ...base, stage: 'Code-Quality' }, /stage/],
    [{ ...base, cycles: 0 }, /cycles/],
    [{ ...base, cycles: -1 }, /cycles/],
    [{ ...base, cycles: 1.5 }, /cycles/],
    [{ ...base, cycles: '2' }, /cycles/],
    [{ ...base, cycles: Number.NaN }, /cycles/],
    [{ ...base, cycles: Number.POSITIVE_INFINITY }, /cycles/],
    [{ ...base, findings: -1 }, /findings/],
    [{ ...base, plan: '' }, /plan/],
    [{ ...base, task_id: '' }, /task_id/],
  ];
  try {
    for (const [args, pattern] of bad) {
      assert.throws(
        () => reportReviewRound(root, SPEC, args),
        (err) => err.code === 'EVENT_SCHEMA_INVALID' && pattern.test(err.message),
        `expected refusal for ${JSON.stringify(args)}`,
      );
    }
    assert.equal(readEvents(root, SPEC).length, 0, 'no malformed event reached the log');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound never coerces a rejected value into a written one', () => {
  const root = project();
  try {
    assert.throws(() => reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: '3',
    }));
    assert.equal(readEvents(root, SPEC).length, 0, 'no silently-coerced cycles: 3 event');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound requires an args object', () => {
  const root = project();
  try {
    assert.throws(() => reportReviewRound(root, SPEC), (e) => e.code === 'EVENT_SCHEMA_INVALID');
  } finally { cleanupTempDir(root); }
});

// Spec AC 4's second half: "…and is not rejected under `strict`". Task 2 asserts the
// tier-1 producer emits no findings under the default `tag` mode; this pins the
// stricter mode directly, where an unregistered discriminator makes appendEvent throw.
test('a review_round write succeeds under event_diagnostics: strict', () => {
  const root = project();
  writeFixture(root, '.context-index/manifest.yaml',
    'domain: software\nlifecycle:\n  event_diagnostics: strict\n');
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 });
    assert.equal(readEvents(root, SPEC).length, 1, 'strict mode must not reject the variant');
  } finally { cleanupTempDir(root); }
});
```

> Confirm the exact manifest key for strict event diagnostics against `lib/lifecycle-state.mjs`'s diagnostics-mode resolution before authoring (the plan writes `lifecycle.event_diagnostics: strict`); `tests/cli/report-gate-outcomes.test.mjs::makeTempProject({ strictEventDiagnostics: true })` already builds such a fixture and is the safest source for the key.

- [ ] **Verify test fails**

Run: `node --test tests/lifecycle/review-round-event.test.mjs`
Expected: FAIL — `reportReviewRound is not a function` (no such export).

- [ ] **Implement**

Add beside `reportPartialRecovery()` in `lib/lifecycle-state.mjs`:

```javascript
/** Closed enum of legal `review_round.stage` values (review-provenance.spec.md Contract B). */
export const REVIEW_ROUND_STAGES = Object.freeze(
  new Set(['spec-compliance', 'code-quality', 'synthesized']),
);

/**
 * Exact accepted key set on a `reportReviewRound` args object. Stated explicitly
 * (never inferred) so an unknown key is a hard refusal rather than a silent
 * pass-through, mirroring `GATE_OUTCOME_KEYS`.
 */
const REVIEW_ROUND_KEYS = new Set(['plan', 'task_id', 'stage', 'cycles', 'findings']);

/**
 * Stages for which `findings` is countable. `spec-compliance` is excluded because
 * step 2f of skills/implement/SKILL.md mandates no stable finding-id convention,
 * so "distinct findings" is undefined there (omit-rather-than-guess).
 */
const REVIEW_ROUND_FINDINGS_STAGES = new Set(['code-quality', 'synthesized']);

export function reportReviewRound(projectRoot, specPath, args) {
  // Validate here, in the lib, not only in lib/cli/report.mjs: the log is
  // append-only, so a forged field reaching it via ANY caller is permanent.
  // Throws EVENT_SCHEMA_INVALID naming the offending key or value; nothing is coerced.
  //   … closed-key sweep over Object.keys(args)
  //   … stage ∈ REVIEW_ROUND_STAGES
  //   … Number.isInteger(cycles) && cycles >= 1
  //   … findings, when present: Number.isInteger(findings) && findings >= 0
  //     AND REVIEW_ROUND_FINDINGS_STAGES.has(stage)
  // then appendEvent(projectRoot, specPath, { event: 'review_round', plan, task_id,
  //   stage, cycles, ...(findings === undefined ? {} : { findings }) })
}
```

Use the existing `mkErr('EVENT_SCHEMA_INVALID', …)` helper for every refusal, and omit `findings` from the payload entirely when it was not supplied (do not write `findings: null` — absence must read as "not recorded"). Re-export `reportReviewRound` from wherever the module's public surface is enumerated.

- [ ] **Verify test passes**

Run: `node --test tests/lifecycle/review-round-event.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/lifecycle-state.mjs` and the new test, then commit with subject
`feat(lifecycle): add reportReviewRound with a closed-allow-list write guard`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 3
```

---

### Task 4: `reviewRounds` projection fold in `currentState()` [specialist: none]

**Charter capability:** Key Behaviors — state readable by `/adev:status`, `/adev:retro`, and `/adev:recover` without shelling out to git.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-state.mjs:1487-1500` (StateProjection typedef), `:1508-1530` (`emptyProjection`), `:1808-1818` (the fold `switch`, a new `case 'review_round'` beside `test_depth_assigned`)

**Tests:** extend `tests/lifecycle/review-round-event.test.mjs`

**Depends on:** Task 2, Task 3

**Context to load:**
- `review-provenance.spec.md` Output Contract B — the fold-rule/projection-field table and the `unknownEvents[]`-deprecation paragraph explaining why a `CANONICAL_EVENTS` entry with no fold case would hollow out Contract B's rationale
- `lib/lifecycle-state.mjs:1793-1835` — `case 'test_depth_assigned'`, the closest precedent
- `lifecycle-event-log.spec.md` Acceptance Criteria — camelCase-only projection keys (CON-2)

- [ ] **Write failing test**

```javascript
// tests/lifecycle/review-round-event.test.mjs — append
import { currentState } from '../../lib/lifecycle-state.mjs';

test('currentState folds review_round under reviewRounds keyed plan::task_id::stage', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'spec-compliance', cycles: 2 });
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1, findings: 0 });
    const state = currentState(root, SPEC);
    assert.deepEqual(
      Object.keys(state.reviewRounds).sort(),
      ['demo.plan.md::t1::code-quality', 'demo.plan.md::t1::spec-compliance'],
    );
    assert.equal(state.reviewRounds['demo.plan.md::t1::spec-compliance'].cycles, 2);
    assert.equal(state.reviewRounds['demo.plan.md::t1::code-quality'].findings, 0);
  } finally { cleanupTempDir(root); }
});

test('review_round never lands in the deprecated unknownEvents[]', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 });
    const state = currentState(root, SPEC);
    assert.deepEqual(state.unknownEvents, []);
  } finally { cleanupTempDir(root); }
});

test('duplicate (plan, task_id, stage) events fold last-wins', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 });
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 3 });
    const state = currentState(root, SPEC);
    assert.equal(readEvents(root, SPEC).length, 2, 'both events persist — the log is append-only');
    assert.equal(state.reviewRounds['demo.plan.md::t1::code-quality'].cycles, 3, 'last wins');
  } finally { cleanupTempDir(root); }
});

test('reviewRounds is an empty object, never zero-filled, when nothing was recorded', () => {
  const root = project();
  try {
    const state = currentState(root, SPEC);
    assert.deepEqual(state.reviewRounds, {},
      'absence means "not recorded", never a synthesized cycles: 0');
  } finally { cleanupTempDir(root); }
});

test('folding review_round changes neither status nor currentStep nor currentTask', () => {
  const root = project();
  try {
    const before = currentState(root, SPEC);
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 });
    const after = currentState(root, SPEC);
    assert.equal(after.status, before.status);
    assert.equal(after.currentStep, before.currentStep);
    assert.equal(after.currentTask, before.currentTask,
      'provenance is observability, not a lifecycle position');
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lifecycle/review-round-event.test.mjs`
Expected: FAIL — `state.reviewRounds` is `undefined`, and the event appears in `state.unknownEvents`.

- [ ] **Implement**

```javascript
// lib/lifecycle-state.mjs — emptyProjection()
    reviewRounds: {},
```

```javascript
// lib/lifecycle-state.mjs — the fold switch, beside case 'test_depth_assigned'
      case 'review_round': {
        // review-provenance.spec.md Output Contract B: keyed on (plan, task_id, stage) with
        // last-wins, mirroring testDepthAssignments. Deliberately NOT unknownEvents[] (that
        // field is deprecated / back-compat-only) and deliberately not a lifecycle position:
        // status, currentStep and currentTask are untouched.
        if (typeof ev.task_id !== 'string' || typeof ev.plan !== 'string'
            || typeof ev.stage !== 'string') break;
        projection.reviewRounds[`${ev.plan}::${ev.task_id}::${ev.stage}`] = { ...ev };
        break;
      }
```

Add the matching `@property {object} reviewRounds` line to the `StateProjection` typedef, describing the key form and the last-wins rule, and add `reviewRounds` to the camelCase-key list the typedef documents.

- [ ] **Verify test passes**

Run: `node --test tests/lifecycle/review-round-event.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/lifecycle-state.mjs` and the extended test, then commit with subject
`feat(lifecycle): fold review_round into the reviewRounds projection field`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 4
```

---

### Task 5: `buildReviewRoundTrailer()` — the sole producer of the trailer line [specialist: none]

**Charter capability:** Key Behaviors — commits traceable to lifecycle artifacts (the constitution's Commit Trailers mechanism, extended to the review dimension).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lifecycle/review-round-trailer.test.mjs`
- Modify: `lib/lifecycle-state.mjs` — `buildReviewRoundTrailer()`, co-located with `reportReviewRound()`

**Tests:** create `tests/lifecycle/review-round-trailer.test.mjs`

**Depends on:** Task 3 (shares `REVIEW_ROUND_STAGES`)

**Context to load:**
- `review-provenance.spec.md` Output Contract A in full — the trailer shape, the four-bullet behavioral contract, and the CWE-93 / CWE-113 / CWE-150 rationale for refusing rather than sanitizing
- `lib/issues/render-markdown.mjs:55-66` (`FIELD_CAPS`) and `:132-160` (`escapeField`)
- Constitution, "Commit Trailers" — the `Spec:` / `Plan-task:` precedent

**Critical design constraint:** `escapeField()` **normalizes** CR/LF (`\r\n` → `\n`, then `\n` → `" "` in the inline slot) and truncates at a cap. That is the opposite of what Output Contract A requires, which is **refusal**. The spec explicitly demotes the `escapeField` citation to a non-contractual implementation note, so do not delegate the rejection half to it. Reuse `FIELD_CAPS`-style constants if convenient, but the reject-vs-normalize decision belongs to this helper.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewRoundTrailer } from '../../lib/lifecycle-state.mjs';

test('buildReviewRoundTrailer emits one Review-round line per stage', () => {
  assert.equal(buildReviewRoundTrailer('spec-compliance', 2), 'Review-round: spec-compliance=2');
  assert.equal(buildReviewRoundTrailer('code-quality', 1), 'Review-round: code-quality=1');
  assert.equal(buildReviewRoundTrailer('synthesized', 3), 'Review-round: synthesized=3');
});

test('buildReviewRoundTrailer encodes first-pass positively as =1', () => {
  assert.equal(buildReviewRoundTrailer('code-quality', 1), 'Review-round: code-quality=1');
});

test('buildReviewRoundTrailer rejects embedded CR/LF (no forged extra trailer line)', () => {
  for (const stage of ['code-quality\nReview-round: spec-compliance=9',
                       'code-quality\r\nSpec: evil.spec.md',
                       'code-quality\r']) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1),
      (err) => /stage/i.test(err.message), `expected refusal for ${JSON.stringify(stage)}`);
  }
});

test('buildReviewRoundTrailer rejects control and ANSI escape sequences', () => {
  for (const stage of ['code-quality\u001b[31m', 'code-\u0000quality', 'code-quality\u0007',
                       'code-quality\u001b]0;title\u0007']) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1));
  }
});

test('buildReviewRoundTrailer enforces a hard length cap on <stage>=<cycles>', () => {
  // The stage half: out of enum AND over cap. Either refusal is correct.
  assert.throws(() => buildReviewRoundTrailer('c'.repeat(500), 1), (e) => /stage|length|cap/i.test(e.message));
  // The cycles half: 1e40 passes Number.isInteger and >= 1, so ONLY the length cap
  // rejects it. The cap-violation message must still name `cycles` — see the
  // implementation note below.
  assert.throws(() => buildReviewRoundTrailer('code-quality', 10 ** 40), (e) => /cycles/i.test(e.message));
  assert.throws(() => buildReviewRoundTrailer('code-quality', Number.MAX_SAFE_INTEGER), (e) => /cycles/i.test(e.message));
});

test('buildReviewRoundTrailer rejects an out-of-enum stage', () => {
  for (const stage of ['sanity-check', 'Code-Quality', 'code_quality', '', ' code-quality', null, 42]) {
    assert.throws(() => buildReviewRoundTrailer(stage, 1), (e) => /stage/i.test(e.message));
  }
});

test('buildReviewRoundTrailer rejects non-integer or < 1 cycles without coercing', () => {
  for (const cycles of [0, -1, 1.5, '2', Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
    assert.throws(() => buildReviewRoundTrailer('code-quality', cycles),
      (e) => /cycles/i.test(e.message), `expected refusal for ${String(cycles)}`);
  }
});

test('a rejected value is never silently rewritten into a valid trailer', () => {
  let emitted = null;
  try { emitted = buildReviewRoundTrailer('code-quality', '2'); } catch { /* expected */ }
  assert.equal(emitted, null, 'refusal, not coercion to cycles=2');
});

test('the emitted line is a single line with exactly one key=value pair', () => {
  const line = buildReviewRoundTrailer('code-quality', 2);
  assert.equal(line.split('\n').length, 1);
  assert.equal((line.match(/=/g) ?? []).length, 1);
  assert.match(line, /^Review-round: [a-z-]+=[0-9]+$/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lifecycle/review-round-trailer.test.mjs`
Expected: FAIL — `buildReviewRoundTrailer is not a function`.

- [ ] **Implement**

```javascript
/**
 * Build the single sanctioned `Review-round: <stage>=<cycles>` trailer line.
 *
 * The ONLY producer of this trailer (review-provenance.spec.md Output Contract A).
 * skills/implement/SKILL.md step 2h names this helper instead of composing the
 * text as orchestrator prose, because the trailer is authored by an LLM whose
 * inputs (task reports, reviewer output, code under review) are treated as
 * prompt-injectable, and a merged commit is materially harder to correct than an
 * append-only JSONL row is to supersede (CWE-93 / CWE-113 / CWE-150).
 *
 * REJECTS rather than sanitizes — it does NOT delegate to `escapeField`, which
 * normalizes CR/LF and truncates instead of refusing:
 *   - embedded CR/LF (would forge an additional trailer line on the commit)
 *   - control characters and ANSI escape sequences (would be echoed verbatim into
 *     terminal-facing advisories and raw-trailer renderers)
 *   - a `<stage>=<cycles>` string over the hard cap
 *   - a stage outside REVIEW_ROUND_STAGES
 *   - any `cycles` failing Number.isInteger(cycles) && cycles >= 1
 * Nothing is coerced: a refusal raises, it never emits a quietly altered line.
 */
export function buildReviewRoundTrailer(stage, cycles) { /* … */ }
```

Order the checks so the error message always names the offending input (`stage` or `cycles`). Enforce the enum membership check *before* the character checks for in-enum values, but keep an explicit CR/LF and control/ANSI sweep so a caller that later widens the enum cannot bypass it. Define the cap as a named module constant (a small value — the legal payload is at most `spec-compliance=<n>`).

**Cap-message requirement (the integer guard alone is not enough).** `Number.isInteger(1e40)` is `true` and `1e40 >= 1`, so an absurdly large `cycles` passes the integer guard and is caught only by the length cap. Attribute the cap violation to whichever half overflowed and name it: when the rendered `cycles` digits are what breached the cap, the error message must contain `cycles`. Cap the `cycles` digit count directly (a small explicit bound) rather than relying on the composed-string length alone, so the message is unambiguous.

- [ ] **Verify test passes**

Run: `node --test tests/lifecycle/review-round-trailer.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/lifecycle-state.mjs` and the new test, then commit with subject
`feat(lifecycle): add buildReviewRoundTrailer as the sole trailer producer`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 5
```

---

### Task 6: `adev report --type review-round` [specialist: none]

**Charter capability:** Key Files — the CLI surface skills invoke instead of inline Node (`cli-driver-surface` charter).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/cli/report-review-round.test.mjs`
- Modify: `lib/cli/report.mjs:72` (usage line), `:180-190` (arg parsing), `:352-460` (type dispatch + unknown-type message), `:570` and `:630-654` (help text)

**Tests:** create `tests/cli/report-review-round.test.mjs`

**Depends on:** Task 3

**Context to load:**
- `review-provenance.spec.md` Arguments table — the full signature `adev report --type review-round --spec <spec> --plan <p> --task-id <id> --stage <s> --cycles <n> [--findings <m>]`; `--spec` is required, as it is for every event type
- `lib/cli/report.mjs` in full; mirror the `--type plan-task` block (`:352-420`) and the flag-scoping guard at `:221-232` (`--gate-outcomes is only valid with --type validator`)
- `tests/cli/report.test.mjs` and `tests/cli/report-gate-outcomes.test.mjs`

**Note:** the CLI does **not** duplicate the validation — it parses, then calls `reportReviewRound()` and lets the lib's `EVENT_SCHEMA_INVALID` refusal surface as a non-zero exit naming the offending argument. Duplicating the rules here would create a second authority that can drift.

**Pre-existing enum drift you must reconcile (verified on disk, 2026-08-18).** `lib/cli/report.mjs` states its `--type` vocabulary in four separate hand-maintained strings that already disagree:

| Site | Current content |
|---|---|
| `:72` (`USAGE`) | `validator\|step\|reviewer\|plan-task\|intervention` — five values |
| `:214` (missing `--type`) | `validator, step, reviewer, plan-task, intervention` — five values |
| `:458` (unknown `--type`) | `validator, step, reviewer, plan-task, intervention` — five values |
| `:570` (`help()`) | `validator\|step\|reviewer\|plan-task\|intervention\|cost-checkpoint` — six values |

`cost-checkpoint` appears **only** in the `help()` string at `:570` and in `docs/cli-reference.md:306`; there is no `if (v.type === "cost-checkpoint")` branch, so the CLI rejects it. Do **not** implement `cost-checkpoint` — that is outside this spec. Instead:

1. Introduce one exported source of truth, e.g. `export const REPORT_TYPES = Object.freeze(['validator', 'step', 'reviewer', 'plan-task', 'intervention', 'review-round']);` — the types the dispatcher actually accepts, `review-round` included.
2. Derive all four strings above from `REPORT_TYPES` (join with `|` for the two usage lines, `, ` for the two error messages) so they cannot drift again.
3. Leave `cost-checkpoint` in the **documented** enum only, and record it in the code comment beside `REPORT_TYPES` as a known documented-but-unimplemented value predating this spec, with a follow-up pointer. Task 7's parity test pins exactly that one discrepancy, so a *new* divergence fails while the pre-existing one is explicit rather than silent.

File an issue for the `cost-checkpoint` gap via `/adev:issues` (non-blocking; the `br` CLI cannot open issue storage from this worktree, so record it in the task report if the write fails).

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEvents } from '../../lib/lifecycle-state.mjs';
// Fixture helpers: copy the local ones tests/cli/report-gate-outcomes.test.mjs
// already defines for this verb — `makeTempProject(opts)`, `cleanup(dir)`,
// `runReport(dir, args)` (returns the spawnSync result), `readLog(dir)`,
// `lastEvent(dir)`, plus its `PROJECT_ROOT` / `CLI` consts. The pseudocode below
// writes `runCli` / `project` / `PLUGIN_ROOT` for brevity; rename to the real
// helpers when authoring. NOTE: tests/helpers.mjs exports a DIFFERENT helper
// named `runCLI` (different capitalization, different signature) and a
// `PLUGIN_ROOT` const — do not mix the two harnesses.

test('--type review-round appends a review_round event', async () => {
  const { root, spec } = project();
  const res = await runCli(root, ['report', '--type', 'review-round', '--spec', spec,
    '--plan', 'demo.plan.md', '--task-id', 't1', '--stage', 'code-quality',
    '--cycles', '2', '--findings', '1']);
  assert.equal(res.code, 0, res.stderr);
  const [ev] = readEvents(root, spec);
  assert.equal(ev.event, 'review_round');
  assert.equal(ev.cycles, 2, 'numeric, not the string "2"');
  assert.equal(ev.findings, 1);
});

test('--findings is omitted from the payload when the flag is absent', async () => {
  const { root, spec } = project();
  await runCli(root, ['report', '--type', 'review-round', '--spec', spec,
    '--plan', 'demo.plan.md', '--task-id', 't1', '--stage', 'spec-compliance', '--cycles', '1']);
  const [ev] = readEvents(root, spec);
  assert.ok(!('findings' in ev), 'absence means not recorded, never null and never 0');
});

test('--type review-round refuses loudly on each missing required flag', async () => {
  const { root, spec } = project();
  const full = { '--spec': spec, '--plan': 'demo.plan.md', '--task-id': 't1',
                 '--stage': 'code-quality', '--cycles': '2' };
  for (const omit of Object.keys(full)) {
    const argv = ['report', '--type', 'review-round'];
    for (const [k, v] of Object.entries(full)) if (k !== omit) argv.push(k, v);
    const res = await runCli(root, argv);
    assert.notEqual(res.code, 0, `expected non-zero when ${omit} is missing`);
    assert.match(res.stderr, new RegExp(omit.replace(/^--/, '')));
  }
  assert.equal(readEvents(root, spec).length, 0, 'no event written on any refusal');
});

test('--type review-round refuses malformed values without writing', async () => {
  const { root, spec } = project();
  const bad = [['--cycles', '0'], ['--cycles', 'two'], ['--cycles', '1.5'],
               ['--stage', 'sanity-check'], ['--findings', '-1']];
  for (const [flag, value] of bad) {
    const argv = ['report', '--type', 'review-round', '--spec', spec, '--plan', 'demo.plan.md',
      '--task-id', 't1', '--stage', 'code-quality', '--cycles', '2'];
    const i = argv.indexOf(flag);
    if (i === -1) argv.push(flag, value); else argv[i + 1] = value;
    const res = await runCli(root, argv);
    assert.notEqual(res.code, 0, `expected refusal for ${flag} ${value}`);
    assert.match(res.stderr, new RegExp(flag.replace(/^--/, '')));
  }
  assert.equal(readEvents(root, spec).length, 0);
});

test('--findings on --type review-round --stage spec-compliance is refused', async () => {
  const { root, spec } = project();
  const res = await runCli(root, ['report', '--type', 'review-round', '--spec', spec,
    '--plan', 'demo.plan.md', '--task-id', 't1', '--stage', 'spec-compliance',
    '--cycles', '1', '--findings', '1']);
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /findings/);
  assert.equal(readEvents(root, spec).length, 0);
});

test('review-round-only flags are rejected on other --type values', async () => {
  const { root, spec } = project();
  const res = await runCli(root, ['report', '--type', 'step', '--spec', spec,
    '--step', 'plan', '--status', 'started', '--cycles', '2']);
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /only valid with --type review-round/);
});

test('all four --type vocabulary strings list review-round and agree with each other', async () => {
  const { root, spec } = project();
  // :458 unknown-type path
  const unknown = await runCli(root, ['report', '--type', 'bogus', '--spec', spec]);
  assert.notEqual(unknown.code, 0);
  assert.match(unknown.stderr, /review-round/, ':458 unknown --type message');
  assert.match(unknown.stderr, /review-round/, ':72 USAGE (also printed on this path)');
  // :214 missing-type path
  const missing = await runCli(root, ['report', '--spec', spec]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /review-round/, ':214 missing --type message');
  // :570 help()
  const help = await runCli(root, ['report', '--help']);
  assert.match(help.stdout, /review-round/, ':570 help() usage line');
});

test('the --type vocabulary is derived from one exported constant, not four strings', () => {
  const src = readFileSync(join(PLUGIN_ROOT, 'lib/cli/report.mjs'), 'utf8');
  const m = src.match(/export const REPORT_TYPES = Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(m, 'REPORT_TYPES must be the single source of truth for the --type vocabulary');
  const types = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.deepEqual(types.slice().sort(), [
    'intervention', 'plan-task', 'review-round', 'reviewer', 'step', 'validator',
  ], 'exactly the six types the dispatcher accepts');
  // No hand-maintained duplicate of the joined vocabulary survives.
  assert.ok(
    !/plan-task\|intervention(?!\s*['"]?\s*\])/.test(src.replace(/REPORT_TYPES[^\n]*/g, '')),
    'the four usage/error strings must be derived from REPORT_TYPES, not literal',
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/report-review-round.test.mjs`
Expected: FAIL — `unknown --type "review-round"`.

- [ ] **Implement**

In `lib/cli/report.mjs`:
1. Add `plan`, `task-id`, `stage`, `cycles`, `findings` to the arg spec (`plan` / `task-id` already exist for `--type plan-task`; add `stage`, `cycles`, `findings` as strings and parse the two numerics explicitly so `"two"` and `"1.5"` are refused rather than becoming `NaN`).
2. Extend the flag-scoping guard block (`:221-232`) with `--stage` / `--cycles` / `--findings` are only valid with `--type review-round`, matching the existing `--gate-outcomes` wording.
3. Add a `if (v.type === "review-round")` block beside the `plan-task` one: require `--spec`, `--plan`, `--task-id`, `--stage`, `--cycles`; pass `findings` through only when the flag was supplied; call `reportReviewRound(projectRoot, specPath, {...})` and let a thrown `EVENT_SCHEMA_INVALID` become a non-zero exit whose stderr names the offending argument.
4. Add `export const REPORT_TYPES` per the reconciliation note above and derive **all four** vocabulary strings from it — `USAGE` at `:72`, the missing-`--type` message at `:214`, the unknown-`--type` message at `:458`, and the `help()` usage line at `:570`. Add the per-type help block for `--type review-round` in the `:630-654` region alongside the existing per-type blocks.

- [ ] **Verify test passes**

Run: `node --test tests/cli/report-review-round.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/cli/report.mjs` and the new test, then commit with subject
`feat(cli): add adev report --type review-round`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 6
```

---

### Task 7: `docs/cli-reference.md` enum parity [specialist: none]

**Charter capability:** Key Files — `docs/cli-reference.md` is the reference agents consult for CLI signatures (CLAUDE.md Context Routing).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `docs/cli-reference.md:306` — the `report --type` enum gains a seventh value, plus one usage example
- Modify: `tests/cli/report-review-round.test.mjs` — add the documented-vs-implemented parity check

**Tests:** extend `tests/cli/report-review-round.test.mjs`

**Depends on:** Task 6

**Context to load:**
- `review-provenance.spec.md` Output Contract B — the `docs/cli-reference.md` paragraph ("so the documented surface never contradicts the implemented one")
- `docs/cli-reference.md:300-330`
- `tests/docs/test-depth-policy-docs.test.mjs` — the existing doc-parity test shape

- [ ] **Write failing test**

```javascript
// tests/cli/report-review-round.test.mjs — append
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the documented report --type enum matches the implemented one', () => {
  const doc = readFileSync(join(PLUGIN_ROOT, 'docs/cli-reference.md'), 'utf8');
  const src = readFileSync(join(PLUGIN_ROOT, 'lib/cli/report.mjs'), 'utf8');

  const m = doc.match(/report --type <([^>]+)>/);
  assert.ok(m, 'docs/cli-reference.md must carry a `report --type <…>` signature');
  const documented = m[1].split('|').map((s) => s.trim()).sort();

  const t = src.match(/export const REPORT_TYPES = Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(t, 'lib/cli/report.mjs must export REPORT_TYPES as the implemented enum');
  const implemented = t[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean).sort();

  assert.ok(documented.includes('review-round'), 'docs must list review-round');
  assert.ok(implemented.includes('review-round'), 'the CLI must accept review-round');
  assert.equal(documented.length, 7, 'exactly seven documented values');

  // Every implemented type must be documented.
  for (const type of implemented) {
    assert.ok(documented.includes(type), `implemented type ${type} is undocumented`);
  }
  // The ONLY permitted documented-but-unimplemented value is the pre-existing
  // cost-checkpoint gap, which predates this spec and is out of its scope. Pinning
  // it here means a NEW divergence fails the test while this one stays explicit.
  const documentedOnly = documented.filter((type) => !implemented.includes(type));
  assert.deepEqual(documentedOnly, ['cost-checkpoint'],
    'no new documented-but-unimplemented --type may be introduced');
});

test('docs/cli-reference.md shows a review-round invocation example', () => {
  const doc = readFileSync(join(PLUGIN_ROOT, 'docs/cli-reference.md'), 'utf8');
  assert.match(doc, /adev report --type review-round[^\n]*--spec/);
  assert.match(doc, /--stage/);
  assert.match(doc, /--cycles/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/report-review-round.test.mjs`
Expected: FAIL — the documented enum has six values and no `review-round`.

- [ ] **Implement**

Update the signature line at `docs/cli-reference.md:306` — currently six values — to the seven-value form
`report --type <validator|step|reviewer|plan-task|intervention|cost-checkpoint|review-round> --spec <path> [type-specific flags]`
and add one worked example beneath the existing `--type validator` one:

```bash
adev report --type review-round --spec <p> --plan <p>.plan.md --task-id t1 \
  --stage code-quality --cycles 2 --findings 1
```

Document that `--findings` is omitted for `--stage spec-compliance` (no stable finding-id convention at step 2f), and that omitting an event entirely reads as "not recorded", never "zero". Add a one-line note that `cost-checkpoint` remains documented but is not yet an implemented `--type` — a pre-existing gap, tracked separately, deliberately untouched by this change.

- [ ] **Verify test passes**

Run: `node --test tests/cli/report-review-round.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `docs/cli-reference.md` and the extended test, then commit with subject
`docs(cli): document report --type review-round`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 7
```

---

### Task 8: `skills/implement/SKILL.md` step 2h names the helper and the emitter [specialist: none]

**Charter capability:** Key Files — `skills/implement/SKILL.md`; this completes the instruction the skill already carries at step 2h item 4.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/skills/implement-review-provenance.test.mjs`
- Modify: `skills/implement/SKILL.md:618-635` — step 2h item 4

**Tests:** create `tests/skills/implement-review-provenance.test.mjs`

**Depends on:** Task 5 (imports `buildReviewRoundTrailer` for the commit-count test), Task 6

**Context to load:**
- `review-provenance.spec.md` Output Contract A ("The trailer is constructed by a validated helper, never by free-text prose"), Output Contract D, and the Acceptance Criteria rows for step 2h and for unchanged dispatch counts
- `skills/implement/SKILL.md:550-640` (steps 2f, 2g, 2h) in full
- `tests/skills/implement.test.mjs`, `tests/skills/step-failed-emission.test.mjs`
- Constitution Anti-Patterns: no inline Node in SKILL.md, no executable logic in SKILL.md, fenced JavaScript is descriptive-reference only, and no H3 section may contain both an inline-Node block and an `adev <verb>` invocation

**Scope guard (Output Contract D):** this task adds prose that *records*. It must not change the 3-cycle Stage 1 cap, the 3-cycle Stage 2 cap, the visual fix cap, the non-PASS escalation path, or any dispatch count. The no-behavior-change test below pins those numbers.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildReviewRoundTrailer } from '../../lib/lifecycle-state.mjs';
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from '../helpers.mjs';

const SKILL = readFileSync(join(PLUGIN_ROOT, 'skills/implement/SKILL.md'), 'utf8');
const step2h = SKILL.slice(SKILL.indexOf('#### 2h.'), SKILL.indexOf('### Step 2.5'));

test('step 2h names buildReviewRoundTrailer as the sole trailer producer', () => {
  assert.match(step2h, /buildReviewRoundTrailer/);
  assert.match(step2h, /Review-round:/, 'the trailer key must be shown');
  assert.match(step2h, /only|sole/i, 'the helper must be named as the ONLY producer');
});

test('step 2h names the review_round emitter and its per-stage cardinality', () => {
  assert.match(step2h, /adev report --type review-round|reportReviewRound/);
  assert.match(step2h, /per stage|each stage|one per stage/i);
});

test('step 2h states that findings is omitted for the spec-compliance stage', () => {
  assert.match(step2h, /spec-compliance/);
  assert.match(step2h, /findings/);
});

test('step 2h keeps exactly-one-commit-per-task', () => {
  assert.match(step2h, /Commit-per-task is MANDATORY/);
  assert.match(step2h, /exactly one git commit/);
});

// Spec AC: "a test asserts the commit count for a multi-cycle task is 1". This runs
// buildReviewRoundTrailer's output through a real `git commit` in a throwaway repo,
// so the trailer block and the one-commit invariant are asserted mechanically rather
// than as prose. The orchestrator's own dispatch path stays prose-asserted above.
test('a multi-cycle task produces exactly one commit carrying both stage trailers', () => {
  const repo = createTempDir();
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(repo, 'thing.mjs'), 'export const a = 1;\n');           // first pass
    writeFileSync(join(repo, 'thing.mjs'), 'export const a = 2;\n');           // cycle 2 fix
    writeFileSync(join(repo, 'thing.mjs'), 'export const a = 3;\n');           // cycle 3 fix
    git('add', 'thing.mjs');
    const message = [
      'feat(demo): add thing',
      '',
      'Spec: .context-index/specs/features/demo/thing.spec.md',
      'Plan-task: 1',
      buildReviewRoundTrailer('spec-compliance', 1),
      buildReviewRoundTrailer('code-quality', 3),
    ].join('\n');
    git('commit', '-q', '-m', message);

    assert.equal(git('log', '--oneline').trim().split('\n').length, 1,
      'three review cycles must still yield exactly one commit');

    const trailers = git('log', '-1', '--pretty=%B').split('\n')
      .filter((l) => l.startsWith('Review-round:'));
    assert.deepEqual(trailers, [
      'Review-round: spec-compliance=1',
      'Review-round: code-quality=3',
    ], 'one repeated trailer key per stage, cycles including the initial review');
    // The multi-cycle stage records 3, the first-pass stage records 1 positively.
    assert.ok(trailers.some((l) => l.endsWith('=1')), 'first-pass encoded as =1, not absence');
  } finally { cleanupTempDir(repo); }
});

test('review-provenance prose changes no cap, threshold, or dispatch count (Contract D)', () => {
  const stage1 = SKILL.slice(SKILL.indexOf('#### 2f.'), SKILL.indexOf('#### 2g.'));
  const stage2 = SKILL.slice(SKILL.indexOf('#### 2g.'), SKILL.indexOf('#### 2h.'));
  assert.match(stage2, /Maximum 3 code-quality review cycles per task/);
  assert.match(stage2, /On any terminal non-PASS verdict, Stage 2 has NOT passed/);
  assert.ok(!/review[- ]round/i.test(stage1), 'Stage 1 prose must be untouched');
  assert.ok(!/review[- ]round/i.test(stage2), 'Stage 2 prose must be untouched');
});

test('step 2h adds no inline Node and no executable logic', () => {
  assert.ok(!/Run inline Node/i.test(step2h));
  assert.ok(!/node\s+--input-type=module\s+-e/.test(step2h));
  assert.ok(!/node\s+-e/.test(step2h));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-review-provenance.test.mjs`
Expected: FAIL — step 2h mentions neither helper.

- [ ] **Implement**

Replace step 2h item 4 (`Record: specialist used (or "generic"), review cycles needed, concerns noted.`) with prose that names the two artifacts that now receive it. Keep it markdown-only — name the CLI verb, do not embed executable logic:

```markdown
4. **Record review-round provenance on both channels** (`review-provenance.spec.md`
   Output Contract A and B). This completes what item 4 previously only instructed.
   For each review stage that ran on this task — always at least `spec-compliance` and
   `code-quality`, since 2h is reached only after both pass:
   - **Trailer.** Add one `Review-round: <stage>=<cycles>` line to this task's single
     commit, built by `buildReviewRoundTrailer(stage, cycles)` in
     `lib/lifecycle-state.mjs`. That helper is the **only** sanctioned producer of the
     line — never compose the text as prose. `cycles` counts reviewer dispatches
     **including the initial review**, so a stage that passed on first look records `=1`.
     Repeated `Review-round:` keys are legal, so two stages produce two lines. The helper
     rejects CR/LF, control/ANSI escapes, over-cap length, an out-of-enum stage, and any
     `cycles` that is not an integer >= 1; a rejection is never coerced into a written line.
   - **Event.** Emit one event per stage:
     `adev report --type review-round --spec <spec> --plan <plan> --task-id <id> --stage <s> --cycles <n> [--findings <m>]`.
     Supply `--findings` only for `code-quality` (and `synthesized`), never for
     `spec-compliance` — step 2f mandates no stable finding-id convention, so distinct
     findings are not countable there. If a stage's cycle count is genuinely unknown
     (for example the run resumed mid-task after a crash), **omit the event for that
     stage** rather than guessing: absence reads as "not recorded", and a fabricated
     count would corrupt the corpus this record exists to create.
   Still record the specialist used (or "generic") and any concerns noted in the
   task report as before. Neither channel gates task completion: a failed
   observability write is a warning naming the task, not a task failure.
```

Leave every other line of 2f, 2g and 2h untouched.

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-review-provenance.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `skills/implement/SKILL.md` and the new test, then commit with subject
`feat(implement): record review-round provenance at step 2h`
and the trailers:

```
Spec: .context-index/specs/features/implementation/review-provenance.spec.md
Plan-task: 8
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates come from `.context-index/governance/gates.yaml`, which supersedes the constitution's Quality Gates block:

| Gate id | Tier | Command | Severity | Notes |
|---|---|---|---|---|
| `test` | fast | `npm test` | error | triggers: post-task, post-implement |
| `quality-gate` | fast | `npm test` | error | domain:software duplicate of the above |
| `integration-test` | integration | `npm run test:evals` | warning | `required: false` until the eval tier is green again (issue-590/591/592) |

Covered by task tests, re-confirmed at validation time:

- `.context-index/governance/diagnostics.yaml` gained no entry and `TIER1_WRITE_TIME_RUNNERS` gained no runner (Task 2).
- `plan_task`'s payload is unchanged — the regression guard against the widening rejected at spec revision 3 (Task 1).
- Exactly one commit per task even for a multi-cycle task, carrying one `Review-round:` trailer per stage (Task 8).
- No new dependency in `package.json`; every new file is `.mjs` ESM; no version manifest touched.

### Declared coverage deferrals

Two acceptance criteria are **not** discharged by a task test in this plan. They are named here rather than left to read as satisfied:

| Spec criterion | How this plan handles it | Why |
|---|---|---|
| *"Dispatch counts and review outcomes are unchanged by this spec: an eval or test asserts enabling provenance alters no review behavior."* | **Static** assertion only: Task 8 pins the Stage 1 / Stage 2 caps and the non-PASS escalation prose in `skills/implement/SKILL.md`, and asserts the 2f/2g sections gained no review-round text. | A behavioral assertion needs a paired A/B `/adev:implement` run against the same plan, which is an eval-tier artifact, not a unit test. The static pin catches the realistic regression (prose drift into the review steps); the runtime eval is a follow-up. |
| *"Existing lifecycle logs written before this spec validate unchanged, with no migration step."* | Deferred to `/adev:validate`'s full-suite run: the change is purely additive to `CANONICAL_EVENTS` and `REQUIRED_FIELDS_BY_EVENT`, so every existing lifecycle-log fixture in the suite is already the regression corpus. | Writing a bespoke "old logs still validate" test would duplicate what the existing fixture-driven diagnostics and projection suites already assert on every run. If `npm test` is green, this criterion holds. |

Neither deferral is a scope reduction: both remain criteria of the spec, and `/adev:validate` should record them as such.
