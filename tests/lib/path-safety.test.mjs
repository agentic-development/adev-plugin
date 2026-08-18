/**
 * Tests for lib/path-safety.mjs — shared path-containment and safe-realpath
 * primitives.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `resolveContained`/`safeRealpath`/`isContained` replaced ~18 identical
 * local reimplementations across lib/.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveContained, safeRealpath, isContained } from '../../lib/path-safety.mjs';

test('resolveContained resolves a relative path within the root', () => {
  const root = '/a/b';
  assert.equal(resolveContained(root, 'c.txt'), '/a/b/c.txt');
});

test('resolveContained returns null when the path escapes the root', () => {
  const root = '/a/b';
  assert.equal(resolveContained(root, '../evil.txt'), null);
});

test('resolveContained accepts the root itself', () => {
  const root = '/a/b';
  assert.equal(resolveContained(root, '/a/b'), root);
});

test('resolveContained rejects a sibling directory with an overlapping prefix', () => {
  const root = '/a/b';
  assert.equal(resolveContained(root, '/a/b-evil/c.txt'), null);
});

test('safeRealpath returns the literal path when it does not exist', () => {
  const missing = join(tmpdir(), `does-not-exist-${Date.now()}`);
  assert.equal(safeRealpath(missing), missing);
});

test('safeRealpath follows a real symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const target = join(dir, 'real');
    const link = join(dir, 'link');
    mkdirSync(target);
    symlinkSync(target, link);
    assert.equal(safeRealpath(link), safeRealpath(target));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isContained: true for the root itself and for a strict descendant (+1 more contract assertions)", () => {
  // isContained: true for the root itself and for a strict descendant
  assert.equal(isContained('/a/b', '/a/b'), true);
  assert.equal(isContained('/a/b/c', '/a/b'), true);

  // isContained: false for a prefix-overlapping sibling
  assert.equal(isContained('/a/b-evil/c', '/a/b'), false);
});
