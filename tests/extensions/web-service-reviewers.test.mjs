import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/profiles/yaml.mjs';
import { parseExtensionManifest } from '../../lib/extensions/manifest-schema.mjs';
import { installExtension } from '../../lib/extensions/install.mjs';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const EXT_DIR = join(REPO_ROOT, 'extensions', 'web-service');

test('adev-extension.yaml is valid and extends software', () => {
  const result = parseExtensionManifest(readFileSync(join(EXT_DIR, 'adev-extension.yaml'), 'utf8'));
  assert.ok(result.valid, JSON.stringify(result));
  assert.equal(result.manifest.provides['domain-profile'].extends, 'software');
});

test('domain/ contains ONLY reviewers.yaml (deliberate partial override, not a full domain package)', () => {
  assert.deepEqual(readdirSync(join(EXT_DIR, 'domain')), ['reviewers.yaml']);
});

test('web-service reviewers.yaml declares six entries: five field-equal to software + security-reviewer', () => {
  const webServiceReviewers = parseYaml(readFileSync(join(EXT_DIR, 'domain', 'reviewers.yaml'), 'utf8')).reviewers;
  assert.equal(webServiceReviewers.length, 6);
  const softwareReviewers = parseYaml(
    readFileSync(join(REPO_ROOT, 'templates/domains/software/reviewers.yaml'), 'utf8')
  ).reviewers.filter((r) => r.enabled !== false);
  const shared = ['referent-integrity', 'wiring-reviewer', 'consistency-analyzer', 'boundary-reviewer', 'termination-reviewer'];
  for (const id of shared) {
    const a = webServiceReviewers.find((r) => r.id === id);
    const b = softwareReviewers.find((r) => r.id === id);
    assert.deepEqual(a, b, `${id} must be field-equal between web-service and software domains`);
  }
  const sec = webServiceReviewers.find((r) => r.id === 'security-reviewer');
  assert.ok(sec, 'web-service must include security-reviewer');
  assert.equal(sec.prompt, 'plugin:review-specs/security-reviewer-prompt.md');
});

test('a scratch project with domain: web-service resolves six reviewers via loadDomainConfig', async () => {
  const tmp = createTempDir();
  try {
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
    await installExtension(EXT_DIR, tmp, { pluginRoot: REPO_ROOT });
    const reviewers = loadDomainConfig('web-service', 'reviewers', tmp, REPO_ROOT);
    assert.equal(reviewers.reviewers.length, 6, 'web-service must resolve six reviewers, not fall back to software\'s three');
  } finally {
    cleanupTempDir(tmp);
  }
});
