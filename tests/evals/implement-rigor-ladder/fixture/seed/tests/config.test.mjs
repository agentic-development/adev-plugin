import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.mjs';

test('parseConfig applies defaults', () => {
  assert.deepEqual(parseConfig('{}'), { pageSize: 20, currency: 'USD' });
});

test('parseConfig rejects invalid JSON with CONFIG_INVALID', () => {
  assert.throws(() => parseConfig('{'), { code: 'CONFIG_INVALID' });
});
