import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeVerification } from '../../../lib/domains/merge-verification.mjs';

describe('mergeVerification', () => {
  it('should return valid verification config', () => {
    const overlay = { type: 'visual', trigger_patterns: ['*.html'], tool: 'playwright' };
    const result = mergeVerification(overlay);
    assert.equal(result.config.type, 'visual');
    assert.deepEqual(result.config.trigger_patterns, ['*.html']);
  });

  it('should accept output type', () => {
    const result = mergeVerification({ type: 'output', trigger_patterns: ['*.csv'], tool: 'none' });
    assert.equal(result.config.type, 'output');
  });

  it('should accept flow type', () => {
    const result = mergeVerification({ type: 'flow', trigger_patterns: ['*.yaml'], tool: 'none' });
    assert.equal(result.config.type, 'flow');
  });

  it('should reject unknown type with UNKNOWN_VERIFY_TYPE', () => {
    const result = mergeVerification({ type: 'unknown' });
    assert.equal(result.config, null);
    assert.ok(result.warnings.some(w => w.code === 'UNKNOWN_VERIFY_TYPE'));
  });

  it('should reject trigger_patterns with path traversal (INVALID_PATTERN)', () => {
    const overlay = { type: 'visual', trigger_patterns: ['../etc/passwd', '*.html'], tool: 'none' };
    const result = mergeVerification(overlay);
    assert.equal(result.config.trigger_patterns.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'INVALID_PATTERN'));
  });

  it('should reject absolute path trigger_patterns (INVALID_PATTERN)', () => {
    const overlay = { type: 'visual', trigger_patterns: ['/etc/passwd'], tool: 'none' };
    const result = mergeVerification(overlay);
    assert.equal(result.config.trigger_patterns.length, 0);
  });

  it('should flag tool not in active servers with TOOL_UNAVAILABLE', () => {
    const overlay = { type: 'visual', trigger_patterns: ['*.html'], tool: 'playwright' };
    const result = mergeVerification(overlay, new Set(['other-tool']));
    assert.equal(result.config, null);
    assert.ok(result.warnings.some(w => w.code === 'TOOL_UNAVAILABLE'));
  });

  it('should accept tool: none without checking active servers', () => {
    const result = mergeVerification({ type: 'output', trigger_patterns: [], tool: 'none' });
    assert.equal(result.config.tool, 'none');
    assert.equal(result.warnings.length, 0);
  });

  it('should return null config when overlay is null', () => {
    const result = mergeVerification(null);
    assert.equal(result.config, null);
  });

  it('should not mutate input overlay', () => {
    const overlay = Object.freeze({ type: 'output', trigger_patterns: Object.freeze(['*.csv']), tool: 'none' });
    assert.doesNotThrow(() => mergeVerification(overlay));
  });
});
