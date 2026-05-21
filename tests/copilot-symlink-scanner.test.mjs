import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { scanForSymlinks } from '../lib/providers/copilot/symlink-scanner.mjs';

test('clean tree returns true', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  writeFileSync(path.join(dir, 'foo.txt'), 'ok');
  assert.equal(scanForSymlinks(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('top-level symlink rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  symlinkSync('/etc/passwd', path.join(dir, 'leak'));
  assert.throws(() => scanForSymlinks(dir), /SKILL_CONTAINS_SYMLINK/);
  rmSync(dir, { recursive: true, force: true });
});

test('nested symlink rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  mkdirSync(path.join(dir, 'sub'));
  symlinkSync('/etc/passwd', path.join(dir, 'sub', 'leak'));
  assert.throws(() => scanForSymlinks(dir), /SKILL_CONTAINS_SYMLINK/);
  rmSync(dir, { recursive: true, force: true });
});

test('symbolic link in deeply nested subdir rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  mkdirSync(path.join(dir, 'a', 'b', 'c'), { recursive: true });
  symlinkSync('/tmp', path.join(dir, 'a', 'b', 'c', 'link'));
  assert.throws(() => scanForSymlinks(dir), /SKILL_CONTAINS_SYMLINK/);
  rmSync(dir, { recursive: true, force: true });
});

test('tree with files and subdirs only (no symlinks) returns true', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  mkdirSync(path.join(dir, 'sub'));
  writeFileSync(path.join(dir, 'sub', 'a.txt'), 'a');
  writeFileSync(path.join(dir, 'b.txt'), 'b');
  assert.equal(scanForSymlinks(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('symlinked directory itself is rejected (not followed)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'symlink-scan-'));
  // create a target dir
  const target = mkdtempSync(path.join(tmpdir(), 'symlink-target-'));
  symlinkSync(target, path.join(dir, 'linked-dir'));
  assert.throws(() => scanForSymlinks(dir), /SKILL_CONTAINS_SYMLINK/);
  rmSync(dir, { recursive: true, force: true });
  rmSync(target, { recursive: true, force: true });
});
