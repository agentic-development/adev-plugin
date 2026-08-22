/**
 * Tests for lib/diagnostics/tier2/mechanism-existence.mjs — Task 8 of
 * review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md.
 *
 * `adev/mechanism-existence`: extracts file:line / backtick-fenced
 * file::symbol / --flag / UPPER_SNAKE_ERROR_CODE referents from authored
 * text and verifies the filesystem-checkable ones (file:line, file::symbol)
 * actually resolve inside projectRoot. Refuses (never silently "not found")
 * on a lexical `../` escape, a post-realpath escape, or an unresolvable
 * path — mirrors lib/extensions/exec-payload.mjs::assertContained (BD-2:
 * refusal block is lines 174-183).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run } from '../../../lib/diagnostics/tier2/mechanism-existence.mjs';

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'adev-mechanism-existence-'));
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(join(root, 'lib', 'foo.mjs'), [
    'export function bar() {',
    '  return 1;',
    '}',
    '',
    'export function baz() {',
    '  return 2;',
    '}',
    '',
  ].join('\n'));
  return root;
}

test('run() refuses a candidate that lexically escapes the repo root before touching the filesystem', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'see `../../etc/passwd:1` for details' };
    const result = run(ctx);
    assert.strictEqual(result.severity, 'error');
    assert.match(result.message, /MECHANISM_PATH_ESCAPE/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() reports fired:false when a file:line candidate resolves inside the project', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'see `lib/foo.mjs:2` for the return statement' };
    const result = run(ctx);
    assert.strictEqual(result.fired, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() reports MECHANISM_NOT_FOUND for a file:line candidate whose line exceeds the file length', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'see `lib/foo.mjs:9999` for details' };
    const result = run(ctx);
    assert.strictEqual(result.severity, 'error');
    assert.match(result.message, /MECHANISM_NOT_FOUND/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() reports MECHANISM_NOT_FOUND for a nonexistent file candidate (ENOENT)', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'see `lib/does-not-exist.mjs:1` for details' };
    const result = run(ctx);
    assert.strictEqual(result.severity, 'error');
    assert.match(result.message, /MECHANISM_NOT_FOUND/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() reports fired:false when a file::symbol candidate resolves inside the project and the symbol is present', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'see `lib/foo.mjs::bar` for the export' };
    const result = run(ctx);
    assert.strictEqual(result.fired, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() reports MECHANISM_NOT_FOUND when a file::symbol candidate\'s symbol is absent from the file', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'see `lib/foo.mjs::qux` for the export' };
    const result = run(ctx);
    assert.strictEqual(result.severity, 'error');
    assert.match(result.message, /MECHANISM_NOT_FOUND/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() refuses a broken symlink target as MECHANISM_NOT_FOUND, never silently "not found"', () => {
  const projectRoot = makeProject();
  try {
    symlinkSync(join(projectRoot, 'lib', 'nonexistent-target.mjs'), join(projectRoot, 'lib', 'broken-link.mjs'));
    const ctx = { projectRoot, authoredText: 'see `lib/broken-link.mjs:1` for details' };
    const result = run(ctx);
    assert.strictEqual(result.severity, 'error');
    assert.match(result.message, /MECHANISM_NOT_FOUND/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() extracts --flag and UPPER_SNAKE_ERROR_CODE tokens without filesystem-verifying them (not in scope for this task)', () => {
  const projectRoot = makeProject();
  try {
    const ctx = { projectRoot, authoredText: 'run with `--dry-run` and check for `INVALID_SPEC_PATH`' };
    const result = run(ctx);
    // Neither token is filesystem-checkable, so neither can fire a MECHANISM_* refusal.
    assert.strictEqual(result.fired, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() with no authoredText or no candidates is a silent no-op', () => {
  const projectRoot = makeProject();
  try {
    assert.strictEqual(run({ projectRoot, authoredText: '' }).fired, false);
    assert.strictEqual(run({ projectRoot, authoredText: 'plain prose, no referents at all' }).fired, false);
    assert.strictEqual(run({ projectRoot }).fired, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run() reports every unresolved referent, not just the first (for blocker construction)', () => {
  const projectRoot = makeProject();
  try {
    const ctx = {
      projectRoot,
      authoredText: 'see `lib/does-not-exist.mjs:1` and also `../../etc/passwd:1`',
    };
    const result = run(ctx);
    assert.strictEqual(result.fired, true);
    assert.ok(Array.isArray(result.unresolved));
    assert.strictEqual(result.unresolved.length, 2);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
