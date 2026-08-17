/**
 * Tests for lib/safe-unlink.mjs — idempotent unlink.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `safeUnlink` replaced identical local copies (`safeUnlink` in
 * `lib/cli/partial.mjs`, `unlinkSidecarTmp` in `lib/plan-routing-sidecar.mjs`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { safeUnlink } from '../../lib/safe-unlink.mjs';

test('safeUnlink removes an existing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'safe-unlink-test-'));
  try {
    const file = join(dir, 'x.txt');
    writeFileSync(file, 'x');
    safeUnlink(file);
    assert.equal(existsSync(file), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('safeUnlink is a no-op (does not throw) when the file is already gone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'safe-unlink-test-'));
  try {
    const file = join(dir, 'missing.txt');
    assert.doesNotThrow(() => safeUnlink(file));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('safeUnlink rethrows non-ENOENT errors (e.g. unlinking a directory)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'safe-unlink-test-'));
  try {
    // unlink(2) on a directory fails with EISDIR/EPERM, not ENOENT.
    assert.throws(
      () => safeUnlink(dir),
      (err) => err && err.code !== 'ENOENT',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
