/**
 * Concurrent-write harness for lib/lifecycle-state.mjs.
 *
 * Spawns 100 child processes that each call `appendEvent` once on the same
 * log file. Asserts every event lands as a complete, well-formed line with
 * no interleaving (relies on `O_APPEND` atomicity for payloads <= PIPE_BUF
 * ≈ 4 KB on macOS/Linux — not a POSIX guarantee, but reliable on target
 * platforms).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { readEvents } from '../../lib/lifecycle-state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRITER_PATH = join(__dirname, '..', 'fixtures', 'lifecycle-state', 'concurrent-writer.mjs');

const CONCURRENT_WRITERS = 100;

test('100 concurrent appendEvent calls all land as well-formed lines', async () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index'), { recursive: true });
    writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
    const specPath = '.context-index/specs/features/test/concurrent.spec.md';

    // Fork all writers concurrently.
    const writers = [];
    for (let i = 0; i < CONCURRENT_WRITERS; i++) {
      writers.push(new Promise((resolve, reject) => {
        const child = fork(WRITER_PATH, [root, specPath, String(i)], { stdio: 'pipe' });
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`writer ${i} exited with code ${code}`));
        });
        child.on('error', reject);
      }));
    }
    await Promise.all(writers);

    // Read and verify.
    const events = readEvents(root, specPath);
    assert.equal(events.length, CONCURRENT_WRITERS, `expected ${CONCURRENT_WRITERS} events, got ${events.length}`);

    // Every event must have a unique writer_index.
    const indices = new Set(events.map((e) => e.writer_index));
    assert.equal(indices.size, CONCURRENT_WRITERS, 'every writer must contribute a unique event');

    // Every event must be well-formed (already asserted by readEvents) and
    // have the expected discriminator.
    for (const ev of events) {
      assert.equal(ev.event, 'lifecycle_step');
      assert.ok(ev.step?.startsWith('concurrent-'));
      assert.ok(typeof ev.writer_pid === 'number');
    }
  } finally {
    cleanupTempDir(root);
  }
});
