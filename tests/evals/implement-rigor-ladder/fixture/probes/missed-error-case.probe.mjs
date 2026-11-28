import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.mjs';

test('JSON null is rejected with CONFIG_INVALID', () => {
  assert.throws(() => parseConfig('null'), { code: 'CONFIG_INVALID' });
});

test('a JSON array is rejected with CONFIG_INVALID', () => {
  assert.throws(() => parseConfig('[]'), { code: 'CONFIG_INVALID' });
});
