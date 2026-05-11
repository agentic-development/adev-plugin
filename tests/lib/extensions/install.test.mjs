import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeManifestStamp, readManifestStamps, listExtensions } from '../../../lib/extensions/install.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

describe('extensions/install', () => {
  let tmp;
  beforeEach(() => {
    tmp = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => { cleanupTempDir(tmp); });

  describe('writeManifestStamp', () => {
    it('writes a new stamp to installed_extensions', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'https://example.com' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps.length, 1);
      assert.equal(stamps[0].name, 'my-ext');
      assert.equal(stamps[0].version, '1.0.0');
      assert.ok(stamps[0].installed_date);
      assert.equal(stamps[0].source_uri, 'https://example.com');
    });

    it('updates existing stamp on re-install (idempotent)', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
      writeManifestStamp(tmp, { name: 'my-ext', version: '2.0.0', source_uri: 'local' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps.length, 1);
      assert.equal(stamps[0].version, '2.0.0');
    });

    it('preserves other extensions on update', () => {
      writeManifestStamp(tmp, { name: 'ext-a', version: '1.0.0', source_uri: 'local' });
      writeManifestStamp(tmp, { name: 'ext-b', version: '1.0.0', source_uri: 'local' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps.length, 2);
      const names = stamps.map(s => s.name).sort();
      assert.deepStrictEqual(names, ['ext-a', 'ext-b']);
    });

    it('strips credentials from source_uri', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'https://user:token@github.com/repo' });
      const stamps = readManifestStamps(tmp);
      assert.equal(stamps[0].source_uri, 'https://github.com/repo');
    });

    it('writes valid ISO 8601 installed_date', () => {
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
      const stamps = readManifestStamps(tmp);
      const date = new Date(stamps[0].installed_date);
      assert.ok(!isNaN(date.getTime()), 'installed_date should be valid ISO 8601');
    });
  });

  describe('readManifestStamps', () => {
    it('returns empty array when no installed_extensions', () => {
      const stamps = readManifestStamps(tmp);
      assert.deepStrictEqual(stamps, []);
    });

    it('returns empty array when manifest has no installed_extensions key', () => {
      writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
      const stamps = readManifestStamps(tmp);
      assert.deepStrictEqual(stamps, []);
    });
  });

  describe('listExtensions', () => {
    it('returns stamps from manifest object', () => {
      const manifest = {
        installed_extensions: [
          { name: 'ext-a', version: '1.0.0', installed_date: '2026-01-01T00:00:00.000Z', source_uri: 'local' },
        ],
      };
      const result = listExtensions(manifest);
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'ext-a');
    });

    it('returns empty array when no installed_extensions', () => {
      const result = listExtensions({});
      assert.deepStrictEqual(result, []);
    });

    it('returns empty array for null manifest', () => {
      const result = listExtensions(null);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('manifest.yaml content preservation', () => {
    it('preserves existing manifest content after stamp write', () => {
      writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: my-project\n  version: 1.0.0\n');
      writeManifestStamp(tmp, { name: 'my-ext', version: '1.0.0', source_uri: 'local' });
      const content = readFileSync(join(tmp, '.context-index/manifest.yaml'), 'utf8');
      assert.ok(content.includes('name: my-project'));
      assert.ok(content.includes('installed_extensions:'));
    });
  });
});
