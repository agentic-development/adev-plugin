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
