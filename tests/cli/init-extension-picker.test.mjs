/**
 * Integration tests for the init-time domain extension picker.
 *
 * Drives lib/cli/domain-extension-picker.mjs::runPicker against:
 *   - the real first-party catalog (templates/extensions-catalog.json)
 *   - the real install pipeline (lib/extensions/install.mjs::installExtension)
 *
 * Covers the acceptance criteria enumerated in
 * .context-index/specs/features/domain-extensions/init-extension-picker.spec.md:
 *   1. software choice writes domain: software, no install
 *   2. skip choice writes domain: software, no install
 *   3. data-engineering install populates .context-index/domains/<name>/ and stamp
 *   4. process-automation install (parity with #3)
 *   5. idempotency: re-running skips picker via already-installed path
 *   6. upgrade parity: same picker, same outcomes
 *   7. catalog-validation drop: malformed catalog entry hidden, no abort
 *   8. error path with credential sanitization: no raw secret in error output
 *   9. workspace-root skip: detectWorkspace returns currentRepoSlug=null
 *  10. banner canonical wording: cli/index.mjs has exactly the canonical format,
 *      no Domain extension: / Selected domain: variants
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from '../helpers.mjs';
import { installExtension, readManifestStamps } from '../../lib/extensions/install.mjs';
import {
  runPicker,
} from '../../lib/cli/domain-extension-picker.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Helper: write a minimal manifest into a temp project root. */
function seedProject(tmp) {
  writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
}

describe('init-extension-picker integration', () => {
  let tmp;
  beforeEach(() => { tmp = createTempDir(); seedProject(tmp); });
  afterEach(() => { cleanupTempDir(tmp); });

  it('software choice writes domain: software and does not install', async () => {
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => '1',
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });
    assert.strictEqual(result.action, 'software');
    assert.strictEqual(result.domainName, 'software');
    const manifest = readFileSync(join(tmp, '.context-index', 'manifest.yaml'), 'utf8');
    assert.match(manifest, /^domain: software$/m);
    assert.ok(!existsSync(join(tmp, '.context-index', 'domains', 'data-engineering')), 'should not install any extension');
  });

  it('skip choice writes domain: software and does not install', async () => {
    // Catalog has 2 entries → options are: 1=software, 2=data-engineering,
    // 3=process-automation, 4=skip
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => '4',
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });
    assert.strictEqual(result.action, 'skip');
    assert.strictEqual(result.domainName, 'software');
    const manifest = readFileSync(join(tmp, '.context-index', 'manifest.yaml'), 'utf8');
    assert.match(manifest, /^domain: software$/m);
  });

  it('data-engineering choice installs the extension and stamps the manifest', async () => {
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => '2',
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });
    assert.strictEqual(result.action, 'install');
    assert.strictEqual(result.domainName, 'data-engineering');

    const manifest = readFileSync(join(tmp, '.context-index', 'manifest.yaml'), 'utf8');
    assert.match(manifest, /^domain: data-engineering$/m);

    // Stamp present in installed_extensions
    const stamps = readManifestStamps(tmp);
    const stamp = stamps.find(s => s.name === 'data-engineering');
    assert.ok(stamp, 'data-engineering should appear in installed_extensions');

    // domain profile directory exists
    assert.ok(
      existsSync(join(tmp, '.context-index', 'domains', 'data-engineering')),
      '.context-index/domains/data-engineering/ should exist after install'
    );
  });

  it('process-automation choice installs the extension and stamps the manifest', async () => {
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => '3',
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });
    assert.strictEqual(result.action, 'install');
    assert.strictEqual(result.domainName, 'process-automation');

    const manifest = readFileSync(join(tmp, '.context-index', 'manifest.yaml'), 'utf8');
    assert.match(manifest, /^domain: process-automation$/m);

    assert.ok(
      existsSync(join(tmp, '.context-index', 'domains', 'process-automation')),
      '.context-index/domains/process-automation/ should exist after install'
    );
  });

  it('idempotency: re-running picker after an install skips silently (already-installed)', async () => {
    // First run: install data-engineering.
    await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => '2',
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });

    // Second run: the picker must skip silently and not call ask.
    let askCalled = false;
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => { askCalled = true; return '1'; },
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });
    assert.strictEqual(result.action, 'already-installed');
    assert.strictEqual(result.domainName, 'data-engineering');
    assert.strictEqual(askCalled, false, 'ask should not be invoked on second run');

    // Stamp count unchanged
    const stamps = readManifestStamps(tmp);
    const matching = stamps.filter(s => s.name === 'data-engineering');
    assert.strictEqual(matching.length, 1, 'no duplicate stamp on re-run');
  });

  it('upgrade parity: same picker behaviour for software choice', async () => {
    // upgrade flow calls the same runPicker — verify by running again on a
    // fresh project to confirm semantics match.
    const tmp2 = createTempDir();
    try {
      seedProject(tmp2);
      const result = await runPicker({
        projectRoot: tmp2,
        pluginRoot: PLUGIN_ROOT,
        ask: async () => '1',
        installFn: installExtension,
        readStamps: readManifestStamps,
        detectWorkspace: () => null,
      });
      assert.strictEqual(result.action, 'software');
      assert.strictEqual(result.domainName, 'software');
    } finally {
      cleanupTempDir(tmp2);
    }
  });

  it('catalog-validation drop: invalid entries are hidden and do not abort the picker', async () => {
    // Use a custom temp pluginRoot with a deliberately malformed catalog
    const tmpPlugin = createTempDir();
    try {
      mkdirSync(join(tmpPlugin, 'templates'), { recursive: true });
      mkdirSync(join(tmpPlugin, 'extensions', 'good'), { recursive: true });
      // Real good entry + invalid name + missing path
      writeFileSync(
        join(tmpPlugin, 'templates', 'extensions-catalog.json'),
        JSON.stringify({
          version: 1,
          entries: [
            { name: 'good', label: 'Good', description: 'd', path: 'extensions/good' },
            { name: 'Bad-Name', label: 'B', description: 'd', path: 'extensions/good' },
            { name: 'missing-on-disk', label: 'M', description: 'd', path: 'extensions/does-not-exist' },
          ],
        })
      );

      // Pick option 1 (software) — we only verify the picker emits advisories
      // for the dropped entries and proceeds without crashing.
      const result = await runPicker({
        projectRoot: tmp,
        pluginRoot: tmpPlugin,
        ask: async () => '1',
        installFn: installExtension,
        readStamps: readManifestStamps,
        detectWorkspace: () => null,
      });
      assert.strictEqual(result.action, 'software');
      assert.ok(Array.isArray(result.advisories));
      const codes = result.advisories.map(a => a.code);
      assert.ok(codes.includes('PICKER_CATALOG_ENTRY_MISSING'), 'should advise on dropped entries');
      const names = result.advisories.map(a => a.name);
      assert.ok(names.includes('Bad-Name'));
      assert.ok(names.includes('missing-on-disk'));
    } finally {
      cleanupTempDir(tmpPlugin);
    }
  });

  it('error path: install failure does not write domain: and credentials are stripped from the error', async () => {
    let observedErr = null;
    const fakeInstall = async () => {
      const e = new Error('clone failed for https://user:secret@example.com/repo.git');
      e.code = 'SOURCE_RESOLUTION';
      throw e;
    };
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => '2',  // data-engineering
      installFn: fakeInstall,
      readStamps: readManifestStamps,
      detectWorkspace: () => null,
    });
    assert.strictEqual(result.action, 'install-failed');
    assert.ok(result.installError, 'installError should be present');
    assert.strictEqual(result.installError.code, 'SOURCE_RESOLUTION');
    assert.ok(
      !result.installError.message.includes('secret'),
      `error message must not contain raw credential: ${result.installError.message}`
    );
    // No domain: written on failure
    const manifest = readFileSync(join(tmp, '.context-index', 'manifest.yaml'), 'utf8');
    assert.ok(!/^domain:/m.test(manifest), 'no domain: should be written on install failure');
  });

  it('workspace-root skip: picker is skipped silently when detectWorkspace.currentRepoSlug is null', async () => {
    let askCalled = false;
    const result = await runPicker({
      projectRoot: tmp,
      pluginRoot: PLUGIN_ROOT,
      ask: async () => { askCalled = true; return '1'; },
      installFn: installExtension,
      readStamps: readManifestStamps,
      detectWorkspace: () => ({ root: tmp, config: {}, currentRepoSlug: null }),
    });
    assert.strictEqual(result.action, 'skipped-workspace-root');
    assert.strictEqual(askCalled, false, 'ask must NOT be called at workspace root');
    const manifest = readFileSync(join(tmp, '.context-index', 'manifest.yaml'), 'utf8');
    assert.ok(!/^domain:/m.test(manifest), 'no manifest write at workspace root');
  });

  it('banner canonical wording: cli/index.mjs prints exactly Domain: <name>, no variants', () => {
    const cli = readFileSync(join(PLUGIN_ROOT, 'cli', 'index.mjs'), 'utf8');
    // Canonical wording present
    assert.match(cli, /`Domain: \$\{[^}]+\}`/);
    // No prohibited variants
    assert.doesNotMatch(cli, /Domain extension:/, 'must not use "Domain extension:" variant');
    assert.doesNotMatch(cli, /Selected domain:/, 'must not use "Selected domain:" variant');
  });
});
