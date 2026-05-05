# Implementation Plan: Contradiction Tracking

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/contradiction-tracking.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-12)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Add contradiction scanning to `/adev:validate` Check 12 and `/adev:recover` Step 7, so that new heuristics trigger `addContradiction` on existing entries whose `pattern`/`antiPattern` semantically conflicts.

**Architecture:** Both Check 12 and Step 7 gain a pre-write contradiction scan step: read existing heuristics for the target scope, compare semantically (agent judgment), call `addContradiction` if a conflict is found, then proceed with the new heuristic write. Ordering is always: contradiction first, then new write. All changes are SKILL.md markdown edits.

---

## File Structure

**Modify:**
- `skills/validate/SKILL.md` — Add contradiction scan to Check 12
- `skills/recover/SKILL.md` — Add contradiction scan to Step 7

**Create:**
- `tests/skills/contradiction-tracking.test.mjs` — Eval tests

**Reference:**
- `lib/heuristics.mjs` — `readHeuristics`, `addContradiction`
- `.context-index/specs/features/heuristics/store-and-helper.spec.md` — addContradiction invariants

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/heuristics/contradiction-tracking.spec.md` (Behaviors 1-2, 4-7)
- Current SKILL.md: `skills/validate/SKILL.md` (Check 12, lines 244-360)

### Task 2 Context
- Spec: `.context-index/specs/features/heuristics/contradiction-tracking.spec.md` (Behaviors 3-7)
- Current SKILL.md: `skills/recover/SKILL.md` (Step 7, lines 304-404)

### Task 3 Context
- Spec: `.context-index/specs/features/heuristics/contradiction-tracking.spec.md` (all AC)

## Parallelization

- Group A: Task 1 (validate SKILL.md)
- Group B: Task 2 (recover SKILL.md)
- Group C: Task 3 (tests, depends on Task 1-2)

Groups A and B can run in parallel. Group C runs after both.

---

### Task 1: Add contradiction scan to Check 12 [specialist: none]

**Charter capability:** Contradiction Tracking
**Files:**
- Modify: `skills/validate/SKILL.md` — Add contradiction scan before writeHeuristic call in Check 12
- Test: `tests/skills/contradiction-tracking.test.mjs`

**Tests:** `tests/skills/contradiction-tracking.test.mjs`

- [ ] **Write failing test**

```javascript
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('contradiction tracking in validate SKILL.md', () => {
  it('Check 12 includes contradiction scan before writeHeuristic', async () => {
    const content = await readFile('skills/validate/SKILL.md', 'utf8');
    assert.ok(content.includes('addContradiction'), 'Must reference addContradiction');
    assert.ok(content.includes('readHeuristics'), 'Must read existing heuristics for comparison');
  });

  it('contradiction scan is ordered before writeHeuristic', async () => {
    const content = await readFile('skills/validate/SKILL.md', 'utf8');
    const contradictionIdx = content.indexOf('addContradiction');
    const writeIdx = content.indexOf('writeHeuristic');
    assert.ok(contradictionIdx < writeIdx, 'addContradiction must appear before writeHeuristic');
  });

  it('contradiction scan is non-blocking', async () => {
    const content = await readFile('skills/validate/SKILL.md', 'utf8');
    // The contradiction section should mention catching errors
    const section = content.slice(content.indexOf('addContradiction'));
    assert.ok(
      section.includes('catch') || section.includes('try') || section.includes('proceed'),
      'Must document non-blocking error handling for addContradiction'
    );
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/contradiction-tracking.test.mjs`
Expected: FAIL

- [ ] **Implement**

In `skills/validate/SKILL.md`, add a contradiction scan subsection to Check 12, before the `writeHeuristic` call. Insert after the scope/title/id derivation rules and before the inline Node.js write block:

```markdown
#### Contradiction Scan (before write)

Before writing the new success heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: `readHeuristics(projectRoot, { module: scope })`.
2. For each existing entry, compare: does the new heuristic's `pattern` directly conflict with an existing entry's `antiPattern`, or does the new heuristic describe a success that an existing entry's `pattern` warns against?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<validation-report-path>', date: '<today>', source: 'validation' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws (e.g., `HEURISTICS_NOT_FOUND` because the entry was archived between read and write), log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

This is a best-effort semantic comparison performed by you (the agent), not a programmatic string match. When in doubt, do not record a contradiction — `/adev:retro` consolidation is the backstop for missed contradictions.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/contradiction-tracking.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/validate/SKILL.md tests/skills/contradiction-tracking.test.mjs
git commit -m "feat(heuristics): add contradiction scan to validate Check 12"
```

---

### Task 2: Add contradiction scan to Step 7 [specialist: none]

**Charter capability:** Contradiction Tracking
**Files:**
- Modify: `skills/recover/SKILL.md` — Add contradiction scan before writeHeuristic call in Step 7
- Test: `tests/skills/contradiction-tracking.test.mjs`

**Tests:** `tests/skills/contradiction-tracking.test.mjs`

- [ ] **Write failing test**

```javascript
describe('contradiction tracking in recover SKILL.md', () => {
  it('Step 7 includes contradiction scan before writeHeuristic', async () => {
    const content = await readFile('skills/recover/SKILL.md', 'utf8');
    const step7Start = content.indexOf('### Step 7');
    const step7Content = content.slice(step7Start);
    assert.ok(step7Content.includes('addContradiction'), 'Step 7 must reference addContradiction');
    assert.ok(step7Content.includes('readHeuristics'), 'Step 7 must read existing heuristics');
  });

  it('contradiction ordering: addContradiction before writeHeuristic in Step 7', async () => {
    const content = await readFile('skills/recover/SKILL.md', 'utf8');
    const step7Start = content.indexOf('### Step 7');
    const step7Content = content.slice(step7Start);
    const contradictionIdx = step7Content.indexOf('addContradiction');
    const writeIdx = step7Content.indexOf('writeHeuristic');
    assert.ok(contradictionIdx < writeIdx, 'addContradiction must come before writeHeuristic in Step 7');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/contradiction-tracking.test.mjs`
Expected: FAIL

- [ ] **Implement**

In `skills/recover/SKILL.md`, add a contradiction scan subsection to Step 7, before the `writeHeuristic` call. Use the same pattern as Check 12:

```markdown
#### Contradiction Scan (before write)

Before writing the new failure heuristic, scan for semantic contradictions with existing heuristics:

1. Read existing heuristics for the target scope: `readHeuristics(projectRoot, { module: scope })`.
2. For each existing entry, compare: does the new heuristic's `antiPattern` directly conflict with an existing entry's `pattern`, or does the new failure diagnosis contradict an existing entry that describes the same area as working reliably?
3. If a semantic contradiction is detected, call `addContradiction(projectRoot, existingId, { path: '<recovery-record-path>', date: '<today>', source: 'recovery' })` before writing the new heuristic. Wrap in try/catch — if `addContradiction` throws, log a warning and proceed.
4. If no contradiction is detected, proceed directly to writeHeuristic.

Best-effort semantic comparison. When in doubt, skip — `/adev:retro` consolidation is the backstop.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/contradiction-tracking.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/recover/SKILL.md tests/skills/contradiction-tracking.test.mjs
git commit -m "feat(heuristics): add contradiction scan to recover Step 7"
```

---

### Task 3: Integration eval tests [specialist: none]

**Charter capability:** Contradiction Tracking
**Files:**
- Test: `tests/skills/contradiction-tracking.test.mjs`

**Tests:** `tests/skills/contradiction-tracking.test.mjs`
**Depends on:** Task 1, Task 2

- [ ] **Write tests**

```javascript
it('both skills reference the same contradiction scan pattern', async () => {
  const validate = await readFile('skills/validate/SKILL.md', 'utf8');
  const recover = await readFile('skills/recover/SKILL.md', 'utf8');
  // Both must have the same ordering and error handling pattern
  assert.ok(validate.includes('Contradiction Scan'), 'Validate must have Contradiction Scan section');
  assert.ok(recover.includes('Contradiction Scan'), 'Recover must have Contradiction Scan section');
});

it('both skills document best-effort semantic comparison', async () => {
  const validate = await readFile('skills/validate/SKILL.md', 'utf8');
  const recover = await readFile('skills/recover/SKILL.md', 'utf8');
  assert.ok(validate.includes('best-effort'), 'Validate must say best-effort');
  assert.ok(recover.includes('best-effort'), 'Recover must say best-effort');
});
```

- [ ] **Verify tests pass**

Run: `node --test tests/skills/contradiction-tracking.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/skills/contradiction-tracking.test.mjs
git commit -m "test(heuristics): add contradiction tracking eval tests"
```

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
