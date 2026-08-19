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
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveContained, safeRealpath, isContained, lenientRealpath } from '../../lib/path-safety.mjs';

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

test('lenientRealpath resolves a plain path with no symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const target = join(dir, 'real');
    mkdirSync(target);
    assert.equal(lenientRealpath(target), realpathSync(target));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lenientRealpath follows a real symlinked directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const target = join(dir, 'real');
    const link = join(dir, 'link');
    mkdirSync(target);
    symlinkSync(target, link);
    assert.equal(lenientRealpath(link), realpathSync(target));
    assert.equal(lenientRealpath(join(link, 'child.txt')), join(realpathSync(target), 'child.txt'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lenientRealpath does not throw on a dangling symlink and resolves its literal target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const link = join(dir, 'dangling');
    symlinkSync(join(dir, 'does-not-exist'), link);
    assert.equal(lenientRealpath(link), realpathSync(dir) + sep + 'does-not-exist');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lenientRealpath does not throw on a path that does not exist at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const missing = join(dir, 'a', 'b', 'c');
    assert.equal(lenientRealpath(missing), realpathSync(dir) + sep + join('a', 'b', 'c'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lenientRealpath resolves a symlink target that escapes the original directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const outside = mkdtempSync(join(tmpdir(), 'path-safety-outside-'));
    try {
      const link = join(dir, 'escape');
      symlinkSync(outside, link);
      assert.equal(lenientRealpath(link), realpathSync(outside));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lenientRealpath rejects a symlink cycle instead of hanging', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-safety-test-'));
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    symlinkSync(b, a);
    symlinkSync(a, b);
    assert.throws(() => lenientRealpath(a), /too many levels of symbolic links/);
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
