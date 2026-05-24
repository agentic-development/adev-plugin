<!-- partial_schema: plan@1 -->

# Implementation Plan: Cost-Checkpoint Lifecycle Events

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-24)
> **Platform:** JavaScript (ESM), Node.js, npm, node:test

**Goal:** Add a write-side `cost_checkpoint` event to the lifecycle log so downstream consumers (`/adev:retro`, `/adev:status`, `/adev:hygiene`) can query per-step token + USD totals without re-aggregating from `.session-tracking.jsonl`.

**Architecture:** The implementation extends the existing closed discriminator set (`lib/lifecycle-events.mjs`), required-field schema (`lib/diagnostics/event-schemas.mjs`), and lifecycle-state emitter surface (`lib/lifecycle-state.mjs`) with a new `cost_checkpoint` variant. A new CLI arm `adev report --type cost-checkpoint` provides both a raw `--totals-json` mode and an aggregate-and-emit `--from-summary` mode (calling the existing `aggregate()` from `lib/cost-summary.mjs`). The `/adev:build` orchestrator wires the emitter into `SKILL.md` step 6 as an informational post-step call. The Tier-1 `adev/event-schema-valid` diagnostic gains the new entry automatically through the shared `REQUIRED_FIELDS_BY_EVENT` table — no diagnostic code changes needed.

---

## Review Notes (PASS_WITH_NOTES)

The review passed with 6 non-blocking suggestions. The following are addressed in this plan:

- **SA-1:** `aggregate()` does not surface the resolved `since` cutoff. The CLI arm (`--from-summary`) must capture `since` independently before calling `aggregate()` so it can be included in the event payload.
- **SA-2:** `aggregate()` is async; the CLI arm must `await` its result.
- **SA-3:** The new CLI persistence line in `SKILL.md` belongs inside step 6 (after the ticker calls), not step 5. This plan places it correctly.
- **SEC-1:** Non-finite number validation on `--totals-json` is scoped to top-level fields only (matching spec Behavior 4 intent; the spec's error table does not require deep validation).
- **SEC-2:** `EVENT_TOO_LARGE` already bounds payloads — no additional size gate needed in this spec.
- **CON-2 (optional):** `depends-on` frontmatter linking to lifecycle-event-log.spec.md is informational and deferred to a hygiene pass.

---

## File Structure

**Create:**
- `tests/cli/report-cost-checkpoint.test.mjs` — CLI arm tests: raw + `--from-summary` + error cases
- `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — Producer test for `reportCostCheckpoint` (deterministic JSONL fixture)

**Modify:**
- `lib/lifecycle-events.mjs` — Add `'cost_checkpoint'` to `CANONICAL_EVENTS`
- `lib/diagnostics/event-schemas.mjs` — Add `cost_checkpoint` entry to `REQUIRED_FIELDS_BY_EVENT`
- `lib/lifecycle-state.mjs` — Add `reportCostCheckpoint(projectRoot, specPath, payload)` export
- `lib/cli/report.mjs` — Add `--type cost-checkpoint` arm with `--step`, `--totals-json`, `--from-summary`
- `skills/build/SKILL.md` — Add one CLI line in step 6 after ticker call
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` — Append `cost_checkpoint` to canonical-events table

**Reference (read, do not modify):**
- `lib/cost-summary.mjs` — Follow `aggregate()` signature for `--from-summary` integration
- `tests/cli/report.test.mjs` — Follow existing pattern for new test file structure
- `.context-index/specs/features/session-awareness/cost-ticker.spec.md` — Read-only contract that `aggregate()` must not be broken

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 1)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Cost-Checkpoint Lifecycle Events)
- Source files: `lib/lifecycle-events.mjs` (full read — primary), `lib/diagnostics/event-schemas.mjs` (full read — co-modify)

### Task 2 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 2)
- Source files: `lib/diagnostics/event-schemas.mjs` (full read), `lib/lifecycle-events.mjs` (signature)
- Cross-cutting: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (four-step process for adding discriminators)

### Task 3 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 3)
- Source files: `lib/lifecycle-state.mjs` (full read — `reportStep` pattern lines 892–919 as model)
- Test pattern: `tests/cli/report.test.mjs` (function structure)

### Task 4 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behaviors 4, 5, 6; Error Cases table)
- Source files: `lib/cli/report.mjs` (full read — existing arm patterns), `lib/cost-summary.mjs` (aggregate signature)
- Review note SA-1: capture `since` cutoff before calling `aggregate()`; review note SA-2: `aggregate()` is async

### Task 5 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 7)
- Source files: `skills/build/SKILL.md` (step 6 section — read lines 294–308)
- Review note SA-3: new line belongs in step 6 (after ticker), not step 5

### Task 6 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Postconditions — cross-spec consistency item)
- Source files: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (canonical-events table section)
- Cross-cutting: `lib/diagnostics/event-schemas.mjs` (comment at line 17–20 documenting four-step process)

### Task 7 Context
- Spec: `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (all Acceptance Criteria)
- Source files: all modified files (read for verification), `tests/cli/report.test.mjs` (test structure pattern)
- Test helper: `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`, `writeFixture`)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens).
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context.
- **Anti-pattern:** Focus on reducing input token counts.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk, instruct it to return only a structured summary to the conversation.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7
  - Tasks 1 and 2 both modify separate files (`lifecycle-events.mjs` and `event-schemas.mjs` respectively) and have no shared write surface, but Task 2 imports from the output of Task 1, so sequential ordering is safest.
  - Tasks 3 and 4 share `lib/lifecycle-state.mjs` and `lib/cli/report.mjs` indirectly; sequential avoids conflicts.
  - All tasks form a dependency chain: discriminator → schema → emitter → CLI arm → skill prose → doc update → tests.

All tasks run sequentially.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Extend `CANONICAL_EVENTS` | small | unit | — | 0 create, 1 modify |
| 2 | Extend `REQUIRED_FIELDS_BY_EVENT` | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Add `reportCostCheckpoint` emitter | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Add CLI arm `--type cost-checkpoint` | medium | unit | Task 3 | 0 create, 1 modify |
| 5 | Update build skill prose | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Update lifecycle-event-log spec | small | unit | Task 1 | 0 create, 1 modify |
| 7 | Tests | medium | unit | Tasks 1–6 | 2 create, 0 modify |

---

## Task Structure

### Task 1: Extend CANONICAL_EVENTS [specialist: none]

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-events.mjs`
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` (created in Task 7)

**Tests:** `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — asserts `CANONICAL_EVENTS.has('cost_checkpoint')`.

**Context to load:**
- `lib/lifecycle-events.mjs` (full read — primary)
- `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 1)

- [ ] **Write failing test**

```javascript
// In tests/lib/lifecycle-state-cost-checkpoint.test.mjs (stub for Task 7)
// For Task 1, write this assertion in isolation:
import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';
import { test } from 'node:test';
import assert from 'node:assert';

test('CANONICAL_EVENTS includes cost_checkpoint', () => {
  assert.ok(CANONICAL_EVENTS.has('cost_checkpoint'));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: FAIL — assertion fails because `'cost_checkpoint'` is not yet in the set.

- [ ] **Implement**

In `lib/lifecycle-events.mjs`, add `'cost_checkpoint'` to the `CANONICAL_EVENTS` Set. Place it after `'human_approval_required'` with a comment referencing the spec:

```
// cost_checkpoint — emitted by `reportCostCheckpoint()` in lib/lifecycle-state.mjs
// after each pipeline step. Persists per-step token + USD totals into the
// lifecycle log so downstream consumers query costs without re-aggregating from
// .session-tracking.jsonl. See cost-checkpoint-events.spec.md.
'cost_checkpoint',
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/session-awareness/cost-checkpoint-events`

```bash
git add lib/lifecycle-events.mjs tests/lib/lifecycle-state-cost-checkpoint.test.mjs
git commit -m "feat(session-awareness): add cost_checkpoint to CANONICAL_EVENTS

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-1"
```

---

### Task 2: Extend REQUIRED_FIELDS_BY_EVENT [specialist: none]

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/diagnostics/event-schemas.mjs`
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs`

**Tests:** `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — asserts `REQUIRED_FIELDS_BY_EVENT.cost_checkpoint` equals `['event', 'ts', 'step', 'totals']`.

**Context to load:**
- `lib/diagnostics/event-schemas.mjs` (full read — primary)
- `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 2)

- [ ] **Write failing test**

```javascript
import { REQUIRED_FIELDS_BY_EVENT } from '../../lib/diagnostics/event-schemas.mjs';
import { test } from 'node:test';
import assert from 'node:assert';

test('REQUIRED_FIELDS_BY_EVENT has cost_checkpoint entry', () => {
  const fields = REQUIRED_FIELDS_BY_EVENT['cost_checkpoint'];
  assert.ok(Array.isArray(fields), 'cost_checkpoint entry must be an array');
  assert.deepStrictEqual([...fields], ['event', 'ts', 'step', 'totals']);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: FAIL — `cost_checkpoint` not yet declared.

- [ ] **Implement**

In `lib/diagnostics/event-schemas.mjs`, add to `REQUIRED_FIELDS_BY_EVENT` after the `human_approval_required` entry:

```javascript
// cost_checkpoint — emitted by `reportCostCheckpoint()` after each pipeline step.
// Persists per-step token + USD totals for downstream cost queries.
// Optional fields (not asserted by Tier-1 diagnostic): model_breakdown, since,
// checkpoints, skipped_lines, spec_ref. See cost-checkpoint-events.spec.md.
cost_checkpoint: Object.freeze([...UNIVERSAL_REQUIRED, 'step', 'totals']),
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/diagnostics/event-schemas.mjs tests/lib/lifecycle-state-cost-checkpoint.test.mjs
git commit -m "feat(session-awareness): add cost_checkpoint to REQUIRED_FIELDS_BY_EVENT

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-2"
```

---

### Task 3: Add reportCostCheckpoint emitter [specialist: none]

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/lifecycle-state.mjs`
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs`

**Tests:** `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — producer test asserting `reportCostCheckpoint` appends a valid `cost_checkpoint` event to the JSONL fixture.

**Context to load:**
- `lib/lifecycle-state.mjs` (lines 892–950 — `reportStep` and `reportPlanTask` patterns)
- `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 3)

- [ ] **Write failing test**

```javascript
import { reportCostCheckpoint, readEvents } from '../../lib/lifecycle-state.mjs';
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('reportCostCheckpoint appends a cost_checkpoint event', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'adev-rcc-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.context-index', 'specs', 'features', 'test'), { recursive: true });
  writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.28.0"\n');
  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  const totals = { input_tokens: 100, output_tokens: 200, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.001, wall_seconds: 5 };
  reportCostCheckpoint(root, specPath, { step: 'review', totals });

  const events = readEvents(root, specPath);
  const checkpoints = events.filter(e => e.event === 'cost_checkpoint');
  assert.strictEqual(checkpoints.length, 1);
  assert.strictEqual(checkpoints[0].step, 'review');
  assert.deepStrictEqual(checkpoints[0].totals, totals);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: FAIL — `reportCostCheckpoint is not a function` (not yet exported).

- [ ] **Implement**

In `lib/lifecycle-state.mjs`, add after `reportIntervention` (around line 972):

```javascript
/**
 * Append a `cost_checkpoint` event.
 *
 * Mirrors the `reportStep` API contract: side-effecting append,
 * no return value, errors thrown synchronously to caller.
 *
 * @param {string} projectRoot
 * @param {string} specPath
 * @param {object} args
 * @param {string}   args.step            - Lifecycle step name (review|plan|route|implement|validate)
 * @param {object}   args.totals          - Required token + USD totals object
 * @param {object[]} [args.model_breakdown] - Optional per-model cost breakdown
 * @param {string}   [args.since]         - Optional ISO-8601 cutoff used by the aggregator
 * @param {number}   [args.skipped_lines] - Optional count of lines skipped by aggregator
 * @param {string}   [args.spec_ref]      - Optional project-root-relative spec path
 * @returns {void}
 */
export function reportCostCheckpoint(projectRoot, specPath, args) {
  if (!args || typeof args !== 'object') {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportCostCheckpoint requires an args object');
  }
  const { step, totals, model_breakdown, since, skipped_lines, spec_ref } = args;
  if (typeof step !== 'string' || step.length === 0) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportCostCheckpoint requires step as a non-empty string');
  }
  if (!totals || typeof totals !== 'object' || Array.isArray(totals)) {
    throw mkErr('EVENT_SCHEMA_INVALID', 'reportCostCheckpoint requires totals as an object');
  }
  const payload = { event: 'cost_checkpoint', step, totals };
  if (model_breakdown !== undefined) payload.model_breakdown = model_breakdown;
  if (since !== undefined) payload.since = since;
  if (skipped_lines !== undefined) payload.skipped_lines = skipped_lines;
  if (spec_ref !== undefined) payload.spec_ref = spec_ref;
  appendEvent(projectRoot, specPath, payload);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/lifecycle-state.mjs tests/lib/lifecycle-state-cost-checkpoint.test.mjs
git commit -m "feat(session-awareness): add reportCostCheckpoint emitter to lifecycle-state

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-3"
```

---

### Task 4: Add CLI arm --type cost-checkpoint [specialist: none]

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/cli/report.mjs`
- Test: `tests/cli/report-cost-checkpoint.test.mjs`

**Tests:** `tests/cli/report-cost-checkpoint.test.mjs` — CLI arm tests covering: raw `--totals-json` mode (exit 0, event appended), `--from-summary` mode (with fixture `.session-tracking.jsonl`), mutual-exclusion errors, missing `--step`, invalid `--step`, invalid `--totals-json` JSON, `--totals-json` non-object, non-finite number top-level field, path traversal, spec not found.

**Context to load:**
- `lib/cli/report.mjs` (full read — existing arm patterns)
- `lib/cost-summary.mjs` (aggregate function signature + async behavior; SA-2: must `await`)
- `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behaviors 4, 5, 6; Error Cases)
- Review note SA-1: capture `since` before calling `aggregate()` so it can be in the payload

- [ ] **Write failing test**

```javascript
// In tests/cli/report-cost-checkpoint.test.mjs
// Key tests: exit 0 + event appended, mutual-exclusion, missing --step, invalid --step,
// bad JSON, non-object JSON, non-finite number, --from-summary with no data (silent exit 0)
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
// ... (follows pattern from tests/cli/report.test.mjs)

test('--type cost-checkpoint --totals-json appends event', () => {
  // setup: temp project + spec file
  // run: adev report --type cost-checkpoint --spec <p> --step review --totals-json '{"input_tokens":1}'
  // assert: exit 0 + one cost_checkpoint event in JSONL
});

test('--type cost-checkpoint --from-summary --totals-json mutual exclusion', () => {
  // run: adev report --type cost-checkpoint --spec <p> --step review --totals-json '{}' --from-summary
  // assert: exit 1, message contains 'mutually exclusive'
});
// ... more test cases per Error Cases table
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/report-cost-checkpoint.test.mjs`
Expected: FAIL — `unknown --type "cost-checkpoint"` from existing report.mjs dispatch.

- [ ] **Implement**

In `lib/cli/report.mjs`:

1. Add new flags to `parseArgs` options block:
   - `"totals-json": { type: "string" }`
   - `"from-summary": { type: "boolean", default: false }`

2. Update the `USAGE` constant and the final `v.type !== "validator"` guard to include `cost-checkpoint`.

3. Add import for `reportCostCheckpoint` from `../lifecycle-state.mjs` and `aggregate` from `../cost-summary.mjs`.

4. Add the `--type cost-checkpoint` arm before the `v.type !== "validator"` fallback:

```javascript
if (v.type === 'cost-checkpoint') {
  // Required: --spec, --step
  if (!v.spec) { console.error(USAGE); console.error('  --type cost-checkpoint requires --spec'); process.exit(1); }
  if (!v.step) { console.error(USAGE); console.error('  --type cost-checkpoint requires --step'); process.exit(1); }

  const VALID_CHECKPOINT_STEPS = new Set(['review', 'plan', 'route', 'implement', 'validate']);
  if (!VALID_CHECKPOINT_STEPS.has(v.step)) {
    console.error(`--step must be one of: review, plan, route, implement, validate (got ${JSON.stringify(v.step)})`);
    process.exit(1);
  }

  // Mutual exclusion
  if (v['totals-json'] !== undefined && v['from-summary']) {
    console.error('--totals-json and --from-summary are mutually exclusive');
    process.exit(1);
  }
  if (!v['totals-json'] && !v['from-summary']) {
    console.error('--type cost-checkpoint requires --totals-json or --from-summary');
    process.exit(1);
  }

  // Spec containment
  const absRoot = resolve(projectRoot);
  const absSpec = resolveContained(absRoot, v.spec);
  if (!absSpec) { console.error(`spec not found: ${v.spec}`); process.exit(1); }
  if (!existsSync(absSpec)) { console.error(`spec not found: ${v.spec}`); process.exit(1); }

  if (v['from-summary']) {
    // SA-1: capture since before aggregate() call
    // aggregate() uses defaultSinceFromReview internally when since is undefined
    const result = await aggregate({ projectRoot: absRoot, specPath: v.spec });
    if (result.totals === null) {
      // Behavior 6: silent exit 0, no event appended
      return;
    }
    // Build payload with optional since (not directly exposed by aggregate() — SA-1 note:
    // aggregate() resolves `since` internally; we include skipped_lines + model_breakdown)
    reportCostCheckpoint(absRoot, v.spec, {
      step: v.step,
      totals: result.totals,
      model_breakdown: result.model_breakdown,
      skipped_lines: result.skipped_lines,
      spec_ref: v.spec,
    });
    return;
  }

  // --totals-json mode
  let totals;
  try {
    totals = JSON.parse(v['totals-json']);
  } catch (err) {
    console.error(`--totals-json could not be parsed: ${err.message}`);
    process.exit(1);
  }
  if (!totals || typeof totals !== 'object' || Array.isArray(totals)) {
    console.error('--totals-json must be a JSON object');
    process.exit(1);
  }
  // SEC-1: non-finite number validation on top-level fields only
  for (const [key, val] of Object.entries(totals)) {
    if (typeof val === 'number' && !Number.isFinite(val)) {
      console.error(`--totals-json field "${key}" must be a finite number`);
      process.exit(1);
    }
  }
  reportCostCheckpoint(absRoot, v.spec, { step: v.step, totals });
  return;
}
```

5. Update `help()` to include `--type cost-checkpoint` documentation.

6. Make `run()` an `async` function (it calls `aggregate()` which is async; SA-2).

- [ ] **Verify test passes**

Run: `node --test tests/cli/report-cost-checkpoint.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/report.mjs tests/cli/report-cost-checkpoint.test.mjs
git commit -m "feat(session-awareness): add adev report --type cost-checkpoint CLI arm

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-4"
```

---

### Task 5: Update build skill prose [specialist: none]

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/build/SKILL.md`
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` (prose presence assertion)

**Tests:** `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — asserts `skills/build/SKILL.md` step 6 prose contains exactly one invocation of `adev report --type cost-checkpoint --from-summary --spec ... --step ...`.

**Context to load:**
- `skills/build/SKILL.md` (step 6 section, lines 294–308)
- `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Behavior 7)
- Review note SA-3: new line belongs in step 6 (after ticker), not step 5

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('skills/build/SKILL.md step 6 contains cost-checkpoint invocation', () => {
  const content = readFileSync(resolve(process.cwd(), 'skills/build/SKILL.md'), 'utf8');
  const matches = content.match(/adev report --type cost-checkpoint --from-summary/g) ?? [];
  assert.strictEqual(matches.length, 1, 'Expected exactly one cost-checkpoint invocation in SKILL.md');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: FAIL — `SKILL.md` does not yet contain the invocation.

- [ ] **Implement**

In `skills/build/SKILL.md`, locate the step 6 "Cost ticker between steps" section. After the existing ticker invocation block (both interactive and `--auto` modes), add:

```
   **Cost-checkpoint persistence (cost-checkpoint-events.spec.md Behavior 7).** After the cost ticker call above, persist the aggregated cost into the lifecycle log. This is informational — a non-zero exit does NOT block the build:

   ```bash
   adev report --type cost-checkpoint --from-summary --spec <SPEC_PATH> --step <STEP_NAME>
   ```

   The `--step` argument echoes the step name just passed to `adev build-state record`. When the aggregator has no data for the spec (`totals: null`), the call exits 0 with no event appended (Behavior 6 — silent no-op).
```

**Note:** Per CLAUDE.md anti-patterns, this is a plain shell code block used as a CLI invocation directive, not an executable Node.js block. The pattern is consistent with the adjacent ticker block in step 6.

- [ ] **Verify test passes**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/build/SKILL.md tests/lib/lifecycle-state-cost-checkpoint.test.mjs
git commit -m "feat(session-awareness): wire cost-checkpoint persistence into build skill step 6

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-5"
```

---

### Task 6: Update lifecycle-event-log spec [specialist: none]

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md`
- Test: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` (cross-spec consistency assertion)

**Tests:** `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` — asserts `lifecycle-event-log.spec.md` canonical-events table contains `cost_checkpoint`.

**Context to load:**
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` (canonical-events table section)
- `lib/diagnostics/event-schemas.mjs` (comment at lines 17–20 documenting four-step process)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('lifecycle-event-log.spec.md canonical-events table includes cost_checkpoint', () => {
  const content = readFileSync(
    resolve(process.cwd(), '.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md'),
    'utf8'
  );
  assert.ok(content.includes('cost_checkpoint'), 'lifecycle-event-log.spec.md must mention cost_checkpoint');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: FAIL — `cost_checkpoint` not yet in the spec.

- [ ] **Implement**

In `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md`, locate the canonical-events table. Append a new row for `cost_checkpoint`:

```markdown
| `cost_checkpoint` | Per-step token + USD totals persisted by `reportCostCheckpoint()` after each pipeline step. Required fields: `event`, `ts`, `step`, `totals`. Optional: `model_breakdown`, `since`, `skipped_lines`, `spec_ref`. See `cost-checkpoint-events.spec.md`. | `lib/lifecycle-state.mjs::reportCostCheckpoint` |
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/lifecycle-state-cost-checkpoint.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md tests/lib/lifecycle-state-cost-checkpoint.test.mjs
git commit -m "docs(session-awareness): add cost_checkpoint to lifecycle-event-log canonical-events table

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-6"
```

---

### Task 7: Tests [specialist: none]

**Depends on:** Tasks 1, 2, 3, 4, 5, 6

**Charter capability:** Cost-Checkpoint Lifecycle Events
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/cli/report-cost-checkpoint.test.mjs`
- Create: `tests/lib/lifecycle-state-cost-checkpoint.test.mjs`

**Tests:** This task IS the tests. It consolidates all test cases written incrementally in Tasks 1–6 into complete, well-structured test files and adds the remaining acceptance-criteria coverage not yet proven by earlier tasks.

**Context to load:**
- `tests/cli/report.test.mjs` (test file structure pattern)
- `tests/helpers.mjs` (`createTempDir`, `cleanupTempDir`, `writeFixture`)
- `.context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md` (Acceptance Criteria)

- [ ] **Write failing test**

All tests in `tests/cli/report-cost-checkpoint.test.mjs` must collectively cover:
1. `--totals-json` mode: event appended, exit 0, silent stdout
2. `--from-summary` mode: reads aggregator, appends event, exit 0
3. `--from-summary` with no aggregator data: no event appended, exit 0
4. `--totals-json` + `--from-summary` mutual exclusion: exit 1
5. Missing `--step`: exit 1
6. `--step` not in allowed set: exit 1
7. `--totals-json` not valid JSON: exit 1
8. `--totals-json` non-object (e.g., array): exit 1
9. `--totals-json` with non-finite top-level number: exit 1
10. Spec path traversal: exit 1
11. Spec not found: exit 1

All tests in `tests/lib/lifecycle-state-cost-checkpoint.test.mjs` must cover:
1. `CANONICAL_EVENTS.has('cost_checkpoint')` (from Task 1)
2. `REQUIRED_FIELDS_BY_EVENT.cost_checkpoint` deep-equals `['event', 'ts', 'step', 'totals']` (Task 2)
3. `reportCostCheckpoint` appends correct JSONL event shape (Task 3)
4. `reportCostCheckpoint` with unknown discriminator event still projects under `unknownEvents[]` for unrelated events — regression guard for additive-change requirement (AC line "Logs containing events with unknown discriminators continue to parse")
5. `skills/build/SKILL.md` step 6 contains exactly one cost-checkpoint invocation (Task 5)
6. `lifecycle-event-log.spec.md` canonical-events table includes `cost_checkpoint` (Task 6)
7. Diagnostic schema test: a `cost_checkpoint` event missing `step` is flagged by `adev/event-schema-valid` (AC line 172)
8. End-to-end integration: `reportCostCheckpoint` called twice for same `(spec, step)` pair → two events appended (Behavior 9 — append-only)

- [ ] **Verify test fails**

Run: `npm test`
Expected: FAIL — any tests that touch not-yet-implemented acceptance criteria items fail.

- [ ] **Implement**

Flesh out all stubs written in Tasks 1–6 into complete test implementations following the pattern in `tests/cli/report.test.mjs`. Add the remaining coverage items listed above.

For the `--from-summary` tests: write a minimal `.session-tracking.jsonl` fixture with one entry containing `spec_ref` matching the test spec and a `usage` object. This proves the aggregator is called without needing network access.

For the diagnostic schema test: instantiate a temp project, call `appendEvent` (not `reportCostCheckpoint`) with a `cost_checkpoint` event missing the `step` field in strict event-diagnostics mode (`manifest.lifecycle.event_diagnostics: strict`), and assert it throws `GateError`.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — full test suite passes.

- [ ] **Commit**

```bash
git add tests/cli/report-cost-checkpoint.test.mjs tests/lib/lifecycle-state-cost-checkpoint.test.mjs
git commit -m "test(session-awareness): add cost-checkpoint test suite (producer + CLI arm)

Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
Plan-task: task-7"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- Lint passes: (no separate lint command in constitution — covered by `npm test`)
- All acceptance criteria from spec satisfied

**Key acceptance criteria cross-check:**
- `CANONICAL_EVENTS` contains `'cost_checkpoint'` ✓ (Task 1)
- `REQUIRED_FIELDS_BY_EVENT.cost_checkpoint` = `['event', 'ts', 'step', 'totals']` ✓ (Task 2)
- `reportCostCheckpoint` exported + appends correct shape ✓ (Task 3)
- CLI arm raw + `--from-summary` modes functional ✓ (Task 4)
- Build skill step 6 prose updated ✓ (Task 5)
- `lifecycle-event-log.spec.md` updated ✓ (Task 6)
- Diagnostic recognises new discriminator ✓ (Task 7)
- Additive-change regression: unknown discriminators still project under `unknownEvents[]` ✓ (Task 7)
- Append-only: duplicate `(spec, step)` pairs append new event, not overwrite ✓ (Task 7)
- `cost-summary` read-only contract preserved ✓ (Task 7 integration assertion)
- `npm test` passes ✓ (Task 7)
- No constitutional violations ✓ (all tasks — zero new dependencies, ESM only)
