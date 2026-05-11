import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeTestConfig } from '../../../lib/domains/merge-test-config.mjs';

describe('mergeTestConfig', () => {
  it('should return test config from overlay', () => {
    const overlay = {
      permitted_tools: ['node:test', 'jest'],
      max_test_file_size: 500,
      skip_patterns: ['describe\\.skip', 'it\\.skip'],
    };
    const result = mergeTestConfig(overlay);
    assert.deepEqual(result.config.permitted_tools, ['node:test', 'jest']);
    assert.equal(result.config.max_test_file_size, 500);
    assert.equal(result.config.skip_patterns.length, 2);
  });

  it('should return empty config with warning when overlay is null', () => {
    const result = mergeTestConfig(null);
    assert.deepEqual(result.config.permitted_tools, []);
    assert.ok(result.warnings.length > 0);
  });

  it('should handle partial overlay', () => {
    const result = mergeTestConfig({ permitted_tools: ['vitest'] });
    assert.deepEqual(result.config.permitted_tools, ['vitest']);
    assert.equal(result.config.max_test_file_size, undefined);
    assert.deepEqual(result.config.skip_patterns, []);
  });

  it('should not mutate input', () => {
    const overlay = Object.freeze({ permitted_tools: Object.freeze(['node:test']) });
    assert.doesNotThrow(() => mergeTestConfig(overlay));
  });
});
