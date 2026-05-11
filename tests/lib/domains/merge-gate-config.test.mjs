import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeGateConfig } from '../../../lib/domains/merge-gate-config.mjs';

describe('mergeGateConfig', () => {
  it('should return file_exclusions and bash_passthrough from overlay', () => {
    const overlay = {
      file_exclusions: ['*.test.*', 'docs/**'],
      bash_passthrough: ['git status', 'npm test'],
    };
    const result = mergeGateConfig(overlay);
    assert.deepEqual(result.config.file_exclusions, ['*.test.*', 'docs/**']);
    assert.deepEqual(result.config.bash_passthrough, ['git status', 'npm test']);
  });

  it('should return empty arrays when overlay is null', () => {
    const result = mergeGateConfig(null);
    assert.deepEqual(result.config.file_exclusions, []);
    assert.deepEqual(result.config.bash_passthrough, []);
  });

  it('should handle missing fields gracefully', () => {
    const result = mergeGateConfig({ file_exclusions: ['*.test.*'] });
    assert.deepEqual(result.config.file_exclusions, ['*.test.*']);
    assert.deepEqual(result.config.bash_passthrough, []);
  });

  it('should not mutate input', () => {
    const overlay = Object.freeze({ file_exclusions: Object.freeze(['*.test.*']), bash_passthrough: Object.freeze(['ls']) });
    assert.doesNotThrow(() => mergeGateConfig(overlay));
  });

  it('should handle empty overlay object', () => {
    const result = mergeGateConfig({});
    assert.deepEqual(result.config.file_exclusions, []);
    assert.deepEqual(result.config.bash_passthrough, []);
  });
});
