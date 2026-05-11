import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExtensionManifest } from '../../lib/extensions/manifest-schema.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

const EXT_DIR = join(REPO_ROOT, 'extensions', 'data-engineering');
const DOMAIN_DIR = join(EXT_DIR, 'domain');
const TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'domains', 'data-engineering');

const EXPECTED_DOMAIN_FILES = [
  'charter-template.md',
  'spec-template.md',
  'reviewers.yaml',
  'gates.yaml',
  'verification.yaml',
  'gate-config.yaml',
  'test-config.yaml',
];

describe('data-engineering extension package', () => {
  it('extensions/data-engineering/ directory exists', () => {
    assert.ok(existsSync(EXT_DIR), 'extensions/data-engineering/ should exist');
  });

  it('adev-extension.yaml exists and passes parseExtensionManifest() validation', () => {
    const manifestPath = join(EXT_DIR, 'adev-extension.yaml');
    assert.ok(existsSync(manifestPath), 'adev-extension.yaml should exist');

    const content = readFileSync(manifestPath, 'utf8');
    const result = parseExtensionManifest(content);
    assert.ok(result.valid, `Manifest should be valid: ${result.message || ''}`);
    assert.equal(result.manifest.name, 'data-engineering');
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

  it('domain profile files are content-identical to templates/domains/data-engineering/', () => {
    for (const file of EXPECTED_DOMAIN_FILES) {
      const extContent = readFileSync(join(DOMAIN_DIR, file), 'utf8');
      const templateContent = readFileSync(join(TEMPLATE_DIR, file), 'utf8');
      assert.equal(extContent, templateContent,
        `${file} should be content-identical to template source`);
    }
  });

  it('README.md exists', () => {
    const readmePath = join(EXT_DIR, 'README.md');
    assert.ok(existsSync(readmePath), 'README.md should exist');
    const content = readFileSync(readmePath, 'utf8');
    assert.ok(content.includes('data-engineering'), 'README should mention data-engineering');
    assert.ok(content.includes('install'), 'README should mention install');
  });
});
