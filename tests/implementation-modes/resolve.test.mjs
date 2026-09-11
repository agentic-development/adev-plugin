import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { IMPLEMENTATION_MODE_NAMES, DEFAULT_IMPLEMENTATION_MODE, IMPLEMENTATION_MODE_CONFIGS } from '../../lib/implementation-modes/constants.mjs';
import { resolveImplementationMode, resolveImplementationModeFromProjectRoot } from '../../lib/implementation-modes/resolve.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

describe('implementation-mode constants', () => {
  it('declares exactly the 3 modes from the charter', () => {
    assert.deepStrictEqual([...IMPLEMENTATION_MODE_NAMES].sort(), ['agent-default', 'tdd', 'test-required']);
  });

  it('defaults to tdd for full backward compatibility', () => {
    assert.equal(DEFAULT_IMPLEMENTATION_MODE, 'tdd');
  });

  it('every mode config has exactly {dispatch_red, ordering_enforced, coverage_check}', () => {
    for (const name of IMPLEMENTATION_MODE_NAMES) {
      const cfg = IMPLEMENTATION_MODE_CONFIGS.get(name);
      assert.deepStrictEqual(Object.keys(cfg).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
    }
  });
});

describe('resolveImplementationMode', () => {
  it('BEH-1: explicit --mode resolves directly, ignoring manifest.yaml', () => {
    const result = resolveImplementationMode({ implementation_mode: 'agent-default' }, 'tdd');
    assert.equal(result.mode, 'tdd');
    assert.equal(result.source, 'explicit');
  });

  it('BEH-2: no explicit mode, no stored value -> tdd default', () => {
    const result = resolveImplementationMode({}, undefined);
    assert.equal(result.mode, 'tdd');
    assert.equal(result.source, 'default');
  });

  it('BEH-3: no explicit mode, stored value -> resolves stored value', () => {
    const result = resolveImplementationMode({ implementation_mode: 'test-required' }, undefined);
    assert.equal(result.mode, 'test-required');
    assert.equal(result.source, 'manifest');
  });

  it('throws UNKNOWN_IMPLEMENTATION_MODE for a bad explicit mode, listing the 3 options', () => {
    assert.throws(
      () => resolveImplementationMode({}, 'bogus'),
      (err) => err.code === 'UNKNOWN_IMPLEMENTATION_MODE' && /tdd/.test(err.message) && /test-required/.test(err.message) && /agent-default/.test(err.message)
    );
  });

  it('treats an empty-string explicit mode as an invalid name, not as unset', () => {
    assert.throws(
      () => resolveImplementationMode({}, ''),
      (err) => err.code === 'UNKNOWN_IMPLEMENTATION_MODE'
    );
  });

  it('BEH-4: return value config has exactly the 3 keys', () => {
    const result = resolveImplementationMode({}, undefined);
    assert.deepStrictEqual(Object.keys(result.config).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
  });
});

describe('resolveImplementationModeFromProjectRoot', () => {
  it('re-codes a malformed manifest.yaml as MANIFEST_PARSE_ERROR naming the file', (t) => {
    const malformedProjectRoot = createTempDir();
    t.after(() => cleanupTempDir(malformedProjectRoot));
    writeFixture(malformedProjectRoot, '.context-index/manifest.yaml', 'foo: [unclosed\n  bar: baz\n');

    assert.throws(
      () => resolveImplementationModeFromProjectRoot(malformedProjectRoot),
      (err) => err.code === 'MANIFEST_PARSE_ERROR' && /manifest\.yaml/.test(err.message)
    );
  });

  it('passes through an already-coded loadManifest error untouched', () => {
    assert.throws(
      () => resolveImplementationModeFromProjectRoot('/some/nonexistent/path/xyz'),
      (err) => err.code === 'INVALID_PROJECT_ROOT'
    );
  });
});
