import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { loadSpecContext, findSpecsByStatus, getPlanProgress } from '../../lib/meta-tools.mjs';

const TEMP_ROOT = join(import.meta.dirname, '..', '..', '.test-meta-tools-temp');

function setup() {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
  mkdirSync(join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards'), { recursive: true });
  mkdirSync(join(TEMP_ROOT, '.context-index', 'specs', 'cross-cutting'), { recursive: true });

  // Constitution
  writeFileSync(join(TEMP_ROOT, '.context-index', 'constitution.md'), `# Constitution

## Identity

Test project.

## Non-Negotiable Principles

1. **Zero dependencies** — use built-ins only.
2. **Pure ESM** — no CommonJS.
`);

  // Charter
  writeFileSync(join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'charter.md'), `# Feature Charter: Task Boards

## Business Intent

Task management with boards.

## Capability Map

| Capability | Description | Priority | Status |
|-----------|-------------|----------|--------|
| Drag-drop | Reorder cards | must | specified |
| Filters | Filter by label | should | — |
`);

  // Spec with charter reference
  writeFileSync(join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.spec.md'), `---
charter: task-boards
status: review-pending
milestone: v1
revision: 1
created: 2026-05-01
updated: 2026-05-01
---

# Live Spec: Drag and Drop

## Behavioral Contract

When a user drags a card then it moves.
`);

  // Spec with different status
  writeFileSync(join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'filters.spec.md'), `---
charter: task-boards
status: draft
milestone: v2
revision: 1
created: 2026-05-02
updated: 2026-05-02
---

# Live Spec: Card Filters

## Behavioral Contract

When a user filters then cards are filtered.
`);

  // Cross-cutting spec
  writeFileSync(join(TEMP_ROOT, '.context-index', 'specs', 'cross-cutting', 'auth.spec.md'), `---
mode: cross-cutting
status: review-pending
revision: 1
created: 2026-05-01
updated: 2026-05-01
affects:
  - task-boards
---

# Cross-Cutting Spec: Authentication

## Behavioral Contract

When a request has no token then reject.
`);

  // Plan file
  writeFileSync(join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.plan.md'), `# Plan: Drag and Drop

## Review Gate

- [x] Spec reviewed

### Task 1: Setup drag listeners

- [x] Create drag handler
- [x] Add event listeners
- [ ] Test drag start event

### Task 2: Implement drop zones

- [ ] Create drop zone component
- [ ] Handle drop event
- [ ] Update card positions

### Task 3: Integration tests

- [ ] Test drag between columns
- [x] Test drag within column
`);
}

function teardown() {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
}

describe('meta-tools', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  describe('loadSpecContext', () => {
    it('returns spec + charter capability map + constitution principles (Behavior 1)', async () => {
      const specPath = join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.spec.md');
      const result = await loadSpecContext(specPath);

      assert.ok(result.includes('## Spec'));
      assert.ok(result.includes('Live Spec: Drag and Drop'));
      assert.ok(result.includes('## Charter Capability Map'));
      assert.ok(result.includes('Drag-drop'));
      assert.ok(result.includes('## Constitution Principles'));
      assert.ok(result.includes('Zero dependencies'));
    });

    it('resolves charter from spec frontmatter (Behavior 2)', async () => {
      const specPath = join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.spec.md');
      const result = await loadSpecContext(specPath);

      assert.ok(result.includes('Charter Capability Map'));
      assert.ok(result.includes('| Drag-drop'));
    });

    it('skips charter for cross-cutting specs (Behavior 2)', async () => {
      const specPath = join(TEMP_ROOT, '.context-index', 'specs', 'cross-cutting', 'auth.spec.md');
      const result = await loadSpecContext(specPath);

      assert.ok(result.includes('## Spec'));
      assert.ok(result.includes('Authentication'));
      assert.ok(result.includes('## Constitution Principles'));
      assert.ok(!result.includes('Charter Capability Map'));
    });

    it('throws on missing spec file (Error Case 1)', async () => {
      await assert.rejects(
        () => loadSpecContext(join(TEMP_ROOT, 'nonexistent.md')),
        /Spec not found/
      );
    });

    it('handles missing charter gracefully (Error Case 2)', async () => {
      // Create spec with non-existent charter reference
      const specPath = join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'orphan.spec.md');
      writeFileSync(specPath, `---
charter: nonexistent-module
status: draft
---

# Live Spec: Orphan
`);
      const result = await loadSpecContext(specPath);
      assert.ok(result.includes('Orphan'));
      assert.ok(result.includes('Constitution Principles'));
      // Should not throw — graceful degradation
    });

    it('uses --- delimiters between sections (Behavior 1)', async () => {
      const specPath = join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.spec.md');
      const result = await loadSpecContext(specPath);

      const delimiters = result.split('\n---\n').length - 1;
      assert.ok(delimiters >= 2, `Expected at least 2 delimiters, got ${delimiters}`);
    });
  });

  describe('findSpecsByStatus', () => {
    it('finds specs matching status in a module (Behavior 3)', async () => {
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus('task-boards', 'review-pending');
        assert.equal(results.length, 1);
        assert.ok(results[0].path.includes('drag-drop.spec.md'));
        assert.equal(results[0].status, 'review-pending');
        assert.equal(results[0].milestone, 'v1');
      } finally {
        process.chdir(origCwd);
      }
    });

    it('scans all modules when module is "*" (Behavior 4)', async () => {
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus('*', 'review-pending');
        assert.equal(results.length, 2); // drag-drop + auth cross-cutting
        const paths = results.map(r => r.path);
        assert.ok(paths.some(p => p.includes('drag-drop.spec.md')));
        assert.ok(paths.some(p => p.includes('auth.spec.md')));
      } finally {
        process.chdir(origCwd);
      }
    });

    it('scans all modules when module is null (Behavior 4)', async () => {
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus(null, 'draft');
        assert.equal(results.length, 1);
        assert.ok(results[0].path.includes('filters.spec.md'));
      } finally {
        process.chdir(origCwd);
      }
    });

    it('returns empty array for nonexistent module (Error Case 4)', async () => {
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus('nonexistent', 'draft');
        assert.deepEqual(results, []);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('skips files with malformed frontmatter (Error Case 5)', async () => {
      writeFileSync(
        join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'malformed.spec.md'),
        'this has no frontmatter at all\n# Just a heading'
      );
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus('task-boards', 'review-pending');
        assert.equal(results.length, 1); // only drag-drop
      } finally {
        process.chdir(origCwd);
      }
    });

    it('excludes charter.md and plan/review files (Behavior 3)', async () => {
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus('task-boards', 'review-pending');
        const paths = results.map(r => r.path);
        assert.ok(!paths.some(p => p.includes('charter.md')));
        assert.ok(!paths.some(p => p.includes('.plan.md')));
      } finally {
        process.chdir(origCwd);
      }
    });

    it('extracts title from heading (Behavior 3)', async () => {
      const origCwd = process.cwd();
      process.chdir(TEMP_ROOT);
      try {
        const results = await findSpecsByStatus('task-boards', 'review-pending');
        assert.equal(results[0].title, 'Drag and Drop');
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('getPlanProgress', () => {
    it('counts checkboxes correctly (Behavior 5)', async () => {
      const planPath = join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.plan.md');
      const result = await getPlanProgress(planPath);

      assert.equal(result.total, 9); // 4 checked + 5 unchecked
      assert.equal(result.completed, 4);
      assert.equal(result.remaining, 5);
      assert.equal(result.percent, 44);
    });

    it('groups by task headings (Behavior 6)', async () => {
      const planPath = join(TEMP_ROOT, '.context-index', 'specs', 'features', 'task-boards', 'drag-drop.plan.md');
      const result = await getPlanProgress(planPath);

      assert.equal(result.tasks.length, 3);
      assert.equal(result.tasks[0].number, 1);
      assert.equal(result.tasks[0].title, 'Setup drag listeners');
      assert.equal(result.tasks[0].done, false); // has 1 unchecked
      assert.equal(result.tasks[1].number, 2);
      assert.equal(result.tasks[1].done, false); // all unchecked
      assert.equal(result.tasks[2].number, 3);
      assert.equal(result.tasks[2].title, 'Integration tests');
      assert.equal(result.tasks[2].done, false); // has 1 unchecked
    });

    it('throws on missing plan file (Error Case 3)', async () => {
      await assert.rejects(
        () => getPlanProgress(join(TEMP_ROOT, 'nonexistent.plan.md')),
        /Plan not found/
      );
    });

    it('returns zeros for plan with no checkboxes (Error Case 6)', async () => {
      const emptyPlan = join(TEMP_ROOT, 'empty.plan.md');
      writeFileSync(emptyPlan, '# Plan\n\nNo checkboxes here.\n');
      const result = await getPlanProgress(emptyPlan);

      assert.equal(result.total, 0);
      assert.equal(result.completed, 0);
      assert.equal(result.remaining, 0);
      assert.equal(result.percent, 0);
      assert.deepEqual(result.tasks, []);
    });
  });
});
