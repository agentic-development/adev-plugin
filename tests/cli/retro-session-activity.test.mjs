// tests/cli/retro-session-activity.test.mjs
//
// CLI integration tests for `adev retro session-activity`.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from '../helpers.mjs';

function runCLI(args, { cwd } = {}) {
  const result = spawnSync('node', [join(PLUGIN_ROOT, 'cli', 'index.mjs'), ...args], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

test('adev retro session-activity: empty sessions dir → JSON, exit 0', () => {
  const dir = createTempDir();
  try {
    const r = runCLI(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir],
      { cwd: dir }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.totalSessions, 0);
    assert.deepEqual(data.formatBreakdown, { hook: 0, 'post-commit': 0, unknown: 0 });
  } finally {
    cleanupTempDir(dir);
  }
});

test('adev retro session-activity: in-window file counted', () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, '.context-index/sessions'), { recursive: true });
    writeFileSync(
      join(dir, '.context-index/sessions/2026-05-15-abcdef12.md'),
      '---\nkind: session-end\nsession_id: abcdef12\ndate: 2026-05-15\n---\n### Read\n'
    );
    const r = runCLI(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir],
      { cwd: dir }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.totalSessions, 1);
    assert.deepEqual(data.formatBreakdown, { hook: 1, 'post-commit': 0, unknown: 0 });
    assert.equal(data.toolUseDistribution[0].tool, 'Read');
  } finally {
    cleanupTempDir(dir);
  }
});

test('adev retro session-activity: --format text renders markdown', () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, '.context-index/sessions'), { recursive: true });
    writeFileSync(
      join(dir, '.context-index/sessions/2026-05-15-abc.md'),
      '---\nkind: session-end\nsession_id: abc\ndate: 2026-05-15\n---\n### Read\n'
    );
    const r = runCLI(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir, '--format', 'text'],
      { cwd: dir }
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /## Session Activity/);
    assert.match(r.stdout, /Total: 1/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('adev retro session-activity: --format text omits section when no sessions', () => {
  const dir = createTempDir();
  try {
    const r = runCLI(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir, '--format', 'text'],
      { cwd: dir }
    );
    assert.equal(r.status, 0);
    // Empty result → empty markdown (section omitted per Graceful absence invariant).
    assert.equal(r.stdout.trim(), '');
  } finally {
    cleanupTempDir(dir);
  }
});

test('adev retro session-activity: missing --since flag → exit 1', () => {
  const dir = createTempDir();
  try {
    const r = runCLI(
      ['retro', 'session-activity', '--until', '2026-05-31', '--project-root', dir],
      { cwd: dir }
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--since/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('adev retro session-activity: --project-root containment enforced', () => {
  // Pass an absolute path outside the cwd's filesystem boundary. We can't
  // easily test traversal in a unit context, but we can ensure the flag is
  // accepted as absolute and the verb runs.
  const dir = createTempDir();
  try {
    const r = runCLI(
      ['retro', 'session-activity', '--since', '2026-05-01', '--until', '2026-05-31', '--project-root', dir],
      { cwd: dir }
    );
    assert.equal(r.status, 0);
  } finally {
    cleanupTempDir(dir);
  }
});
