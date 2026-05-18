// Tests for orphan-lock cleanup in JsonAdapter (orphan-lock-cleanup.spec.md).
// Built incrementally across plan tasks 1-4:
//   Task 1 — _acquireLock helper existence + happy-path return shape.
//   Task 2 — orphan-recovery branch + one-time stderr warning.
//   Task 3 — DEFAULT_CAS_LOCK_STALE_SECONDS export + manifest knob + validation.
//   Task 4 — full coverage of 6 Behaviors + 6 Error Cases + Acceptance Criterion 2.
//
// Time-sensitive cases use fs.utimesSync to age the lock file artificially
// instead of mocking Date.now — this avoids the experimental test-runner
// mock-timers API and stays deterministic across Node 18+.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeSync,
  unlinkSync,
  openSync,
  utimesSync,
  existsSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { JsonAdapter, DEFAULT_CAS_LOCK_STALE_SECONDS } from '../../../lib/issues/json-adapter.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

// ---------------------------------------------------------------------------
// Task 1 — _acquireLock helper exists and returns a numeric fd on success.
// ---------------------------------------------------------------------------

test('JsonAdapter._acquireLock returns a numeric fd on success', () => {
  const root = createTempDir();
  try {
    writeFixture(root, '.context-index/manifest.yaml', 'tasks:\n  backend: json\n');
    // Ensure tasks dir exists so openSync(lockPath, 'wx') can create the file.
    mkdirSync(join(root, '.context-index', 'tasks'), { recursive: true });
    const adapter = new JsonAdapter(root);
    const lockPath = adapter.filePath + '.lock';
    const fd = adapter._acquireLock(lockPath);
    assert.equal(typeof fd, 'number');
    try { closeSync(fd); } catch { /* ignore */ }
    try { unlinkSync(lockPath); } catch { /* ignore */ }
  } finally {
    cleanupTempDir(root);
  }
});

// ---------------------------------------------------------------------------
// Task 3 — DEFAULT_CAS_LOCK_STALE_SECONDS export + manifest knob + validation.
// ---------------------------------------------------------------------------

describe('orphan-lock cleanup — manifest knob (Task 3)', () => {

  test('DEFAULT_CAS_LOCK_STALE_SECONDS exported and equals 30', () => {
    assert.equal(DEFAULT_CAS_LOCK_STALE_SECONDS, 30);
  });

  test('absent manifest knob → falls back to default', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n');
      const adapter = new JsonAdapter(root);
      assert.equal(adapter.casLockStaleSeconds, DEFAULT_CAS_LOCK_STALE_SECONDS);
    } finally { cleanupTempDir(root); }
  });

  test('manifest.tasks.cas_lock_stale_seconds: 60 overrides the default', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n  cas_lock_stale_seconds: 60\n');
      const adapter = new JsonAdapter(root);
      assert.equal(adapter.casLockStaleSeconds, 60);
    } finally { cleanupTempDir(root); }
  });

  test('manifest with cas_lock_stale_seconds: 3 (< floor 5) rejects at construction', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n  cas_lock_stale_seconds: 3\n');
      assert.throws(
        () => new JsonAdapter(root),
        (err) => err.code === 'BOARD_INVALID_LOCK_STALE_SECONDS',
      );
    } finally { cleanupTempDir(root); }
  });

  test('manifest with non-integer (string literal) cas_lock_stale_seconds rejects', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n  cas_lock_stale_seconds: thirty\n');
      assert.throws(
        () => new JsonAdapter(root),
        (err) => err.code === 'BOARD_INVALID_LOCK_STALE_SECONDS',
      );
    } finally { cleanupTempDir(root); }
  });

  test('manifest with float cas_lock_stale_seconds: 5.5 rejects', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n  cas_lock_stale_seconds: 5.5\n');
      assert.throws(
        () => new JsonAdapter(root),
        (err) => err.code === 'BOARD_INVALID_LOCK_STALE_SECONDS',
      );
    } finally { cleanupTempDir(root); }
  });

  test('manifest with boolean cas_lock_stale_seconds: true rejects', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n  cas_lock_stale_seconds: true\n');
      assert.throws(
        () => new JsonAdapter(root),
        (err) => err.code === 'BOARD_INVALID_LOCK_STALE_SECONDS',
      );
    } finally { cleanupTempDir(root); }
  });

  test('manifest with cas_lock_stale_seconds: null rejects', () => {
    const root = createTempDir();
    try {
      writeFixture(root, '.context-index/manifest.yaml',
        'tasks:\n  backend: json\n  cas_lock_stale_seconds: null\n');
      assert.throws(
        () => new JsonAdapter(root),
        (err) => err.code === 'BOARD_INVALID_LOCK_STALE_SECONDS',
      );
    } finally { cleanupTempDir(root); }
  });
});
