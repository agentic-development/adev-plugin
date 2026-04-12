# Implementation Plan: Retrieval Filtering

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/retrieval-filtering.md
> **Review:** PASS_WITH_NOTES (2026-04-12)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Add a `retrieveHeuristics` function to `lib/heuristics.mjs` that implements the dual-read, merge, dedup, budget-cap retrieval protocol and a `renderHeuristic` function for context packet formatting.

**Architecture:** The retrieval protocol is a higher-level composition of the existing `readHeuristics` API. Two new exported functions are added to `lib/heuristics.mjs`: `retrieveHeuristics(projectRoot, module, manifest)` handles the dual-read + merge + budget pipeline, and `renderHeuristic(heuristic)` produces the markdown block for injection. Both are pure ESM, zero new dependencies, and follow the existing camelCase/kebab-case convention. SKILL.md injection instructions (implement-injection and plan-injection specs) will consume these functions via inline Node.js.

---

## File Structure

**Modify:**
- `lib/heuristics.mjs` — Add `retrieveHeuristics` and `renderHeuristic` exports
- `tests/lib/heuristics.test.mjs` — Add retrieval filtering test suite

**Reference (read, do not modify):**
- `.context-index/specs/features/heuristics/store-and-helper.md` — Existing API signatures
- `.context-index/memory/heuristics/_format.md` — Schema documentation

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/heuristics/retrieval-filtering.md` (Behaviors 1-4, Error Cases)
- Charter: `.context-index/specs/features/heuristics/charter.md` (capability: Retrieval Filtering)
- Sibling spec: `.context-index/specs/features/heuristics/store-and-helper.md` (readHeuristics API signature)

### Task 2 Context
- Spec: `.context-index/specs/features/heuristics/retrieval-filtering.md` (Behavior 8, AC: rendering format)
- Charter: `.context-index/specs/features/heuristics/charter.md` (capability: Retrieval Filtering)

### Task 3 Context
- Spec: `.context-index/specs/features/heuristics/retrieval-filtering.md` (all Behaviors, all AC)
- Task 1 and Task 2 implementation

## Parallelization

- Group A (sequential): Task 1 → Task 3 (shared files, Task 3 tests both)
- Group B (independent): Task 2 (no file overlap with Task 1 test paths, but logically depends on Task 1 types)

In practice, run sequentially: Task 1 → Task 2 → Task 3.

---

### Task 1: `retrieveHeuristics` function [specialist: none]

**Charter capability:** Retrieval Filtering
**Files:**
- Modify: `lib/heuristics.mjs` — Add `retrieveHeuristics` export
- Test: `tests/lib/heuristics.test.mjs` — Add retrieval filtering suite

**Tests:** `tests/lib/heuristics.test.mjs`

- [ ] **Write failing tests**

Add a new `describe('retrieveHeuristics')` suite to the existing test file with these test cases:

```javascript
describe('retrieveHeuristics', () => {
  it('merges module and _global heuristics, deduplicates by id', async () => {
    // Write heuristics to both module and _global files
    // Call retrieveHeuristics(root, 'hooks', {})
    // Verify merged results, no duplicates
  });

  it('sorts module-scoped before _global at same confidence', async () => {
    // Write a medium-confidence heuristic to hooks.md and _global.md (different ids)
    // Call retrieveHeuristics
    // Verify hooks entry appears before _global entry
  });

  it('applies default budget cap: 5 high + 3 medium, excludes all low', async () => {
    // Write 7 high, 5 medium, 3 low heuristics
    // Call retrieveHeuristics with no injectionLimit
    // Verify: exactly 5 high + 3 medium returned
    // Verify: result contains zero entries with confidence === 'low'
  });

  it('scales budget proportionally with custom injectionLimit', async () => {
    // Write 10 high, 10 medium heuristics
    // Call retrieveHeuristics with injectionLimit: 3
    // Verify: highMax=2, mediumMax=1 (ceil(3*5/8)=2, 3-2=1)
  });

  it('returns empty array when injectionLimit is 0 (injection disabled)', async () => {
    // Write heuristics to module file
    // Call retrieveHeuristics with injectionLimit: 0
    // Verify: empty array returned (injection disabled)
    // Note: advisory log is emitted by the calling skill, not by this function
  });

  it('returns empty array when no heuristics exist', async () => {
    // Call retrieveHeuristics on empty store
    // Verify: empty array, no error
  });

  it('catches readHeuristics errors and returns empty array', async () => {
    // Call retrieveHeuristics with invalid projectRoot
    // Verify: empty array, no throw
  });

  it('treats non-integer injectionLimit as default 8', async () => {
    // Write heuristics
    // Call retrieveHeuristics with injectionLimit: 'abc'
    // Verify: uses default 8 budget
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/heuristics.test.mjs`
Expected: FAIL — `retrieveHeuristics is not a function`

- [ ] **Implement**

Add to `lib/heuristics.mjs`:

```javascript
/**
 * @typedef {Object} RetrieveOptions
 * @property {number} [injectionLimit] - Total budget (default 8). 0 disables injection.
 */

/**
 * Retrieve heuristics for injection into a context packet.
 *
 * Implements the dual-read protocol: reads module-scoped and _global heuristics,
 * merges, deduplicates by id (module-scoped wins), sorts by confidence then
 * scope-priority then recency, and applies the budget cap.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} module - Module slug to retrieve heuristics for
 * @param {RetrieveOptions} [options]
 * @returns {Promise<Heuristic[]>} Budget-capped array of heuristics
 */
export async function retrieveHeuristics(projectRoot, module, { injectionLimit } = {}) {
  // Parse and validate injectionLimit
  let limit = 8;
  if (injectionLimit !== undefined) {
    const parsed = Number(injectionLimit);
    if (Number.isInteger(parsed) && parsed >= 0) {
      limit = parsed;
    }
    // else: use default 8 (non-integer or negative)
  }
  if (limit === 0) return [];

  // Dual-read: module + _global
  let moduleEntries, globalEntries;
  try {
    moduleEntries = module && module !== '_global'
      ? await readHeuristics(projectRoot, { module })
      : [];
  } catch { moduleEntries = []; }

  try {
    globalEntries = await readHeuristics(projectRoot, { module: '_global' });
  } catch { globalEntries = []; }

  // Tag entries with scope priority for sorting
  const tagged = [
    ...moduleEntries.map(e => ({ ...e, _scopePriority: 0 })),
    ...globalEntries.map(e => ({ ...e, _scopePriority: 1 })),
  ];

  // Dedup by id (module-scoped wins via order)
  const seen = new Set();
  const deduped = [];
  for (const entry of tagged) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      deduped.push(entry);
    }
  }

  // Sort: confidence DESC, scope priority ASC, updated DESC
  deduped.sort((a, b) => {
    const rankDiff = (CONFIDENCE_RANK[b.confidence] ?? 0) - (CONFIDENCE_RANK[a.confidence] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    if (a._scopePriority !== b._scopePriority) return a._scopePriority - b._scopePriority;
    const au = a.updated || '';
    const bu = b.updated || '';
    if (bu < au) return -1;
    if (bu > au) return 1;
    return 0;
  });

  // Budget cap: exclude low, split high/medium
  const highMax = Math.ceil(limit * 5 / 8);
  const mediumMax = limit - highMax;
  let highCount = 0, mediumCount = 0;
  const result = [];

  for (const entry of deduped) {
    if (entry.confidence === 'low') continue;
    if (entry.confidence === 'high' && highCount < highMax) {
      highCount++;
      result.push(entry);
    } else if (entry.confidence === 'medium' && mediumCount < mediumMax) {
      mediumCount++;
      result.push(entry);
    }
  }

  // Strip internal _scopePriority tag
  return result.map(({ _scopePriority, ...rest }) => rest);
}
```

- [ ] **Verify tests pass**

Run: `node --test tests/lib/heuristics.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics.test.mjs
git commit -m "feat(heuristics): add retrieveHeuristics with dual-read, merge, budget cap"
```

---

### Task 2: `renderHeuristic` function [specialist: none]

**Charter capability:** Retrieval Filtering
**Files:**
- Modify: `lib/heuristics.mjs` — Add `renderHeuristic` export
- Test: `tests/lib/heuristics.test.mjs` — Add rendering test suite

**Tests:** `tests/lib/heuristics.test.mjs`
**Depends on:** Task 1

- [ ] **Write failing tests**

```javascript
describe('renderHeuristic', () => {
  it('renders a heuristic with pattern and antiPattern', () => {
    const h = {
      id: 'test-001', title: 'Test Title', confidence: 'high',
      pattern: 'Do this', antiPattern: 'Avoid that',
      evidence: [{ path: 'a.md', date: '2026-01-01' }, { path: 'b.md', date: '2026-01-02' }],
    };
    const result = renderHeuristic(h);
    assert.ok(result.includes('### Heuristic: Test Title (confidence: high)'));
    assert.ok(result.includes('**Pattern:** Do this'));
    assert.ok(result.includes('**Anti-pattern:** Avoid that'));
    assert.ok(result.includes('**Evidence:** 2 observations'));
  });

  it('omits anti-pattern line when antiPattern is absent', () => {
    const h = {
      id: 'test-002', title: 'No Anti', confidence: 'medium',
      pattern: 'Do this', evidence: [{ path: 'a.md', date: '2026-01-01' }],
    };
    const result = renderHeuristic(h);
    assert.ok(!result.includes('Anti-pattern'));
  });

  it('renders evidence count of 0 for missing evidence array', () => {
    const h = {
      id: 'test-003', title: 'No Evidence', confidence: 'low',
      pattern: 'Something',
    };
    const result = renderHeuristic(h);
    assert.ok(result.includes('**Evidence:** 0 observations'));
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/heuristics.test.mjs`
Expected: FAIL — `renderHeuristic is not a function`

- [ ] **Implement**

Add to `lib/heuristics.mjs`:

```javascript
/**
 * Render a heuristic as a markdown block for injection into a context packet.
 *
 * @param {Heuristic} heuristic
 * @returns {string} Markdown block
 */
export function renderHeuristic(heuristic) {
  const lines = [
    `### Heuristic: ${heuristic.title} (confidence: ${heuristic.confidence})`,
    `- **Pattern:** ${heuristic.pattern}`,
  ];
  if (heuristic.antiPattern) {
    lines.push(`- **Anti-pattern:** ${heuristic.antiPattern}`);
  }
  const count = Array.isArray(heuristic.evidence) ? heuristic.evidence.length : 0;
  lines.push(`- **Evidence:** ${count} observations`);
  return lines.join('\n');
}
```

- [ ] **Verify tests pass**

Run: `node --test tests/lib/heuristics.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/heuristics.mjs tests/lib/heuristics.test.mjs
git commit -m "feat(heuristics): add renderHeuristic for context packet formatting"
```

---

### Task 3: Integration tests and edge cases [specialist: none]

**Charter capability:** Retrieval Filtering
**Files:**
- Test: `tests/lib/heuristics.test.mjs` — Add integration edge case tests

**Tests:** `tests/lib/heuristics.test.mjs`
**Depends on:** Task 1, Task 2

- [ ] **Write failing tests**

```javascript
describe('retrieveHeuristics integration', () => {
  it('end-to-end: write module + global heuristics, retrieve with budget', async () => {
    // Write 3 high to hooks, 2 high to _global, 4 medium to hooks, 2 medium to _global
    // retrieveHeuristics(root, 'hooks', {})
    // Verify: 5 high (3 hooks + 2 global), 3 medium (hooks first)
  });

  it('dedup: same id in module and _global, module version wins', async () => {
    // Write heuristic with id 'dup-001' to both hooks and _global with different patterns
    // Verify: only module version appears, pattern matches module version
  });

  it('negative injectionLimit treated as default', async () => {
    // retrieveHeuristics(root, 'hooks', { injectionLimit: -5 })
    // Verify: uses default 8
  });

  it('renderHeuristic output is valid markdown (no unclosed tags)', () => {
    // Render a heuristic, verify no conflict markers or unclosed markdown
  });
});
```

- [ ] **Verify tests fail**

Run: `node --test tests/lib/heuristics.test.mjs`
Expected: FAIL — test assertions fail on expected data

- [ ] **Implement**

Fill in the test bodies using `createTempDir()`, `writeHeuristic`, and `retrieveHeuristics`. No production code changes needed — this task validates the Task 1-2 implementation with realistic scenarios.

- [ ] **Verify tests pass**

Run: `node --test tests/lib/heuristics.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/lib/heuristics.test.mjs
git commit -m "test(heuristics): add retrieval filtering integration and edge case tests"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
