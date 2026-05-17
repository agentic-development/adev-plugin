# Implementation Plan: Concurrent-write protection for the JSON issue board

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md (rev 2)
> **Review:** PASS (2026-05-17, structural-architect + security-reviewer + consistency-analyzer; all 5 rev-1 warnings RESOLVED, zero new findings)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js 18+, npm, node:test
> **Risk level:** high (HITL-approved 2026-05-17)
> **Strategy:** unit (all tasks; one task uses N-process child-process spawn for concurrency proof but still executes under `node --test`)

**Goal:** Add optimistic compare-and-swap (CAS) to `lib/issues/json-adapter.mjs` so concurrent mutators on a shared `tasks.json` cannot silently overwrite each other; failed writes throw `STALE_BOARD_WRITE` deterministically rather than producing lost updates.

**Architecture:** Add a monotonic `seq` field to the on-disk `tasks.json` document (separate from the existing `version: 2` schema field). Mutating operations (`create`, `update`, `close`, `addDependency`, `createEpic`, `updateEpic`) capture the on-disk `seq` at read, re-read immediately before `renameSync`, and only commit when the disk `seq` still matches the captured value. On mismatch, the operation re-reads the snapshot, re-derives IDs/timestamps from the freshest state, and retries up to `MAX_CAS_RETRIES` (default 3, configurable via `manifest.tasks.cas_max_retries`). The atomic-rename substrate (`lib/build-state.mjs::atomicWriteJson` pattern, already used by the adapter) is unchanged — CAS layers on top. Read-only methods (`list`, `get`, `listEpics`, `walkTree`) continue calling the unchanged `_read()` and pay no CAS overhead.

---

## File Structure

**Create:**
- `tests/issues/json-adapter-cas-concurrency.test.mjs` — N-process concurrency proof (Task 8)
- `tests/issues/json-adapter-cas-exhaustion.test.mjs` — stale-write exhaustion test (Task 7)
- `tests/issues/json-adapter-cas-legacy.test.mjs` — legacy `tasks.json` (no `seq`) transparent upgrade (Task 5)
- `tests/issues/json-adapter-cas-hostile-seed.test.mjs` — `seq > MAX_SAFE_INTEGER` rejection without value-echo (Task 6)
- `tests/issues/json-adapter-internal-encapsulation.test.mjs` — grep-test asserting zero external `_read`/`_write` callers (Task 9)

**Modify:**
- `lib/issues/json-adapter.mjs` — add `seq` schema validation, split read primitive, CAS-ified `_write`, retry wrapper in six mutators, doc header (Tasks 1-4, 11)
- `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md` — amend canonical schema to include `seq`, document `_write` preservation rule (Task 10)

**Reference (read, do not modify):**
- `lib/build-state.mjs::atomicWriteJson` — exemplar atomic-rename pattern
- `lib/issues/interface.mjs` — `IssueManagerInterface` definitions (must stay unchanged)
- `lib/manifest.mjs` — manifest loader (for `tasks.cas_max_retries` knob)
- `tests/helpers.mjs` — test fixtures (`createTempDir`, `cleanupTempDir`, `writeFixture`)

---

## Context Packets

### Task 1 Context (schema validation for `seq`)
- Spec: `.context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md` (Behaviors 4-5; Error Cases rows `INVALID_BOARD_SEQ`, legacy fallback; Acceptance Criteria #4)
- Source files: `lib/issues/json-adapter.mjs` (full read, focus on `_validateBoardDocument` lines 212-249, `CANONICAL_VERSION` constant line 48)
- Sample: existing schema validation in `_validateBoardDocument` (extend the same shape)

### Task 2 Context (split read primitive)
- Spec: Behavior 1; Acceptance Criteria #1; SA-4 resolution in Constitution Reference
- Source files: `lib/issues/json-adapter.mjs` (`_read` lines 262-300, all callers of `_read` — `list`/`get`/`listEpics`/`walkTree` and the six mutators)

### Task 3 Context (CAS-ified `_write`)
- Spec: Behaviors 1-3, 6, 8; Error Cases rows `STALE_BOARD_WRITE_RETRY` and `STALE_BOARD_WRITE`; Acceptance Criteria #2; Constitution Reference (POSIX TOCTOU caveat)
- Source files: `lib/issues/json-adapter.mjs` (`_write` lines 311-338)
- Pattern reference: `lib/build-state.mjs::atomicWriteJson` (temp+rename idiom this builds on)

### Task 4 Context (retry wrapper + manifest knob)
- Spec: Behaviors 1-3, 7; Error Cases rows for retry; Acceptance Criteria #3
- Source files: `lib/issues/json-adapter.mjs` (six mutators — `create` line 384, `update` line 474, `close` line 501, `addDependency` line 604, `createEpic` line 572, `updateEpic` line 584)
- Reference: `lib/manifest.mjs` (loader pattern), `lib/issues/json-adapter.mjs` constructor (line 160) for adapter-side manifest read

### Task 5 Context (legacy-document test)
- Spec: Behavior 5; Acceptance Criteria #6
- Test helpers: `tests/helpers.mjs::createTempDir, cleanupTempDir, writeFixture`
- Reference: existing legacy-fallback path in `_read` lines 282-297 (the existing `tasks.md` fallback is analogous in shape)

### Task 6 Context (hostile-seed test)
- Spec: Error Cases row `INVALID_BOARD_SEQ`; Acceptance Criteria #4 + #7
- Test helpers: same as Task 5

### Task 7 Context (stale-write exhaustion test)
- Spec: Behavior 3; Error Cases row `STALE_BOARD_WRITE`; Acceptance Criteria #5
- Test helpers: same as Task 5
- Pattern: simulate slow-writer by capturing `_readWithSeq` snapshot, allowing other writers to bump `seq` past retry budget

### Task 8 Context (concurrency proof)
- Spec: Behavior 8; Acceptance Criteria #4
- Test helpers: `tests/helpers.mjs` plus Node's `child_process.fork`/`spawn` for true OS-level concurrency
- Pattern: each child process initializes its own adapter instance against the shared `tasks.json` temp dir; main process awaits all child exits, then re-reads the board and asserts the contractual guarantee

### Task 9 Context (internal-encapsulation grep test)
- Spec: Acceptance Criteria #8; CON-5 resolution in Constitution Reference
- Search targets: `lib/**`, `tests/**`, `cli/**`, `hooks/**`, `viz/**`, `providers/**`
- Regex: `\._read\(|\._write\(`
- Pattern: use `node:fs` walk + regex; assert all matches reside in `lib/issues/json-adapter.mjs` itself

### Task 10 Context (sibling spec amendment)
- Target spec: `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md`
- Section: "tasks.json document schema" — add `seq` to the canonical shape; add note that `_write()` preserves `seq` rather than stripping it (exception to the "drop unknown top-level keys" rule)

### Task 11 Context (doc header on json-adapter.mjs)
- Target file: `lib/issues/json-adapter.mjs` (header block lines 1-25)
- Content: one paragraph referencing `STALE_BOARD_WRITE`, the retry budget constant, and the CAS-over-atomic-rename layering

---

## Parallelization

- **Sequential spine:** Task 1 → Task 2 → Task 3 → Task 4 (each builds on the previous adapter modification; shared file `lib/issues/json-adapter.mjs`)
- **Independent test group:** Tasks 5, 6, 7, 8 (new test files; each independent of each other; each depends on Tasks 1-4 being complete because they exercise the new behavior)
- **Independent grep test:** Task 9 (no dependency on Tasks 1-4; pure static check; could run first as a regression baseline if `_read`/`_write` are already free of external callers)
- **Independent doc edits:** Tasks 10, 11 (pure markdown / code-comment edits; no test dependency; can be done at any point in any order)

Recommended order: 1 → 2 → 3 → 4 → (5, 6, 7, 8 in parallel) → 9 → (10, 11 in any order). Total: 11 tasks across one sequential spine and one independent burst.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Add `seq` to document schema validation | small | unit | — | 0 create, 1 modify |
| 2 | Split read primitive (`_read` + `_readWithSeq`) | small | unit | Task 1 | 0 create, 1 modify |
| 3 | CAS-ify `_write(data, expectedSeq)` | medium | unit | Task 2 | 0 create, 1 modify |
| 4 | Retry wrapper in six mutators + manifest knob | medium | unit | Task 3 | 0 create, 1 modify |
| 5 | Legacy-document test | small | unit | Tasks 1, 3 | 1 create, 0 modify |
| 6 | Hostile-seed test | small | unit | Task 1 | 1 create, 0 modify |
| 7 | Stale-write exhaustion test | small | unit | Tasks 3, 4 | 1 create, 0 modify |
| 8 | Concurrency proof (N parallel mutators) | medium | unit | Tasks 3, 4 | 1 create, 0 modify |
| 9 | Internal-encapsulation grep test | small | unit | — | 1 create, 0 modify |
| 10 | Amend sibling spec (json-issue-board-adapter) | small | unit | — | 0 create, 1 modify |
| 11 | Doc header on `json-adapter.mjs` | small | unit | Tasks 1-4 | 0 create, 1 modify |

---

## Strategy Summary

All 11 tasks use the `unit` strategy. The concurrency proof (Task 8) spawns child processes via `node:child_process` but the test harness itself is `node --test` (the spawned children call into the adapter directly; no external infra). No `Strategy Summary` divergence to report.

---

## Task Structure

> **Note on task status.** The per-task `- [ ]` checkboxes below are authoring guides only. Authoritative task state lives in the spec's lifecycle event log (`plan_task` events) via `currentState(projectRoot, specPath).planTasks`. `/adev:implement` reads/writes that log, not these checkboxes.

### Task 1: Add `seq` to document schema validation [specialist: none]

**Charter capability:** This spec extends the existing "JSON issue board + adapter" capability with the new "Concurrent-write CAS" charter-extension scope.
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/issues/json-adapter.mjs:212-249` (`_validateBoardDocument`)
- Test: `tests/issues/json-adapter-cas-hostile-seed.test.mjs` (Task 6 will create this; for Task 1's RED phase, write a minimal failing test inline in `tests/issues/json-adapter.test.mjs` if it exists, otherwise stub the hostile-seed test file with one failing case)

**Tests:** `tests/issues/json-adapter-cas-hostile-seed.test.mjs` (stub for RED; expanded in Task 6)

**Context to load:** See Task 1 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonAdapter } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

test('JsonAdapter rejects seq > MAX_SAFE_INTEGER with INVALID_BOARD_SEQ', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: Number.MAX_SAFE_INTEGER + 1, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);
    await assert.rejects(
      adapter.list(),
      (err) => err.code === 'INVALID_BOARD_SEQ' && !String(err.message).includes(String(Number.MAX_SAFE_INTEGER + 1))
    );
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/json-adapter-cas-hostile-seed.test.mjs`
Expected: FAIL — `INVALID_BOARD_SEQ` not thrown; current `_validateBoardDocument` ignores `seq`.

- [ ] **Implement**

Extend `_validateBoardDocument` after the existing `version` coercion block:

```javascript
// After existing version validation, before final return:
if ('seq' in parsed) {
  const seq = parsed.seq;
  const seqValid = typeof seq === 'number' && Number.isInteger(seq) && seq >= 0 && seq <= Number.MAX_SAFE_INTEGER;
  if (!seqValid) {
    const err = new Error('tasks.json: `seq` must be a non-negative integer <= Number.MAX_SAFE_INTEGER');
    err.code = 'INVALID_BOARD_SEQ';
    throw err;
  }
}
```

Note: error message does NOT echo the offending value (SEC-1 sanitization contract).

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-hostile-seed.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/agent-reliable-state-artifacts/concurrent-write-protection`

```bash
git add lib/issues/json-adapter.mjs tests/issues/json-adapter-cas-hostile-seed.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): validate seq field on tasks.json

Adds INVALID_BOARD_SEQ schema check rejecting negative, non-integer,
or out-of-range seq values. Error message does not echo the offending
value (routed through MALFORMED_BOARD sanitization contract).

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 1
EOF
)"
```

---

### Task 2: Split read primitive (`_read` + `_readWithSeq`) [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/issues/json-adapter.mjs:262-300` (add `_readWithSeq` returning `{ board, seq }`; keep `_read` returning `board` unchanged)
- Test: extend `tests/issues/json-adapter.test.mjs` (if exists) or add `tests/issues/json-adapter-read-with-seq.test.mjs`

**Tests:** `tests/issues/json-adapter-read-with-seq.test.mjs`

**Context to load:** See Task 2 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonAdapter } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

test('JsonAdapter._readWithSeq returns { board, seq } from disk', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 42, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);
    const result = adapter._readWithSeq();
    assert.equal(result.seq, 42);
    assert.deepEqual(result.board.epics, []);
    assert.deepEqual(result.board.issues, []);
  } finally { cleanupTempDir(root); }
});

test('JsonAdapter._read still returns board only (unchanged)', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 5, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);
    const board = adapter._read();
    assert.ok('epics' in board && 'issues' in board);
    assert.ok(!('seq' in { board } && false)); // structural: _read returns board, not {board, seq}
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/json-adapter-read-with-seq.test.mjs`
Expected: FAIL — `_readWithSeq is not a function`

- [ ] **Implement**

Add to `JsonAdapter` class, immediately after `_read`:

```javascript
/**
 * Read board AND its current seq for CAS. Used only by mutators.
 * Legacy documents (missing seq) yield seq=0.
 */
_readWithSeq() {
  const board = this._read();
  const seq = typeof board.seq === 'number' ? board.seq : 0;
  return { board, seq };
}
```

Also update `_read` to preserve `seq` in returned board (so `_readWithSeq` can extract it):
```javascript
// In _read(), after JSON.parse + _validateBoardDocument, ensure parsed object passes through seq:
// Currently _read returns parsed; verify the validation didn't drop seq. If _validateBoardDocument
// strips unknown keys (it doesn't — it only validates shape), this is a no-op. Add explicit assertion:
return parsed;  // includes seq if present; missing seq is treated as absent by _readWithSeq
```

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-read-with-seq.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/json-adapter.mjs tests/issues/json-adapter-read-with-seq.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): split read primitive for CAS path

Adds JsonAdapter._readWithSeq() returning { board, seq } for use by
mutators. _read() unchanged — read-only callers (list/get/listEpics/
walkTree) keep current call shape and pay no CAS overhead. Missing
seq field is treated as 0 (legacy-document fallback).

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: CAS-ify `_write(data, expectedSeq)` [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/issues/json-adapter.mjs:311-338` (`_write`)
- Test: `tests/issues/json-adapter-cas-write.test.mjs`

**Tests:** `tests/issues/json-adapter-cas-write.test.mjs`

**Context to load:** See Task 3 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JsonAdapter } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

test('JsonAdapter._write throws STALE_BOARD_WRITE_RETRY when disk seq advanced', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);

    // Capture seq 0 by reading
    const captured = adapter._readWithSeq();
    assert.equal(captured.seq, 0);

    // Simulate concurrent write: another process bumps disk to seq 1
    writeFileSync(join(root, '.context-index/tasks/tasks.json'),
      JSON.stringify({ version: 2, seq: 1, epics: [], issues: [] }) + '\n');

    // Our write believes captured was 0, but disk is now 1 → STALE_BOARD_WRITE_RETRY
    assert.throws(
      () => adapter._write({ ...captured.board, seq: 1 }, 0),
      (err) => err.code === 'STALE_BOARD_WRITE_RETRY'
    );
  } finally { cleanupTempDir(root); }
});

test('JsonAdapter._write stamps seq = expectedSeq + 1 on successful commit', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);
    adapter._write({ version: 2, epics: [], issues: [] }, 0);
    const after = JSON.parse(readFileSync(join(root, '.context-index/tasks/tasks.json'), 'utf8'));
    assert.equal(after.seq, 1);
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/json-adapter-cas-write.test.mjs`
Expected: FAIL — `_write` currently ignores `expectedSeq` parameter; does not throw.

- [ ] **Implement**

Modify `_write` to accept `expectedSeq` and CAS:

```javascript
_write(data, expectedSeq = null) {
  mkdirSync(this.storageDir, { recursive: true });

  // CAS check: re-read disk seq immediately before rename and compare.
  // expectedSeq === null skips the check (initial-write path or non-CAS callers).
  if (expectedSeq !== null && existsSync(this.filePath)) {
    const currentRaw = readFileSync(this.filePath, 'utf8');
    let current;
    try { current = JSON.parse(currentRaw); } catch { current = { seq: 0 }; }
    const currentSeq = typeof current.seq === 'number' ? current.seq : 0;
    if (currentSeq !== expectedSeq) {
      const err = new Error(
        `tasks.json: stale write; captured seq=${expectedSeq}, current seq=${currentSeq}`
      );
      err.code = 'STALE_BOARD_WRITE_RETRY';
      throw err;
    }
  }

  const document = {
    version: CANONICAL_VERSION,
    seq: expectedSeq === null ? (typeof data.seq === 'number' ? data.seq : 0) : expectedSeq + 1,
    epics: Array.isArray(data.epics) ? data.epics : [],
    issues: Array.isArray(data.issues) ? data.issues : [],
  };

  const tmpName = this.filePath + '.' + randomBytes(4).toString('hex') + '.tmp';
  assertWithin(this.storageDir, tmpName, 'INVALID_STORAGE_PATH');

  let renamed = false;
  try {
    writeFileSync(tmpName, JSON.stringify(document, null, 2) + '\n');
    renameSync(tmpName, this.filePath);
    renamed = true;
  } finally {
    if (!renamed) { try { unlinkSync(tmpName); } catch {} }
  }
}
```

Important: this preserves `seq` through the reconstructor — cross-spec amendment to `json-issue-board-adapter.spec.md` (SA-5 in review) is satisfied by this code change; Task 10 documents it in the sibling spec.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-write.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/json-adapter.mjs tests/issues/json-adapter-cas-write.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): CAS-ify JsonAdapter._write

_write(data, expectedSeq) now re-reads tasks.json immediately before
renameSync and compares disk seq to expectedSeq. Mismatch throws
STALE_BOARD_WRITE_RETRY (internal control-flow signal consumed by the
retry wrapper added in Task 4). Successful commit stamps
seq = expectedSeq + 1. expectedSeq=null bypasses CAS for init-path.

Document reconstructor now preserves the seq field (cross-spec
amendment to json-issue-board-adapter.spec.md; spec edit follows in
Task 10).

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: Retry wrapper in six mutators + manifest knob [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `lib/issues/json-adapter.mjs` — wrap `create`, `update`, `close`, `addDependency`, `createEpic`, `updateEpic` in CAS retry loops; add `MAX_CAS_RETRIES` constant; read `manifest.tasks.cas_max_retries` in constructor
- Test: `tests/issues/json-adapter-cas-retry.test.mjs`

**Tests:** `tests/issues/json-adapter-cas-retry.test.mjs`

**Context to load:** See Task 4 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JsonAdapter, MAX_CAS_RETRIES } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

test('MAX_CAS_RETRIES is exported and defaults to 3', () => {
  assert.equal(MAX_CAS_RETRIES, 3);
});

test('create() retries on stale snapshot and lands on retry', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);

    // Inject a single-shot stale-write: monkey-patch _readWithSeq to return seq 0 once
    // (forcing one retry cycle), then return real disk state thereafter.
    let firstCall = true;
    const origRead = adapter._readWithSeq.bind(adapter);
    adapter._readWithSeq = function () {
      if (firstCall) {
        firstCall = false;
        // Bump disk to seq 1 to force CAS mismatch
        writeFileSync(join(root, '.context-index/tasks/tasks.json'),
          JSON.stringify({ version: 2, seq: 1, epics: [], issues: [] }) + '\n');
        return { board: { version: 2, epics: [], issues: [] }, seq: 0 };
      }
      return origRead();
    };

    const issue = await adapter.create({ title: 'Test', type: 'task' });
    assert.equal(issue.id, 'issue-1');
    const after = JSON.parse(readFileSync(join(root, '.context-index/tasks/tasks.json'), 'utf8'));
    assert.equal(after.seq, 2); // initial 1 → retry stamps 2
    assert.equal(after.issues.length, 1);
  } finally { cleanupTempDir(root); }
});

test('manifest.tasks.cas_max_retries overrides MAX_CAS_RETRIES default', () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml',
      'tasks:\n  backend: json\n  cas_max_retries: 5\n');
    const adapter = new JsonAdapter(root);
    assert.equal(adapter.casMaxRetries, 5);
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/issues/json-adapter-cas-retry.test.mjs`
Expected: FAIL — `MAX_CAS_RETRIES` not exported, mutators don't retry, `casMaxRetries` field absent.

- [ ] **Implement**

Add at top of `json-adapter.mjs`:
```javascript
export const MAX_CAS_RETRIES = 3;
```

In constructor (around line 160), read manifest knob:
```javascript
// In constructor, after assertProjectRoot:
let manifestKnob = null;
try {
  const { loadManifest } = await import('../manifest.mjs');
  const manifest = loadManifest(this.projectRoot);
  manifestKnob = manifest?.tasks?.cas_max_retries ?? null;
} catch { /* manifest may not exist in some test setups; fall through to default */ }
this.casMaxRetries = (typeof manifestKnob === 'number' && manifestKnob > 0) ? manifestKnob : MAX_CAS_RETRIES;
```

Note: dynamic import inside constructor is async-unfriendly. Switch to sync manifest read via `readFileSync` + minimal YAML parse, OR make adapter construction async, OR keep manifest read at first-call-time (lazy). For simplicity and constitution Principle 1 (no new deps): use `readFileSync` + the existing yaml parser already used by `lib/manifest.mjs`. Verify by tracing the existing import chain.

Add internal CAS-wrap helper:
```javascript
async _withCas(operation) {
  for (let attempt = 0; attempt < this.casMaxRetries; attempt++) {
    const { board, seq } = this._readWithSeq();
    try {
      return await operation(board, seq);  // operation returns the result; _write must use seq+1
    } catch (err) {
      if (err.code === 'STALE_BOARD_WRITE_RETRY' && attempt < this.casMaxRetries - 1) {
        continue;  // re-read, re-derive, retry
      }
      if (err.code === 'STALE_BOARD_WRITE_RETRY') {
        const final = new Error(
          `tasks.json: stale write after ${this.casMaxRetries} retries (op=create|update|...|...)`
        );
        final.code = 'STALE_BOARD_WRITE';
        throw final;
      }
      throw err;
    }
  }
}
```

Wrap each of the six mutators. For `create` (as the most complex due to ID re-derivation under retry):
```javascript
async create(issueData) {
  return await this._withCas((board, seq) => {
    JsonAdapter._validateBoardGranularity(issueData);
    const issue = validateIssue(issueData);
    const { epics, issues } = board;
    // ID derivation against THIS snapshot (re-runs on retry)
    issue.id = this._nextIssueId(issues);  // or tiered path per existing logic
    // ... rest of existing create() body, with _write(board, seq) at end:
    issues.push(issue);
    this._write({ ...board, epics, issues }, seq);
    return issue;
  });
}
```

Repeat for `update`, `close`, `addDependency`, `createEpic`, `updateEpic`.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-retry.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/issues/json-adapter.mjs tests/issues/json-adapter-cas-retry.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): CAS retry wrapper in six mutators

Wraps create, update, close, addDependency, createEpic, updateEpic in
bounded CAS retry loops. On STALE_BOARD_WRITE_RETRY: re-read snapshot,
re-derive IDs/timestamps, re-apply mutation. After MAX_CAS_RETRIES
attempts (default 3, override via manifest.tasks.cas_max_retries):
throw STALE_BOARD_WRITE.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: Legacy-document test [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 1, 3
**Files:**
- Create: `tests/issues/json-adapter-cas-legacy.test.mjs`

**Tests:** `tests/issues/json-adapter-cas-legacy.test.mjs`

**Context to load:** See Task 5 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JsonAdapter } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

test('Legacy tasks.json (no seq field) upgrades transparently on first write', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    // Legacy doc: no seq field
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);
    await adapter.create({ title: 'First post-upgrade issue', type: 'task' });
    const after = JSON.parse(readFileSync(join(root, '.context-index/tasks/tasks.json'), 'utf8'));
    assert.equal(after.seq, 1);
    assert.equal(after.issues.length, 1);
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails** — only meaningful before Task 4 lands. After Task 4 this passes immediately. Run before merging Task 4 to confirm RED, then re-run to confirm GREEN.

Run: `node --test tests/issues/json-adapter-cas-legacy.test.mjs`
Expected (post-Task 4): PASS

- [ ] **Implement** — no implementation needed; this test exercises behavior from Tasks 1+3+4.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-legacy.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/issues/json-adapter-cas-legacy.test.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): legacy tasks.json upgrade test

Asserts that a pre-CAS tasks.json (no seq field) upgrades transparently
on first write — adapter treats missing seq as 0 and stamps seq=1 on
the next successful commit. No adev migrate invocation needed.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 5
EOF
)"
```

---

### Task 6: Hostile-seed test [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create / expand: `tests/issues/json-adapter-cas-hostile-seed.test.mjs` (stub created in Task 1; this task expands with multiple invalid-value cases)

**Tests:** `tests/issues/json-adapter-cas-hostile-seed.test.mjs`

**Context to load:** See Task 6 Context above.

- [ ] **Write failing test** — expand on the Task 1 stub:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonAdapter } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const invalidSeqs = [
  { name: 'negative', value: -1 },
  { name: 'non-integer', value: 1.5 },
  { name: 'string', value: '42' },
  { name: 'NaN', value: NaN },
  { name: 'above MAX_SAFE_INTEGER', value: Number.MAX_SAFE_INTEGER + 1 },
];

for (const { name, value } of invalidSeqs) {
  test(`INVALID_BOARD_SEQ rejects ${name} seq (${value})`, async () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
      writeFixture(root, '.context-index/tasks/tasks.json',
        JSON.stringify({ version: 2, seq: value, epics: [], issues: [] }));
      const adapter = new JsonAdapter(root);
      await assert.rejects(
        adapter.list(),
        (err) =>
          err.code === 'INVALID_BOARD_SEQ' &&
          // Critical: error message must NOT echo the offending value
          !String(err.message).includes(String(value))
      );
    } finally { cleanupTempDir(root); }
  });
}
```

- [ ] **Verify test fails** before Task 1 implementation; passes after.

Run: `node --test tests/issues/json-adapter-cas-hostile-seed.test.mjs`
Expected: PASS

- [ ] **Implement** — covered by Task 1.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-hostile-seed.test.mjs`
Expected: PASS (5 cases)

- [ ] **Commit**

```bash
git add tests/issues/json-adapter-cas-hostile-seed.test.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): hostile-seed seq validation cases

Expands hostile-seed test coverage to 5 invalid-seq cases (negative,
non-integer, string, NaN, above MAX_SAFE_INTEGER). All must throw
INVALID_BOARD_SEQ; all must verify the error message does not echo
the offending value (SEC-1 sanitization contract).

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 6
EOF
)"
```

---

### Task 7: Stale-write exhaustion test [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 3, 4
**Files:**
- Create: `tests/issues/json-adapter-cas-exhaustion.test.mjs`

**Tests:** `tests/issues/json-adapter-cas-exhaustion.test.mjs`

**Context to load:** See Task 7 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JsonAdapter, MAX_CAS_RETRIES } from '../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

test('STALE_BOARD_WRITE thrown after retry budget exhausted', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }));
    const adapter = new JsonAdapter(root);

    // Force every CAS attempt to be stale: monkey-patch _readWithSeq to always
    // bump disk seq AFTER returning the captured snapshot, so every _write loses.
    let disk = 0;
    adapter._readWithSeq = function () {
      const board = { version: 2, epics: [], issues: [] };
      const captured = disk;
      disk += 1;
      writeFileSync(join(root, '.context-index/tasks/tasks.json'),
        JSON.stringify({ version: 2, seq: disk, epics: [], issues: [] }) + '\n');
      return { board, seq: captured };
    };

    await assert.rejects(
      adapter.create({ title: 'Doomed', type: 'task' }),
      (err) =>
        err.code === 'STALE_BOARD_WRITE' &&
        // Message must include op name + retry count (integers only)
        /create|update|close|addDependency|createEpic|updateEpic/.test(err.message) &&
        new RegExp(String(MAX_CAS_RETRIES)).test(err.message) &&
        // Must NOT include filesystem paths or document contents
        !err.message.includes('/tasks.json') &&
        !err.message.includes('Doomed')
    );
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails** before Tasks 3+4; passes after.

Run: `node --test tests/issues/json-adapter-cas-exhaustion.test.mjs`
Expected: PASS

- [ ] **Implement** — covered by Tasks 3+4.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-exhaustion.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/issues/json-adapter-cas-exhaustion.test.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): CAS retry exhaustion test

Asserts STALE_BOARD_WRITE thrown after MAX_CAS_RETRIES exhausted.
Verifies error message includes op name + retry count (integers only)
and excludes filesystem paths and document contents per SEC-1
sanitization contract.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 7
EOF
)"
```

---

### Task 8: Concurrency proof (N parallel mutators) [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 3, 4
**Files:**
- Create: `tests/issues/json-adapter-cas-concurrency.test.mjs`
- Create (helper): `tests/issues/_cas-concurrency-child.mjs` — child process script that does one mutation against a shared tasks.json (path passed via argv)

**Tests:** `tests/issues/json-adapter-cas-concurrency.test.mjs`

**Context to load:** See Task 8 Context above.

- [ ] **Write failing test**

```javascript
// tests/issues/_cas-concurrency-child.mjs
import { JsonAdapter } from '../../lib/issues/json-adapter.mjs';
const [, , projectRoot, idx] = process.argv;
const adapter = new JsonAdapter(projectRoot);
try {
  const issue = await adapter.create({ title: `child-${idx}`, type: 'task' });
  process.stdout.write(JSON.stringify({ status: 'committed', id: issue.id }));
  process.exit(0);
} catch (err) {
  process.stdout.write(JSON.stringify({ status: 'stale', code: err.code, message: err.message }));
  process.exit(0);  // exit 0; the orchestrator inspects status from stdout
}
```

```javascript
// tests/issues/json-adapter-cas-concurrency.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const N = 10;

test('N=10 concurrent mutators all have observable outcomes; no silent loss', async () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    writeFixture(root, '.context-index/tasks/tasks.json',
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }));

    const childPath = join(__dirname, '_cas-concurrency-child.mjs');
    const children = [];
    for (let i = 0; i < N; i++) {
      children.push(new Promise((resolve) => {
        const c = spawn('node', [childPath, root, String(i)]);
        let out = '';
        c.stdout.on('data', (d) => { out += d.toString(); });
        c.on('exit', () => resolve(JSON.parse(out)));
      }));
    }
    const results = await Promise.all(children);

    // Every result has an observable outcome (committed or stale)
    for (const r of results) {
      assert.ok(r.status === 'committed' || r.status === 'stale',
        `unexpected outcome: ${JSON.stringify(r)}`);
    }

    // Final state: every 'committed' mutation must appear in the board
    const board = JSON.parse(readFileSync(join(root, '.context-index/tasks/tasks.json'), 'utf8'));
    const committed = results.filter(r => r.status === 'committed');
    assert.equal(board.issues.length, committed.length,
      `silent loss: ${committed.length} mutations claimed committed but board has ${board.issues.length}`);
    assert.equal(board.seq, committed.length,
      `seq mismatch: expected ${committed.length}, got ${board.seq}`);

    // No orphan .tmp files
    const dirFiles = readdirSync(join(root, '.context-index/tasks'));
    const orphans = dirFiles.filter(f => f.endsWith('.tmp'));
    assert.deepEqual(orphans, [], `orphan temp files: ${orphans.join(', ')}`);
  } finally { cleanupTempDir(root); }
});
```

- [ ] **Verify test fails** before Tasks 3+4; passes after.

Run: `node --test tests/issues/json-adapter-cas-concurrency.test.mjs`
Expected: PASS (with N=10 children; some may end as 'stale' if retry budget exhausted under load — that's the contractual guarantee per Behavior 8)

- [ ] **Implement** — covered by Tasks 3+4.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-cas-concurrency.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/issues/json-adapter-cas-concurrency.test.mjs tests/issues/_cas-concurrency-child.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): N=10 concurrent CAS proof

Spawns 10 child processes that each call adapter.create() against a
shared tasks.json. Asserts the contractual Behavior 8 guarantee:
every mutation has an observable outcome (committed or
STALE_BOARD_WRITE); no mutation is silently lost; final seq matches
committed count; no orphan .tmp files remain.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 8
EOF
)"
```

---

### Task 9: Internal-encapsulation grep test [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** — (none; can run first as regression baseline)
**Files:**
- Create: `tests/issues/json-adapter-internal-encapsulation.test.mjs`

**Tests:** `tests/issues/json-adapter-internal-encapsulation.test.mjs`

**Context to load:** See Task 9 Context above.

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const SEARCH_DIRS = ['lib', 'tests', 'cli', 'hooks', 'viz', 'providers'];
const ADAPTER_PATH = 'lib/issues/json-adapter.mjs';
const PATTERN = /\._read\(|\._write\(/;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(m?js|mjs)$/.test(p)) acc.push(p);
  }
  return acc;
}

test('No external callers invoke JsonAdapter._read() or ._write()', () => {
  const violations = [];
  for (const dirName of SEARCH_DIRS) {
    const dir = join(repoRoot, dirName);
    try { statSync(dir); } catch { continue; }
    for (const file of walk(dir)) {
      const rel = relative(repoRoot, file);
      if (rel === ADAPTER_PATH) continue;  // adapter file itself is allowed
      const content = readFileSync(file, 'utf8');
      if (PATTERN.test(content)) {
        violations.push(rel);
      }
    }
  }
  assert.deepEqual(violations, [],
    `External callers of JsonAdapter._read/_write found: ${violations.join(', ')}`);
});
```

- [ ] **Verify test fails** — only if external callers exist today. If zero callers exist (likely), this test passes immediately as a regression baseline.

Run: `node --test tests/issues/json-adapter-internal-encapsulation.test.mjs`
Expected: PASS (baseline)

- [ ] **Implement** — no implementation needed; this is a regression-prevention test.

- [ ] **Verify test passes**

Run: `node --test tests/issues/json-adapter-internal-encapsulation.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/issues/json-adapter-internal-encapsulation.test.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): _read/_write encapsulation guard

Greps lib/**, tests/**, cli/**, hooks/**, viz/**, providers/** for
external invocations of JsonAdapter._read() or ._write(). Asserts
zero matches outside lib/issues/json-adapter.mjs itself. Protects
the CAS signature changes (Tasks 2-3) from silent regression.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 9
EOF
)"
```

---

### Task 10: Amend sibling spec (json-issue-board-adapter) [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension); cross-spec amendment to `json-issue-board-adapter`.
**Strategy:** unit (source: fallback, confidence: high — this is a spec-only edit; "unit" means it passes through the standard spec validation without external infra)
**Depends on:** — (pure markdown edit; independent of code tasks)
**Files:**
- Modify: `.context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md` (locate the "tasks.json document schema" section; add `seq` to the canonical document shape; add a paragraph documenting the exception to the "drop unknown top-level keys on write" rule)

**Tests:** No test (spec edit). Validation: `/adev:validate` Check 7 (spec-source coherence) and Check 9 (spec lint) verify the edit lands correctly.

**Context to load:** See Task 10 Context above.

- [ ] **Write failing test** — N/A for pure spec edits. Authoring-step proxy: confirm the edit produces the expected diff via `git diff --stat`.

- [ ] **Verify** — read the sibling spec before editing; confirm the "tasks.json document schema" section exists and its current shape is `{version, epics[], issues[]}` (no `seq`).

- [ ] **Implement**

Add `seq` to the canonical schema diagram:

```
Before: { "version": 2, "epics": [...], "issues": [...] }
After:  { "version": 2, "seq": 0, "epics": [...], "issues": [...] }
```

Add a paragraph under or near the schema diagram:

> **`seq` field (added by `concurrent-write-protection.spec.md`):** The `seq` field is a monotonic per-write revision counter used by the CAS mechanism for concurrent-write protection. Unlike other unknown top-level keys (which `_write()` drops on reconstruction), `seq` is preserved through the reconstructor — it must round-trip every read-modify-write cycle to support compare-and-swap semantics. Legacy `tasks.json` files written by the pre-CAS adapter omit `seq`; the adapter treats missing values as `seq: 0` and stamps `seq: 1` on the next successful commit.

- [ ] **Verify spec changes**

Run: `node --test tests/specs/` (if spec-lint tests exist) and `npm test`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
git commit -m "$(cat <<'EOF'
docs(agent-reliable-state-artifacts): amend sibling spec for seq field

Adds seq to the canonical tasks.json schema and documents the
top-level-key-preservation exception. The _write() reconstructor
must round-trip seq (unlike other unknown top-level keys, which it
drops) to support CAS semantics in concurrent-write-protection.spec.md.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 10
EOF
)"
```

---

### Task 11: Doc header on `json-adapter.mjs` [specialist: none]

**Charter capability:** "Concurrent-write CAS" (charter-extension).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 1-4 (so the header accurately describes what's in the file)
**Files:**
- Modify: `lib/issues/json-adapter.mjs:1-25` (extend existing header comment block)

**Tests:** No test (comment edit). Verified by spec compliance check during `/adev:validate`.

**Context to load:** See Task 11 Context above.

- [ ] **Write failing test** — N/A for comment-only edits.

- [ ] **Implement**

Add a paragraph after the existing "Writes are atomic via temp-file-then-rename" sentence:

```javascript
/**
 * ... existing header ...
 *
 * Mutating operations (create / update / close / addDependency / createEpic /
 * updateEpic) are CAS-protected. Each captures the on-disk `seq` via
 * `_readWithSeq`, stages the mutation, and commits only when the on-disk `seq`
 * still matches the captured value. On mismatch, the operation re-reads the
 * snapshot, re-derives IDs and timestamps from the fresh state, and retries
 * up to `MAX_CAS_RETRIES` (default 3, configurable via
 * `manifest.tasks.cas_max_retries`). Exhausting the retry budget throws
 * `STALE_BOARD_WRITE`. The contractual guarantee is "no silent loss": every
 * mutation either commits (seq incremented) or throws — no in-between.
 *
 * Read-only methods (list / get / listEpics / walkTree) call the unchanged
 * `_read()` and pay no CAS overhead.
 */
```

- [ ] **Verify**

Run: `npm test`
Expected: PASS (no test changes; comment-only edit)

- [ ] **Commit**

```bash
git add lib/issues/json-adapter.mjs
git commit -m "$(cat <<'EOF'
docs(agent-reliable-state-artifacts): document CAS layer in adapter header

Adds a paragraph to lib/issues/json-adapter.mjs's header comment
describing the CAS-over-atomic-rename mechanism, the six mutators it
covers, the MAX_CAS_RETRIES budget, the STALE_BOARD_WRITE error, and
the read-only-method exemption.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/concurrent-write-protection.spec.md
Plan-task: 11
EOF
)"
```

---

## Quality Gates

After all 11 tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in `concurrent-write-protection.validate.md`, not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from the spec satisfied (11 criteria; tests cover #1-9; #10 covered by Task 10 spec amendment; #11 by absence of new deps in package.json; #12 by `IssueManagerInterface` signature stability; #13 by `npm test` itself; #14 by review verdict)
- No constitutional violations introduced
- `issue-459` updated with `spec_ref` (already complete; reaffirm during validate)
