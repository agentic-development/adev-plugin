/**
 * Tests for lib/test-strategies/detection.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { detectStrategies, detectTaskStrategy } from '../../../lib/test-strategies/detection.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'adev-detection-test-'));
}

function cleanupTempDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function touch(dir, ...relativeParts) {
  const fullPath = join(dir, ...relativeParts);
  mkdirSync(join(dir, ...relativeParts.slice(0, -1)), { recursive: true });
  writeFileSync(fullPath, '');
}

function mkdir(dir, ...relativeParts) {
  mkdirSync(join(dir, ...relativeParts), { recursive: true });
}

// ---------------------------------------------------------------------------
// Project-level detection tests
// ---------------------------------------------------------------------------

describe('detectStrategies — project-level', () => {
  test('empty directory → only unit detected', async () => {
    const dir = createTempDir();
    try {
      const results = await detectStrategies(dir);
      assert.equal(results.length, 1);
      assert.deepEqual(results[0], { strategyId: 'unit', confidence: 'high' });
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('unit is always present alongside other strategies', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'dbt_project.yml');
      const results = await detectStrategies(dir);
      const unitEntry = results.find((r) => r.strategyId === 'unit');
      assert.ok(unitEntry, 'unit strategy should always be present');
      assert.equal(unitEntry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('dbt_project.yml → fixture detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'dbt_project.yml');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'fixture');
      assert.ok(entry, 'fixture strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('profiles.yml → fixture detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'profiles.yml');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'fixture');
      assert.ok(entry, 'fixture strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('.tf file → policy detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'main.tf');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'policy');
      assert.ok(entry, 'policy strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('terraform/ directory → policy detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'terraform');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'policy');
      assert.ok(entry, 'policy strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('Dockerfile → policy detected with medium confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'Dockerfile');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'policy');
      assert.ok(entry, 'policy strategy expected');
      assert.equal(entry.confidence, 'medium');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('k8s/ directory → policy detected with medium confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'k8s');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'policy');
      assert.ok(entry, 'policy strategy expected');
      assert.equal(entry.confidence, 'medium');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('migrations/ directory → schema detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'migrations');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'schema');
      assert.ok(entry, 'schema strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('prisma/schema.prisma → schema detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'prisma', 'schema.prisma');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'schema');
      assert.ok(entry, 'schema strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('alembic/ directory → schema detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'alembic');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'schema');
      assert.ok(entry, 'schema strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('*.proto file → contract detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'service.proto');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'contract');
      assert.ok(entry, 'contract strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('openapi.yaml → contract detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'openapi.yaml');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'contract');
      assert.ok(entry, 'contract strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('openapi.json → contract detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'openapi.json');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'contract');
      assert.ok(entry, 'contract strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('contracts/ directory → contract detected with high confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'contracts');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'contract');
      assert.ok(entry, 'contract strategy expected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('k6/ directory → threshold detected with medium confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'k6');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'threshold');
      assert.ok(entry, 'threshold strategy expected');
      assert.equal(entry.confidence, 'medium');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('locust/ directory → threshold detected with medium confidence', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'locust');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'threshold');
      assert.ok(entry, 'threshold strategy expected');
      assert.equal(entry.confidence, 'medium');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('*.bench.* file → threshold detected with medium confidence', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'sort.bench.ts');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'threshold');
      assert.ok(entry, 'threshold strategy expected');
      assert.equal(entry.confidence, 'medium');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('multiple indicators → multiple strategies detected', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'dbt_project.yml');
      touch(dir, 'main.tf');
      mkdir(dir, 'migrations');
      touch(dir, 'service.proto');
      mkdir(dir, 'k6');
      const results = await detectStrategies(dir);
      const ids = results.map((r) => r.strategyId);
      assert.ok(ids.includes('unit'), 'unit expected');
      assert.ok(ids.includes('fixture'), 'fixture expected');
      assert.ok(ids.includes('policy'), 'policy expected');
      assert.ok(ids.includes('schema'), 'schema expected');
      assert.ok(ids.includes('contract'), 'contract expected');
      assert.ok(ids.includes('threshold'), 'threshold expected');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('non-existent directory → returns unit only with warning logged', async () => {
    const results = await detectStrategies('/tmp/does-not-exist-adev-test-xyz');
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], { strategyId: 'unit', confidence: 'high' });
  });

  test('null projectRoot → returns unit only', async () => {
    const results = await detectStrategies(null);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], { strategyId: 'unit', confidence: 'high' });
  });

  test('terraform/ dir upgrades policy confidence from medium to high', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'Dockerfile');   // medium
      mkdir(dir, 'terraform');     // high
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'policy');
      assert.ok(entry, 'policy strategy expected');
      assert.equal(entry.confidence, 'high', 'higher confidence should win');
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Task-level detection tests
// ---------------------------------------------------------------------------

describe('detectTaskStrategy — task-level', () => {
  test('file in migrations/ → schema', () => {
    const result = detectTaskStrategy(['migrations/001_create_users.sql']);
    assert.deepEqual(result, { strategyId: 'schema', confidence: 'high' });
  });

  test('file in prisma/migrations/ → schema', () => {
    const result = detectTaskStrategy(['prisma/migrations/20240101_init.sql']);
    assert.deepEqual(result, { strategyId: 'schema', confidence: 'high' });
  });

  test('file in alembic/versions/ → schema', () => {
    const result = detectTaskStrategy(['alembic/versions/abc123_add_column.py']);
    assert.deepEqual(result, { strategyId: 'schema', confidence: 'high' });
  });

  test('file ending in .tf → policy', () => {
    const result = detectTaskStrategy(['infra/main.tf']);
    assert.deepEqual(result, { strategyId: 'policy', confidence: 'high' });
  });

  test('file ending in .tfvars → policy', () => {
    const result = detectTaskStrategy(['infra/prod.tfvars']);
    assert.deepEqual(result, { strategyId: 'policy', confidence: 'high' });
  });

  test('file under k8s/ → policy', () => {
    const result = detectTaskStrategy(['k8s/deployment.yaml']);
    assert.deepEqual(result, { strategyId: 'policy', confidence: 'high' });
  });

  test('file under kubernetes/ → policy', () => {
    const result = detectTaskStrategy(['kubernetes/service.yaml']);
    assert.deepEqual(result, { strategyId: 'policy', confidence: 'high' });
  });

  test('file under helm/ → policy', () => {
    const result = detectTaskStrategy(['helm/values.yaml']);
    assert.deepEqual(result, { strategyId: 'policy', confidence: 'high' });
  });

  test('models/staging/users.sql → fixture', () => {
    const result = detectTaskStrategy(['models/staging/users.sql']);
    assert.deepEqual(result, { strategyId: 'fixture', confidence: 'high' });
  });

  test('file ending in .proto → contract', () => {
    const result = detectTaskStrategy(['protos/user.proto']);
    assert.deepEqual(result, { strategyId: 'contract', confidence: 'high' });
  });

  test('file ending in .pact.json → contract', () => {
    const result = detectTaskStrategy(['contracts/user-service.pact.json']);
    assert.deepEqual(result, { strategyId: 'contract', confidence: 'high' });
  });

  test('openapi.yaml → contract', () => {
    const result = detectTaskStrategy(['openapi.yaml']);
    assert.deepEqual(result, { strategyId: 'contract', confidence: 'high' });
  });

  test('openapi.json → contract', () => {
    const result = detectTaskStrategy(['openapi.json']);
    assert.deepEqual(result, { strategyId: 'contract', confidence: 'high' });
  });

  test('src/components/Button.tsx → visual', () => {
    const result = detectTaskStrategy(['src/components/Button.tsx']);
    assert.deepEqual(result, { strategyId: 'visual', confidence: 'medium' });
  });

  test('src/components/Card.jsx → visual', () => {
    const result = detectTaskStrategy(['src/components/Card.jsx']);
    assert.deepEqual(result, { strategyId: 'visual', confidence: 'medium' });
  });

  test('app/components/Header.vue → visual', () => {
    const result = detectTaskStrategy(['app/components/Header.vue']);
    assert.deepEqual(result, { strategyId: 'visual', confidence: 'medium' });
  });

  test('app/components/Footer.svelte → visual', () => {
    const result = detectTaskStrategy(['app/components/Footer.svelte']);
    assert.deepEqual(result, { strategyId: 'visual', confidence: 'medium' });
  });

  test('k6/load-test.js → threshold', () => {
    const result = detectTaskStrategy(['k6/load-test.js']);
    assert.deepEqual(result, { strategyId: 'threshold', confidence: 'medium' });
  });

  test('locust/locustfile.py → threshold', () => {
    const result = detectTaskStrategy(['locust/locustfile.py']);
    assert.deepEqual(result, { strategyId: 'threshold', confidence: 'medium' });
  });

  test('artillery/scenario.yml → threshold', () => {
    const result = detectTaskStrategy(['artillery/scenario.yml']);
    assert.deepEqual(result, { strategyId: 'threshold', confidence: 'medium' });
  });

  test('file matching *.bench.* → threshold', () => {
    const result = detectTaskStrategy(['src/sort.bench.ts']);
    assert.deepEqual(result, { strategyId: 'threshold', confidence: 'medium' });
  });

  test('src/utils/helpers.mjs → unit (default)', () => {
    const result = detectTaskStrategy(['src/utils/helpers.mjs']);
    assert.deepEqual(result, { strategyId: 'unit', confidence: 'high' });
  });

  test('empty array → unit (default)', () => {
    const result = detectTaskStrategy([]);
    assert.deepEqual(result, { strategyId: 'unit', confidence: 'high' });
  });

  test('mixed file paths → first matching rule wins (schema)', () => {
    // migrations/ is checked first in the rules, so schema should win
    const result = detectTaskStrategy([
      'migrations/001_create_users.sql',
      'infra/main.tf',
      'src/utils/helpers.mjs',
    ]);
    assert.deepEqual(result, { strategyId: 'schema', confidence: 'high' });
  });

  test('mixed file paths → first matching rule wins (policy before visual)', () => {
    // policy rule comes before visual
    const result = detectTaskStrategy([
      'k8s/deployment.yaml',
      'src/components/Button.tsx',
    ]);
    assert.deepEqual(result, { strategyId: 'policy', confidence: 'high' });
  });

  test('src/components/Button.ts (non-UI ext) → unit', () => {
    // .ts alone is not in UI_EXTS, only .tsx is
    const result = detectTaskStrategy(['src/components/Button.ts']);
    assert.deepEqual(result, { strategyId: 'unit', confidence: 'high' });
  });
});

// ---------------------------------------------------------------------------
// Project-level: integration
// ---------------------------------------------------------------------------

describe('detectStrategies — integration project-level', () => {
  test('detects integration (high) when adapters/ directory exists', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'adapters');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('detects integration (high) when integrations/ directory exists', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'integrations');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('detects integration (high) when connectors/ directory exists', async () => {
    const dir = createTempDir();
    try {
      mkdir(dir, 'connectors');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });

  test('detects integration (high) when serverless.yml exists', async () => {
    const dir = createTempDir();
    try {
      touch(dir, 'serverless.yml');
      const results = await detectStrategies(dir);
      const entry = results.find((r) => r.strategyId === 'integration');
      assert.ok(entry, 'Expected integration to be detected');
      assert.equal(entry.confidence, 'high');
    } finally {
      cleanupTempDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Task-level: integration
// ---------------------------------------------------------------------------

describe('detectTaskStrategy — integration task-level', () => {
  test('detects integration (medium) for path under adapters/', () => {
    const result = detectTaskStrategy(['src/adapters/s3-client.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for path under integrations/', () => {
    const result = detectTaskStrategy(['lib/integrations/stripe.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for path under connectors/', () => {
    const result = detectTaskStrategy(['src/connectors/kafka.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for *-adapter.* filename pattern', () => {
    const result = detectTaskStrategy(['src/storage/s3-adapter.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('detects integration (medium) for *-client.* filename pattern', () => {
    const result = detectTaskStrategy(['lib/stripe-client.mjs']);
    assert.equal(result.strategyId, 'integration');
    assert.equal(result.confidence, 'medium');
  });

  test('integration does not override schema for migrations/ paths', () => {
    const result = detectTaskStrategy(['db/migrations/001_create_users.sql']);
    assert.equal(result.strategyId, 'schema', 'schema takes precedence over integration for migrations/');
  });

  test('contract takes precedence over integration for .proto files', () => {
    const result = detectTaskStrategy(['proto/adapters/service.proto']);
    assert.equal(result.strategyId, 'contract', 'contract takes precedence for .proto files');
  });
});
