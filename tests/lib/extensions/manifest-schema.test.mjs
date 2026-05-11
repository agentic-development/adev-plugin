import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateExtensionManifest, parseExtensionManifest } from '../../../lib/extensions/manifest-schema.mjs';

describe('extensions/manifest-schema', () => {
  describe('validateExtensionManifest', () => {
    it('accepts a valid minimal manifest', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0' });
      assert.equal(result.valid, true);
      assert.deepStrictEqual(result.manifest.name, 'my-ext');
      assert.deepStrictEqual(result.manifest.version, '1.0.0');
    });

    it('rejects missing name', () => {
      const result = validateExtensionManifest({ version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
      assert.ok(result.message.includes('name'));
    });

    it('rejects missing version', () => {
      const result = validateExtensionManifest({ name: 'my-ext' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
      assert.ok(result.message.includes('version'));
    });

    it('rejects non-kebab-case name', () => {
      const result = validateExtensionManifest({ name: 'MyExt', version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
      assert.ok(result.message.includes('kebab-case'));
    });

    it('rejects name starting with a digit', () => {
      const result = validateExtensionManifest({ name: '1ext', version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('rejects name containing dots', () => {
      const result = validateExtensionManifest({ name: 'my.ext', version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('rejects name containing slashes', () => {
      const result = validateExtensionManifest({ name: 'my/ext', version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('rejects name exceeding 64 characters', () => {
      const result = validateExtensionManifest({ name: 'a'.repeat(65), version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.ok(result.message.includes('64'));
    });

    it('rejects empty name', () => {
      const result = validateExtensionManifest({ name: '', version: '1.0.0' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('rejects invalid semver version', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: 'not-semver' });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('rejects version exceeding 32 characters', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0-' + 'a'.repeat(30) });
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('accepts version with pre-release tag', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0-beta.1' });
      assert.equal(result.valid, true);
    });

    it('ignores unknown fields (forward compat)', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0', future_field: true });
      assert.equal(result.valid, true);
    });

    it('accepts optional description field', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0', description: 'A test extension' });
      assert.equal(result.valid, true);
      assert.equal(result.manifest.description, 'A test extension');
    });

    it('accepts optional author field', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0', author: 'test' });
      assert.equal(result.valid, true);
    });

    it('accepts optional requires object', () => {
      const result = validateExtensionManifest({ name: 'my-ext', version: '1.0.0', requires: { adev: '>=0.20.0' } });
      assert.equal(result.valid, true);
      assert.equal(result.manifest.requires.adev, '>=0.20.0');
    });

    it('accepts optional provides object', () => {
      const result = validateExtensionManifest({
        name: 'my-ext', version: '1.0.0',
        provides: { 'domain-profile': 'my-domain' }
      });
      assert.equal(result.valid, true);
    });

    it('reports missing fields in missingFields array', () => {
      const result = validateExtensionManifest({});
      assert.equal(result.valid, false);
      assert.ok(result.missingFields.includes('name'));
      assert.ok(result.missingFields.includes('version'));
    });

    it('rejects null input', () => {
      const result = validateExtensionManifest(null);
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });

    it('rejects non-object input', () => {
      const result = validateExtensionManifest('string');
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });
  });

  describe('parseExtensionManifest', () => {
    it('parses valid YAML and validates', () => {
      const yaml = 'name: test-ext\nversion: 1.0.0\n';
      const result = parseExtensionManifest(yaml);
      assert.equal(result.valid, true);
      assert.equal(result.manifest.name, 'test-ext');
    });

    it('returns INVALID_SCHEMA for malformed YAML', () => {
      const yaml = ':::not yaml:::';
      const result = parseExtensionManifest(yaml);
      assert.equal(result.valid, false);
      assert.equal(result.code, 'INVALID_SCHEMA');
    });
  });
});
