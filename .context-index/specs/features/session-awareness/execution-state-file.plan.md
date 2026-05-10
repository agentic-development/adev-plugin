# Implementation Plan: Execution State File

> **Methodology:** adev
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Spec:** .context-index/specs/features/session-awareness/execution-state-file.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-06)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Implement `lib/execution-state.mjs` — a thin read/write abstraction for the `.context-index/.execution-state.md` file with validation, atomic writes, and frontmatter serialization.

**Architecture:** Single library module (`lib/execution-state.mjs`) with three named exports. Follows the atomic write pattern from `lib/issues/file-adapter.mjs` and the frontmatter parse/serialize pattern from `lib/session-summary.mjs`. No new dependencies — uses `fs`, `path`, and `crypto` built-ins only.

---

## File Structure

**Create:**
- `lib/execution-state.mjs` — Core module with `readExecutionState`, `writeExecutionState`, `clearExecutionState`
- `tests/lib/execution-state.test.mjs` — Unit tests for all behaviors and error cases

**Reference (read, do not modify):**
- `lib/issues/file-adapter.mjs` — Atomic write pattern (`randomBytes` + `.tmp` + `renameSync`)
- `lib/session-summary.mjs` — Frontmatter parse/serialize pattern (`parseFrontmatter`, `buildMarkdown`)
- `.context-index/samples/general-library-module-graph.md` — Module structure pattern (imports, exports, JSDoc, helpers)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/session-awareness/execution-state-file.spec.md` (Preconditions, Error Cases, Serialization Safety)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Execution State File)
- Sample: `.context-index/samples/general-library-module-graph.md`

### Task 2 Context
- Spec: `.context-index/specs/features/session-awareness/execution-state-file.spec.md` (Behaviors 1, 6, 7; File Format; Serialization Safety)
- Charter: `.context-index/specs/features/session-awareness/charter.md` (capability: Execution State File, Concurrent Access Safety)
- Reference: `lib/issues/file-adapter.mjs` (atomic write pattern)
- Reference: `lib/session-summary.mjs` (frontmatter serialization pattern)

### Task 3 Context
- Spec: `.context-index/specs/features/session-awareness/execution-state-file.spec.md` (Behaviors 2, 3, 4; Progress Body)
- Reference: `lib/session-summary.mjs` (frontmatter parsing pattern)

### Task 4 Context
- Spec: `.context-index/specs/features/session-awareness/execution-state-file.spec.md` (Behavior 5; Acceptance Criteria: round-trip, clearExecutionState)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4
- All tasks share `lib/execution-state.mjs` and `tests/lib/execution-state.test.mjs`, so they must be sequential.

---

### Task 1: Validation and Sanitization Helpers [specialist: none]

**Charter capability:** Execution State File
**Files:**
- Create: `lib/execution-state.mjs`
- Create: `tests/lib/execution-state.test.mjs`

**Tests:** `tests/lib/execution-state.test.mjs`

- [ ] **Write failing tests**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeExecutionState } from '../../lib/execution-state.mjs';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';

describe('execution-state validation', () => {
  it('rejects relative projectRoot with INVALID_PROJECT_ROOT', () => {
    assert.throws(
      () => writeExecutionState('relative/path', { status: 'idle' }),
      (err) => err.code === 'INVALID_PROJECT_ROOT'
    );
  });

  it('rejects invalid status with INVALID_STATUS', async () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => writeExecutionState(tmp, { status: 'running' }),
        (err) => err.code === 'INVALID_STATUS'
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('rejects active status without planRef with MISSING_PLAN_REF', async () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => writeExecutionState(tmp, { status: 'active', currentTask: 1 }),
        (err) => err.code === 'MISSING_PLAN_REF'
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('rejects active status without currentTask with MISSING_CURRENT_TASK', async () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => writeExecutionState(tmp, { status: 'active', planRef: 'specs/foo.plan.md' }),
        (err) => err.code === 'MISSING_CURRENT_TASK'
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: FAIL — `writeExecutionState` is not defined or module not found

- [ ] **Implement**

Create `lib/execution-state.mjs` with the module skeleton: imports (`fs`, `path`, `crypto`), the `VALID_STATUSES` constant, the `validateState` internal helper (checks projectRoot is absolute, status is valid, active-state invariants), and the `sanitizeField` internal helper (replaces newlines with spaces, strips `---` sequences). Export a stub `writeExecutionState` that calls `validateState` and returns (serialization added in Task 2).

```javascript
/**
 * Execution state file reader/writer.
 *
 * Maintains `.context-index/.execution-state.md` — a live snapshot of
 * current work in progress with YAML frontmatter and markdown progress body.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, isAbsolute, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const VALID_STATUSES = new Set(['idle', 'active', 'blocked']);
const STATE_FILE = '.context-index/.execution-state.md';

/**
 * Validate projectRoot and state object. Throws coded errors on failure.
 */
function validateState(projectRoot, state) {
  if (!isAbsolute(projectRoot)) {
    const err = new Error('projectRoot must be an absolute path');
    err.code = 'INVALID_PROJECT_ROOT';
    throw err;
  }
  if (!state || !VALID_STATUSES.has(state.status)) {
    const err = new Error(`Invalid status: ${state?.status}. Must be one of: idle, active, blocked`);
    err.code = 'INVALID_STATUS';
    throw err;
  }
  if (state.status === 'active') {
    if (!state.planRef) {
      const err = new Error('Active state requires planRef');
      err.code = 'MISSING_PLAN_REF';
      throw err;
    }
    if (state.currentTask == null) {
      const err = new Error('Active state requires currentTask');
      err.code = 'MISSING_CURRENT_TASK';
      throw err;
    }
  }
}

/**
 * Sanitize a free-text field for safe YAML frontmatter serialization.
 * Replaces newlines with spaces and strips `---` sequences.
 * @param {string} value
 * @returns {string}
 */
function sanitizeField(value) {
  if (typeof value !== 'string') return value ?? '';
  return value.replace(/\n/g, ' ').replace(/---/g, '');
}

export function writeExecutionState(projectRoot, state) {
  validateState(projectRoot, state);
  // Serialization and write in Task 2
}

export function readExecutionState(projectRoot) {
  // Implemented in Task 3
  return null;
}

export function clearExecutionState(projectRoot) {
  // Implemented in Task 4
}
```

- [ ] **Verify tests pass**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: PASS — all 4 validation tests pass

- [ ] **Commit**

Branch: `feat/session-awareness/execution-state-file` (create from current branch)

```bash
git add lib/execution-state.mjs tests/lib/execution-state.test.mjs
git commit -m "feat(session-awareness): add execution state validation and module skeleton"
```

---

### Task 2: writeExecutionState with Atomic Writes [specialist: none]

**Charter capability:** Execution State File, Concurrent Access Safety
**Depends on:** Task 1
**Files:**
- Modify: `lib/execution-state.mjs` — complete `writeExecutionState`
- Modify: `tests/lib/execution-state.test.mjs` — add write tests

**Tests:** `tests/lib/execution-state.test.mjs`

- [ ] **Write failing tests**

```javascript
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('writeExecutionState', () => {
  it('writes file with correct YAML frontmatter for active state', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: 'active',
        planRef: 'specs/feature.plan.md',
        currentTask: 3,
        issueBinding: 'ISSUE-42',
        blockers: '',
        nextAction: 'Implement parser',
        progress: [
          { task: 'Task 1: Setup', done: true },
          { task: 'Task 2: Core', done: true },
          { task: 'Task 3: Parser', done: false },
        ],
      });
      const content = readFileSync(join(tmp, '.context-index/.execution-state.md'), 'utf-8');
      assert.ok(content.startsWith('---\n'));
      assert.ok(content.includes('status: active'));
      assert.ok(content.includes('planRef: specs/feature.plan.md'));
      assert.ok(content.includes('currentTask: 3'));
      assert.ok(content.includes('issueBinding: ISSUE-42'));
      assert.ok(content.includes('updated:'));
      assert.ok(content.includes('- [x] Task 1: Setup'));
      assert.ok(content.includes('- [ ] Task 3: Parser'));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('creates .context-index/ directory if missing', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, { status: 'idle' });
      assert.ok(existsSync(join(tmp, '.context-index/.execution-state.md')));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('clears all fields when status is idle', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: 'idle',
        planRef: 'should-be-cleared',
        currentTask: 5,
        issueBinding: 'ISSUE-99',
        blockers: 'should-be-cleared',
        nextAction: 'should-be-cleared',
      });
      const content = readFileSync(join(tmp, '.context-index/.execution-state.md'), 'utf-8');
      assert.ok(content.includes('status: idle'));
      assert.ok(!content.includes('should-be-cleared'));
      assert.ok(!content.includes('ISSUE-99'));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('leaves no .tmp files after successful write', () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, '.context-index'), { recursive: true });
      writeExecutionState(tmp, { status: 'idle' });
      const files = readdirSync(join(tmp, '.context-index'));
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      assert.equal(tmpFiles.length, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('sanitizes newlines and --- in free-text fields', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: 'blocked',
        blockers: 'line1\nline2\n---\nline3',
        nextAction: 'do\nthis',
      });
      const content = readFileSync(join(tmp, '.context-index/.execution-state.md'), 'utf-8');
      // Should not have raw newlines within a field value
      const lines = content.split('\n');
      const blockersLine = lines.find(l => l.startsWith('blockers:'));
      assert.ok(blockersLine);
      assert.ok(!blockersLine.includes('\n', blockersLine.indexOf(':')));
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: FAIL — `writeExecutionState` does not write a file yet (stub from Task 1)

- [ ] **Implement**

Complete `writeExecutionState` in `lib/execution-state.mjs`:
1. After validation, normalize state for idle (clear all binding fields).
2. Serialize YAML frontmatter: `status`, `planRef`, `currentTask`, `issueBinding`, `blockers` (sanitized), `nextAction` (sanitized), `updated` (ISO 8601 now).
3. Serialize progress body: if `state.progress` array provided, render as `## Progress\n\n` followed by `- [x]`/`- [ ]` checklist items.
4. Ensure `.context-index/` directory exists (`mkdirSync` with `recursive: true`).
5. Atomic write: generate temp path with `randomBytes(4).toString('hex') + '.tmp'`, `writeFileSync` to temp, `renameSync` to target. Wrap rename in try/catch; on failure, attempt `unlinkSync` on temp (best-effort, swallow cleanup errors) then re-throw.

- [ ] **Verify tests pass**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: PASS — all write tests and prior validation tests pass

- [ ] **Commit**

```bash
git add lib/execution-state.mjs tests/lib/execution-state.test.mjs
git commit -m "feat(session-awareness): implement writeExecutionState with atomic writes and sanitization"
```

---

### Task 3: readExecutionState with Frontmatter Parsing [specialist: none]

**Charter capability:** Execution State File
**Depends on:** Task 2
**Files:**
- Modify: `lib/execution-state.mjs` — complete `readExecutionState`
- Modify: `tests/lib/execution-state.test.mjs` — add read tests

**Tests:** `tests/lib/execution-state.test.mjs`

- [ ] **Write failing tests**

```javascript
describe('readExecutionState', () => {
  it('returns null when file does not exist', () => {
    const tmp = createTempDir();
    try {
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('returns null for malformed frontmatter', () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, '.context-index'), { recursive: true });
      writeFileSync(join(tmp, '.context-index/.execution-state.md'), 'no frontmatter here');
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('parses active state with all fields', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: 'active',
        planRef: 'specs/feature.plan.md',
        currentTask: 2,
        issueBinding: 'ISSUE-7',
        blockers: 'waiting on API',
        nextAction: 'implement endpoint',
        progress: [
          { task: 'Task 1: Setup', done: true },
          { task: 'Task 2: Core', done: false },
        ],
      });
      const result = readExecutionState(tmp);
      assert.equal(result.status, 'active');
      assert.equal(result.planRef, 'specs/feature.plan.md');
      assert.equal(result.currentTask, 2);
      assert.equal(result.issueBinding, 'ISSUE-7');
      assert.equal(result.blockers, 'waiting on API');
      assert.equal(result.nextAction, 'implement endpoint');
      assert.ok(result.updated);
      assert.equal(result.progress.length, 2);
      assert.deepEqual(result.progress[0], { task: 'Task 1: Setup', done: true });
      assert.deepEqual(result.progress[1], { task: 'Task 2: Core', done: false });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('parses idle state with empty progress', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, { status: 'idle' });
      const result = readExecutionState(tmp);
      assert.equal(result.status, 'idle');
      assert.equal(result.planRef, '');
      assert.equal(result.currentTask, '');
      assert.deepEqual(result.progress, []);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('rejects relative projectRoot', () => {
    assert.throws(
      () => readExecutionState('relative/path'),
      (err) => err.code === 'INVALID_PROJECT_ROOT'
    );
  });

  it('never throws on read errors (returns null)', () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, '.context-index'), { recursive: true });
      writeFileSync(join(tmp, '.context-index/.execution-state.md'), '---\ngarbage: [[[');
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: FAIL — `readExecutionState` returns `null` unconditionally (stub)

- [ ] **Implement**

Complete `readExecutionState` in `lib/execution-state.mjs`:
1. Validate `projectRoot` is absolute (throw `INVALID_PROJECT_ROOT`).
2. Try to read the file. If `ENOENT`, return `null`.
3. Parse frontmatter using regex: `^---\n([\s\S]*?)\n---\n?([\s\S]*)$`. If no match, return `null`.
4. Parse YAML block line-by-line (split on first `:`), building a metadata object with camelCase keys.
5. Coerce `currentTask` to a number if numeric, else keep as string.
6. Parse progress body: match lines against `/^- \[(x| )\] (.+)$/` to build `{task, done}` array.
7. Return structured object: `{ status, planRef, currentTask, issueBinding, blockers, nextAction, updated, progress }`.
8. Wrap entire read/parse in try/catch — return `null` on any error.

- [ ] **Verify tests pass**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: PASS — all read tests, write tests, and validation tests pass

- [ ] **Commit**

```bash
git add lib/execution-state.mjs tests/lib/execution-state.test.mjs
git commit -m "feat(session-awareness): implement readExecutionState with frontmatter parsing"
```

---

### Task 4: clearExecutionState and Round-Trip Verification [specialist: none]

**Charter capability:** Execution State File
**Depends on:** Task 3
**Files:**
- Modify: `lib/execution-state.mjs` — complete `clearExecutionState`
- Modify: `tests/lib/execution-state.test.mjs` — add clear and round-trip tests

**Tests:** `tests/lib/execution-state.test.mjs`

- [ ] **Write failing tests**

```javascript
describe('clearExecutionState', () => {
  it('resets to idle with empty bindings', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: 'active',
        planRef: 'specs/feature.plan.md',
        currentTask: 3,
        issueBinding: 'ISSUE-42',
        blockers: 'stuck',
        nextAction: 'fix it',
        progress: [{ task: 'Task 1', done: true }],
      });
      clearExecutionState(tmp);
      const result = readExecutionState(tmp);
      assert.equal(result.status, 'idle');
      assert.equal(result.planRef, '');
      assert.equal(result.currentTask, '');
      assert.equal(result.issueBinding, '');
      assert.equal(result.blockers, '');
      assert.equal(result.nextAction, '');
      assert.deepEqual(result.progress, []);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

describe('round-trip', () => {
  it('write then read produces identical state', () => {
    const tmp = createTempDir();
    try {
      const state = {
        status: 'active',
        planRef: 'specs/auth.plan.md',
        currentTask: 2,
        issueBinding: 'ISSUE-10',
        blockers: '',
        nextAction: 'write tests',
        progress: [
          { task: 'Task 1: Schema', done: true },
          { task: 'Task 2: Logic', done: false },
          { task: 'Task 3: API', done: false },
        ],
      };
      writeExecutionState(tmp, state);
      const result = readExecutionState(tmp);
      assert.equal(result.status, state.status);
      assert.equal(result.planRef, state.planRef);
      assert.equal(result.currentTask, state.currentTask);
      assert.equal(result.issueBinding, state.issueBinding);
      assert.equal(result.nextAction, state.nextAction);
      assert.equal(result.progress.length, 3);
      assert.deepEqual(result.progress[0], { task: 'Task 1: Schema', done: true });
      assert.deepEqual(result.progress[2], { task: 'Task 3: API', done: false });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('blocked state round-trips correctly', () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: 'blocked',
        blockers: 'waiting on upstream API',
        nextAction: 'check back tomorrow',
      });
      const result = readExecutionState(tmp);
      assert.equal(result.status, 'blocked');
      assert.equal(result.blockers, 'waiting on upstream API');
      assert.equal(result.nextAction, 'check back tomorrow');
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: FAIL — `clearExecutionState` is a no-op stub

- [ ] **Implement**

Complete `clearExecutionState` in `lib/execution-state.mjs`:
```javascript
export function clearExecutionState(projectRoot) {
  writeExecutionState(projectRoot, { status: 'idle' });
}
```

- [ ] **Verify tests pass**

Run: `node --test tests/lib/execution-state.test.mjs`
Expected: PASS — all tests pass (validation, write, read, clear, round-trip)

- [ ] **Run full quality gates**

Run: `npm test`
Expected: PASS — all existing tests plus new execution-state tests pass

- [ ] **Commit**

```bash
git add lib/execution-state.mjs tests/lib/execution-state.test.mjs
git commit -m "feat(session-awareness): implement clearExecutionState and verify round-trip"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - `writeExecutionState` produces a file parseable by `readExecutionState` (round-trip) — Task 4
  - `readExecutionState` returns `null` for missing or malformed files, never throws — Task 3
  - `clearExecutionState` resets to idle with empty bindings — Task 4
  - Active state without `planRef` or `currentTask` throws `MISSING_PLAN_REF` / `MISSING_CURRENT_TASK` — Task 1
  - Atomic write leaves no `.tmp` files on success — Task 2
  - Failed atomic write cleans up temp file — Task 2
  - `.context-index/` directory is created if missing on write — Task 2
  - All quality gates pass (`npm test`) — Quality Gates
  - No new dependencies added — verified (only `fs`, `path`, `crypto`)
  - No constitutional violations introduced — verified
