/**
 * Tests for CLI extension install and list commands.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from './helpers.mjs';

describe('CLI extension commands', () => {
  let tmp;
  beforeEach(() => {
    tmp = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => { cleanupTempDir(tmp); });

  it('extension list shows no extensions message', () => {
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'list'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.ok(result.stdout.toString().includes('No extensions installed'));
  });

  it('extension install with no source fails', () => {
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.notEqual(result.status, 0);
  });

  it('extension without subcommand shows usage', () => {
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension'], {
      cwd: tmp, env: { ...process.env }
    });
    const output = result.stdout.toString() + result.stderr.toString();
    assert.ok(output.includes('install') && output.includes('list'));
  });

  it('extension list shows installed extension after install', () => {
    // Create a local extension fixture
    const extDir = createTempDir();
    writeFixture(extDir, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\nprovides: {}\n');

    const installResult = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install', extDir], {
      cwd: tmp, env: { ...process.env }
    });

    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'list'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.ok(result.stdout.toString().includes('test-ext'));
    cleanupTempDir(extDir);
  });
});
