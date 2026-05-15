/**
 * Crash-safety harness for lib/lifecycle-state.mjs.
 *
 * Spawns a child that begins writing a giant event one byte at a time, then
 * SIGKILLs it mid-write. The lifecycle log ends up with a truncated final
 * line. `readEvents` must skip the tail silently and return all prior
 * complete events.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { appendEvent, readEvents } from '../../lib/lifecycle-state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRASH_WRITER = join(__dirname, '..', 'fixtures', 'lifecycle-state', 'crash-writer.mjs');

test('readEvents recovers prior complete events after a mid-write crash', async () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index'), { recursive: true });
    writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
    const specPath = '.context-index/specs/features/test/crash.spec.md';

    // First, write two clean events so we have a baseline.
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify', verdict: 'PASS' });

    // Resolve the log path the same way the lib would.
    const logPath = join(root, '.context-index', 'lifecycle-state', 'crash.jsonl');
    assert.ok(existsSync(logPath), 'log file should exist after appendEvent');

    // Spawn the crash writer and wait for its READY signal, then kill it.
    await new Promise((resolve, reject) => {
      const child = spawn('node', [CRASH_WRITER, logPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      let ready = false;
      let buf = '';
      child.stdout.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        if (!ready && buf.includes('READY')) {
          ready = true;
          // Let the writer emit a few bytes before SIGKILL.
          setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 50);
        }
      });
      child.on('error', reject);
      child.on('exit', () => { /* exit is the goal */ });
    });

    // After the crash, the log has a truncated final line. readEvents must
    // tolerate the tail silently and return the two pre-crash events.
    const events = readEvents(root, specPath);
    assert.ok(events.length >= 2, `expected at least 2 events, got ${events.length}`);
    assert.equal(events[0].event, 'lifecycle_step');
    assert.equal(events[1].event, 'step_completed');
  } finally {
    cleanupTempDir(root);
  }
});
