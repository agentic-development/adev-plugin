import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectStrategies, detectTaskStrategy } from '../../../lib/test-strategies/detection.mjs';
import { resolveStrategy } from '../../../lib/test-strategies/assignment.mjs';
import { getStrategy, listStrategies } from '../../../lib/test-strategies/registry.mjs';
import { parseTestStrategies, matchStrategy } from '../../../lib/test-strategies/manifest.mjs';
import { getStrategyProfile, UNIT_PROFILE } from '../../../lib/test-strategies/profiles.mjs';
import { detectSharedGamingPatterns, INTEGRATION_PATTERNS } from '../../../lib/test-strategies/gaming.mjs';
import { readFileSync } from 'node:fs';

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
// Scenario 10: Integration service — integration strategy
// ============================================================================

describe('Scenario: integration-service (cloud adapters + serverless)', () => {
  const root = join(FIXTURES, 'integration-service');

  it('project-level detection includes integration (from serverless.yml)', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('integration'), `Expected integration in ${JSON.stringify(ids)}`);
  });

  it('integration from serverless.yml has high confidence', async () => {
    const results = await detectStrategies(root);
    const integration = results.find(r => r.strategyId === 'integration');
    assert.strictEqual(integration.confidence, 'high');
  });

  it('unit is always present alongside integration', async () => {
    const results = await detectStrategies(root);
    const ids = results.map(r => r.strategyId);
    assert.ok(ids.includes('unit'), `Expected unit in ${JSON.stringify(ids)}`);
  });

  it('task-level detection for adapters/ path returns integration', () => {
    const result = detectTaskStrategy(['adapters/s3-client.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
    assert.strictEqual(result.confidence, 'medium');
  });

  it('task-level detection for integrations/ path returns integration', () => {
    const result = detectTaskStrategy(['integrations/stripe-gateway.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('task-level detection for clients/ path returns integration', () => {
    const result = detectTaskStrategy(['src/clients/redis-client.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('task-level detection for providers/ path returns integration', () => {
    const result = detectTaskStrategy(['lib/providers/twilio-provider.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('task-level detection for *-adapter.* filename returns integration', () => {
    const result = detectTaskStrategy(['src/dynamo-adapter.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('task-level detection for *-client.* filename returns integration', () => {
    const result = detectTaskStrategy(['src/postgres-client.ts']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('task-level detection for *-gateway.* filename returns integration', () => {
    const result = detectTaskStrategy(['src/payment-gateway.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('task-level detection for *-connector.* filename returns integration', () => {
    const result = detectTaskStrategy(['lib/kafka-connector.mjs']);
    assert.strictEqual(result.strategyId, 'integration');
  });

  it('resolveStrategy routes adapter file to integration/detected', () => {
    const assignment = resolveStrategy(
      { id: 'task-1', filePaths: ['adapters/s3-client.mjs'] },
      {}, {}
    );
    assert.strictEqual(assignment.strategyId, 'integration');
    assert.strictEqual(assignment.source, 'detected');
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

  it('all 9 profiles load without fallback', () => {
    const ids = ['unit', 'schema', 'contract', 'fixture', 'integration', 'policy', 'threshold', 'visual', 'smoke'];
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
// Profile content validation — each profile has domain-appropriate rules
// ============================================================================

describe('Profile content: schema', () => {
  const p = () => getStrategyProfile('schema', PROFILES_DIR).profile;

  it("RED condition references migration assertions (+1 more contract assertions)", () => {
    // RED condition references migration assertions
    assert.ok(p().red_exit_condition.toLowerCase().includes('migration'),
    `Expected "migration" in red_exit_condition: ${p().red_exit_condition}`);

    // seed data rule requires production-like data
    assert.ok(p().seed_data_rule.toLowerCase().includes('production') ||
    p().seed_data_rule.toLowerCase().includes('representative'),
    `Expected production-like seed data requirement`);
  });

  it('gaming blockers include empty database testing', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('empty database') || blockers.includes('empty db'),
      `Expected empty database gaming blocker`);
  });

  it('gaming blockers include missing rollback', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('rollback'), `Expected rollback gaming blocker`);
  });


  it('permitted tools include migration frameworks', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('flyway') || tools.includes('prisma') || tools.includes('alembic'),
      `Expected migration framework in permitted_tools`);
  });
});

describe('Profile content: contract', () => {
  const p = () => getStrategyProfile('contract', PROFILES_DIR).profile;

  it("RED condition references consumer contract verification (+1 more contract assertions)", () => {
    // RED condition references consumer contract verification
    assert.ok(p().red_exit_condition.toLowerCase().includes('consumer') ||
    p().red_exit_condition.toLowerCase().includes('contract'),
    `Expected contract reference in red_exit_condition`);

    // assertion rules require semantic assertions
    assert.ok(p().assertion_rules.toLowerCase().includes('semantic'),
    `Expected semantic assertion requirement`);
  });

  it('gaming blockers include structure-only assertions', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('structure') || blockers.includes('field existence'),
      `Expected structure-only gaming blocker`);
  });

  it('gaming blockers include happy-path-only', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('happy') || blockers.includes('error'),
      `Expected happy-path-only gaming blocker`);
  });


  it('permitted tools include Pact', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('pact'), `Expected Pact in permitted_tools`);
  });
});

describe('Profile content: fixture', () => {
  const p = () => getStrategyProfile('fixture', PROFILES_DIR).profile;

  it('RED condition references fixture output mismatch', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('fixture') || red.includes('output'),
      `Expected fixture/output in red_exit_condition`);
  });

  it('gaming blockers include trivially small fixtures', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('trivial') || blockers.includes('fewer than'),
      `Expected small fixture gaming blocker`);
  });

  it("assertion rules require exact output comparison (+1 more contract assertions)", () => {
    // assertion rules require exact output comparison
    assert.ok(p().assertion_rules.toLowerCase().includes('exact'),
    `Expected exact comparison requirement`);

    // seed data rule requires hand-crafted fixtures
    assert.ok(p().seed_data_rule.toLowerCase().includes('hand-crafted') ||
    p().seed_data_rule.toLowerCase().includes('deterministic'),
    `Expected hand-crafted seed data requirement`);
  });

  it('permitted tools include dbt', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('dbt'), `Expected dbt in permitted_tools`);
  });
});

describe('Profile content: policy', () => {
  const p = () => getStrategyProfile('policy', PROFILES_DIR).profile;

  it('RED condition references policy/deny rule', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('policy') || red.includes('deny'),
      `Expected policy/deny in red_exit_condition`);
  });

  it('gaming blockers include key-without-value checks', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('key') && blockers.includes('value'),
      `Expected key-without-value gaming blocker`);
  });

  it('assertion rules require concrete values', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('concrete') ||
      p().assertion_rules.toLowerCase().includes('value'),
      `Expected concrete value assertion requirement`);
  });

  it('permitted tools include Conftest or OPA', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('conftest') || tools.includes('opa'),
      `Expected Conftest/OPA in permitted_tools`);
  });
});

describe('Profile content: threshold', () => {
  const p = () => getStrategyProfile('threshold', PROFILES_DIR).profile;

  it('RED condition references performance threshold', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('threshold') || red.includes('p95') || red.includes('latency'),
      `Expected threshold/latency in red_exit_condition`);
  });

  it('gaming blockers include loose thresholds', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('loose') || blockers.includes('too'),
      `Expected loose threshold gaming blocker`);
  });

  it('gaming blockers include missing error rate', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('error rate') || blockers.includes('latency without'),
      `Expected error rate gaming blocker`);
  });

  it('assertion rules require percentile targets', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('percentile') ||
      p().assertion_rules.toLowerCase().includes('p95'),
      `Expected percentile assertion requirement`);
  });

  it('permitted tools include k6 or Gatling', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('k6') || tools.includes('gatling'),
      `Expected k6/Gatling in permitted_tools`);
  });
});

describe('Profile content: visual', () => {
  const p = () => getStrategyProfile('visual', PROFILES_DIR).profile;

  it('RED condition references screenshot diff', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('screenshot') || red.includes('diff') || red.includes('baseline'),
      `Expected screenshot/diff in red_exit_condition`);
  });

  it('gaming blockers include high pixel threshold', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('pixel') || blockers.includes('threshold'),
      `Expected pixel threshold gaming blocker`);
  });

  it('gaming blockers include default-state-only', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('default state') || blockers.includes('only render'),
      `Expected default-state-only gaming blocker`);
  });

  it('seed data rule requires deterministic props', () => {
    assert.ok(p().seed_data_rule.toLowerCase().includes('deterministic') ||
      p().seed_data_rule.toLowerCase().includes('no random'),
      `Expected deterministic seed data requirement`);
  });

  it('permitted tools include Playwright or Chromatic', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('playwright') || tools.includes('chromatic'),
      `Expected Playwright/Chromatic in permitted_tools`);
  });
});

describe('Profile content: smoke', () => {
  const p = () => getStrategyProfile('smoke', PROFILES_DIR).profile;

  it('RED condition references service not running', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('not running') || red.includes('not working') || red.includes('non-zero'),
      `Expected service-down reference in red_exit_condition`);
  });

  it('gaming blockers include exit-code-only checks', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('exit code') || blockers.includes('process exit'),
      `Expected exit-code-only gaming blocker`);
  });

  it('assertion rules require meaningful response property', () => {
    assert.ok(p().assertion_rules.toLowerCase().includes('meaningful') ||
      p().assertion_rules.toLowerCase().includes('response property'),
      `Expected meaningful response requirement`);
  });

  it('seed data rule is minimal', () => {
    assert.ok(p().seed_data_rule.toLowerCase().includes('minimal'),
      `Expected minimal seed data for smoke`);
  });

  it('permitted tools include curl or httpie', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('curl') || tools.includes('httpie'),
      `Expected curl/httpie in permitted_tools`);
  });
});

describe('Profile content: integration', () => {
  const p = () => getStrategyProfile('integration', PROFILES_DIR).profile;

  it('RED condition references real infrastructure assertion failure', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('infrastructure') || red.includes('real') || red.includes('assertion'),
      `Expected real-infrastructure reference in red_exit_condition: ${p().red_exit_condition}`);
  });

  it('RED condition explicitly excludes credential/connectivity failures as valid RED', () => {
    const red = p().red_exit_condition.toLowerCase();
    assert.ok(red.includes('credential') || red.includes('unreachable') || red.includes('setup error'),
      `RED condition must distinguish behavioral failures from setup failures`);
  });

  it('GREEN condition references live external infrastructure', () => {
    const green = p().green_exit_condition.toLowerCase();
    assert.ok(green.includes('live') || green.includes('real') || green.includes('external'),
      `Expected live infrastructure reference in green_exit_condition`);
  });

  it('gaming blockers include boundary mocking', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('mock') || blockers.includes('boundary') || blockers.includes('stub'),
      `Expected boundary mocking gaming blocker`);
  });

  it('gaming blockers include credential-absent pass', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('credential') || blockers.includes('absent') || blockers.includes('env var'),
      `Expected credential-absent gaming blocker`);
  });

  it('gaming blockers include CI bypass', () => {
    const blockers = p().gaming_blockers.join(' ').toLowerCase();
    assert.ok(blockers.includes('ci') || blockers.includes('bypass') || blockers.includes('skip'),
      `Expected CI bypass gaming blocker`);
  });

  it('seed data rule requires UUID/random suffixes for isolation', () => {
    const seed = p().seed_data_rule.toLowerCase();
    assert.ok(seed.includes('uuid') || seed.includes('random') || seed.includes('unique'),
      `Expected UUID/random suffix isolation requirement`);
  });

  it('permitted tools include cloud SDKs', () => {
    const tools = p().permitted_tools.join(' ').toLowerCase();
    assert.ok(tools.includes('aws') || tools.includes('sdk') || tools.includes('pg') || tools.includes('postgres'),
      `Expected cloud SDK or database driver in permitted_tools`);
  });
});

// ============================================================================
// Profile consistency — all profiles follow the same contract
// ============================================================================

describe('Profile contract consistency across all 9 strategies', () => {
  const ids = ['unit', 'schema', 'contract', 'fixture', 'integration', 'policy', 'threshold', 'visual', 'smoke'];
  const required = ['strategy_id', 'red_exit_condition', 'green_exit_condition',
    'gaming_blockers', 'assertion_rules', 'seed_data_rule', 'handoff_format', 'permitted_tools'];

  it('every profile has all 8 required fields', () => {
    for (const id of ids) {
      const { profile } = getStrategyProfile(id, PROFILES_DIR);
      for (const field of required) {
        assert.ok(field in profile, `Profile ${id} missing field: ${field}`);
      }
    }
  });

  it('every profile has non-empty gaming_blockers array', () => {
    for (const id of ids) {
      const { profile } = getStrategyProfile(id, PROFILES_DIR);
      assert.ok(Array.isArray(profile.gaming_blockers), `${id} gaming_blockers not array`);
      assert.ok(profile.gaming_blockers.length >= 3, `${id} has fewer than 3 gaming blockers`);
    }
  });

  it('every profile has non-empty permitted_tools array', () => {
    for (const id of ids) {
      const { profile } = getStrategyProfile(id, PROFILES_DIR);
      assert.ok(Array.isArray(profile.permitted_tools), `${id} permitted_tools not array`);
      assert.ok(profile.permitted_tools.length >= 1, `${id} has no permitted tools`);
    }
  });

  it('every profile has distinct red and green conditions', () => {
    for (const id of ids) {
      const { profile } = getStrategyProfile(id, PROFILES_DIR);
      assert.notStrictEqual(profile.red_exit_condition, profile.green_exit_condition,
        `${id} has identical red and green conditions`);
    }
  });

  it('no two profiles share the same red_exit_condition', () => {
    const conditions = new Set();
    for (const id of ids) {
      const { profile } = getStrategyProfile(id, PROFILES_DIR);
      assert.ok(!conditions.has(profile.red_exit_condition),
        `Duplicate red_exit_condition found in ${id}`);
      conditions.add(profile.red_exit_condition);
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
// Cross-cutting: Integration gaming detection on fixture test files
// ============================================================================

describe('Integration gaming detection on fixture content', () => {
  const GAMING_FIXTURE = join(FIXTURES, 'integration-service', 'tests', 's3-client-gaming.fixture.mjs');

  it('INTEGRATION_PATTERNS array has 4 patterns', () => {
    assert.strictEqual(INTEGRATION_PATTERNS.length, 4);
  });

  it('INTEGRATION_PATTERNS contains BOUNDARY_MOCKING, CI_BYPASS, CREDENTIAL_ABSENT_PASS, AGENT_SKIP', () => {
    const ids = INTEGRATION_PATTERNS.map(p => p.id);
    assert.ok(ids.includes('BOUNDARY_MOCKING'), 'Missing BOUNDARY_MOCKING');
    assert.ok(ids.includes('CI_BYPASS'), 'Missing CI_BYPASS');
    assert.ok(ids.includes('CREDENTIAL_ABSENT_PASS'), 'Missing CREDENTIAL_ABSENT_PASS');
    assert.ok(ids.includes('AGENT_SKIP'), 'Missing AGENT_SKIP');
  });

  it('gaming fixture file detects BOUNDARY_MOCKING from jest.mock on @aws-sdk', () => {
    const content = readFileSync(GAMING_FIXTURE, 'utf8');
    const pattern = INTEGRATION_PATTERNS.find(p => p.id === 'BOUNDARY_MOCKING');
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected BOUNDARY_MOCKING violations');
    assert.ok(violations.some(v => v.message.includes('@aws-sdk')),
      `Expected @aws-sdk in violation message, got: ${violations.map(v => v.message).join(', ')}`);
  });

  it('gaming fixture file detects CI_BYPASS from if (process.env.CI)', () => {
    const content = readFileSync(GAMING_FIXTURE, 'utf8');
    const pattern = INTEGRATION_PATTERNS.find(p => p.id === 'CI_BYPASS');
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected CI_BYPASS violations');
  });

  it('gaming fixture file detects CREDENTIAL_ABSENT_PASS (S3Client without env guard)', () => {
    const content = readFileSync(GAMING_FIXTURE, 'utf8');
    const pattern = INTEGRATION_PATTERNS.find(p => p.id === 'CREDENTIAL_ABSENT_PASS');
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected CREDENTIAL_ABSENT_PASS violations');
  });

  it('clean integration test (with env guard, no mocks) produces no integration violations', () => {
    const clean = `
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID is required');
const s3 = new S3Client({ region: process.env.AWS_REGION });
test('uploads a real file', async () => {
  const result = await s3.send(new PutObjectCommand({ Bucket: 'test', Key: 'k', Body: 'v' }));
  assert.ok(result.$metadata.httpStatusCode === 200);
});
`;
    for (const pattern of INTEGRATION_PATTERNS) {
      const violations = pattern.detect(clean);
      assert.strictEqual(violations.length, 0,
        `Pattern ${pattern.id} flagged clean integration test: ${violations.map(v => v.message).join(', ')}`);
    }
  });

  it('nock usage is caught by BOUNDARY_MOCKING', () => {
    const content = `
const nock = require('nock');
nock('https://s3.amazonaws.com').put('/').reply(200);
test('upload', async () => { const r = await upload(); assert.ok(r); });
`;
    const pattern = INTEGRATION_PATTERNS.find(p => p.id === 'BOUNDARY_MOCKING');
    const violations = pattern.detect(content);
    assert.ok(violations.length > 0, 'Expected nock() to trigger BOUNDARY_MOCKING');
  });
});

// ============================================================================
// Cross-cutting: Registry completeness
// ============================================================================

describe('Registry covers all fixture scenarios', () => {
  const expectedStrategies = ['contract', 'fixture', 'integration', 'policy', 'schema', 'smoke', 'threshold', 'unit', 'visual'];

  it('registry has exactly 9 strategies', () => {
    const all = listStrategies();
    assert.strictEqual(all.length, 9);
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
