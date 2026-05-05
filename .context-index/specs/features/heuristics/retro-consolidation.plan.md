# Implementation Plan: Retro Consolidation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Spec:** .context-index/specs/features/heuristics/retro-consolidation.spec.md
> **Review:** PASS_WITH_NOTES (2026-04-12)
> **Platform:** Node.js, JavaScript (ESM), node:test

**Goal:** Add heuristic consolidation to `/adev:retro` — gather heuristic data, analyze health, generate recommendations, auto-apply stale archival, and include metrics in the retro report.

**Architecture:** Five insertions into existing retro SKILL.md steps: Step 1 gains heuristic data gathering (1.7), Step 2 gains health analysis (2.8), Step 3 gains consolidation recommendations (3.7), Step 4 gains stale auto-archival, and Step 5 gains a `### Heuristic Health` report subsection. Uses `readHeuristics` API per manifest modules (not raw directory scan). All changes are SKILL.md markdown edits.

---

## File Structure

**Modify:**
- `skills/retro/SKILL.md` — Add heuristic consolidation across Steps 1-5

**Create:**
- `tests/skills/retro-consolidation.test.mjs` — Eval tests

**Reference:**
- `lib/heuristics.mjs` — `readHeuristics`, `archiveHeuristic`
- `.context-index/manifest.yaml` — `modules[].slug`, `heuristics.staleness_days`

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/heuristics/retro-consolidation.spec.md` (Behaviors 1-2)
- Current SKILL.md: `skills/retro/SKILL.md` (Step 1, lines 22-81)

### Task 2 Context
- Spec: `.context-index/specs/features/heuristics/retro-consolidation.spec.md` (Behaviors 3-7)
- Current SKILL.md: `skills/retro/SKILL.md` (Steps 2-3, lines 83-179)

### Task 3 Context
- Spec: `.context-index/specs/features/heuristics/retro-consolidation.spec.md` (Behaviors 8-11)
- Current SKILL.md: `skills/retro/SKILL.md` (Steps 4-5, lines 181-296)

### Task 4 Context
- Spec: `.context-index/specs/features/heuristics/retro-consolidation.spec.md` (all AC)

## Parallelization

All sequential: Task 1 → Task 2 → Task 3 → Task 4 (all modify same file).

---

### Task 1: Add heuristic data gathering to Step 1 [specialist: none]

**Charter capability:** Retro Consolidation
**Files:**
- Modify: `skills/retro/SKILL.md` — Add section 1.7 after 1.6
- Test: `tests/skills/retro-consolidation.test.mjs`

**Tests:** `tests/skills/retro-consolidation.test.mjs`

- [ ] **Write failing test**

```javascript
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('retro SKILL.md heuristic consolidation', () => {
  it('Step 1 includes heuristic data gathering (1.7)', async () => {
    const content = await readFile('skills/retro/SKILL.md', 'utf8');
    assert.ok(content.includes('1.7') || content.includes('Heuristic'), 
      'Step 1 must include heuristic gathering section');
    assert.ok(content.includes('readHeuristics'), 'Must use readHeuristics API');
    assert.ok(content.includes('modules'), 'Must iterate over manifest modules');
  });
});
```

- [ ] **Verify test fails** → **Implement** → **Verify test passes**

Add section `### 1.7 Heuristics` after `### 1.6 Plan Files` in `skills/retro/SKILL.md`:

```markdown
### 1.7 Heuristics

Read heuristics by iterating over module slugs from `manifest.yaml` `modules[].slug` plus `_global`. For each module, call `readHeuristics(projectRoot, { module: slug })` via inline Node.js. Record each entry's `id`, `scope`, `confidence`, `evidence[]` count, `contradicted-by[]` count, `created`, and `updated` dates.

Also scan `.context-index/memory/heuristics/archive/` for recently archived entries (where `archived` date falls within the analysis range).

If the heuristics directory does not exist or `readHeuristics` throws, note "No heuristics found" and proceed. The consolidation steps (2.8 and 3.7) are skipped when no heuristics are gathered.
```

- [ ] **Commit**

```bash
git add skills/retro/SKILL.md tests/skills/retro-consolidation.test.mjs
git commit -m "feat(heuristics): add heuristic data gathering to retro Step 1"
```

---

### Task 2: Add health analysis and recommendations [specialist: none]

**Charter capability:** Retro Consolidation
**Files:**
- Modify: `skills/retro/SKILL.md` — Add sections 2.8 and 3.7
- Test: `tests/skills/retro-consolidation.test.mjs`

**Tests:** `tests/skills/retro-consolidation.test.mjs`
**Depends on:** Task 1

- [ ] **Write failing test**

```javascript
it('Step 2 includes heuristic health analysis (2.8)', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  assert.ok(content.includes('staleness') || content.includes('stale'), 'Must analyze staleness');
  assert.ok(content.includes('duplicate'), 'Must detect duplicates');
  assert.ok(content.includes('contradicted'), 'Must report contradicted entries');
  assert.ok(content.includes('staleness_days'), 'Must reference configurable staleness threshold');
});

it('Step 3 includes consolidation recommendations (3.7)', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  assert.ok(content.includes('Archive stale') || content.includes('archive stale'),
    'Must recommend archiving stale heuristics');
  assert.ok(content.includes('Merge duplicate') || content.includes('merge duplicate'),
    'Must recommend merging duplicates');
});
```

- [ ] **Verify test fails** → **Implement** → **Verify test passes**

Add `### Heuristic Health` subsection after the last existing analysis in Step 2, and `### Heuristic Consolidation` subsection after the last recommendation type in Step 3.

- [ ] **Commit**

```bash
git add skills/retro/SKILL.md tests/skills/retro-consolidation.test.mjs
git commit -m "feat(heuristics): add health analysis and consolidation recommendations to retro"
```

---

### Task 3: Add auto-apply and report sections [specialist: none]

**Charter capability:** Retro Consolidation
**Files:**
- Modify: `skills/retro/SKILL.md` — Add stale archival to Step 4, metrics to Step 5
- Test: `tests/skills/retro-consolidation.test.mjs`

**Tests:** `tests/skills/retro-consolidation.test.mjs`
**Depends on:** Task 2

- [ ] **Write failing test**

```javascript
it('Step 4 includes stale heuristic archival for --auto-apply', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  assert.ok(content.includes('archiveHeuristic'), 'Must call archiveHeuristic for stale entries');
  assert.ok(content.includes("'stale'") || content.includes('"stale"'),
    'Must use reason "stale"');
});

it('Step 4 does NOT auto-merge or auto-promote', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  assert.ok(content.includes('NOT auto-merge') || content.includes('not auto-merge') ||
    content.includes('does NOT'),
    'Must explicitly state no auto-merge/promote');
});

it('Step 5 report includes Heuristic Health subsection', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  assert.ok(content.includes('### Heuristic Health') || content.includes('Heuristic Health'),
    'Report must include Heuristic Health subsection');
});
```

- [ ] **Verify test fails** → **Implement** → **Verify test passes**

Add to Step 4 in `skills/retro/SKILL.md`:

```markdown
5. **Archive stale heuristics.** For each heuristic whose `updated` date is older than `heuristics.staleness_days` from manifest (default 90 days), call `archiveHeuristic(projectRoot, id, 'stale')` via inline Node.js. Log progress: "Archived N/M stale heuristics". If `archiveHeuristic` throws (e.g., `HEURISTICS_ARCHIVE_CONFLICT`), log a warning per entry and continue.

   **Actions NOT auto-applied:** Duplicate merging, promotion, and contradiction resolution require human judgment. These remain as recommendations only.
```

Add to Step 5 report template:

```markdown
### Heuristic Health

- **Total heuristics:** N (by scope: hooks: N, cli: N, _global: N)
- **Confidence distribution:** high: N, medium: N, low: N
- **New in period:** N
- **Stale (>90d):** N (archived: N if --auto-apply)
- **Contradicted:** N
- **Duplicate candidates:** N
- **Promotion anomalies:** N
```

- [ ] **Commit**

```bash
git add skills/retro/SKILL.md tests/skills/retro-consolidation.test.mjs
git commit -m "feat(heuristics): add stale archival and health metrics to retro"
```

---

### Task 4: Integration eval tests [specialist: none]

**Charter capability:** Retro Consolidation
**Files:**
- Test: `tests/skills/retro-consolidation.test.mjs`

**Tests:** `tests/skills/retro-consolidation.test.mjs`
**Depends on:** Task 1, Task 2, Task 3

- [ ] **Write tests**

```javascript
it('all five retro steps reference heuristics', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  // Verify heuristic-related content exists in each major step
  const step1 = content.indexOf('## Step 1');
  const step2 = content.indexOf('## Step 2');
  const step3 = content.indexOf('## Step 3');
  const step4 = content.indexOf('## Step 4');
  const step5 = content.indexOf('## Step 5');
  
  assert.ok(content.slice(step1, step2).includes('euristic'), 'Step 1 must reference heuristics');
  assert.ok(content.slice(step2, step3).includes('euristic'), 'Step 2 must reference heuristics');
  assert.ok(content.slice(step3, step4).includes('euristic'), 'Step 3 must reference heuristics');
  assert.ok(content.slice(step4, step5).includes('euristic'), 'Step 4 must reference heuristics');
  assert.ok(content.slice(step5).includes('euristic'), 'Step 5 must reference heuristics');
});

it('uses readHeuristics API, not raw directory scan', async () => {
  const content = await readFile('skills/retro/SKILL.md', 'utf8');
  const heuristicsSection = content.slice(content.indexOf('1.7'));
  assert.ok(heuristicsSection.includes('readHeuristics'), 'Must use readHeuristics API');
  assert.ok(!heuristicsSection.includes('readdir'), 'Must NOT use raw readdir for heuristics');
});
```

- [ ] **Verify tests pass** → **Commit**

```bash
git add tests/skills/retro-consolidation.test.mjs
git commit -m "test(heuristics): add retro consolidation eval tests"
```

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
