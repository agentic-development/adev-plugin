<!-- DO NOT EDIT statuses inline — see lifecycle log implement-injection.jsonl -->
# Implementation Plan: Implement Injection

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/implement-injection.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-12)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Add heuristic loading to `/adev:implement` Step 1 and heuristic injection into Step 2a context packets, so subagents receive advisory heuristic context.

**Architecture:** Step 1 gains a new item (11) that calls `retrieveHeuristics` and `renderHeuristic` from `lib/heuristics.mjs` via inline Node.js. Step 2a gains a `## Heuristics` subsection appended to each task's context packet when heuristics are available. The subagent prompt includes an advisory preamble. All changes are SKILL.md markdown edits — no companion code changes.

---

## File Structure

**Modify:**
- `skills/implement/SKILL.md` — Add heuristic loading to Step 1 and injection to Step 2a

**Create:**
- `tests/skills/implement-heuristic-injection.test.mjs` — Eval tests for injection behavior

**Reference (read, do not modify):**
- `lib/heuristics.mjs` — `retrieveHeuristics`, `renderHeuristic` (from retrieval-filtering plan)
- `.context-index/specs/features/heuristics/retrieval-filtering.spec.md` — Budget and format conventions

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/heuristics/implement-injection.spec.md` (Behaviors 1-2, 6-7)
- Charter: `.context-index/specs/features/heuristics/charter.md` (capability: Implement Injection)
- Current SKILL.md: `skills/implement/SKILL.md` (Step 1, lines 28-50)

### Task 2 Context
- Spec: `.context-index/specs/features/heuristics/implement-injection.spec.md` (Behaviors 3-5, 7)
- Current SKILL.md: `skills/implement/SKILL.md` (Step 2a, lines 85-97)

### Task 3 Context
- Spec: `.context-index/specs/features/heuristics/implement-injection.spec.md` (all Behaviors, all AC)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (both modify same file)
- Group B (independent): Task 3 (test file only, but depends on Task 1-2 content)

---

### Task 1: Add heuristic loading to Step 1 [specialist: none]

**Charter capability:** Implement Injection
**Files:**
- Modify: `skills/implement/SKILL.md` — Add item 11 to Step 1
- Test: `tests/skills/implement-heuristic-injection.test.mjs`

**Tests:** `tests/skills/implement-heuristic-injection.test.mjs`

- [ ] **Write failing test**

```javascript
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('implement SKILL.md heuristic injection', () => {
  it('Step 1 includes heuristic loading instruction', async () => {
    const content = await readFile('skills/implement/SKILL.md', 'utf8');
    assert.ok(content.includes('retrieveHeuristics'), 'Step 1 must reference retrieveHeuristics');
    assert.ok(content.includes('renderHeuristic'), 'Step 1 must reference renderHeuristic');
    assert.ok(content.includes('lib/heuristics.mjs'), 'Step 1 must reference lib/heuristics.mjs');
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-heuristic-injection.test.mjs`
Expected: FAIL — SKILL.md does not yet contain these references

- [ ] **Implement**

Add item 11 to Step 1 in `skills/implement/SKILL.md`, after item 10 (Model tier resolution):

```markdown
11. **Heuristics:** Load module-scoped heuristics for injection into context packets. Run inline Node.js:
    ```bash
    node -e "
      import { retrieveHeuristics, renderHeuristic } from './lib/heuristics.mjs';
      import { readFile } from 'node:fs/promises';
      const manifest = JSON.parse(await readFile('.context-index/manifest.yaml', 'utf8'));
      const limit = manifest?.heuristics?.injection_limit;
      const heuristics = await retrieveHeuristics(process.cwd(), '<module>', { injectionLimit: limit });
      const rendered = heuristics.map(renderHeuristic).join('\n\n');
      console.log(JSON.stringify({ count: heuristics.length, rendered }));
    "
    ```
    Where `<module>` is the charter module slug from the plan's spec. If the command fails or returns `count: 0`, proceed without heuristics — heuristic injection is strictly non-blocking. Store the `rendered` output for use in Step 2a.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-heuristic-injection.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-heuristic-injection.test.mjs
git commit -m "feat(heuristics): add heuristic loading to implement Step 1"
```

---

### Task 2: Add heuristics section to Step 2a context packets [specialist: none]

**Charter capability:** Implement Injection
**Files:**
- Modify: `skills/implement/SKILL.md` — Add heuristics to Step 2a
- Test: `tests/skills/implement-heuristic-injection.test.mjs`

**Tests:** `tests/skills/implement-heuristic-injection.test.mjs`
**Depends on:** Task 1

- [ ] **Write failing test**

```javascript
it('Step 2a includes heuristics section instruction', async () => {
  const content = await readFile('skills/implement/SKILL.md', 'utf8');
  assert.ok(content.includes('## Heuristics'), 'Step 2a must describe heuristics section');
  assert.ok(content.includes('advisory'), 'Must include advisory preamble instruction');
  assert.ok(content.includes('guidance, not as hard rules'), 'Must include preamble text');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-heuristic-injection.test.mjs`
Expected: FAIL

- [ ] **Implement**

Add to Step 2a in `skills/implement/SKILL.md`, after item 4 (default packet assembly):

```markdown
5. **Heuristics injection:** If heuristics were loaded in Step 1 (count > 0), append a `## Heuristics` section to the context packet with the rendered blocks from Step 1. Prefix the section with the advisory preamble:

   > The following heuristics are lessons learned from past work in this module. Use them as guidance, not as hard rules.

   All tasks in the same plan receive the same heuristic set. If no heuristics are available, omit this section entirely — do not emit an empty placeholder.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-heuristic-injection.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-heuristic-injection.test.mjs
git commit -m "feat(heuristics): add heuristics section to implement Step 2a context packets"
```

---

### Task 3: End-to-end eval tests [specialist: none]

**Charter capability:** Implement Injection
**Files:**
- Test: `tests/skills/implement-heuristic-injection.test.mjs`

**Tests:** `tests/skills/implement-heuristic-injection.test.mjs`
**Depends on:** Task 1, Task 2

- [ ] **Write failing test**

```javascript
it('SKILL.md documents non-blocking behavior for heuristic failures', async () => {
  const content = await readFile('skills/implement/SKILL.md', 'utf8');
  assert.ok(content.includes('non-blocking') || content.includes('proceed without heuristics'),
    'Must document non-blocking semantics');
});

it('SKILL.md does not hardcode injection_limit value', async () => {
  const content = await readFile('skills/implement/SKILL.md', 'utf8');
  // Should reference manifest config, not hardcode 8
  assert.ok(content.includes('injection_limit'), 'Must reference configurable limit');
});
```

- [ ] **Verify tests fail** / **Verify tests pass**

These should already pass if Task 1-2 were implemented correctly. If not, fix the SKILL.md content.

- [ ] **Commit**

```bash
git add tests/skills/implement-heuristic-injection.test.mjs
git commit -m "test(heuristics): add implement injection eval tests"
```

---

## Quality Gates

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
