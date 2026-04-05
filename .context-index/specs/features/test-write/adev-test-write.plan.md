# Implementation Plan: adev:test-write

> **Methodology:** adev
> **Charter:** .context-index/specs/features/adev:test-write/charter.md
> **Specs:** All 10 Live Specs in .context-index/specs/features/adev:test-write/
> **Review:** PASS_WITH_NOTES (2026-03-27) — blockers resolved in commit 78e5ba3; warnings are advisory only
> **Platform:** Node.js, JavaScript ESM (.mjs), node:test, npm

**Goal:** Build the `adev:test-write` skill — a TDD integrity specialist that authors failing tests, produces immutable handoff blocks, detects specification gaming, enforces mocking boundaries, and verifies post-GREEN test tamper.

**Architecture:** The skill is composed of three pure `.mjs` helper modules (`detect-framework.mjs`, `detect-gaming.mjs`, `write-handoff.mjs`) and one primary `SKILL.md` containing the full behavioral instruction set for Claude. Helpers are acceleration aids — the skill functions without them. All helpers use Node.js built-ins only (`crypto`, `fs`, `path`). The skill lives at `skills/test-write/`, tests at `tests/adev:test-write/`. Per ADR-0001 and ADR-0002, no external dependencies may be added; test runner is `node:test`.

---

## Spec-to-Task Coverage Matrix

| Spec | Primary Task(s) |
|------|----------------|
| framework-detection | Task 1 |
| gaming-violation-detection | Task 2 |
| immutable-handoff-block | Task 3 |
| preexisting-failure-protocol | Task 4 (SKILL.md section), Task 3 (format) |
| red-phase-test-authoring | Task 4 |
| mocking-boundary-declaration | Task 4 |
| post-green-semantic-verification | Task 4, Task 3 (hash recheck) |
| handoff-block-diff-report | Task 4 |
| standalone-invocation | Task 4 |
| model-selection | Task 4, Task 5 |

---

## File Structure

**Create:**
- `skills/test-write/detect-framework.mjs` — Framework detection helper
- `skills/test-write/detect-gaming.mjs` — Gaming violation pattern scanner
- `skills/test-write/write-handoff.mjs` — Handoff Block writer and hash verifier
- `skills/test-write/SKILL.md` — Complete skill instruction set
- `tests/adev:test-write/detect-framework.test.mjs` — Framework detection tests
- `tests/adev:test-write/detect-gaming.test.mjs` — Gaming violation tests
- `tests/adev:test-write/write-handoff.test.mjs` — Handoff block tests
- `tests/adev:test-write/skill-structure.test.mjs` — SKILL.md content validation tests

**Modify:**
- `templates/platform-context.yaml` — Add `model_tiers` section with `fast`, `capable`, `reasoning` keys

**Reference (read, do not modify):**
- `tests/helpers.mjs` — Provides `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()`
- `.context-index/specs/features/adev:test-write/gaming-violation-detection.md` (Canonical Violation Patterns table)
- `.context-index/specs/features/adev:test-write/framework-detection.md` (Supported Frameworks table)
- `.context-index/specs/features/adev:test-write/immutable-handoff-block.md` (Handoff Block Format section)
- `.context-index/specs/cross-cutting/model-routing.md` (fallback tier table)

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/adev:test-write/framework-detection.md` (all behaviors and Supported Frameworks table)
- Charter: `.context-index/specs/features/adev:test-write/charter.md` (capability: Framework Detection)
- Test helpers: `tests/helpers.mjs` (createTempDir, writeFixture)
- Constitution: non-negotiable principles 1 (no external deps), 3 (pure ESM)

### Task 2 Context
- Spec: `.context-index/specs/features/adev:test-write/gaming-violation-detection.md` (all behaviors and Canonical Violation Patterns table)
- Charter: `.context-index/specs/features/adev:test-write/charter.md` (capability: Gaming Violation Detection)
- Test helpers: `tests/helpers.mjs`
- Constitution: non-negotiable principles 1, 3

### Task 3 Context
- Spec: `.context-index/specs/features/adev:test-write/immutable-handoff-block.md` (Handoff Block Format, all behaviors and acceptance criteria)
- Spec: `.context-index/specs/features/adev:test-write/post-green-semantic-verification.md` (Behavior 1: hash recheck)
- Charter: `.context-index/specs/features/adev:test-write/charter.md` (capabilities: Immutable Handoff Block, Post-GREEN Semantic Verification)
- Test helpers: `tests/helpers.mjs`
- Constitution: non-negotiable principles 1, 3

### Task 4 Context
- All 10 specs in `.context-index/specs/features/adev:test-write/` (behavioral contracts, acceptance criteria)
- Charter: `.context-index/specs/features/adev:test-write/charter.md` (full capability map)
- Cross-cutting: `.context-index/specs/cross-cutting/model-routing.md` (tier assignments and fallback table)
- Constitution: all principles, especially "skills are primarily markdown"
- Platform: `.context-index/platform-context.yaml` (node:test, ESM)

### Task 5 Context
- Spec: `.context-index/specs/features/adev:test-write/model-selection.md` (Behavior 4-6: template requirements)
- Cross-cutting: `.context-index/specs/cross-cutting/model-routing.md` (Behavior 5: template scaffolding)
- File: `templates/platform-context.yaml` (current content)

---

## Parallelization

- **Group A (sequential):** Task 1 → Task 3 (write-handoff accepts framework name as input; framework detection must be implemented first so its API is stable)
- **Group B (sequential):** Task 2 → Task 3 (write-handoff accepts gaming_check results)
- **Group C (sequential):** Task 1, Task 2, Task 3 → Task 4 (SKILL.md references all three helpers)
- **Group D (independent):** Task 5 (templates update — no file overlap with A, B, C)

Task 5 can run in parallel with Tasks 1-3. Task 4 must wait for Tasks 1-3 to complete.

---

## Tasks

### Task 1: Framework Detection Helper [specialist: none]

**Charter capability:** Framework Detection
**Files:**
- Create: `skills/test-write/detect-framework.mjs`
- Test: `tests/adev:test-write/detect-framework.test.mjs`

**Context to load:**
- `.context-index/specs/features/adev:test-write/framework-detection.md` (Supported Frameworks table, all behaviors)
- `tests/helpers.mjs` (writeFixture for fixture setup)

- [ ] **Write failing test**

```javascript
// tests/adev:test-write/detect-framework.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { detectFramework } from '../../skills/test-write/detect-framework.mjs';

test('detects vitest from package.json devDependencies', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'vitest');
  assert.equal(result.command, 'npx vitest run');
  assert.ok(result.filePattern);
});

test('detects jest from package.json devDependencies', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ devDependencies: { jest: '^29.0.0' } }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'jest');
  assert.equal(result.command, 'npx jest');
});

test('detects node:test as default for Node.js >= 18 project (no framework dep)', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ dependencies: {} }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'node:test');
  assert.equal(result.command, 'node --test');
});

test('prefers vitest over jest when both present', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({
    devDependencies: { vitest: '^1.0.0', jest: '^29.0.0' }
  }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'vitest');
});

test('falls back to file scan when package.json has no match — infers jest from .test.js import', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({}));
  await writeFixture(dir, 'tests/foo.test.js', "import { describe, it, expect } from '@jest/globals';");
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'jest');
});

test('returns null when no framework is detectable', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({}));
  const result = await detectFramework(dir);
  assert.equal(result, null);
});

test('skips malformed package.json and falls back to file scan', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', 'not valid json {{{{');
  const result = await detectFramework(dir);
  assert.equal(result, null);
});

test('file scan reads at most 4096 bytes per file', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({}));
  // Large file — framework keyword is beyond 4096 bytes
  const padding = 'x'.repeat(4200);
  await writeFixture(dir, 'tests/foo.test.js', padding + "\nimport { describe } from 'jest';");
  const result = await detectFramework(dir);
  // Should not detect jest because relevant content is past 4096 bytes
  assert.equal(result, null);
});
```

- [ ] **Verify test fails**

```bash
node --test tests/adev:test-write/detect-framework.test.mjs
```
Expected: FAIL — `Cannot find module '../../skills/test-write/detect-framework.mjs'`

- [ ] **Implement**

Create `skills/test-write/detect-framework.mjs` with:
- `export async function detectFramework(projectRoot)` — async, accepts project root path
- Check `package.json` deps/devDeps for vitest, jest, mocha, jasmine in priority order; `node:test` if Node >= 18
- Check `go.mod`, `Cargo.toml`, `pyproject.toml` for go/cargo/python
- Return `{ framework, command, filePattern }` from allowlist only — never read `scripts.test`
- If no package.json match: scan `**/*.test.*`, `**/*.spec.*`, read up to 4096 bytes per file, infer from import statements
- Return `null` if nothing detectable
- Handle malformed JSON without throwing

- [ ] **Verify test passes**

```bash
node --test tests/adev:test-write/detect-framework.test.mjs
```
Expected: PASS — all 8 tests pass

- [ ] **Commit**

Branch: `feat/adev:test-write/helpers`

```bash
git add skills/test-write/detect-framework.mjs tests/adev:test-write/detect-framework.test.mjs
git commit -m "feat(adev:test-write): add detect-framework.mjs helper with tests"
```

---

### Task 2: Gaming Violation Detection Helper [specialist: none]

**Charter capability:** Gaming Violation Detection
**Files:**
- Create: `skills/test-write/detect-gaming.mjs`
- Test: `tests/adev:test-write/detect-gaming.test.mjs`

**Context to load:**
- `.context-index/specs/features/adev:test-write/gaming-violation-detection.md` (Canonical Violation Patterns table, all 9 patterns)

- [ ] **Write failing test**

```javascript
// tests/adev:test-write/detect-gaming.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGaming } from '../../skills/test-write/detect-gaming.mjs';

// Helper: run detector on inline content
async function scan(content) {
  return detectGaming([{ path: 'test.mjs', content }]);
}

test('flags toBeTruthy() as sole assertion — blocking', async () => {
  const violations = await scan(`
    test('x', () => {
      const result = doThing();
      expect(result).toBeTruthy();
    });
  `);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'vacuous-matcher');
  assert.equal(violations[0].severity, 'blocking');
  assert.ok(violations[0].line > 0);
});

test('flags toBeDefined() as sole assertion — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(result).toBeDefined(); });`);
  assert.equal(violations.filter(v => v.type === 'vacuous-matcher').length, 1);
});

test('flags toBeGreaterThanOrEqual(0) — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(count).toBeGreaterThanOrEqual(0); });`);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 1);
});

test('flags toBeGreaterThan(-1) — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(count).toBeGreaterThan(-1); });`);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 1);
});

test('flags .skip( — blocking', async () => {
  const violations = await scan(`test.skip('x', () => { expect(1).toBe(1); });`);
  assert.equal(violations.filter(v => v.type === 'conditional-skip').length, 1);
});

test('flags xit( — blocking', async () => {
  const violations = await scan(`xit('x', () => { expect(1).toBe(1); });`);
  assert.ok(violations.some(v => v.severity === 'blocking'));
});

test('flags try { expect } without rethrow — blocking', async () => {
  const violations = await scan(`
    test('x', () => {
      try { expect(result).toBe(true); } catch(e) {}
    });
  `);
  assert.ok(violations.some(v => v.type === 'conditional-skip' && v.severity === 'blocking'));
});

test('flags if (x) { expect } without else — blocking', async () => {
  const violations = await scan(`
    test('x', () => {
      if (condition) { expect(result).toBe(true); }
    });
  `);
  assert.ok(violations.some(v => v.severity === 'blocking'));
});

test('flags .not.toThrow() as sole assertion — blocking', async () => {
  const violations = await scan(`test('x', () => { expect(() => fn()).not.toThrow(); });`);
  assert.ok(violations.some(v => v.severity === 'blocking'));
});

test('does not flag toEqual with specific expected value', async () => {
  const violations = await scan(`
    test('x', () => {
      expect(user).toEqual({ id: 1, name: 'Alice' });
    });
  `);
  assert.equal(violations.filter(v => v.severity === 'blocking').length, 0);
});

test('returns structured violation with file, line, matched text, severity', async () => {
  const violations = await detectGaming([{ path: 'src/test.mjs', content: `test('x', () => { expect(r).toBeTruthy(); });` }]);
  assert.ok(violations[0].file);
  assert.ok(violations[0].line >= 1);
  assert.ok(violations[0].matched);
  assert.ok(violations[0].severity);
  assert.ok(violations[0].type);
});
```

- [ ] **Verify test fails**

```bash
node --test tests/adev:test-write/detect-gaming.test.mjs
```
Expected: FAIL — `Cannot find module '../../skills/test-write/detect-gaming.mjs'`

- [ ] **Implement**

Create `skills/test-write/detect-gaming.mjs` with:
- `export async function detectGaming(files)` — accepts `[{ path, content }]` array
- Run each canonical regex against each file's content (line by line for line numbers)
- Return `[{ type, severity, file, line, matched }]`
- Use only `node:fs`, `node:path` built-ins (no AST parser)
- "Sole assertion" detection: check if `expect(` appears only once in the test body

- [ ] **Verify test passes**

```bash
node --test tests/adev:test-write/detect-gaming.test.mjs
```
Expected: PASS — all 11 tests pass

- [ ] **Commit**

```bash
git add skills/test-write/detect-gaming.mjs tests/adev:test-write/detect-gaming.test.mjs
git commit -m "feat(adev:test-write): add detect-gaming.mjs helper with canonical pattern tests"
```

---

### Task 3: Handoff Block Writer & Hash Verifier [specialist: none]

**Charter capability:** Immutable Handoff Block, Post-GREEN Semantic Verification (hash check component)
**Files:**
- Create: `skills/test-write/write-handoff.mjs`
- Test: `tests/adev:test-write/write-handoff.test.mjs`

**Context to load:**
- `.context-index/specs/features/adev:test-write/immutable-handoff-block.md` (Handoff Block Format section, all behaviors)
- `.context-index/specs/features/adev:test-write/post-green-semantic-verification.md` (Behavior 1: hash recheck algorithm)

- [ ] **Write failing test**

```javascript
// tests/adev:test-write/write-handoff.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { writeHandoff, verifyHandoff } from '../../skills/test-write/write-handoff.mjs';

test('writes handoff block to correct path', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const testFile = join(dir, 'tests/foo.test.mjs');
  await writeFixture(dir, 'tests/foo.test.mjs', 'test content here');
  await writeHandoff({
    packetsDir: join(dir, 'packets'),
    slug: 'foo-feature',
    spec: 'specs/foo.md',
    testFiles: [testFile],
    verificationCommand: 'node --test tests/foo.test.mjs',
    redStateEvidence: 'AssertionError: expected undefined to equal 42',
    constraints: ['assertion on line 3 must remain'],
    mockingBoundaries: [],
    preexistingCheck: 'skipped (clean tree)',
    gamingCheck: 'passed',
    framework: 'node:test',
  });
  assert.ok(existsSync(join(dir, 'packets', 'foo-feature-tests.md')));
});

test('handoff block contains all required fields', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const testFile = join(dir, 'tests/bar.test.mjs');
  await writeFixture(dir, 'tests/bar.test.mjs', 'expect(1).toBe(1);');
  await writeHandoff({
    packetsDir: join(dir, 'packets'),
    slug: 'bar-feature',
    spec: 'specs/bar.md',
    testFiles: [testFile],
    verificationCommand: 'node --test tests/bar.test.mjs',
    redStateEvidence: 'Test failed',
    constraints: [],
    mockingBoundaries: [],
    preexistingCheck: 'passed',
    gamingCheck: 'passed',
    framework: 'node:test',
  });
  const content = readFileSync(join(dir, 'packets', 'bar-feature-tests.md'), 'utf-8');
  assert.ok(content.includes('locked: true'));
  assert.ok(content.includes('hash:'));
  assert.ok(content.includes('preexisting_check:'));
  assert.ok(content.includes('gaming_check:'));
  assert.ok(content.includes('## Original Test File Contents'));
  assert.ok(content.includes('expect(1).toBe(1);'));
  assert.ok(content.includes('## Verification Command'));
  assert.ok(content.includes('## RED State Evidence'));
  assert.ok(content.includes('## Locked Constraints'));
});

test('hash is SHA-256 of test files concatenated in path-alphabetical order', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  const { createHash } = await import('node:crypto');
  const contentA = 'file a content';
  const contentB = 'file b content';
  await writeFixture(dir, 'tests/a.test.mjs', contentA);
  await writeFixture(dir, 'tests/b.test.mjs', contentB);
  const filesA = [join(dir, 'tests/a.test.mjs'), join(dir, 'tests/b.test.mjs')];
  const filesB = [join(dir, 'tests/b.test.mjs'), join(dir, 'tests/a.test.mjs')]; // different order
  const r1 = await writeHandoff({ packetsDir: join(dir, 'p1'), slug: 's1', spec: 'x', testFiles: filesA, verificationCommand: 'x', redStateEvidence: 'x', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  const r2 = await writeHandoff({ packetsDir: join(dir, 'p2'), slug: 's2', spec: 'x', testFiles: filesB, verificationCommand: 'x', redStateEvidence: 'x', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  // Must produce same hash regardless of input order (sorted alphabetically)
  const content1 = readFileSync(join(dir, 'p1', 's1-tests.md'), 'utf-8');
  const content2 = readFileSync(join(dir, 'p2', 's2-tests.md'), 'utf-8');
  const hash1 = content1.match(/^hash: (.+)$/m)?.[1];
  const hash2 = content2.match(/^hash: (.+)$/m)?.[1];
  assert.equal(hash1, hash2);
});

test('overwrites existing packet and records previous_hash', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/x.test.mjs', 'v1 content');
  const baseArgs = { packetsDir: join(dir, 'packets'), slug: 'x', spec: 's', testFiles: [join(dir, 'tests/x.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' };
  await writeHandoff(baseArgs);
  // Change content and overwrite
  await writeFixture(dir, 'tests/x.test.mjs', 'v2 content');
  await writeHandoff(baseArgs);
  const content = readFileSync(join(dir, 'packets', 'x-tests.md'), 'utf-8');
  assert.ok(content.includes('previous_hash:'));
});

test('creates packets directory if absent', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/y.test.mjs', 'content');
  const newPacketsDir = join(dir, 'does', 'not', 'exist');
  await writeHandoff({ packetsDir: newPacketsDir, slug: 'y', spec: 's', testFiles: [join(dir, 'tests/y.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  assert.ok(existsSync(join(newPacketsDir, 'y-tests.md')));
});

test('RED State Evidence redacts common secret patterns', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/z.test.mjs', 'content');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'z', spec: 's', testFiles: [join(dir, 'tests/z.test.mjs')], verificationCommand: 'c', redStateEvidence: 'Error: PASSWORD=supersecret TOKEN=abc123', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  const content = readFileSync(join(dir, 'packets', 'z-tests.md'), 'utf-8');
  assert.ok(!content.includes('supersecret'));
  assert.ok(!content.includes('abc123'));
});

test('verifyHandoff returns PASS when hash matches', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/v.test.mjs', 'stable content');
  const packetPath = join(dir, 'packets', 'v-tests.md');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'v', spec: 's', testFiles: [join(dir, 'tests/v.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  const result = await verifyHandoff(packetPath);
  assert.equal(result.status, 'PASS');
});

test('verifyHandoff returns HASH_MISMATCH when file content changed', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'tests/w.test.mjs', 'original content');
  const packetPath = join(dir, 'packets', 'w-tests.md');
  await writeHandoff({ packetsDir: join(dir, 'packets'), slug: 'w', spec: 's', testFiles: [join(dir, 'tests/w.test.mjs')], verificationCommand: 'c', redStateEvidence: 'e', constraints: [], mockingBoundaries: [], preexistingCheck: 'passed', gamingCheck: 'passed', framework: 'node:test' });
  await writeFixture(dir, 'tests/w.test.mjs', 'modified content');
  const result = await verifyHandoff(packetPath);
  assert.equal(result.status, 'HASH_MISMATCH');
  assert.ok(result.storedHash);
  assert.ok(result.computedHash);
});
```

- [ ] **Verify test fails**

```bash
node --test tests/adev:test-write/write-handoff.test.mjs
```
Expected: FAIL — `Cannot find module '../../skills/test-write/write-handoff.mjs'`

- [ ] **Implement**

Create `skills/test-write/write-handoff.mjs` with:
- `export async function writeHandoff(params)` — writes the Handoff Block markdown file
  - Derives slug from spec title (kebab-case)
  - Computes SHA-256 hash of test file contents (path-alphabetical sort, `crypto.createHash('sha256')`)
  - Creates packets directory if absent
  - If packet already exists, reads its hash → `previous_hash`
  - Redacts `PASSWORD=`, `SECRET=`, `TOKEN=`, `API_KEY=`, connection-string-like patterns from RED State Evidence
  - Writes full Handoff Block format per spec (frontmatter + all sections including Original Test File Contents)
- `export async function verifyHandoff(packetPath)` — reads packet, recomputes hash from current files
  - Returns `{ status: 'PASS' | 'HASH_MISMATCH', storedHash?, computedHash? }`
  - Throws if packet file not found
- Uses only `node:crypto`, `node:fs`, `node:path`

- [ ] **Verify test passes**

```bash
node --test tests/adev:test-write/write-handoff.test.mjs
```
Expected: PASS — all 8 tests pass

- [ ] **Commit**

```bash
git add skills/test-write/write-handoff.mjs tests/adev:test-write/write-handoff.test.mjs
git commit -m "feat(adev:test-write): add write-handoff.mjs with SHA-256 hashing and verifyHandoff"
```

---

### Task 4: SKILL.md — Complete Skill Instruction Set [specialist: none]

**Charter capability:** RED Phase Test Authoring, Pre-existing Failure Protocol, Mocking Boundary Declaration, Post-GREEN Semantic Verification, Handoff Block Diff Report, Standalone Invocation, Model Selection
**Depends on:** Task 1, Task 2, Task 3 (SKILL.md references their APIs)
**Files:**
- Create: `skills/test-write/SKILL.md`
- Test: `tests/adev:test-write/skill-structure.test.mjs`

**Context to load:**
- All 10 specs in `.context-index/specs/features/adev:test-write/` (behavioral contracts and acceptance criteria)
- `.context-index/specs/cross-cutting/model-routing.md` (tier assignments: capable=RED, fast=verify/gaming)
- `.context-index/specs/features/adev:test-write/charter.md` (capability map and invariants)

- [ ] **Write failing test**

```javascript
// tests/adev:test-write/skill-structure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL_PATH = 'skills/test-write/SKILL.md';

function readSkill() {
  return readFileSync(SKILL_PATH, 'utf-8');
}

test('SKILL.md file exists and is non-empty', () => {
  const content = readSkill();
  assert.ok(content.length > 500, 'SKILL.md should be substantial');
});

test('SKILL.md documents --red invocation mode', () => {
  assert.ok(readSkill().includes('--red'));
});

test('SKILL.md documents --verify invocation mode', () => {
  assert.ok(readSkill().includes('--verify'));
});

test('SKILL.md documents --spec, --file, and free-form description modes', () => {
  const content = readSkill();
  assert.ok(content.includes('--spec'));
  assert.ok(content.includes('--file'));
});

test('SKILL.md documents pre-existing failure protocol (git stash --include-untracked)', () => {
  assert.ok(readSkill().includes('git stash --include-untracked'));
});

test('SKILL.md documents lockfile creation (.test-write.lock)', () => {
  assert.ok(readSkill().includes('.test-write.lock'));
});

test('SKILL.md documents mocking boundary types', () => {
  const content = readSkill();
  assert.ok(content.includes('HTTP'));
  assert.ok(content.includes('external-api'));
  assert.ok(content.includes('MOCK_VIOLATION'));
});

test('SKILL.md documents all 5 tamper classifications', () => {
  const content = readSkill();
  assert.ok(content.includes('REMOVED'));
  assert.ok(content.includes('LOOSENED'));
  assert.ok(content.includes('HARDCODED_TO_PASS'));
  assert.ok(content.includes('SKIPPED'));
  assert.ok(content.includes('CONDITIONAL'));
});

test('SKILL.md documents model tier resolution — no hardcoded model IDs', () => {
  const content = readSkill();
  const hardcoded = ['claude-sonnet', 'claude-opus', 'claude-haiku', 'gpt-4', 'gpt-3', 'gemini'];
  for (const model of hardcoded) {
    assert.ok(!content.toLowerCase().includes(model),
      `SKILL.md must not contain hardcoded model name: ${model}`);
  }
});

test('SKILL.md references capable tier for RED phase dispatch', () => {
  assert.ok(readSkill().includes('capable'));
});

test('SKILL.md references fast tier for verify/gaming dispatch', () => {
  assert.ok(readSkill().includes('fast'));
});

test('SKILL.md documents standalone invocation with preflight summary', () => {
  const content = readSkill();
  assert.ok(content.includes('standalone') || content.includes('Standalone'));
  assert.ok(content.includes('pre-flight') || content.includes('preflight') || content.includes('Pre-flight'));
});

test('SKILL.md documents diff report format (verify report path)', () => {
  assert.ok(readSkill().includes('-verify-report.md'));
});

test('SKILL.md documents GAMING_VIOLATION error code', () => {
  assert.ok(readSkill().includes('GAMING_VIOLATION'));
});

test('SKILL.md documents RED_STATE_FAILED error code', () => {
  assert.ok(readSkill().includes('RED_STATE_FAILED'));
});
```

- [ ] **Verify test fails**

```bash
node --test tests/adev:test-write/skill-structure.test.mjs
```
Expected: FAIL — `ENOENT: no such file or directory, open 'skills/test-write/SKILL.md'`

- [ ] **Implement**

Create `skills/test-write/SKILL.md` with the following sections:

1. **Identity and Invocation** — entry point description, `--red` and `--verify` modes, standalone modes (`--spec`, `--file`, free-form)
2. **Step 0: Standalone Pre-flight** — pre-flight summary (framework, target, estimated contracts, output path), confirm before proceeding; `.context-index/`-free fallback to `./packets/`
3. **Step 1: Model Tier Resolution** — read `model_tiers` from `platform-context.yaml`; dispatch tiers: RED authoring = `capable`, verify/gaming judgment = `fast`; fallback table and advisory log
4. **Step 2: Framework Detection** — run `detect-framework.mjs`; block with `FRAMEWORK_NOT_DETECTED` if null
5. **Step 3: Pre-existing Failure Protocol** (for `--red`) — write lockfile, run tests, if failing: `git stash --include-untracked`, re-run tests (60s timeout), `git stash pop` (always, even on error/timeout), classify failures, attach Pre-existing Failure Record or block with `REGRESSION_DETECTED`; remove lockfile; handle `GIT_POP_FAILED` by blocking immediately with stash SHA
6. **Step 4: Test Authoring** — derive Test Contracts from spec/file/description; enforce seed data; detect gaming violations via `detect-gaming.mjs` (block on `blocking` violations with `GAMING_VIOLATION`); enforce mocking boundaries (four permitted types: `HTTP`, `DB`, `filesystem`, `external-api`); block on internal module mocking with `MOCK_VIOLATION` and boundary suggestion; require justification for all mocks (`MISSING_JUSTIFICATION`)
7. **Step 5: RED State Verification** — run tests scoped to new files; must fail for behavioral reasons (not setup errors); fix setup and retry up to 2 times on setup errors; block with `RED_STATE_FAILED` if tests pass; block with `SETUP_ERROR` if still failing for wrong reason
8. **Step 6: Handoff Block Production** — call `write-handoff.mjs` with all required fields; block on write failure with `WRITE_ERROR`
9. **Verify Mode (`--verify`)** — read packet; call `verifyHandoff()` for hash check; if PASS → done; if HASH_MISMATCH → dispatch `fast`-tier subagent for semantic diff; semantic diff compares Original Test File Contents section against current files; classify: REMOVED, LOOSENED, HARDCODED_TO_PASS, SKIPPED, CONDITIONAL; cosmetic-only changes → `PASS_WITH_COSMETIC_CHANGES`; any tamper → `TAMPERED`; write verify report to `packets/<slug>-verify-report.md` AND print inline; handle `DIFF_UNAVAILABLE` when Original Test File Contents section absent; check for new undeclared mocks introduced during GREEN phase
10. **Error Codes Reference** — table of all error codes from all specs

Key invariants to document:
- `git stash pop` ALWAYS runs after `git stash` — even on timeout or error
- Every mock must have a declared Mocking Boundary with justification
- Handoff Block is never modified by `--verify` (read-only)
- Re-running `--red` on same target is safe (overwrites, records `previous_hash`)

- [ ] **Verify test passes**

```bash
node --test tests/adev:test-write/skill-structure.test.mjs
```
Expected: PASS — all 15 tests pass

- [ ] **Commit**

```bash
git add skills/test-write/SKILL.md tests/adev:test-write/skill-structure.test.mjs
git commit -m "feat(adev:test-write): add SKILL.md covering all 10 behavioral specs"
```

---

### Task 5: Templates — Add model_tiers to platform-context.yaml [specialist: none]

**Charter capability:** Model Selection
**Files:**
- Modify: `templates/platform-context.yaml`

**Context to load:**
- `.context-index/specs/features/adev:test-write/model-selection.md` (Behavior 4: template requirements)
- `.context-index/specs/cross-cutting/model-routing.md` (Behavior 5: template scaffolding)

- [ ] **Write failing test**

```javascript
// Inline: add to tests/adev:test-write/skill-structure.test.mjs OR create a new file
// tests/adev:test-write/platform-context-template.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('templates/platform-context.yaml contains model_tiers section', () => {
  const content = readFileSync('templates/platform-context.yaml', 'utf-8');
  assert.ok(content.includes('model_tiers'));
});

test('templates/platform-context.yaml has fast, capable, reasoning keys under model_tiers', () => {
  const content = readFileSync('templates/platform-context.yaml', 'utf-8');
  assert.ok(content.includes('fast:'));
  assert.ok(content.includes('capable:'));
  assert.ok(content.includes('reasoning:'));
});

test('templates/platform-context.yaml model_tiers values are blank (not hardcoded model IDs)', () => {
  const content = readFileSync('templates/platform-context.yaml', 'utf-8');
  // Values should be blank (null or empty string), not specific model names
  const hardcoded = ['claude-sonnet', 'claude-opus', 'claude-haiku', 'gpt-4', 'gemini'];
  for (const model of hardcoded) {
    assert.ok(!content.includes(model), `Template must not hardcode model ID: ${model}`);
  }
});
```

- [ ] **Verify test fails**

```bash
node --test tests/adev:test-write/platform-context-template.test.mjs
```
Expected: FAIL — `model_tiers` section not present in template

- [ ] **Implement**

Read `templates/platform-context.yaml`, then append:
```yaml
# Model tier configuration — set these to your provider's model IDs.
# If absent, all skills fall back to built-in defaults (see model-routing spec).
model_tiers:
  fast:       # low-stakes: pattern matching, diffs, semantic comparison, gaming detection
  capable:    # high-stakes: code generation, test authoring, behavioral reasoning
  reasoning:  # highest-stakes: architecture review, cross-cutting analysis
```

- [ ] **Verify test passes**

```bash
node --test tests/adev:test-write/platform-context-template.test.mjs
```
Expected: PASS — all 3 tests pass

- [ ] **Verify full suite still passes**

```bash
npm test
```
Expected: PASS — all tests including existing cli and hooks tests

- [ ] **Commit**

```bash
git add templates/platform-context.yaml tests/adev:test-write/platform-context-template.test.mjs
git commit -m "feat(adev:test-write): add model_tiers to platform-context.yaml template"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] All tests pass: `npm test`
- [ ] No CommonJS syntax in any new file (`require`, `module.exports`)
- [ ] No hardcoded model IDs in `SKILL.md`
- [ ] All acceptance criteria from all 10 specs satisfied (review each spec's checklist)

### Acceptance Criteria Cross-check

**framework-detection:** 9 criteria — covered by Task 1 tests + implementation
**gaming-violation-detection:** 7 criteria — covered by Task 2 tests + implementation
**immutable-handoff-block:** 10 criteria — covered by Task 3 tests + implementation
**preexisting-failure-protocol:** 9 criteria — covered by Task 4 SKILL.md section (documented behavior, not unit-tested code)
**red-phase-test-authoring:** 12 criteria — covered by Task 4 SKILL.md + Task 1-3 helpers + Task 4 structural tests
**mocking-boundary-declaration:** 6 criteria — covered by Task 4 SKILL.md section + structural tests
**post-green-semantic-verification:** 9 criteria — covered by Task 3 verifyHandoff + Task 4 SKILL.md verify mode + structural tests
**handoff-block-diff-report:** 6 criteria — covered by Task 4 SKILL.md + structural tests
**standalone-invocation:** 8 criteria — covered by Task 4 SKILL.md standalone section + structural tests
**model-selection:** 8 criteria — covered by Task 4 SKILL.md model tier section + Task 5 + structural tests

### PASS_WITH_NOTES Warnings (from review — address in implementation)

- **SA-5:** `previous_hash` is audit-only — document this explicitly in SKILL.md and in `write-handoff.mjs` JSDoc
- **SA-6:** "Last 20 lines" fragility — SKILL.md should say "relevant failure excerpt, enough to confirm behavioral reason" rather than a fixed line count
- **SEC-3:** RED State Evidence secret redaction — implemented in `write-handoff.mjs` Task 3
- **CON-6:** `STALE_PACKET` severity — `--verify` always blocks; `/adev:retro` always warns; document this distinction in SKILL.md

---
