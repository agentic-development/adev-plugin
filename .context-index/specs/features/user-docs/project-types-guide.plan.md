<!-- DO NOT EDIT statuses inline — see lifecycle log project-types-guide.jsonl -->
# Implementation Plan: Project Types Guide

> **Methodology:** adev
> **Charter:** .context-index/specs/features/user-docs/charter.md
> **Spec:** .context-index/specs/features/user-docs/project-types-guide.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm

**Goal:** Create a project types guide with worked examples showing how adev adapts to different project architectures, using the four eval fixture submodules (API service, data pipeline, migrations tool, CI/CD pipeline) as real-world demonstrations.

**Architecture:** Pure markdown documentation in `docs/`. No build step, no site generator. Content is sourced from eval fixture submodules at `tests/evals/adev-*-eval/`. Each example walks through the full adev lifecycle for that project type — from init detection through charter, spec, and implementation artifacts — using real fixture data.

**Review notes to address during implementation:**
- SA-1: Fixture validation should be a task — Task 1 inventories fixtures and validates health before writing examples
- SEC-2: Audit fixtures for secrets before documenting paths — checked in Task 1

---

## File Structure

**Create:**
- `docs/project-types.md` — Project types guide with worked examples
- `tests/docs/project-types-guide.test.mjs` — Tests for the project types guide

**Modify:**
- `docs/README.md` — Update "Project Types (coming soon)" to a live link

**Reference (read, do not modify):**
- `tests/evals/adev-api-eval/` — API service eval fixture
- `tests/evals/adev-data-eval/` — Data pipeline eval fixture
- `tests/evals/adev-migrations-eval/` — Migrations tool eval fixture
- `tests/evals/adev-pipeline-eval/` — CI/CD pipeline eval fixture
- `.context-index/constitution.md` — Principles referenced in examples
- `docs/README.md` — TOC to update with project-types link

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/user-docs/project-types-guide.spec.md` (preconditions, error cases)
- Review: SA-1 (fixture validation), SEC-2 (secrets audit)
- Source: `tests/evals/adev-*-eval/` (submodule directories)
- Source: `.gitmodules` (submodule URLs and paths)

### Task 2 Context
- Spec: `.context-index/specs/features/user-docs/project-types-guide.spec.md` (criteria 1-5)
- Charter: `.context-index/specs/features/user-docs/charter.md` (capability: Project Types Guide)
- Source: Task 1 fixture inventory output
- Source: `tests/evals/adev-api-eval/.context-index/` (constitution, manifest, specs for API example)
- Source: `tests/evals/adev-data-eval/.context-index/` (constitution, manifest, specs for data example)
- Source: `tests/evals/adev-pipeline-eval/.context-index/` (constitution, manifest, specs for pipeline example)

### Task 3 Context
- Spec: `.context-index/specs/features/user-docs/project-types-guide.spec.md` (behavior 4)
- Source: `docs/project-types.md` (from Task 2 — add extrapolation section)

### Task 4 Context
- Spec: `.context-index/specs/features/user-docs/project-types-guide.spec.md` (postcondition 3)
- Source: `docs/README.md` (update coming soon to live link)

### Task 5 Context
- Spec: `.context-index/specs/features/user-docs/project-types-guide.spec.md` (all acceptance criteria)
- Source: all files created/modified in Tasks 1-4

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (inventory feeds examples, examples feed extrapolation)
- Group B (after Task 2): Task 4 (TOC update needs project-types.md to exist)
- Group C (after all): Task 5 (verification depends on all content existing)

Task 4 can run in parallel with Task 3.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Inventory eval fixtures and validate health | small | unit | — | 0 (research only) |
| 2 | Write docs/project-types.md with 3+ worked examples | large | unit | Task 1 | 1 create |
| 3 | Add extrapolation guidance section | small | unit | Task 2 | 1 modify |
| 4 | Link project-types.md from docs/README.md | small | unit | Task 2 | 1 modify |
| 5 | Verify links, fixture references, and acceptance criteria | small | unit | Task 2, 3, 4 | 0 (verification only) |

---

### Task 1: Inventory eval fixtures and validate health [specialist: none]

**Charter capability:** Project Types Guide (precondition validation)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Read: `tests/evals/adev-*-eval/` directories
- Read: `.gitmodules`
- Test: `tests/docs/project-types-guide.test.mjs`

**Tests:** `tests/docs/project-types-guide.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');
const EVALS_DIR = join(import.meta.dirname, '..', '..', 'tests', 'evals');

describe('Eval fixture availability', () => {
  it('should have at least 3 eval fixture directories', () => {
    const fixtures = ['adev-api-eval', 'adev-data-eval', 'adev-migrations-eval', 'adev-pipeline-eval'];
    const existing = fixtures.filter(f => existsSync(join(EVALS_DIR, f)));
    assert.ok(existing.length >= 3, `Need at least 3 fixtures, found ${existing.length}: ${existing.join(', ')}`);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: PASS or FAIL depending on submodule init status — this test validates preconditions.

- [x] **Implement**

1. Initialize eval submodules if not already initialized: `git submodule update --init tests/evals/`
2. For each fixture, inspect:
   - Does `.context-index/constitution.md` exist? What project type does it describe?
   - Does `.context-index/manifest.yaml` exist? What platform/language does it declare?
   - Are there charters, specs, plans visible?
   - Scan for secrets: no `.env` files with real values, no API keys, no credentials
3. Document findings as comments in the test file for Task 2 reference
4. If a fixture is incomplete (INCOMPLETE_FIXTURE error case), note gaps — document only what exists
5. Select at least 3 fixtures to use as worked examples, preferring diversity of project types

- [x] **Verify test passes**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add tests/docs/project-types-guide.test.mjs
git commit -m "feat(user-docs): add fixture inventory test for project types guide

Spec: .context-index/specs/features/user-docs/project-types-guide.spec.md
Plan-task: 1"
```

---

### Task 2: Write docs/project-types.md with 3+ worked examples [specialist: none]

**Charter capability:** Project Types Guide
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `docs/project-types.md`
- Modify: `tests/docs/project-types-guide.test.mjs`

**Tests:** `tests/docs/project-types-guide.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/project-types-guide.test.mjs`:

```javascript
describe('docs/project-types.md — Project Types Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'project-types.md')));
  });

  it('should contain at least 3 project type examples', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    // Each example should have a heading with the project type
    const exampleHeadings = content.match(/^## .+/gm) || [];
    // Filter out non-example headings (intro, extrapolation, etc.)
    const projectExamples = exampleHeadings.filter(h =>
      !h.includes('Introduction') &&
      !h.includes('Extrapolat') &&
      !h.includes('Pattern') &&
      !h.includes('What You')
    );
    assert.ok(projectExamples.length >= 3, `Need at least 3 project type examples, found ${projectExamples.length}`);
  });

  it('should reference eval fixture paths for each example', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('tests/evals/'), 'Should reference eval fixture paths');
    // At least 3 distinct fixture references
    const fixtureRefs = content.match(/tests\/evals\/adev-\w+-eval/g) || [];
    const uniqueFixtures = new Set(fixtureRefs);
    assert.ok(uniqueFixtures.size >= 3, `Need at least 3 distinct fixture references, found ${uniqueFixtures.size}`);
  });

  it('should show charter artifacts for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('charter') || content.includes('Charter'), 'Should show charter examples');
  });

  it('should show spec artifacts for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('spec') || content.includes('Spec'), 'Should show spec examples');
  });

  it('should show how adev:init detects project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(
      content.includes('adev:init') || content.includes('/adev:init'),
      'Should explain how init detects project type'
    );
  });

  it('should show constitution examples for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('constitution') || content.includes('Constitution'), 'Should show constitution examples');
  });

  it('should show manifest examples for each project type', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(content.includes('manifest') || content.includes('Manifest'), 'Should show manifest examples');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: FAIL — docs/project-types.md does not exist yet

- [x] **Implement**

Create `docs/project-types.md` with the following structure. Source all examples from real eval fixture content — read each fixture's `.context-index/` directory to extract actual constitution, manifest, charter, spec, and plan artifacts.

**Structure:**
- **Title:** "Project Types Guide"
- **Introduction:** Brief explanation that adev adapts to any project type. `/adev:init` detects the tech stack and generates appropriate scaffolding. This guide shows worked examples using real projects.

- **Example 1: API Service** (from `tests/evals/adev-api-eval/`)
  - Project description (what it is, tech stack)
  - How `/adev:init` detected the project type
  - What the constitution looks like for an API project
  - What the manifest looks like (platform, language, quality gates)
  - A concrete charter example from the fixture
  - A concrete spec example showing behavioral contracts for API endpoints
  - How skills adapted (e.g., test strategies, validation checks)
  - Fixture path for reader exploration: `tests/evals/adev-api-eval/`

- **Example 2: Data Pipeline** (from `tests/evals/adev-data-eval/`)
  - Same structure as Example 1, adapted for data pipeline concerns
  - Fixture path: `tests/evals/adev-data-eval/`

- **Example 3: CI/CD Pipeline** (from `tests/evals/adev-pipeline-eval/`)
  - Same structure as Example 1, adapted for CI/CD concerns
  - Fixture path: `tests/evals/adev-pipeline-eval/`

If any fixture is incomplete (INCOMPLETE_FIXTURE), document only what exists and note gaps. If a fixture has no initialized submodule content, describe the project type based on its name and `.gitmodules` URL, noting that readers need to `git submodule update --init` to explore it.

**Important:** Use real content from the fixtures, not hypothetical code. If fixtures are not initialized, initialize them first. If initialization fails (local-only URLs), document what is known from the submodule configuration and note the limitation.

- [x] **Verify test passes**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/project-types.md tests/docs/project-types-guide.test.mjs
git commit -m "feat(user-docs): add docs/project-types.md with 3 worked examples

Spec: .context-index/specs/features/user-docs/project-types-guide.spec.md
Plan-task: 2"
```

---

### Task 3: Add extrapolation guidance section [specialist: none]

**Charter capability:** Project Types Guide (extrapolation)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `docs/project-types.md`
- Modify: `tests/docs/project-types-guide.test.mjs`

**Tests:** `tests/docs/project-types-guide.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/project-types-guide.test.mjs`:

```javascript
describe('docs/project-types.md — Extrapolation guidance', () => {
  it('should have a section helping readers apply patterns to unlisted project types', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(
      content.includes('other project') ||
      content.includes('your project') ||
      content.includes('Extrapolat') ||
      content.includes('Applying') ||
      content.includes('Your Own'),
      'Should have extrapolation guidance for unlisted project types'
    );
  });

  it('should mention common patterns that transfer across project types', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    assert.ok(
      content.includes('pattern') || content.includes('Pattern'),
      'Should describe transferable patterns'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: FAIL — extrapolation section does not exist yet

- [x] **Implement**

Add a section at the end of `docs/project-types.md` titled "Applying adev to Your Own Project Type" (or similar). Include:

1. **Common patterns across all project types:**
   - Constitution always captures project identity and principles regardless of tech stack
   - Manifest always declares platform, language, and quality gates
   - Specs always use behavioral contracts (When/Then), adapted to the domain
   - Plans always decompose into TDD tasks with context packets

2. **How to adapt for unlisted types:**
   - Frontend/SPA: quality gates include browser tests, specs focus on user interactions
   - Mobile apps: platform-context includes target OS, specs cover device-specific behavior
   - Libraries/SDKs: specs focus on API surface, quality gates include backward compatibility
   - Monorepos: workspace configuration, cross-module specs
   - ML/AI projects: specs cover model behavior, quality gates include evaluation metrics

3. **Key principle:** adev is project-type agnostic — the framework adapts to whatever quality gates and conventions your project needs.

- [x] **Verify test passes**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/project-types.md tests/docs/project-types-guide.test.mjs
git commit -m "feat(user-docs): add extrapolation guidance to project types guide

Spec: .context-index/specs/features/user-docs/project-types-guide.spec.md
Plan-task: 3"
```

---

### Task 4: Link project-types.md from docs/README.md [specialist: none]

**Charter capability:** Project Types Guide (navigation)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `docs/README.md`
- Modify: `tests/docs/project-types-guide.test.mjs`

**Tests:** `tests/docs/project-types-guide.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/project-types-guide.test.mjs`:

```javascript
describe('docs/README.md — Project Types link', () => {
  it('should link to project-types.md (not coming soon)', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('project-types.md'), 'README.md should link to project-types.md');
    // Verify it is a real link, not just text
    assert.ok(
      content.includes('[') && content.includes('](project-types.md'),
      'Should be a markdown link to project-types.md'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: FAIL — README.md currently says "Project Types (coming soon)" without a link

- [x] **Implement**

Edit `docs/README.md` to replace the "Project Types (coming soon)" line in the Advanced section with a live link:
```markdown
- [Project Types](project-types.md) — Worked examples for different project architectures
```

- [x] **Verify test passes**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/README.md tests/docs/project-types-guide.test.mjs
git commit -m "feat(user-docs): link project-types.md from docs/README.md TOC

Spec: .context-index/specs/features/user-docs/project-types-guide.spec.md
Plan-task: 4"
```

---

### Task 5: Verify links, fixture references, and acceptance criteria [specialist: none]

**Charter capability:** Project Types Guide (quality verification)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 3, Task 4
**Files:**
- Modify: `tests/docs/project-types-guide.test.mjs`

**Tests:** `tests/docs/project-types-guide.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/project-types-guide.test.mjs`:

```javascript
describe('docs/project-types.md — Link integrity', () => {
  it('should have all relative links resolve to existing files', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      const target = match[2];
      if (target.startsWith('http') || target.startsWith('#')) continue;
      const filePart = target.split('#')[0];
      if (filePart) {
        const targetPath = join(DOCS_DIR, filePart);
        assert.ok(
          existsSync(targetPath),
          `Broken link to ${target} (expected file at ${targetPath})`
        );
      }
    }
  });

  it('should reference only existing fixture directories', () => {
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    const ROOT = join(import.meta.dirname, '..', '..');
    const fixtureRefs = content.match(/tests\/evals\/adev-[\w-]+-eval/g) || [];
    for (const ref of fixtureRefs) {
      assert.ok(
        existsSync(join(ROOT, ref)),
        `Fixture reference ${ref} does not exist (STALE_FIXTURE)`
      );
    }
  });
});

describe('Acceptance criteria checklist', () => {
  it('project-types.md exists with at least 3 examples', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'project-types.md')));
    const content = readFileSync(join(DOCS_DIR, 'project-types.md'), 'utf-8');
    const fixtureRefs = content.match(/tests\/evals\/adev-\w+-eval/g) || [];
    const uniqueFixtures = new Set(fixtureRefs);
    assert.ok(uniqueFixtures.size >= 3);
  });

  it('guide is reachable from docs/README.md', () => {
    const readme = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(readme.includes('project-types.md'));
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: Tests may pass if all previous tasks completed correctly, or fail if any links are broken.

- [x] **Implement**

1. Run the full test suite to identify any failures
2. Fix any broken links in `docs/project-types.md`
3. Fix any stale fixture references (STALE_FIXTURE error case)
4. Verify all acceptance criteria from the spec are met

- [x] **Verify test passes**

Run: `node --test tests/docs/project-types-guide.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add tests/docs/project-types-guide.test.mjs
git commit -m "feat(user-docs): add verification tests for project types guide

Spec: .context-index/specs/features/user-docs/project-types-guide.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from spec satisfied:
  - [x] `docs/project-types.md` exists with at least 3 project type examples
  - [x] Each example uses a real eval fixture project, not hypothetical code
  - [x] Each example shows charter, spec, and implementation artifacts for that project type
  - [x] Fixture paths are documented so readers can explore the source
  - [x] All fixture references point to existing projects
  - [x] The guide is reachable from docs/README.md
  - [x] No constitutional violations introduced
