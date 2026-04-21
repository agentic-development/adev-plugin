/**
 * Tests for lib/test-strategies/assignment.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStrategy, resolveStrategyBatch } from '../../../lib/test-strategies/assignment.mjs';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

/** A manifest with a single test_strategies entry matching src/**\/*.mjs → unit */
const MANIFEST_WITH_UNIT = {
  test_strategies: [
    { strategy_id: 'unit', paths: ['src/**/*.mjs'] },
  ],
};

/** A manifest with a schema entry matching migrations/**\/* */
const MANIFEST_WITH_SCHEMA = {
  test_strategies: [
    { strategy_id: 'schema', paths: ['migrations/**/*'] },
  ],
};

const TASK_EMPTY_PATHS = { id: 'task-1', filePaths: [] };
const TASK_SRC_FILE   = { id: 'task-2', filePaths: ['src/lib/foo.mjs'] };
const TASK_MIGRATION  = { id: 'task-3', filePaths: ['migrations/001_add_users.sql'] };
const TASK_K8S        = { id: 'task-4', filePaths: ['k8s/deployment.yaml'] };

// ---------------------------------------------------------------------------
// Priority chain — spec-declared
// ---------------------------------------------------------------------------

describe('resolveStrategy — spec-declared', () => {
  test('valid spec test_strategy wins over everything else', () => {
    const spec = { test_strategy: 'schema' };
    const result = resolveStrategy(TASK_MIGRATION, MANIFEST_WITH_UNIT, spec);
    assert.equal(result.strategyId, 'schema');
    assert.equal(result.source, 'spec-declared');
    assert.equal(result.confidence, 'high');
    assert.equal(result.reason, null);
  });

  test('spec-declared wins even when manifest and detection would differ', () => {
    const spec = { test_strategy: 'contract' };
    // Manifest would match unit; detection of migration path would pick schema
    const result = resolveStrategy(TASK_MIGRATION, MANIFEST_WITH_UNIT, spec);
    assert.equal(result.strategyId, 'contract');
    assert.equal(result.source, 'spec-declared');
  });

  test('unknown spec test_strategy falls through with warning', () => {
    const spec = { test_strategy: 'not-a-real-strategy' };
    const result = resolveStrategy(TASK_MIGRATION, MANIFEST_WITH_SCHEMA, spec);
    // Fell through — should resolve via manifest
    assert.equal(result.source, 'manifest');
    assert.equal(result.strategyId, 'schema');
    assert.ok(
      result.warnings.some((w) => w.includes("Unknown spec test_strategy 'not-a-real-strategy'")),
      'expected warning about unknown spec strategy'
    );
  });

  test('unknown spec strategy warning text contains — falling through', () => {
    const spec = { test_strategy: 'bogus' };
    const result = resolveStrategy(TASK_SRC_FILE, null, spec);
    assert.ok(result.warnings[0].includes('falling through'));
  });
});

// ---------------------------------------------------------------------------
// Priority chain — manifest
// ---------------------------------------------------------------------------

describe('resolveStrategy — manifest', () => {
  test('manifest match wins when no spec override', () => {
    const result = resolveStrategy(TASK_SRC_FILE, MANIFEST_WITH_UNIT, null);
    assert.equal(result.strategyId, 'unit');
    assert.equal(result.source, 'manifest');
    assert.equal(result.confidence, 'high');
    assert.equal(result.reason, null);
  });

  test('manifest match uses first matching path across filePaths', () => {
    const task = { id: 't', filePaths: ['unrelated/file.ts', 'migrations/001.sql'] };
    const result = resolveStrategy(task, MANIFEST_WITH_SCHEMA, null);
    assert.equal(result.strategyId, 'schema');
    assert.equal(result.source, 'manifest');
  });

  test('no manifest match falls through to detected', () => {
    // Task with a k8s path — manifest has only schema rule, no match
    const result = resolveStrategy(TASK_K8S, MANIFEST_WITH_SCHEMA, null);
    // k8s detection → policy/high via detectTaskStrategy
    assert.equal(result.source, 'detected');
    assert.equal(result.strategyId, 'policy');
  });
});

// ---------------------------------------------------------------------------
// Priority chain — detected
// ---------------------------------------------------------------------------

describe('resolveStrategy — detected', () => {
  test('detection kicks in when no spec and no manifest match', () => {
    const result = resolveStrategy(TASK_K8S, null, null);
    assert.equal(result.source, 'detected');
    assert.equal(result.strategyId, 'policy');
    assert.equal(result.confidence, 'high');
  });

  test('detection result carries the confidence from detectTaskStrategy', () => {
    // visual components: src/components/Button.tsx → medium
    const task = { id: 't', filePaths: ['src/components/Button.tsx'] };
    const result = resolveStrategy(task, null, null);
    assert.equal(result.source, 'detected');
    assert.equal(result.strategyId, 'visual');
    assert.equal(result.confidence, 'medium');
  });
});

// ---------------------------------------------------------------------------
// Priority chain — fallback
// ---------------------------------------------------------------------------

describe('resolveStrategy — fallback', () => {
  test('empty filePaths with no spec or manifest → fallback', () => {
    const result = resolveStrategy(TASK_EMPTY_PATHS, null, null);
    assert.equal(result.strategyId, 'unit');
    assert.equal(result.source, 'fallback');
    assert.equal(result.confidence, 'high');
    assert.equal(result.reason, null);
  });

  test('fallback produces no warnings on its own', () => {
    const result = resolveStrategy(TASK_EMPTY_PATHS, null, null);
    assert.deepEqual(result.warnings, []);
  });
});

// ---------------------------------------------------------------------------
// Source & confidence invariants
// ---------------------------------------------------------------------------

describe('resolveStrategy — confidence invariants', () => {
  test('spec-declared always confidence high', () => {
    const result = resolveStrategy(TASK_SRC_FILE, null, { test_strategy: 'unit' });
    assert.equal(result.source, 'spec-declared');
    assert.equal(result.confidence, 'high');
  });

  test('manifest always confidence high', () => {
    const result = resolveStrategy(TASK_SRC_FILE, MANIFEST_WITH_UNIT, null);
    assert.equal(result.source, 'manifest');
    assert.equal(result.confidence, 'high');
  });

  test('fallback always confidence high', () => {
    const result = resolveStrategy(TASK_EMPTY_PATHS, null, null);
    assert.equal(result.source, 'fallback');
    assert.equal(result.confidence, 'high');
  });

  test('detected confidence is medium for visual', () => {
    const task = { id: 't', filePaths: ['src/components/Header.vue'] };
    const result = resolveStrategy(task, null, null);
    assert.equal(result.source, 'detected');
    assert.equal(result.confidence, 'medium');
  });

  test('detected confidence is high for schema migration path', () => {
    const result = resolveStrategy(TASK_MIGRATION, null, null);
    assert.equal(result.source, 'detected');
    assert.equal(result.confidence, 'high');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('resolveStrategy — edge cases', () => {
  test('spec is null → skip spec check, proceed to manifest', () => {
    const result = resolveStrategy(TASK_SRC_FILE, MANIFEST_WITH_UNIT, null);
    assert.equal(result.source, 'manifest');
  });

  test('spec is undefined → skip spec check', () => {
    const result = resolveStrategy(TASK_SRC_FILE, MANIFEST_WITH_UNIT, undefined);
    assert.equal(result.source, 'manifest');
  });

  test('manifest is null → skip manifest check', () => {
    const result = resolveStrategy(TASK_K8S, null, null);
    assert.notEqual(result.source, 'manifest');
  });

  test('manifest has no test_strategies → skip manifest check', () => {
    const result = resolveStrategy(TASK_K8S, {}, null);
    assert.notEqual(result.source, 'manifest');
  });

  test('task.filePaths is undefined → fallback', () => {
    const task = { id: 't' };
    const result = resolveStrategy(task, null, null);
    assert.equal(result.source, 'fallback');
  });

  test('task.filePaths missing detection falls back to unit/fallback', () => {
    const task = { id: 't', filePaths: [] };
    const result = resolveStrategy(task, null, null);
    assert.equal(result.source, 'fallback');
    assert.equal(result.strategyId, 'unit');
  });

  test('result always contains warnings array', () => {
    const result = resolveStrategy(TASK_SRC_FILE, null, null);
    assert.ok(Array.isArray(result.warnings));
  });
});

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

describe('resolveStrategy — warnings', () => {
  test('unknown spec strategy produces exactly one warning', () => {
    const spec = { test_strategy: 'nonexistent' };
    const result = resolveStrategy(TASK_EMPTY_PATHS, null, spec);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes("'nonexistent'"));
  });

  test('unknown manifest strategy_id produces warning from parseTestStrategies', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'totally-fake', paths: ['src/**'] },
      ],
    };
    const result = resolveStrategy(TASK_SRC_FILE, manifest, null);
    assert.ok(
      result.warnings.some((w) => w.includes("'totally-fake'")),
      'expected warning about unknown manifest strategy_id'
    );
  });

  test('valid spec strategy produces no warnings', () => {
    const spec = { test_strategy: 'unit' };
    const result = resolveStrategy(TASK_SRC_FILE, MANIFEST_WITH_SCHEMA, spec);
    assert.deepEqual(result.warnings, []);
  });

  test('warnings accumulate from both spec and manifest when spec unknown', () => {
    const spec = { test_strategy: 'fake-spec-strategy' };
    const manifest = {
      test_strategies: [
        { strategy_id: 'fake-manifest-strategy', paths: ['src/**'] },
      ],
    };
    const result = resolveStrategy(TASK_SRC_FILE, manifest, spec);
    // One warning for unknown spec strategy, one for unknown manifest strategy_id
    assert.ok(result.warnings.length >= 2);
  });
});

// ---------------------------------------------------------------------------
// resolveStrategyBatch
// ---------------------------------------------------------------------------

describe('resolveStrategyBatch', () => {
  test('returns an array with one result per task', () => {
    const tasks = [TASK_EMPTY_PATHS, TASK_SRC_FILE, TASK_MIGRATION];
    const results = resolveStrategyBatch(tasks, null, null);
    assert.equal(results.length, 3);
  });

  test('each result has the expected shape', () => {
    const results = resolveStrategyBatch([TASK_MIGRATION], null, null);
    const r = results[0];
    assert.ok('strategyId' in r);
    assert.ok('source' in r);
    assert.ok('confidence' in r);
    assert.ok('reason' in r);
    assert.ok('warnings' in r);
  });

  test('spec-declared wins for all tasks when spec has valid strategy', () => {
    const tasks = [TASK_MIGRATION, TASK_K8S, TASK_SRC_FILE];
    const spec = { test_strategy: 'contract' };
    const results = resolveStrategyBatch(tasks, MANIFEST_WITH_SCHEMA, spec);
    assert.ok(results.every((r) => r.source === 'spec-declared' && r.strategyId === 'contract'));
  });

  test('empty tasks array returns empty array', () => {
    const results = resolveStrategyBatch([], null, null);
    assert.deepEqual(results, []);
  });

  test('each task resolves independently based on its filePaths', () => {
    const tasks = [TASK_EMPTY_PATHS, TASK_MIGRATION];
    const results = resolveStrategyBatch(tasks, null, null);
    assert.equal(results[0].source, 'fallback');
    assert.equal(results[1].source, 'detected');
    assert.equal(results[1].strategyId, 'schema');
  });
});
