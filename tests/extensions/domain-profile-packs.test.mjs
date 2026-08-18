/**
 * Domain-profile extension packages — one table-driven suite.
 *
 * Replaces tests/extensions/data-engineering.test.mjs and
 * tests/extensions/process-automation.test.mjs, which were structurally
 * identical: a per-test-file coverage matrix found them executing 3,300
 * byte-identical first-party lines, and a structural diff showed they differed
 * only in the pack name and the reviewer id each expects.
 *
 * Adding a pack is now a row in PACKS rather than a new ~120-line file.
 *
 * extensions/example-validation-check is deliberately NOT here — it ships a
 * validation check, not a domain profile, so it has no domain/ directory or
 * reviewers.yaml and none of these assertions apply to it.
 *
 * @module tests/extensions/domain-profile-packs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExtensionManifest } from '../../lib/extensions/manifest-schema.mjs';
import { installExtension, readManifestStamps } from '../../lib/extensions/install.mjs';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

/** Every bundled domain-profile pack, and the one reviewer that identifies it. */
const PACKS = [
  { name: 'data-engineering', extendsProfile: 'software', reviewer: 'data-contract-reviewer' },
  { name: 'process-automation', extendsProfile: 'software', reviewer: 'integration-reviewer' },
];

const EXPECTED_DOMAIN_FILES = [
  'charter-template.md',
  'spec-template.md',
  'reviewers.yaml',
  'gates.yaml',
  'verification.yaml',
  'gate-config.yaml',
  'test-config.yaml',
];

for (const pack of PACKS) {
  const EXT_DIR = join(REPO_ROOT, 'extensions', pack.name);
  const DOMAIN_DIR = join(EXT_DIR, 'domain');

  describe(`${pack.name} extension package`, () => {
    it('extension directory exists', () => {
      assert.ok(existsSync(EXT_DIR), `extensions/${pack.name}/ should exist`);
    });

    it('adev-extension.yaml exists and passes parseExtensionManifest() validation', () => {
      const manifestPath = join(EXT_DIR, 'adev-extension.yaml');
      assert.ok(existsSync(manifestPath), 'adev-extension.yaml should exist');

      const result = parseExtensionManifest(readFileSync(manifestPath, 'utf8'));
      assert.ok(result.valid, `Manifest should be valid: ${result.message || ''}`);
      assert.equal(result.manifest.name, pack.name);
      assert.ok(result.manifest.version, 'version should be set');
      assert.ok(result.manifest.requires, 'requires should be set');
      assert.ok(result.manifest.requires.adev, 'requires.adev should be set');
      assert.ok(result.manifest.provides, 'provides should be set');
      assert.ok(
        result.manifest.provides['domain-profile'],
        'provides.domain-profile should be set',
      );
      assert.equal(result.manifest.provides['domain-profile'].path, 'domain');
      assert.equal(result.manifest.provides['domain-profile'].extends, pack.extendsProfile);
    });

    it('domain/ contains exactly the expected files', () => {
      assert.ok(existsSync(DOMAIN_DIR), 'domain/ subdirectory should exist');
      assert.deepStrictEqual(
        readdirSync(DOMAIN_DIR).sort(),
        EXPECTED_DOMAIN_FILES.slice().sort(),
        `domain/ should contain exactly the ${EXPECTED_DOMAIN_FILES.length} expected files`,
      );
    });

    it('domain profile files are non-empty and readable', () => {
      for (const file of EXPECTED_DOMAIN_FILES) {
        const content = readFileSync(join(DOMAIN_DIR, file), 'utf8');
        assert.ok(content.trim().length > 0, `${file} should not be empty`);
      }
    });

    it('README.md exists and documents the pack', () => {
      const readmePath = join(EXT_DIR, 'README.md');
      assert.ok(existsSync(readmePath), 'README.md should exist');
      const content = readFileSync(readmePath, 'utf8');
      assert.ok(content.includes(pack.name), `README should mention ${pack.name}`);
      assert.ok(content.includes('install'), 'README should mention install');
    });
  });

  describe(`${pack.name} extension install and resolution`, () => {
    let tmp;

    beforeEach(() => {
      tmp = createTempDir();
      writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test-project\n');
    });

    afterEach(() => {
      cleanupTempDir(tmp);
    });

    it('installExtension succeeds from local extension path', async () => {
      const result = await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
      assert.equal(result.name, pack.name);
      assert.ok(result.version, 'install should return a version');
      assert.ok(result.filesWritten.length > 0, 'install should write files');
    });

    it('after install, domain.yaml records the profile it extends', async () => {
      await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
      const domainYamlPath = join(tmp, '.context-index', 'domains', pack.name, 'domain.yaml');
      assert.ok(existsSync(domainYamlPath), 'domain.yaml should exist after install');
      const content = readFileSync(domainYamlPath, 'utf8');
      assert.ok(
        content.includes(`extends: ${pack.extendsProfile}`),
        `domain.yaml should contain extends: ${pack.extendsProfile}`,
      );
    });

    it('loadDomainConfig resolves the pack reviewer after install', async () => {
      await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
      const reviewers = loadDomainConfig(pack.name, 'reviewers', tmp, REPO_ROOT);
      assert.ok(reviewers, 'reviewers config should be loaded');
      assert.ok(reviewers.reviewers, 'reviewers config should have a reviewers key');
      assert.ok(
        reviewers.reviewers.some((r) => r.id === pack.reviewer),
        `reviewers should include ${pack.reviewer}`,
      );
    });

    it('re-install is idempotent — no duplicate manifest stamps', async () => {
      await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
      await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
      const stamps = readManifestStamps(tmp).filter((s) => s.name === pack.name);
      assert.equal(stamps.length, 1, 'should have exactly one stamp after re-install');
    });
  });
}
