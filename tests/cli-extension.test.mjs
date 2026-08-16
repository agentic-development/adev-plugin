/**
 * Tests for CLI extension install and list commands.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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

  // ── --allow-exec flag surface ────────────────────────────────────────
  //
  // spawnSync (not the shared `runCLI` helper) because `runCLI` passes its
  // `command` as a single argv element and these cases need four.

  /** A local extension contributing an executable quality gate. */
  function execExtensionFixture() {
    const extDir = createTempDir();
    writeFixture(extDir, 'adev-extension.yaml', [
      'name: cli-exec-ext',
      'version: 1.0.0',
      'provides:',
      '  governance:',
      '    - target: validate.yaml',
      '      entries:',
      '        - id: cli-exec-gate',
      '          kind: quality-gate',
      '          severity: error',
      '          command: [bash, bin/check.sh]',
      '',
    ].join('\n'));
    writeFixture(extDir, 'bin/check.sh', '#!/usr/bin/env bash\nexit 0\n');
    return extDir;
  }

  it('extension install without --allow-exec refuses an executable contribution', () => {
    const extDir = execExtensionFixture();
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install', extDir], {
      cwd: tmp, env: { ...process.env }
    });
    const output = result.stdout.toString() + result.stderr.toString();
    assert.notEqual(result.status, 0);
    assert.match(output, /--allow-exec/);
    assert.match(output, /validate\.yaml \[cli-exec-gate\] command: bash bin\/check\.sh/);
    assert.equal(existsSync(join(tmp, '.context-index/governance/validate.yaml')), false);
    cleanupTempDir(extDir);
  });

  it('extension install --allow-exec installs the executable contribution', () => {
    const extDir = execExtensionFixture();
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install', extDir, '--allow-exec'], {
      cwd: tmp, env: { ...process.env }
    });
    assert.equal(result.status, 0, result.stdout.toString() + result.stderr.toString());
    const out = readFileSync(join(tmp, '.context-index/governance/validate.yaml'), 'utf8');
    assert.match(out, /id: cli-exec-gate/);
    assert.match(out, /exec_consented_at: \d{4}-\d{2}-\d{2}T/);
    assert.match(out, /source: extension:cli-exec-ext/);
    // The payload was relocated into the project and its directory reported.
    assert.match(result.stdout.toString(), /\.context-index\/extensions\/cli-exec-ext/);
    cleanupTempDir(extDir);
  });

  it('extension install --allow-exec is accepted before the source argument', () => {
    const extDir = execExtensionFixture();
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install', '--allow-exec', extDir], {
      cwd: tmp, env: { ...process.env }
    });
    assert.equal(result.status, 0, result.stdout.toString() + result.stderr.toString());
    assert.match(readFileSync(join(tmp, '.context-index/governance/validate.yaml'), 'utf8'), /id: cli-exec-gate/);
    cleanupTempDir(extDir);
  });

  // ── Interactive consent path (Behavior 10) ───────────────────────────
  //
  // `interactive` is `Boolean(process.stdin.isTTY && process.stdout.isTTY)`, and
  // a spawned child's piped stdio is never a TTY — so a plain spawnSync can only
  // ever exercise the NON-interactive branch. That is exactly how the missing
  // `promptFn` survived a full flag-surface suite.
  //
  // These drive `cmdExtension` in a child that sets both isTTY flags before
  // calling it. Everything else is real: fd 0 is a genuine pipe carrying the
  // operator's keystrokes, and the answer travels cmdExtension →
  // installExtension → resolveExecConsent → readConsentAnswerSync → fd 0.

  function installWithFakeTty(extDir, cwd, stdin) {
    const script = [
      `const cli = await import(${JSON.stringify(join(PLUGIN_ROOT, 'cli/index.mjs'))});`,
      'process.stdin.isTTY = true;',
      'process.stdout.isTTY = true;',
      `process.argv = [process.argv[0], 'adev', 'extension', 'install', ${JSON.stringify(extDir)}];`,
      'await cli.cmdExtension();',
    ].join('\n');
    return spawnSync('node', ['--input-type=module', '-e', script], {
      cwd, input: stdin, encoding: 'utf8', env: { ...process.env }
    });
  }

  it('an interactive install answered "y" prompts with each command verbatim, then installs', () => {
    const extDir = execExtensionFixture();
    const result = installWithFakeTty(extDir, tmp, 'y\n');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /validate\.yaml \[cli-exec-gate\] command: bash bin\/check\.sh/);
    assert.match(result.stdout, /Allow these to be installed\? \[y\/N\]/);
    const out = readFileSync(join(tmp, '.context-index/governance/validate.yaml'), 'utf8');
    assert.match(out, /id: cli-exec-gate/);
    assert.match(out, /exec_consented_at: \d{4}-\d{2}-\d{2}T/);
    cleanupTempDir(extDir);
  });

  it('an interactive install answered "n" refuses, writes nothing, and names --allow-exec', () => {
    const extDir = execExtensionFixture();
    const result = installWithFakeTty(extDir, tmp, 'n\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /validate\.yaml \[cli-exec-gate\] command: bash bin\/check\.sh/);
    assert.match(result.stderr, /--allow-exec/);
    assert.equal(existsSync(join(tmp, '.context-index/governance/validate.yaml')), false);
    assert.equal(existsSync(join(tmp, '.context-index/extensions')), false);
    cleanupTempDir(extDir);
  });

  it('an interactive install at EOF refuses — an unanswered prompt never grants', () => {
    const extDir = execExtensionFixture();
    const result = installWithFakeTty(extDir, tmp, '');
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(tmp, '.context-index/governance/validate.yaml')), false);
    cleanupTempDir(extDir);
  });

  it('the consent read stops at the newline and does not swallow the rest of stdin', () => {
    const extDir = execExtensionFixture();
    // A bare "y" followed by more input: only the first line is the answer. If
    // the reader drained stdin instead, the trailing bytes would be consumed
    // (and a `yLEFTOVER` answer would refuse rather than grant).
    const result = installWithFakeTty(extDir, tmp, 'y\nLEFTOVER\n');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(join(tmp, '.context-index/governance/validate.yaml'), 'utf8'), /id: cli-exec-gate/);
    cleanupTempDir(extDir);
  });

  it('extension install usage names --allow-exec when the source is missing', () => {
    const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli/index.mjs'), 'extension', 'install', '--allow-exec'], {
      cwd: tmp, env: { ...process.env }
    });
    const output = result.stdout.toString() + result.stderr.toString();
    assert.notEqual(result.status, 0);
    assert.match(output, /Usage: npx adev-cli extension install <source> \[--allow-exec\]/);
  });
});
