import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStrategy,
  listStrategies,
} from '../../../lib/test-strategies/registry.mjs';

const REQUIRED_FIELDS = [
  'id',
  'name',
  'description',
  'redSemantics',
  'greenSemantics',
  'domain',
  'typicalTools',
];

const ALL_IDS = [
  'contract',
  'fixture',
  'integration',
  'policy',
  'schema',
  'smoke',
  'threshold',
  'unit',
  'visual',
];

test('registry has exactly 9 strategies', () => {
  assert.equal(listStrategies().length, 9);
});

test('each strategy has all required fields', () => {
  for (const strategy of listStrategies()) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(strategy, field),
        `strategy "${strategy.id}" is missing field "${field}"`,
      );
    }
  }
});

test('typicalTools is always an array', () => {
  for (const strategy of listStrategies()) {
    assert.ok(
      Array.isArray(strategy.typicalTools),
      `strategy "${strategy.id}" typicalTools is not an array`,
    );
  }
});

test('getStrategy returns correct object for each of the 8 ids', () => {
  for (const id of ALL_IDS) {
    const strategy = getStrategy(id);
    assert.ok(strategy !== null, `getStrategy("${id}") returned null`);
    assert.equal(strategy.id, id);
  }
});

test('getStrategy returns null for unknown id', () => {
  assert.equal(getStrategy('unknown'), null);
  assert.equal(getStrategy('e2e'), null);
});

test('getStrategy returns valid object for integration', () => {
  const s = getStrategy('integration');
  assert.ok(s !== null, 'getStrategy("integration") should not return null');
  assert.equal(s.id, 'integration');
  assert.equal(typeof s.name, 'string');
  assert.equal(typeof s.description, 'string');
  assert.ok(Array.isArray(s.typicalTools));
});

test('getStrategy returns null for empty string', () => {
  assert.equal(getStrategy(''), null);
});

test('getStrategy returns null for undefined', () => {
  assert.equal(getStrategy(undefined), null);
});

test('getStrategy returns null for null', () => {
  assert.equal(getStrategy(null), null);
});

test('listStrategies returns strategies in alphabetical order by id', () => {
  const strategies = listStrategies();
  const ids = strategies.map((s) => s.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted);
});

test('listStrategies returns immutable strategy objects', () => {
  const strategies = listStrategies();
  for (const strategy of strategies) {
    assert.ok(
      Object.isFrozen(strategy),
      `strategy "${strategy.id}" is not frozen`,
    );
  }
});

test('listStrategies typicalTools arrays are immutable', () => {
  const strategies = listStrategies();
  for (const strategy of strategies) {
    assert.ok(
      Object.isFrozen(strategy.typicalTools),
      `strategy "${strategy.id}" typicalTools is not frozen`,
    );
  }
});
