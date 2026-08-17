/**
 * Tests for lib/atomic-write.mjs — shared temp-then-rename atomic text write.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `atomicWriteFile` replaced identical local copies in
 * `lib/governance/materialize.mjs` and `lib/gitignore-installer.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { atomicWriteFile } from '../../lib/atomic-write.mjs';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-write-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('atomicWriteFile writes the file and leaves no temp file behind', () => {
  withTempDir((dir) => {
    const target = join(dir, 'out.txt');
    atomicWriteFile(target, 'hello world');
    assert.equal(readFileSync(target, 'utf8'), 'hello world');
    const leftovers = readdirSync(dir).filter((f) => f !== 'out.txt');
    assert.deepEqual(leftovers, []);
  });
});

test('atomicWriteFile overwrites an existing file atomically', () => {
  withTempDir((dir) => {
    const target = join(dir, 'out.txt');
    atomicWriteFile(target, 'first');
    atomicWriteFile(target, 'second');
    assert.equal(readFileSync(target, 'utf8'), 'second');
  });
});

test('atomicWriteFile cleans up the temp file and rethrows on a failed rename', () => {
  withTempDir((dir) => {
    // A destination inside a directory that does not exist makes the
    // rename step fail (ENOENT), exercising the catch/cleanup path.
    const target = join(dir, 'missing-subdir', 'out.txt');
    assert.throws(() => atomicWriteFile(target, 'content'));
    const leftovers = readdirSync(dir);
    assert.deepEqual(leftovers, []);
  });
});
