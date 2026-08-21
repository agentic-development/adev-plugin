<!-- partial_schema: plan@1 -->

# Implementation Plan: Per-Issue Attempt Cap

> **Methodology:** adev
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-19)
> **Platform:** Node.js (ESM), JavaScript, npm, node:test

**Goal:** Give `/adev:bugfix-loop` a per-issue attempt cap by adding a small `AttemptRecord` read/write module that reuses `lib/loop-convergence.mjs`'s existing `partitionBlockers`/`evaluateStopCondition` bounding logic, keyed per issue and persisted as an append-only JSONL event log.

**Architecture:** A new module, `lib/bugfix-loop-attempts.mjs`, owns the `.context-index/lifecycle-state/bugfix-loop-attempts.jsonl` file: append-only writes (mirroring the `fs.appendFileSync`/`O_APPEND` pattern already used by `lib/lifecycle-state.mjs`), fold-on-read to the latest record per `issue_id`. It never modifies `lib/loop-convergence.mjs` — only imports and calls its two exports, mapping debug-attempt outcomes (`FIXED`/`PARKED`/`UNREPRODUCIBLE`) onto that module's existing blocker-set/verdict shape. The degraded-mode hash fallback reuses the exact 8-hex-char `SHA-256` truncation convention already established by `lib/blocker-id.mjs` (see RI-1/BD-1 resolution note below). `AttemptRecord` writes are invoked by the sibling `/adev:bugfix-loop` skill (not built by this plan — out of scope, see Preconditions), and reads are consumed by the sibling `bug-selection-and-eligibility` verb (also out of scope — this plan only needs to expose stable, well-documented read exports for that consumer).

**Review-note resolutions carried into this plan:**
- **RI-1 / BD-1 (digest length left to implementer discretion):** resolved to **8 lowercase hex characters** of `SHA-256`, matching the existing precedent in `lib/blocker-id.mjs::buildBlockerId` (`createHash('sha256').update(...).digest('hex').slice(0, 8)`). Using the same convention keeps blocker-adjacent hashing consistent project-wide.
- **WR-3 (parked_reason has a reader but no clearing verb):** intentional scope boundary, not a gap to fix here. The spec's own Preconditions bullet 5 states `parked_reason` is diagnostic/audit-only, human-readable directly from the JSONL, with "no programmatic reader in this charter." No clearing verb exists anywhere in the charter yet (a human clears a capped issue by editing/appending to the log directly, or a future spec adds a verb). Adding an unrequested "clear" verb here would exceed this spec's Actionable Task Map. Noted, not actioned.
- **WR-4 (no end-to-end integration test across the write-to-exclusion path):** the consuming verb (`adev issues next`, owned by the sibling `bug-selection-and-eligibility` spec) is not yet implemented in this codebase (verified: no `issues next` verb exists in `cli/index.mjs` or `lib/issues/*.mjs` today) — a true end-to-end test spanning both specs cannot be written until that sibling lands. Task 5 below adds the maximal integration coverage available today: a full write → read-back → verdict round trip within this module's own boundary (multiple sequential attempts on one issue, verifying `curr_blockers` persists and reads back as the next attempt's `prev_blockers`, per the spec's own Postconditions and Acceptance Criteria).
- **WR-7 (ADR-0015 registration has a real consumer, not cited, untested):** Task 6 below both cites the consumer relationship in the ADR entry itself and adds a dedicated test (following the existing `tests/adrs/0012-status.test.mjs` precedent) asserting the Decision-table row exists — closing the "no test verifies registration" gap directly.

---

## File Structure

**Create:**
- `lib/bugfix-loop-attempts.mjs` — `AttemptRecord` schema, JSONL read/write helpers, cap resolution, degraded-hash fallback, and the `recordDebugAttempt` orchestrator
- `tests/lib/bugfix-loop-attempts.test.mjs` — full verdict-matrix coverage (PASS, CONTINUE, NO_PROGRESS, REGRESSED, BUDGET_EXHAUSTED, UNREPRODUCIBLE-as-immediate-terminal, cap-1-first-attempt), corrupted-state fail-open, degraded-mode hash fallback, cap resolution/default
- `tests/adrs/0015-decision-table.test.mjs` — asserts ADR-0015's Decision-table includes the new `bugfix-loop-attempts.jsonl` row (WR-7 mitigation)

**Modify:**
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — add a Decision-table row for `bugfix-loop-attempts.jsonl` per that ADR's stated requirement that future state artifacts in `lifecycle-state/` declare format + ownership
- `templates/manifest-template.yaml` — document `tasks.bugfix_loop.attempt_cap` next to the existing `tasks:` block (around the `claim_ttl_minutes` doc comment), noting the default of 2

**Reference (read, do not modify):**
- `lib/loop-convergence.mjs` — `partitionBlockers(prev, curr)` and `evaluateStopCondition({...})`, imported and called as-is; this spec's implementer must not change its exports' signatures or behavior (System Constitution Reference)
- `lib/blocker-id.mjs` — `buildBlockerId`/`truncateForHash` pattern; source of the 8-hex-char SHA-256 digest convention this plan reuses for the degraded-mode fallback
- `lib/lifecycle-state.mjs` — `appendEvent`'s `mkdirSync` + `appendFileSync(..., { flag: 'a' })` pattern (lines ~304-344) is the precedent for this module's append-only write primitive; `readEvents`/`currentState`'s fold-on-read projection is the precedent for folding the JSONL by `issue_id` to the latest record
- `lib/errors.mjs` — `codedError` helper convention for `.code`-tagged errors
- `.context-index/specs/features/autonomous-bugfix-loop/charter.md` — Domain Model (`AttemptRecord` extension) and Capability Map (`Per-Issue Attempt Cap` row)
- `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` — the consumer contract (BEH-5, Preconditions bullets 26-27): confirms this plan's read exports must let that verb treat a missing record as zero attempts, never excluded
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — existing Decision table to extend (columns: File | Writer | Format | Tracked | Owner Spec)

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (BEH-5, Postconditions bullets 2-3, Error Cases row 2 "corrupted state")
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: Per-Issue Attempt Cap)
- Source files: `lib/lifecycle-state.mjs` (full read — `appendEvent` lines ~219-350, `readEvents` lines ~1850+, for the append/fold pattern), `lib/errors.mjs` (full read — `codedError`)
- Sibling contract: `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` (Preconditions bullets 26-27, BEH-5 — export signatures only)

### Task 2 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (Preconditions bullet 4, Error Cases row 3 "cap not configured")
- Source files: `lib/lifecycle-state.mjs` (`resolveGateMode`, lines ~2338-2350 — manifest-default-with-warning pattern; signature only)
- Template: `templates/manifest-template.yaml` (`tasks:` block, lines ~229-244, full read)

### Task 3 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (Error Cases row 1, task map row "Implement bounded-hash degraded-mode fallback", BD-6)
- Source files: `lib/blocker-id.mjs` (full read — `truncateForHash`, `buildBlockerId`'s hash construction)

### Task 4 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (BEH-1, BEH-3, Postconditions bullet 1)
- Source files: `lib/bugfix-loop-attempts.mjs` (from Task 1, full read — extending, not creating)

### Task 5 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (BEH-2, BEH-6, Acceptance Criteria bullets 3-4)
- Source files: `lib/bugfix-loop-attempts.mjs` (from Tasks 1-4, full read), `lib/loop-convergence.mjs` (full read — exact `evaluateStopCondition` precedence rules, especially the `retries_remaining <= 0` branch and the `prevSet.size > 0` guard)

### Task 6 Context
- Spec: `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` (Postconditions bullet 2, Acceptance Criteria bullet 9)
- ADR: `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (Decision section table, full read; Consequences > Positive, for the Pass-21/hygiene consumer citation)
- Sample precedent: `tests/adrs/0012-status.test.mjs` (full read — the exact `readFileSync` + `assert.match` style to follow)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

*Note: these heuristics concern token/cost measurement and skill-output ergonomics, not this plan's code content — none are directly actionable against `lib/bugfix-loop-attempts.mjs`. Included per Step 2 retrieval; no task below cites one, which is expected when a module's heuristic pool is off-topic for the code being written.*

---

## Parallelization

- Group A (sequential): Task 1 → Task 4 → Task 5 (all extend the same `lib/bugfix-loop-attempts.mjs` / `tests/lib/bugfix-loop-attempts.test.mjs` files)
- Group A (sequential, file-adjacent): Task 2, Task 3 also extend `lib/bugfix-loop-attempts.mjs` — run after Task 1 lands the module skeleton, before Task 5 (which needs both the cap resolver and the hash fallback)
- Group B (independent): Task 6 (ADR + new test file — no overlap with the `lib/bugfix-loop-attempts.mjs` file; only needs Task 1's file path/schema to exist)

Effective order: Task 1 → {Task 2, Task 3 in either order} → Task 4 → Task 5, with Task 6 runnable any time after Task 1.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | AttemptRecord schema + read helpers (fail-open) | small | unit | — | 2 create, 0 modify |
| 2 | Attempt-cap manifest resolution | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Degraded-mode hash fallback | small | unit | Task 1 | 0 create, 0 modify |
| 4 | recordDebugAttempt: FIXED + UNREPRODUCIBLE paths | medium | unit | Task 1 | 0 create, 0 modify |
| 5 | recordDebugAttempt: PARKED path (loop-convergence integration) | medium | unit | Task 1, Task 2, Task 3, Task 4 | 0 create, 0 modify |
| 6 | ADR-0015 Decision-table entry + registration test | small | unit | Task 1 | 1 create, 1 modify |

---

## Task Structure

### Task 1: AttemptRecord schema + read helpers [specialist: none]

**Charter capability:** Per-Issue Attempt Cap
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/bugfix-loop-attempts.mjs`
- Create: `tests/lib/bugfix-loop-attempts.test.mjs`

**Tests:** `tests/lib/bugfix-loop-attempts.test.mjs` — new suite (per-behavior granularity, source: manifest `test_policy.granularity`). Covers BEH-5 and the corrupted-state Error Case.

**Context to load:**
- `lib/lifecycle-state.mjs` (`appendEvent` write pattern, `readEvents` fold pattern)
- `lib/errors.mjs` (`codedError`)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAttemptRecord, resolveAttemptsLogPath } from '../../lib/bugfix-loop-attempts.mjs';

test('readAttemptRecord returns null when no record exists for the issue (BEH-5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  mkdirSync(join(root, '.context-index'), { recursive: true });
  assert.equal(readAttemptRecord(root, 'issue-1'), null);
  rmSync(root, { recursive: true, force: true });
});

test('readAttemptRecord fails open (treats as zero attempts) when the log file is corrupted', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const logPath = resolveAttemptsLogPath(root);
  mkdirSync(join(root, '.context-index', 'lifecycle-state'), { recursive: true });
  writeFileSync(logPath, 'not valid json\n{"issue_id":"issue-1"\n');
  assert.equal(readAttemptRecord(root, 'issue-1'), null);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/bugfix-loop-attempts.mjs'`

- [ ] **Implement**

```javascript
// lib/bugfix-loop-attempts.mjs
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { codedError as mkErr } from './errors.mjs';

export function resolveAttemptsLogPath(projectRoot) {
  return join(projectRoot, '.context-index', 'lifecycle-state', 'bugfix-loop-attempts.jsonl');
}

// Fold the JSONL by issue_id, last (valid) line wins. Corrupted lines are
// skipped with a logged warning (fail-open — Error Cases row 2).
function readAllRaw(projectRoot) {
  const logPath = resolveAttemptsLogPath(projectRoot);
  if (!existsSync(logPath)) return new Map();
  const raw = readFileSync(logPath, 'utf8');
  const byIssue = new Map();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[bugfix-loop-attempts] skipping corrupted line in ${logPath}`);
      continue;
    }
    if (!parsed || typeof parsed.issue_id !== 'string') continue;
    byIssue.set(parsed.issue_id, parsed);
  }
  return byIssue;
}

export function readAttemptRecord(projectRoot, issueId) {
  return readAllRaw(projectRoot).get(issueId) ?? null;
}

export function readAllAttemptRecords(projectRoot) {
  return readAllRaw(projectRoot);
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/autonomous-bugfix-loop/per-issue-attempt-cap`

```bash
git add lib/bugfix-loop-attempts.mjs tests/lib/bugfix-loop-attempts.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add AttemptRecord read helpers with fail-open corruption handling

Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
Plan-task: 1"
```

---

### Task 2: Attempt-cap manifest resolution [specialist: none]

**Charter capability:** Per-Issue Attempt Cap
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `templates/manifest-template.yaml:229-244` — document `tasks.bugfix_loop.attempt_cap` alongside the existing `claim_ttl_minutes` comment block

**Tests:** `tests/lib/bugfix-loop-attempts.test.mjs` — extend (per-behavior granularity; same behavior group as Task 1's suite since this is the same module).

**Context to load:**
- `lib/lifecycle-state.mjs` (`resolveGateMode`, signature only — manifest-default-with-warning pattern)
- `templates/manifest-template.yaml:229-244`

- [ ] **Write failing test**

```javascript
test('resolveAttemptCap defaults to 2 when tasks.bugfix_loop.attempt_cap is unset', () => {
  assert.equal(resolveAttemptCap({}), 2);
  assert.equal(resolveAttemptCap(undefined), 2);
});

test('resolveAttemptCap reads tasks.bugfix_loop.attempt_cap when present', () => {
  assert.equal(resolveAttemptCap({ tasks: { bugfix_loop: { attempt_cap: 5 } } }), 5);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: FAIL — `resolveAttemptCap is not a function` (not yet exported)

- [ ] **Implement**

```javascript
export const DEFAULT_ATTEMPT_CAP = 2;

export function resolveAttemptCap(manifest) {
  const raw = manifest?.tasks?.bugfix_loop?.attempt_cap;
  if (raw == null) return DEFAULT_ATTEMPT_CAP;
  if (Number.isInteger(raw) && raw > 0) return raw;
  // eslint-disable-next-line no-console
  console.warn(
    `[bugfix-loop-attempts] tasks.bugfix_loop.attempt_cap "${raw}" is not a positive integer; defaulting to ${DEFAULT_ATTEMPT_CAP}.`,
  );
  return DEFAULT_ATTEMPT_CAP;
}
```

Also add to `templates/manifest-template.yaml`, near the `claim_ttl_minutes` comment (line ~244):

```yaml
  # bugfix_loop.attempt_cap: per-issue attempt cap for /adev:bugfix-loop's
  #   auto-retry (per-issue-attempt-cap.spec.md). Default: 2. An issue whose
  #   AttemptRecord.last_verdict lands on NO_PROGRESS, REGRESSED, or
  #   BUDGET_EXHAUSTED is excluded from `adev issues next` until cleared.
  # bugfix_loop:
  #   attempt_cap: 2
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-attempts.mjs tests/lib/bugfix-loop-attempts.test.mjs templates/manifest-template.yaml
git commit -m "feat(autonomous-bugfix-loop): add attempt-cap manifest resolution with default of 2

Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
Plan-task: 2"
```

---

### Task 3: Degraded-mode hash fallback [specialist: none]

**Charter capability:** Per-Issue Attempt Cap
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- (extends `lib/bugfix-loop-attempts.mjs` from Task 1)

**Tests:** `tests/lib/bugfix-loop-attempts.test.mjs` — extend.

**Context to load:**
- `lib/blocker-id.mjs` (full read — `truncateForHash`, hash construction in `buildBlockerId`)

- [ ] **Write failing test**

```javascript
test('computeDegradedBlockerHash returns 8 lowercase hex chars, matching lib/blocker-id.mjs convention', () => {
  const hash = computeDegradedBlockerHash('some raw quality-gate failure output');
  assert.match(hash, /^[0-9a-f]{8}$/);
});

test('computeDegradedBlockerHash is stable for identical input and differs for different input', () => {
  const a = computeDegradedBlockerHash('failure output A');
  const b = computeDegradedBlockerHash('failure output A');
  const c = computeDegradedBlockerHash('failure output B');
  assert.equal(a, b);
  assert.notEqual(a, c);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: FAIL — `computeDegradedBlockerHash is not a function`

- [ ] **Implement**

```javascript
import { createHash } from 'node:crypto';

// Degraded-mode fallback (Error Cases row 1, BD-6): when quality-gate output
// has no stable/comparable check-ID shape, fall back to a bounded hash of
// the raw output — never the raw output itself is persisted. 8 hex chars
// mirrors the existing lib/blocker-id.mjs::buildBlockerId convention.
export function computeDegradedBlockerHash(rawOutput) {
  const text = rawOutput == null ? '' : String(rawOutput);
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-attempts.mjs tests/lib/bugfix-loop-attempts.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add degraded-mode bounded-hash fallback for unstable check IDs

Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
Plan-task: 3"
```

---

### Task 4: recordDebugAttempt — FIXED + UNREPRODUCIBLE paths [specialist: none]

**Charter capability:** Per-Issue Attempt Cap
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- (extends `lib/bugfix-loop-attempts.mjs` from Task 1)

**Tests:** `tests/lib/bugfix-loop-attempts.test.mjs` — extend. Covers BEH-1, BEH-3, Postconditions bullet 1.

**Context to load:**
- `lib/bugfix-loop-attempts.mjs` (from Tasks 1-3, full read)

- [ ] **Write failing test**

```javascript
test('recordDebugAttempt: FIXED increments attempts and sets last_verdict PASS (BEH-1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const rec = recordDebugAttempt(root, {}, { issueId: 'issue-1', outcome: 'FIXED' });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.last_verdict, 'PASS');
  assert.deepEqual(readAttemptRecord(root, 'issue-1'), rec);
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: UNREPRODUCIBLE sets BUDGET_EXHAUSTED immediately with parked_reason (BEH-3)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const rec = recordDebugAttempt(root, {}, { issueId: 'issue-1', outcome: 'UNREPRODUCIBLE' });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.last_verdict, 'BUDGET_EXHAUSTED');
  assert.equal(rec.parked_reason, 'does not reproduce');
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: FAIL — `recordDebugAttempt is not a function`

- [ ] **Implement**

```javascript
function appendAttemptRecord(projectRoot, record) {
  const logPath = resolveAttemptsLogPath(projectRoot);
  mkdirSync(dirname(logPath), { recursive: true });
  const line = JSON.stringify(record) + '\n';
  appendFileSync(logPath, line, { flag: 'a' });
  return record;
}

export function recordDebugAttempt(projectRoot, manifest, { issueId, outcome, checkIds, rawOutput } = {}) {
  if (typeof issueId !== 'string' || issueId.length === 0) {
    throw mkErr('INVALID_ISSUE_ID', 'issueId must be a non-empty string');
  }
  const prior = readAttemptRecord(projectRoot, issueId);
  const attempts = (prior?.attempts ?? 0) + 1;
  const base = { issue_id: issueId, attempts, updated_at: new Date().toISOString() };

  if (outcome === 'FIXED') {
    return appendAttemptRecord(projectRoot, {
      ...base,
      last_verdict: 'PASS',
      curr_blockers: [],
      parked_reason: null,
    });
  }

  if (outcome === 'UNREPRODUCIBLE') {
    return appendAttemptRecord(projectRoot, {
      ...base,
      last_verdict: 'BUDGET_EXHAUSTED',
      curr_blockers: [],
      parked_reason: 'does not reproduce',
    });
  }

  // PARKED path added in Task 5.
  throw mkErr('UNSUPPORTED_OUTCOME', `outcome "${outcome}" not yet handled`);
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-attempts.mjs tests/lib/bugfix-loop-attempts.test.mjs
git commit -m "feat(autonomous-bugfix-loop): implement recordDebugAttempt for FIXED and UNREPRODUCIBLE outcomes

Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
Plan-task: 4"
```

---

### Task 5: recordDebugAttempt — PARKED path (loop-convergence integration) [specialist: none]

**Charter capability:** Per-Issue Attempt Cap
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:**
- (extends `lib/bugfix-loop-attempts.mjs` from Tasks 1-4)

**Tests:** `tests/lib/bugfix-loop-attempts.test.mjs` — extend. Covers BEH-2, BEH-6, the cap-1-first-attempt edge case, and (per WR-4 resolution above) a multi-attempt write→read-back round trip proving `curr_blockers` persists as the next attempt's `prev_blockers`.

**Context to load:**
- `lib/loop-convergence.mjs` (full read — exact precedence rules in `evaluateStopCondition`)
- `lib/bugfix-loop-attempts.mjs` (from Tasks 1-4, full read)

- [ ] **Write failing test**

```javascript
test('recordDebugAttempt: PARKED with no prior record computes CONTINUE via loop-convergence, unconditionally (BEH-2, BEH-5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = { tasks: { bugfix_loop: { attempt_cap: 3 } } };
  const rec = recordDebugAttempt(root, manifest, {
    issueId: 'issue-1',
    outcome: 'PARKED',
    checkIds: ['test-a', 'test-b'],
  });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.last_verdict, 'CONTINUE');
  assert.deepEqual(rec.curr_blockers.sort(), ['test-a', 'test-b']);
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED with cap=1 on first attempt yields BUDGET_EXHAUSTED, not unset (BEH-2 unconditional call)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = { tasks: { bugfix_loop: { attempt_cap: 1 } } };
  const rec = recordDebugAttempt(root, manifest, {
    issueId: 'issue-1',
    outcome: 'PARKED',
    checkIds: ['test-a'],
  });
  assert.equal(rec.last_verdict, 'BUDGET_EXHAUSTED');
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED persistent blockers across two attempts yields NO_PROGRESS (BEH-6, write-read round trip)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = { tasks: { bugfix_loop: { attempt_cap: 5 } } };
  recordDebugAttempt(root, manifest, { issueId: 'issue-1', outcome: 'PARKED', checkIds: ['test-a'] });
  const prior = readAttemptRecord(root, 'issue-1');
  assert.deepEqual(prior.curr_blockers, ['test-a']); // read-back as next attempt's prev_blockers
  const rec2 = recordDebugAttempt(root, manifest, { issueId: 'issue-1', outcome: 'PARKED', checkIds: ['test-a'] });
  assert.equal(rec2.last_verdict, 'NO_PROGRESS');
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED without stable check IDs falls back to bounded hash (Error Cases row 1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = {};
  const rec = recordDebugAttempt(root, manifest, {
    issueId: 'issue-1',
    outcome: 'PARKED',
    rawOutput: 'raw stdout with no discrete check ids',
  });
  assert.equal(rec.curr_blockers.length, 1);
  assert.match(rec.curr_blockers[0], /^[0-9a-f]{8}$/);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: FAIL — PARKED branch throws `UNSUPPORTED_OUTCOME`

- [ ] **Implement**

```javascript
import { partitionBlockers, evaluateStopCondition } from './loop-convergence.mjs';

// inside recordDebugAttempt, replacing the Task 4 PARKED placeholder:
if (outcome === 'PARKED') {
  const prevBlockers = prior?.curr_blockers ?? [];
  const currBlockers =
    Array.isArray(checkIds) && checkIds.length > 0
      ? checkIds
      : [computeDegradedBlockerHash(rawOutput)];

  const { addressed, persistent, new_ } = partitionBlockers(prevBlockers, currBlockers);
  const cap = resolveAttemptCap(manifest);
  const { verdict } = evaluateStopCondition({
    addressed,
    persistent,
    new_,
    prev_blockers: prevBlockers,
    retries_remaining: cap - attempts,
    verdict: 'BLOCK', // debug attempts never reach PASS via this branch — FIXED is a separate outcome
  });

  return appendAttemptRecord(projectRoot, {
    ...base,
    last_verdict: verdict,
    curr_blockers: currBlockers,
    parked_reason: null,
  });
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-attempts.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-attempts.mjs tests/lib/bugfix-loop-attempts.test.mjs
git commit -m "feat(autonomous-bugfix-loop): wire PARKED outcomes through loop-convergence's partitionBlockers/evaluateStopCondition

Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
Plan-task: 5"
```

---

### Task 6: ADR-0015 Decision-table entry + registration test [specialist: none]

**Charter capability:** Per-Issue Attempt Cap
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `tests/adrs/0015-decision-table.test.mjs`
- Modify: `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (Decision section table)

**Tests:** `tests/adrs/0015-decision-table.test.mjs` — new suite (per-behavior granularity; this is a distinct behavior from the `lib/bugfix-loop-attempts.mjs` suite — the ADR registration requirement — so it gets its own file, following the `tests/adrs/0012-status.test.mjs` precedent of one file per ADR-facing assertion set). Covers Postconditions bullet 2 and Acceptance Criteria bullet 9; mitigates WR-7.

**Context to load:**
- `tests/adrs/0012-status.test.mjs` (full read — style precedent)
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (Decision section, full read)

- [ ] **Write failing test**

```javascript
// tests/adrs/0015-decision-table.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
// Plan-task: 6
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ADR_PATH = '.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md';

test('ADR-0015 Decision table registers bugfix-loop-attempts.jsonl (WR-7)', () => {
  const md = readFileSync(ADR_PATH, 'utf8');
  assert.match(md, /bugfix-loop-attempts\.jsonl/);
  assert.match(md, /lib\/bugfix-loop-attempts\.mjs/);
  assert.match(md, /per-issue-attempt-cap\.spec\.md/);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/adrs/0015-decision-table.test.mjs`
Expected: FAIL — ADR text does not yet mention `bugfix-loop-attempts.jsonl`

- [ ] **Implement**

Add a row to ADR-0015's Decision-section table (after the existing `<slug>.json` row):

```markdown
| `bugfix-loop-attempts.jsonl` | `lib/bugfix-loop-attempts.mjs` | append-only JSON Lines | ✅ yes | `.context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` |
```

Also add a short note under "Related > Owning libraries" citing this module, and (per the ADR's own Consequences > Positive text about `/adev:hygiene`'s lifecycle-audit pass being a consumer of this table) leave that citation as-is — it already documents the consumer relationship; this task only needs to add the new row and library reference.

- [ ] **Verify test passes**

Run: `node --test -- tests/adrs/0015-decision-table.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md tests/adrs/0015-decision-table.test.mjs
git commit -m "docs(autonomous-bugfix-loop): register bugfix-loop-attempts.jsonl in ADR-0015's Decision table

Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
Plan-task: 6"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml`:
- `test` gate (tier: fast, severity: error): `npm test`

Additional acceptance criteria to verify manually (not covered by a deterministic gate command):
- `lib/loop-convergence.mjs` is unmodified by this work — verify via `git diff lib/loop-convergence.mjs` returning empty
- No constitutional violations introduced — pure Node.js built-ins only, no new dependencies, no hook-protocol or CLI-install-path changes
