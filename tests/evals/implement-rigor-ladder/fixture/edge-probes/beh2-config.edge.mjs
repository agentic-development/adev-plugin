import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, load } from './load.mjs';

const mod = await load('../src/config.mjs');
const INVALID = { code: 'CONFIG_INVALID' };

test('C1: an empty object takes both defaults', () => {
  assert.deepEqual(fn(mod, 'parseConfig')('{}'), { pageSize: 20, currency: 'USD' });
});

test('C2: JSON null throws CONFIG_INVALID', () => {
  assert.throws(() => fn(mod, 'parseConfig')('null'), INVALID);
});

test('C3: a JSON array throws CONFIG_INVALID', () => {
  assert.throws(() => fn(mod, 'parseConfig')('[]'), INVALID);
});

test('C4: invalid JSON throws CONFIG_INVALID', () => {
  assert.throws(() => fn(mod, 'parseConfig')('{'), INVALID);
});

test('C5: pageSize 0 throws CONFIG_INVALID', () => {
  assert.throws(() => fn(mod, 'parseConfig')('{"pageSize":0}'), INVALID);
});

test('C6: a fractional pageSize throws CONFIG_INVALID', () => {
  assert.throws(() => fn(mod, 'parseConfig')('{"pageSize":2.5}'), INVALID);
});

test('C7: a string pageSize throws CONFIG_INVALID', () => {
  assert.throws(() => fn(mod, 'parseConfig')('{"pageSize":"5"}'), INVALID);
});

test('C8: every CONFIG_INVALID throw is an Error', () => {
  const parseConfig = fn(mod, 'parseConfig');
  for (const text of ['{', 'null', '[]', '{"pageSize":0}']) {
    let thrown = null;
    try {
      parseConfig(text);
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof Error, `${text} threw ${String(thrown)}`);
    assert.equal(thrown.code, 'CONFIG_INVALID', text);
  }
});
