import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectStrategies, detectTaskStrategy } from '../../../lib/test-strategies/detection.mjs';
import { resolveStrategy } from '../../../lib/test-strategies/assignment.mjs';
import { getStrategy, listStrategies } from '../../../lib/test-strategies/registry.mjs';
import { parseTestStrategies, matchStrategy } from '../../../lib/test-strategies/manifest.mjs';
import { getStrategyProfile, UNIT_PROFILE } from '../../../lib/test-strategies/profiles.mjs';
import { detectSharedGamingPatterns } from '../../../lib/test-strategies/gaming.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');
const PROFILES_DIR = join(dirname(__dirname), '..', '..', 'lib', 'test-strategies', 'profiles');

// ============================================================================
// Scenario 1: Plain Node.js API — unit only
// ============================================================================

describe('Scenario: node-api (plain Node.js project)', () => {
  const root = join(FIXTURES, 'node-api');

  it('project-level detection returns only unit', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.deepStrictEqual(ids, ['unit']);
  });

  it('unit has high confidence', async () => {
    const results = await detectStrategies(root);
    assert.strictEqual(results[0].confidence, 'high');
  });

  it('task-level detection for src/app.mjs returns unit', () => {
    const result = detectTaskStrategy(['src/app.mjs']);
    assert.strictEqual(result.strategyId, 'unit');
  });

  it('resolveStrategy resolves to unit', () => {
    const assignment = resolveStrategy(
      { id: 'task-1', filePaths: ['src/app.mjs'] },
      {},
      {}
    );
    assert.strictEqual(assignment.strategyId, 'unit');
    // source is 'detected' because detectTaskStrategy always returns unit as default
    assert.ok(['detected', 'fallback'].includes(assignment.source));
  });
});

// ============================================================================
// Scenario 2: dbt project — fixture strategy
// ============================================================================

describe('Scenario: dbt-project (data pipeline)', () => {
  const root = join(FIXTURES, 'dbt-project');

  it('project-level detection includes fixture', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('fixture'), `Expected fixture in ${JSON.stringify(ids)}`);
  });

  it('fixture has high confidence', async () => {
    const results = await detectStrategies(root);
    const fixture = results.find(r => r.strategyId === 'fixture');
    assert.strictEqual(fixture.confidence, 'high');
  });

  it('unit is always present', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('unit'));
  });

  it('task-level detection for models/*.sql returns fixture', () => {
    const result = detectTaskStrategy(['models/staging/stg_users.sql']);
    assert.strictEqual(result.strategyId, 'fixture');
  });

  it('resolveStrategy for model file returns fixture/detected', () => {
    const assignment = resolveStrategy(
      { id: 'task-1', filePaths: ['models/staging/stg_users.sql'] },
      {},
      {}
    );
    assert.strictEqual(assignment.strategyId, 'fixture');
    assert.strictEqual(assignment.source, 'detected');
  });
});

// ============================================================================
// Scenario 3: Terraform infra — policy strategy
// ============================================================================

describe('Scenario: terraform-infra (IaC)', () => {
  const root = join(FIXTURES, 'terraform-infra');

  it('project-level detection includes policy', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('policy'), `Expected policy in ${JSON.stringify(ids)}`);
  });

  it('policy from .tf files has high confidence', async () => {
    const results = await detectStrategies(root);
    const policy = results.find(r => r.strategyId === 'policy');
    assert.strictEqual(policy.confidence, 'high');
  });

  it('task-level detection for .tf file returns policy', () => {
    const result = detectTaskStrategy(['main.tf']);
    assert.strictEqual(result.strategyId, 'policy');
  });

  it('task-level detection for k8s manifest returns policy', () => {
    const result = detectTaskStrategy(['k8s/deployment.yaml']);
    assert.strictEqual(result.strategyId, 'policy');
  });
});

// ============================================================================
// Scenario 4: Prisma app — schema strategy
// ============================================================================

describe('Scenario: prisma-app (database migrations)', () => {
  const root = join(FIXTURES, 'prisma-app');

  it('project-level detection includes schema', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('schema'), `Expected schema in ${JSON.stringify(ids)}`);
  });

  it('task-level detection for migration file returns schema', () => {
    const result = detectTaskStrategy(['prisma/migrations/001_init/migration.sql']);
    assert.strictEqual(result.strategyId, 'schema');
  });

  it('task-level detection for non-migration file returns unit', () => {
    const result = detectTaskStrategy(['src/db.mjs']);
    assert.strictEqual(result.strategyId, 'unit');
  });
});

// ============================================================================
// Scenario 5: gRPC service — contract strategy
// ============================================================================

describe('Scenario: grpc-service (service integrations)', () => {
  const root = join(FIXTURES, 'grpc-service');

  it('project-level detection includes contract', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('contract'), `Expected contract in ${JSON.stringify(ids)}`);
  });

  it('task-level detection for .proto file returns contract', () => {
    const result = detectTaskStrategy(['proto/service.proto']);
    assert.strictEqual(result.strategyId, 'contract');
  });

  it('task-level detection for .pact.json returns contract', () => {
    const result = detectTaskStrategy(['contracts/consumer.pact.json']);
    assert.strictEqual(result.strategyId, 'contract');
  });
});

// ============================================================================
// Scenario 6: React app — visual strategy
// ============================================================================

describe('Scenario: react-app (UI components)', () => {
  const root = join(FIXTURES, 'react-app');

  it('project-level detection includes visual', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('visual'), `Expected visual in ${JSON.stringify(ids)}`);
  });

  it('visual has medium confidence', async () => {
    const results = await detectStrategies(root);
    const visual = results.find(r => r.strategyId === 'visual');
    assert.strictEqual(visual.confidence, 'medium');
  });

  it('task-level detection for .tsx component returns visual', () => {
    const result = detectTaskStrategy(['src/components/Button.tsx']);
    assert.strictEqual(result.strategyId, 'visual');
  });
});

// ============================================================================
// Scenario 7: Performance suite — threshold strategy
// ============================================================================

describe('Scenario: perf-suite (load testing)', () => {
  const root = join(FIXTURES, 'perf-suite');

  it('project-level detection includes threshold', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('threshold'), `Expected threshold in ${JSON.stringify(ids)}`);
  });

  it('threshold has medium confidence', async () => {
    const results = await detectStrategies(root);
    const threshold = results.find(r => r.strategyId === 'threshold');
    assert.strictEqual(threshold.confidence, 'medium');
  });

  it('task-level detection for k6 file returns threshold', () => {
    const result = detectTaskStrategy(['k6/load-test.js']);
    assert.strictEqual(result.strategyId, 'threshold');
  });
});

// ============================================================================
// Scenario 8: Fullstack app — multiple strategies
// ============================================================================

describe('Scenario: fullstack-app (schema + visual + unit)', () => {
  const root = join(FIXTURES, 'fullstack-app');

  it('project-level detection includes schema and visual', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('schema'), `Expected schema in ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('visual'), `Expected visual in ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('unit'), `Expected unit in ${JSON.stringify(ids)}`);
  });

  it('migration file resolves to schema', () => {
    const result = detectTaskStrategy(['prisma/migrations/001_init/migration.sql']);
    assert.strictEqual(result.strategyId, 'schema');
  });

  it('component file resolves to visual', () => {
    const result = detectTaskStrategy(['src/components/Dashboard.tsx']);
    assert.strictEqual(result.strategyId, 'visual');
  });

  it('API file resolves to unit', () => {
    const result = detectTaskStrategy(['src/api/users.mjs']);
    assert.strictEqual(result.strategyId, 'unit');
  });

  it('resolveStrategy routes different tasks to different strategies', () => {
    const migrationTask = resolveStrategy(
      { id: 'task-migration', filePaths: ['prisma/migrations/001_init/migration.sql'] },
      {}, {}
    );
    const componentTask = resolveStrategy(
      { id: 'task-component', filePaths: ['src/components/Dashboard.tsx'] },
      {}, {}
    );
    const apiTask = resolveStrategy(
      { id: 'task-api', filePaths: ['src/api/users.mjs'] },
      {}, {}
    );
    assert.strictEqual(migrationTask.strategyId, 'schema');
    assert.strictEqual(componentTask.strategyId, 'visual');
    assert.strictEqual(apiTask.strategyId, 'unit');
  });
});

// ============================================================================
// Scenario 9: Data platform — max strategies
// ============================================================================

describe('Scenario: data-platform (fixture + policy + schema + threshold + unit)', () => {
  const root = join(FIXTURES, 'data-platform');

  it('project-level detection includes at least 4 strategies', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('fixture'), `Expected fixture in ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('policy'), `Expected policy in ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('schema'), `Expected schema in ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('threshold'), `Expected threshold in ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('unit'), `Expected unit in ${JSON.stringify(ids)}`);
  });

  it('different file paths resolve to correct strategies', () => {
    assert.strictEqual(detectTaskStrategy(['models/marts/dim_users.sql']).strategyId, 'fixture');
    assert.strictEqual(detectTaskStrategy(['terraform/main.tf']).strategyId, 'policy');
    assert.strictEqual(detectTaskStrategy(['migrations/V001__init.sql']).strategyId, 'schema');
    assert.strictEqual(detectTaskStrategy(['k6/api-load.js']).strategyId, 'threshold');
    assert.strictEqual(detectTaskStrategy(['src/etl.py']).strategyId, 'unit');
  });
});

// ============================================================================
// Cross-cutting: Priority chain with manifest overrides
// ============================================================================

describe('Priority chain: manifest overrides detection', () => {
  it('manifest strategy wins over auto-detection', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'smoke', command: ['npm', 'test'], tier: 'fast', paths: ['src/**'] }
      ]
    };
    const assignment = resolveStrategy(
      { id: 'task-1', filePaths: ['src/app.mjs'] },
      manifest,
      {}
    );
    assert.strictEqual(assignment.strategyId, 'smoke');
    assert.strictEqual(assignment.source, 'manifest');
  });

  it('spec-declared strategy wins over manifest', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'smoke', command: ['npm', 'test'], tier: 'fast', paths: ['src/**'] }
      ]
    };
    const assignment = resolveStrategy(
      { id: 'task-1', filePaths: ['src/app.mjs'] },
      manifest,
      { test_strategy: 'contract' }
    );
    assert.strictEqual(assignment.strategyId, 'contract');
    assert.strictEqual(assignment.source, 'spec-declared');
  });

  it('unknown spec strategy falls through to manifest', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'smoke', command: ['npm', 'test'], tier: 'fast', paths: ['src/**'] }
      ]
    };
    const assignment = resolveStrategy(
      { id: 'task-1', filePaths: ['src/app.mjs'] },
      manifest,
      { test_strategy: 'nonexistent' }
    );
    assert.strictEqual(assignment.strategyId, 'smoke');
    assert.strictEqual(assignment.source, 'manifest');
    assert.ok(assignment.warnings.length > 0, 'Should have warning for unknown spec strategy');
  });
});

// ============================================================================
// Cross-cutting: Profile loading and fallback
// ============================================================================

describe('Profile loading with fixtures', () => {
  it('unit profile loads from file', () => {
    const result = getStrategyProfile('unit', PROFILES_DIR);
    assert.strictEqual(result.profile.strategy_id, 'unit');
    assert.strictEqual(result.fallback, false);
  });

  it('all 8 profiles load without fallback', () => {
    const ids = ['unit', 'schema', 'contract', 'fixture', 'policy', 'threshold', 'visual', 'smoke'];
    for (const id of ids) {
      const result = getStrategyProfile(id, PROFILES_DIR);
      assert.strictEqual(result.profile.strategy_id, id, `Profile ${id} has wrong strategy_id`);
      assert.strictEqual(result.fallback, false, `Profile ${id} should not fallback`);
      assert.strictEqual(result.warnings.length, 0, `Profile ${id} has warnings: ${result.warnings}`);
    }
  });

  it('UNIT_PROFILE has all required fields', () => {
    const required = ['strategy_id', 'red_exit_condition', 'green_exit_condition',
      'gaming_blockers', 'assertion_rules', 'seed_data_rule', 'handoff_format', 'permitted_tools'];
    for (const field of required) {
      assert.ok(field in UNIT_PROFILE, `Missing field: ${field}`);
    }
  });
});

// ============================================================================
// Cross-cutting: Gaming detection on fixture test files
// ============================================================================

describe('Gaming detection on realistic test content', () => {
  it('clean test code produces no violations', () => {
    const clean = `
import { test } from 'node:test';
import assert from 'node:assert';
test('adds numbers', () => {
  assert.strictEqual(1 + 1, 2);
});
`;
    const result = detectSharedGamingPatterns(clean);
    assert.strictEqual(result.clean, true);
  });

  it('disabled test is caught', () => {
    const gaming = `
import { test } from 'node:test';
test.skip('todo test', () => {
  assert.strictEqual(1, 1);
});
`;
    const result = detectSharedGamingPatterns(gaming);
    assert.strictEqual(result.clean, false);
    assert.ok(result.violations.some(v => v.patternId === 'DISABLED_TESTS'));
  });

  it('swallowed assertion is caught', () => {
    const gaming = `
import { test } from 'node:test';
test('catches error', () => {
  try {
    assert.strictEqual(1, 2);
  } catch (e) {}
});
`;
    const result = detectSharedGamingPatterns(gaming);
    assert.strictEqual(result.clean, false);
    assert.ok(result.violations.some(v => v.patternId === 'SWALLOWED_ASSERTIONS'));
  });

  it('all violations have SHARED prefix', () => {
    const gaming = `
import { test } from 'node:test';
test.skip('todo', () => {});
`;
    const result = detectSharedGamingPatterns(gaming);
    for (const v of result.violations) {
      assert.strictEqual(v.prefix, 'SHARED');
    }
  });
});

// ============================================================================
// Cross-cutting: Registry completeness
// ============================================================================

describe('Registry covers all fixture scenarios', () => {
  const expectedStrategies = ['contract', 'fixture', 'policy', 'schema', 'smoke', 'threshold', 'unit', 'visual'];

  it('registry has exactly 8 strategies', () => {
    const all = listStrategies();
    assert.strictEqual(all.length, 8);
  });

  it('all expected strategy IDs exist', () => {
    for (const id of expectedStrategies) {
      const s = getStrategy(id);
      assert.ok(s !== null, `Strategy '${id}' not found in registry`);
    }
  });

  it('each strategy has red and green semantics', () => {
    for (const id of expectedStrategies) {
      const s = getStrategy(id);
      assert.ok(s.redSemantics.length > 10, `${id} redSemantics too short`);
      assert.ok(s.greenSemantics.length > 10, `${id} greenSemantics too short`);
    }
  });

  it('each strategy has a domain and typical tools', () => {
    for (const id of expectedStrategies) {
      const s = getStrategy(id);
      assert.ok(s.domain.length > 5, `${id} domain too short`);
      assert.ok(Array.isArray(s.typicalTools), `${id} typicalTools not array`);
      assert.ok(s.typicalTools.length > 0, `${id} has no typical tools`);
    }
  });
});
