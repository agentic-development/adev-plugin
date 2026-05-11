import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExtensionManifest } from '../../lib/extensions/manifest-schema.mjs';
import { installExtension, readManifestStamps } from '../../lib/extensions/install.mjs';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

const EXT_DIR = join(REPO_ROOT, 'extensions', 'process-automation');
const DOMAIN_DIR = join(EXT_DIR, 'domain');

const EXPECTED_DOMAIN_FILES = [
  'charter-template.md',
  'spec-template.md',
  'reviewers.yaml',
  'gates.yaml',
  'verification.yaml',
  'gate-config.yaml',
  'test-config.yaml',
];

describe('process-automation extension package', () => {
  it('extensions/process-automation/ directory exists', () => {
    assert.ok(existsSync(EXT_DIR), 'extensions/process-automation/ should exist');
  });

  it('adev-extension.yaml exists and passes parseExtensionManifest() validation', () => {
    const manifestPath = join(EXT_DIR, 'adev-extension.yaml');
    assert.ok(existsSync(manifestPath), 'adev-extension.yaml should exist');

    const content = readFileSync(manifestPath, 'utf8');
    const result = parseExtensionManifest(content);
    assert.ok(result.valid, `Manifest should be valid: ${result.message || ''}`);
    assert.equal(result.manifest.name, 'process-automation');
    assert.ok(result.manifest.version, 'version should be set');
    assert.ok(result.manifest.requires, 'requires should be set');
    assert.ok(result.manifest.requires.adev, 'requires.adev should be set');
    assert.ok(result.manifest.provides, 'provides should be set');
    assert.ok(result.manifest.provides['domain-profile'], 'provides.domain-profile should be set');
    assert.equal(result.manifest.provides['domain-profile'].path, 'domain');
    assert.equal(result.manifest.provides['domain-profile'].extends, 'software');
  });

  it('domain/ contains exactly 7 expected files', () => {
    assert.ok(existsSync(DOMAIN_DIR), 'domain/ subdirectory should exist');
    const files = readdirSync(DOMAIN_DIR).sort();
    assert.deepStrictEqual(files, EXPECTED_DOMAIN_FILES.slice().sort(),
      'domain/ should contain exactly the 7 expected files');
  });

  it('domain profile files are non-empty and readable', () => {
    for (const file of EXPECTED_DOMAIN_FILES) {
      const content = readFileSync(join(DOMAIN_DIR, file), 'utf8');
      assert.ok(content.trim().length > 0, `${file} should not be empty`);
    }
  });

  it('README.md exists', () => {
    const readmePath = join(EXT_DIR, 'README.md');
    assert.ok(existsSync(readmePath), 'README.md should exist');
    const content = readFileSync(readmePath, 'utf8');
    assert.ok(content.includes('process-automation'), 'README should mention process-automation');
    assert.ok(content.includes('install'), 'README should mention install');
  });
});

// ── Task 2: Install and resolution integration tests ──────────────────

describe('process-automation extension install and resolution', () => {
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
    assert.equal(result.name, 'process-automation');
    assert.ok(result.version, 'install should return a version');
    assert.ok(result.filesWritten.length > 0, 'install should write files');
  });

  it('after install, domain.yaml exists with extends: software', async () => {
    await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
    const domainYamlPath = join(tmp, '.context-index', 'domains', 'process-automation', 'domain.yaml');
    assert.ok(existsSync(domainYamlPath), 'domain.yaml should exist after install');
    const content = readFileSync(domainYamlPath, 'utf8');
    assert.ok(content.includes('extends: software'), 'domain.yaml should contain extends: software');
  });

  it('loadDomainConfig returns integration-reviewer after install', async () => {
    await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
    const reviewers = loadDomainConfig('process-automation', 'reviewers', tmp, REPO_ROOT);
    assert.ok(reviewers, 'reviewers config should be loaded');
    assert.ok(reviewers.reviewers, 'reviewers config should have a reviewers key');
    const hasIntegrationReviewer = reviewers.reviewers.some(
      r => r.id === 'integration-reviewer'
    );
    assert.ok(hasIntegrationReviewer, 'reviewers should include integration-reviewer');
  });

  it('re-install is idempotent — no duplicate manifest stamps', async () => {
    await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
    await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
    const stamps = readManifestStamps(tmp);
    const paStamps = stamps.filter(s => s.name === 'process-automation');
    assert.equal(paStamps.length, 1, 'should have exactly one stamp after re-install');
  });
});
