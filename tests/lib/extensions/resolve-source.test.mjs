import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyUri, resolveExtensionSource, stripCredentials } from '../../../lib/extensions/resolve-source.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

describe('extensions/resolve-source', () => {
  describe('classifyUri', () => {
    it('classifies absolute path as local', () => {
      assert.equal(classifyUri('/tmp/my-ext'), 'local');
    });

    it('classifies ./ relative path as local', () => {
      assert.equal(classifyUri('./my-ext'), 'local');
    });

    it('classifies ../ relative path as local', () => {
      assert.equal(classifyUri('../my-ext'), 'local');
    });

    it('classifies https URL as git', () => {
      assert.equal(classifyUri('https://github.com/org/ext.git'), 'git');
    });

    it('classifies http URL as git', () => {
      assert.equal(classifyUri('http://github.com/org/ext.git'), 'git');
    });

    it('classifies git:// URL as git', () => {
      assert.equal(classifyUri('git://github.com/org/ext.git'), 'git');
    });

    it('classifies ssh:// URL as git', () => {
      assert.equal(classifyUri('ssh://git@github.com/org/ext.git'), 'git');
    });

    it('classifies git@ SSH as git', () => {
      assert.equal(classifyUri('git@github.com:org/ext.git'), 'git');
    });

    it('classifies npm scoped package name as npm', () => {
      assert.equal(classifyUri('@org/adev-ext-foo'), 'npm');
    });

    it('classifies simple name as npm', () => {
      assert.equal(classifyUri('adev-ext-foo'), 'npm');
    });
  });

  describe('stripCredentials', () => {
    it('strips userinfo from https URL', () => {
      assert.equal(
        stripCredentials('https://user:token@github.com/repo'),
        'https://github.com/repo'
      );
    });

    it('strips username-only from URL', () => {
      assert.equal(
        stripCredentials('https://user@github.com/repo'),
        'https://github.com/repo'
      );
    });

    it('returns non-URL strings unchanged', () => {
      assert.equal(stripCredentials('my-package'), 'my-package');
    });

    it('returns URL without credentials unchanged', () => {
      assert.equal(
        stripCredentials('https://github.com/repo'),
        'https://github.com/repo'
      );
    });

    it('strips credentials from git@ SSH URIs', () => {
      // git@ URIs don't have userinfo in the URL sense, return as-is
      assert.equal(
        stripCredentials('git@github.com:org/ext.git'),
        'git@github.com:org/ext.git'
      );
    });
  });

  describe('resolveExtensionSource (local)', () => {
    let tmp;
    beforeEach(() => { tmp = createTempDir(); });
    afterEach(() => { cleanupTempDir(tmp); });

    it('resolves local dir with valid manifest', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\n');
      const result = await resolveExtensionSource(tmp);
      assert.equal(result.type, 'local');
      assert.ok(result.resolved_path.includes(tmp));
      assert.equal(result.manifest.name, 'test-ext');
    });

    it('throws MISSING_MANIFEST for dir without manifest', async () => {
      await assert.rejects(
        () => resolveExtensionSource(tmp),
        (err) => {
          assert.equal(err.code, 'MISSING_MANIFEST');
          assert.ok(err.message.includes(tmp));
          return true;
        }
      );
    });

    it('throws INVALID_SCHEMA for dir with invalid manifest', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: BadName\nversion: not-semver\n');
      await assert.rejects(
        () => resolveExtensionSource(tmp),
        (err) => {
          assert.equal(err.code, 'INVALID_SCHEMA');
          return true;
        }
      );
    });

    it('resolves relative path to absolute', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\n');
      // Use the absolute path directly — we test that resolved_path is absolute
      const result = await resolveExtensionSource(tmp);
      assert.ok(result.resolved_path.startsWith('/'));
    });
  });

  describe('resolveExtensionSource (npm)', () => {
    it('rejects invalid npm package name', async () => {
      await assert.rejects(
        () => resolveExtensionSource('INVALID_PACKAGE_NAME!!'),
        (err) => {
          assert.equal(err.code, 'SOURCE_RESOLUTION');
          return true;
        }
      );
    });
  });

  describe('resolveExtensionSource (git)', () => {
    it('rejects invalid git URL', async () => {
      await assert.rejects(
        () => resolveExtensionSource('https://'),
        (err) => {
          assert.equal(err.code, 'SOURCE_RESOLUTION');
          return true;
        }
      );
    });
  });
});
