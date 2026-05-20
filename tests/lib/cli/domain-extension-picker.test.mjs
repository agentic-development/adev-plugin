/**
 * Unit tests for lib/cli/domain-extension-picker.mjs
 *
 * Covers: catalog file shape, picker error codes, loadCatalog, validateEntries.
 * Picker prompt + dispatch + workspace guard + manifest writer are added in
 * tasks 4-6 (same test file extended incrementally).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

describe('catalog file shape', () => {
  it('templates/extensions-catalog.json exists and parses', () => {
    const catalogPath = join(PLUGIN_ROOT, 'templates', 'extensions-catalog.json');
    assert.ok(existsSync(catalogPath), 'catalog file should exist');
    const raw = readFileSync(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.version, 1);
    assert.ok(Array.isArray(parsed.entries));
  });

  it('has entries for data-engineering and process-automation that resolve to existing directories', () => {
    const catalogPath = join(PLUGIN_ROOT, 'templates', 'extensions-catalog.json');
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const names = parsed.entries.map(e => e.name);
    assert.ok(names.includes('data-engineering'));
    assert.ok(names.includes('process-automation'));

    for (const entry of parsed.entries) {
      const resolved = resolve(PLUGIN_ROOT, entry.path);
      assert.ok(existsSync(resolved), `entry "${entry.name}" path "${entry.path}" should resolve to an existing directory`);
    }
  });
});

describe('picker error codes', () => {
  it('exports the four PICKER_* codes with stable string values', async () => {
    const {
      PICKER_CATALOG_ENTRY_MISSING,
      PICKER_USER_ABORTED,
      PICKER_MANIFEST_WRITE_FAILED,
      PICKER_CATALOG_PARSE_FAILED,
    } = await import('../../../lib/cli/picker-errors.mjs');

    assert.strictEqual(PICKER_CATALOG_ENTRY_MISSING, 'PICKER_CATALOG_ENTRY_MISSING');
    assert.strictEqual(PICKER_USER_ABORTED, 'PICKER_USER_ABORTED');
    assert.strictEqual(PICKER_MANIFEST_WRITE_FAILED, 'PICKER_MANIFEST_WRITE_FAILED');
    assert.strictEqual(PICKER_CATALOG_PARSE_FAILED, 'PICKER_CATALOG_PARSE_FAILED');
  });
});

describe('loadCatalog', () => {
  it('reads and parses templates/extensions-catalog.json from the real plugin root', async () => {
    const { loadCatalog } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = loadCatalog(PLUGIN_ROOT);
    assert.strictEqual(catalog.version, 1);
    assert.ok(Array.isArray(catalog.entries));
    assert.ok(catalog.entries.some(e => e.name === 'data-engineering'));
  });

  it('throws PICKER_CATALOG_PARSE_FAILED when the catalog file is missing', async () => {
    const { loadCatalog } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const tmp = mkdtempSync(join(tmpdir(), 'adev-picker-'));
    try {
      mkdirSync(join(tmp, 'templates'), { recursive: true });
      // no catalog file
      assert.throws(
        () => loadCatalog(tmp),
        (err) => err.code === 'PICKER_CATALOG_PARSE_FAILED'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws PICKER_CATALOG_PARSE_FAILED when the catalog file is malformed JSON', async () => {
    const { loadCatalog } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const tmp = mkdtempSync(join(tmpdir(), 'adev-picker-'));
    try {
      mkdirSync(join(tmp, 'templates'), { recursive: true });
      writeFileSync(join(tmp, 'templates', 'extensions-catalog.json'), '{ this is not json');
      assert.throws(
        () => loadCatalog(tmp),
        (err) => err.code === 'PICKER_CATALOG_PARSE_FAILED'
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('validateEntries', () => {
  let tmpPluginRoot;
  beforeEach(() => {
    tmpPluginRoot = mkdtempSync(join(tmpdir(), 'adev-picker-vt-'));
    // Create a real extension directory so "exists on disk" passes for the happy path.
    mkdirSync(join(tmpPluginRoot, 'extensions', 'good'), { recursive: true });
  });
  afterEach(() => {
    rmSync(tmpPluginRoot, { recursive: true, force: true });
  });

  it('returns a valid entry when name, path, and on-disk all pass', async () => {
    const { validateEntries } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = {
      version: 1,
      entries: [{ name: 'good', label: 'Good', description: 'x', path: 'extensions/good' }],
    };
    const { valid, advisories } = validateEntries(catalog, tmpPluginRoot);
    assert.strictEqual(valid.length, 1);
    assert.strictEqual(valid[0].name, 'good');
    assert.strictEqual(advisories.length, 0);
    // Resolved path is attached for downstream dispatch
    assert.strictEqual(valid[0].resolvedPath, resolve(tmpPluginRoot, 'extensions/good'));
  });

  it('drops entries whose name fails the [a-z][a-z0-9-]* regex', async () => {
    const { validateEntries } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = {
      version: 1,
      entries: [
        { name: 'Bad-Name', label: 'x', description: 'x', path: 'extensions/good' },
        { name: '1starts-with-digit', label: 'x', description: 'x', path: 'extensions/good' },
        { name: 'has spaces', label: 'x', description: 'x', path: 'extensions/good' },
      ],
    };
    const { valid, advisories } = validateEntries(catalog, tmpPluginRoot);
    assert.strictEqual(valid.length, 0);
    assert.strictEqual(advisories.length, 3);
    for (const adv of advisories) {
      assert.strictEqual(adv.code, 'PICKER_CATALOG_ENTRY_MISSING');
    }
  });

  it('drops entries whose resolved path escapes the plugin root (path-traversal)', async () => {
    const { validateEntries } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = {
      version: 1,
      entries: [{ name: 'evil', label: 'x', description: 'x', path: '../../../etc/passwd' }],
    };
    const { valid, advisories } = validateEntries(catalog, tmpPluginRoot);
    assert.strictEqual(valid.length, 0);
    assert.strictEqual(advisories.length, 1);
    assert.strictEqual(advisories[0].code, 'PICKER_CATALOG_ENTRY_MISSING');
    assert.match(advisories[0].reason, /traversal|escape/i);
  });

  it('drops entries whose resolved path does not exist on disk', async () => {
    const { validateEntries } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = {
      version: 1,
      entries: [{ name: 'missing', label: 'x', description: 'x', path: 'extensions/does-not-exist' }],
    };
    const { valid, advisories } = validateEntries(catalog, tmpPluginRoot);
    assert.strictEqual(valid.length, 0);
    assert.strictEqual(advisories.length, 1);
    assert.strictEqual(advisories[0].code, 'PICKER_CATALOG_ENTRY_MISSING');
    assert.match(advisories[0].reason, /exist|disk|not found/i);
  });

  it('attaches a name field to each advisory', async () => {
    const { validateEntries } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const catalog = {
      version: 1,
      entries: [{ name: 'missing', label: 'x', description: 'x', path: 'extensions/does-not-exist' }],
    };
    const { advisories } = validateEntries(catalog, tmpPluginRoot);
    assert.strictEqual(advisories[0].name, 'missing');
  });
});

// ---------------------------------------------------------------------------
// Task 4: runPicker + dispatchInstall
// ---------------------------------------------------------------------------

describe('runPicker', () => {
  let tmpPluginRoot;
  let tmpProjectRoot;

  beforeEach(() => {
    tmpPluginRoot = mkdtempSync(join(tmpdir(), 'adev-picker-pr-'));
    tmpProjectRoot = mkdtempSync(join(tmpdir(), 'adev-picker-proj-'));
    mkdirSync(join(tmpPluginRoot, 'templates'), { recursive: true });
    mkdirSync(join(tmpPluginRoot, 'extensions', 'data-engineering'), { recursive: true });
    mkdirSync(join(tmpPluginRoot, 'extensions', 'process-automation'), { recursive: true });
    writeFileSync(
      join(tmpPluginRoot, 'templates', 'extensions-catalog.json'),
      JSON.stringify({
        version: 1,
        entries: [
          { name: 'data-engineering', label: 'Data Engineering', description: 'd', path: 'extensions/data-engineering' },
          { name: 'process-automation', label: 'Process Automation', description: 'd', path: 'extensions/process-automation' },
        ],
      })
    );
    mkdirSync(join(tmpProjectRoot, '.context-index'), { recursive: true });
    writeFileSync(join(tmpProjectRoot, '.context-index', 'manifest.yaml'), 'project:\n  name: tp\n');
  });

  afterEach(() => {
    rmSync(tmpPluginRoot, { recursive: true, force: true });
    rmSync(tmpProjectRoot, { recursive: true, force: true });
  });

  it('returns action "software" when user selects software (choice 1)', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const ask = async () => '1';
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [];
    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
    });
    assert.strictEqual(result.action, 'software');
    assert.strictEqual(result.domainName, 'software');
    assert.strictEqual(result.sourcePath, null);
  });

  it('returns action "skip" → domainName "software" when user selects last option (skip)', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    // Catalog has 2 valid entries: software=1, data-engineering=2, process-automation=3, skip=4.
    const ask = async () => '4';
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [];
    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
    });
    assert.strictEqual(result.action, 'skip');
    assert.strictEqual(result.domainName, 'software');
    assert.strictEqual(result.sourcePath, null);
  });

  it('returns action "install" with resolved sourcePath when user selects data-engineering (choice 2)', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    let installCalledWith = null;
    const ask = async () => '2';
    const installFn = async (path, root, opts) => {
      installCalledWith = { path, root, opts };
      return { name: 'data-engineering', version: '0.1.0', filesWritten: [], mergesApplied: [], warnings: [] };
    };
    const readStamps = () => [];
    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
    });
    assert.strictEqual(result.action, 'install');
    assert.strictEqual(result.domainName, 'data-engineering');
    assert.strictEqual(result.sourcePath, resolve(tmpPluginRoot, 'extensions/data-engineering'));
    assert.ok(installCalledWith !== null, 'installFn should have been called');
    assert.strictEqual(installCalledWith.path, resolve(tmpPluginRoot, 'extensions/data-engineering'));
  });

  it('throws PICKER_USER_ABORTED when ask returns null/undefined (Ctrl+C / EOF)', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const ask = async () => null;
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [];
    await assert.rejects(
      runPicker({ projectRoot: tmpProjectRoot, pluginRoot: tmpPluginRoot, ask, installFn, readStamps }),
      (err) => err.code === 'PICKER_USER_ABORTED'
    );
  });

  it('returns action "already-installed" when readStamps reports a domain-profile extension', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    let askCalled = false;
    const ask = async () => { askCalled = true; return '1'; };
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [
      { name: 'data-engineering', version: '0.1.0', source_uri: '/x', kind: 'domain-profile' },
    ];
    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
    });
    assert.strictEqual(result.action, 'already-installed');
    assert.strictEqual(result.domainName, 'data-engineering');
    assert.strictEqual(askCalled, false, 'ask should NOT be called when a domain-profile is already installed');
  });
});

describe('dispatchInstall', () => {
  it('calls installFn with the resolved source path and returns installed:true on success', async () => {
    const { dispatchInstall } = await import('../../../lib/cli/domain-extension-picker.mjs');
    let calledWith = null;
    const installFn = async (path, root, opts) => {
      calledWith = { path, root, opts };
      return { name: 'data-engineering', version: '0.1.0', filesWritten: [] };
    };
    const entry = { name: 'data-engineering', resolvedPath: '/tmp/fake/data-engineering' };
    const result = await dispatchInstall(entry, '/tmp/proj', { installFn });
    assert.strictEqual(result.installed, true);
    assert.strictEqual(calledWith.path, '/tmp/fake/data-engineering');
    assert.strictEqual(calledWith.root, '/tmp/proj');
  });

  it('returns installed:false and the sanitized error on installFn throw', async () => {
    const { dispatchInstall } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const installFn = async () => {
      const e = new Error('clone failed for https://user:secret@example.com/repo.git');
      e.code = 'SOURCE_RESOLUTION';
      throw e;
    };
    const entry = { name: 'data-engineering', resolvedPath: 'https://user:secret@example.com/repo.git' };
    const result = await dispatchInstall(entry, '/tmp/proj', { installFn });
    assert.strictEqual(result.installed, false);
    assert.ok(result.err, 'err should be present');
    assert.strictEqual(result.err.code, 'SOURCE_RESOLUTION');
    assert.ok(
      !result.err.message.includes('secret'),
      `error message should not include raw credential 'secret', got: ${result.err.message}`
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5: workspace-mode guard
// ---------------------------------------------------------------------------

describe('workspace mode', () => {
  let tmpPluginRoot;
  let tmpProjectRoot;

  beforeEach(() => {
    tmpPluginRoot = mkdtempSync(join(tmpdir(), 'adev-picker-ws-'));
    tmpProjectRoot = mkdtempSync(join(tmpdir(), 'adev-picker-ws-proj-'));
    mkdirSync(join(tmpPluginRoot, 'templates'), { recursive: true });
    mkdirSync(join(tmpPluginRoot, 'extensions', 'data-engineering'), { recursive: true });
    writeFileSync(
      join(tmpPluginRoot, 'templates', 'extensions-catalog.json'),
      JSON.stringify({
        version: 1,
        entries: [
          { name: 'data-engineering', label: 'Data Engineering', description: 'd', path: 'extensions/data-engineering' },
        ],
      })
    );
    mkdirSync(join(tmpProjectRoot, '.context-index'), { recursive: true });
    writeFileSync(join(tmpProjectRoot, '.context-index', 'manifest.yaml'), 'project:\n  name: tp\n');
  });

  afterEach(() => {
    rmSync(tmpPluginRoot, { recursive: true, force: true });
    rmSync(tmpProjectRoot, { recursive: true, force: true });
  });

  it('skips picker silently with action "skipped-workspace-root" when invoked at workspace root', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    // detectWorkspace returns non-null with currentRepoSlug=null → workspace root
    const detectWorkspace = () => ({ root: tmpProjectRoot, config: {}, currentRepoSlug: null });
    let askCalled = false;
    const ask = async () => { askCalled = true; return '1'; };
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [];

    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
      detectWorkspace,
    });
    assert.strictEqual(result.action, 'skipped-workspace-root');
    assert.strictEqual(askCalled, false, 'prompt should NOT be issued at workspace root');
    assert.strictEqual(result.sourcePath, null);
  });

  it('proceeds normally when invoked inside a registered repo (currentRepoSlug set)', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const detectWorkspace = () => ({ root: '/some/ws', config: {}, currentRepoSlug: 'repo-a' });
    const ask = async () => '1';  // software
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [];

    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
      detectWorkspace,
    });
    assert.strictEqual(result.action, 'software');
  });

  it('proceeds normally when detectWorkspace returns null (single-repo mode)', async () => {
    const { runPicker } = await import('../../../lib/cli/domain-extension-picker.mjs');
    const detectWorkspace = () => null;
    const ask = async () => '1';
    const installFn = async () => { throw new Error('should not be called'); };
    const readStamps = () => [];

    const result = await runPicker({
      projectRoot: tmpProjectRoot,
      pluginRoot: tmpPluginRoot,
      ask, installFn, readStamps,
      detectWorkspace,
    });
    assert.strictEqual(result.action, 'software');
  });
});

// ---------------------------------------------------------------------------
// Task 6: writeDomainKey
// ---------------------------------------------------------------------------

describe('writeDomainKey', () => {
  let tmpProjectRoot;
  let manifestPath;

  beforeEach(() => {
    tmpProjectRoot = mkdtempSync(join(tmpdir(), 'adev-picker-wd-'));
    mkdirSync(join(tmpProjectRoot, '.context-index'), { recursive: true });
    manifestPath = join(tmpProjectRoot, '.context-index', 'manifest.yaml');
  });

  afterEach(() => {
    rmSync(tmpProjectRoot, { recursive: true, force: true });
  });

  it('appends a top-level domain: key to a manifest that has none', async () => {
    writeFileSync(manifestPath, 'project:\n  name: test\n');
    const { writeDomainKey } = await import('../../../lib/cli/domain-extension-picker.mjs');
    writeDomainKey(tmpProjectRoot, 'data-engineering');
    const content = readFileSync(manifestPath, 'utf8');
    assert.match(content, /^domain: data-engineering$/m);
    // existing content preserved
    assert.match(content, /project:\n {2}name: test/);
  });

  it('replaces an existing top-level domain: key idempotently', async () => {
    writeFileSync(manifestPath, 'project:\n  name: test\ndomain: software\n');
    const { writeDomainKey } = await import('../../../lib/cli/domain-extension-picker.mjs');
    writeDomainKey(tmpProjectRoot, 'data-engineering');
    const content = readFileSync(manifestPath, 'utf8');
    const matches = content.match(/^domain:/gm) || [];
    assert.strictEqual(matches.length, 1, 'should have exactly one domain: key');
    assert.match(content, /^domain: data-engineering$/m);
  });

  it('is byte-identical when called twice with the same value (idempotent)', async () => {
    writeFileSync(manifestPath, 'project:\n  name: test\n');
    const { writeDomainKey } = await import('../../../lib/cli/domain-extension-picker.mjs');
    writeDomainKey(tmpProjectRoot, 'data-engineering');
    const first = readFileSync(manifestPath, 'utf8');
    writeDomainKey(tmpProjectRoot, 'data-engineering');
    const second = readFileSync(manifestPath, 'utf8');
    assert.strictEqual(first, second);
  });

  it('writes domain: software for skip / software outcomes', async () => {
    writeFileSync(manifestPath, 'project:\n  name: test\n');
    const { writeDomainKey } = await import('../../../lib/cli/domain-extension-picker.mjs');
    writeDomainKey(tmpProjectRoot, 'software');
    const content = readFileSync(manifestPath, 'utf8');
    assert.match(content, /^domain: software$/m);
  });

  it('throws PICKER_MANIFEST_WRITE_FAILED when manifest.yaml is missing', async () => {
    const { writeDomainKey } = await import('../../../lib/cli/domain-extension-picker.mjs');
    // no manifest written
    assert.throws(
      () => writeDomainKey(tmpProjectRoot, 'data-engineering'),
      (err) => err.code === 'PICKER_MANIFEST_WRITE_FAILED'
    );
  });
});
