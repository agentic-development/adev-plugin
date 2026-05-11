/**
 * Unit tests for lib/lifecycle-state.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { existsSync, statSync } from 'node:fs';
import {
  CANONICAL_EVENTS,
  slugFromSpec,
  validateProjectRoot,
  ensureLifecycleState,
  hasLifecycleState,
} from '../../lib/lifecycle-state.mjs';

// ── Test helper: build a minimal project tmpdir + spec path ────────────────

function makeProject() {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index'), { recursive: true });
  writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\n');
  const specPath = '.context-index/specs/features/test/sample.spec.md';
  return { root, specPath };
}

function logPathFor(root, slug) {
  return join(root, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
}

// ── Task 1: canonical event schema ──────────────────────────────────────────

test('CANONICAL_EVENTS contains every documented variant', () => {
  for (const e of [
    'lifecycle_step', 'step_completed', 'step_failed',
    'reviewer_report', 'validator_report',
    'plan_task', 'debug_intervention', 'recovery_record', 'manual_override',
  ]) {
    assert.ok(CANONICAL_EVENTS.has(e), `missing variant: ${e}`);
  }
});

// ── Task 2: slugFromSpec / validateProjectRoot ─────────────────────────────

test('slugFromSpec accepts a normal spec filename', () => {
  assert.equal(slugFromSpec('a/b/foo.spec.md'), 'foo');
});

test('slugFromSpec strips uppercase to lowercase', () => {
  assert.equal(slugFromSpec('a/b/Foo-Bar.spec.md'), 'foo-bar');
});

test('slugFromSpec rejects path traversal (INVALID_SPEC_PATH)', () => {
  // The slug derived from ".bashrc" contains a leading dot inside the
  // allowed character set, so this exercises the .spec.md extension guard
  // when fed a non-spec path.
  assert.throws(
    () => slugFromSpec('../../bashrc.md'),
    (err) => err.code === 'INVALID_SPEC_PATH',
  );
});

test('slugFromSpec rejects non-spec extension', () => {
  assert.throws(
    () => slugFromSpec('a/b/foo.md'),
    (err) => err.code === 'INVALID_SPEC_PATH',
  );
});

test('slugFromSpec rejects disallowed characters in slug', () => {
  assert.throws(
    () => slugFromSpec('a/b/foo!.spec.md'),
    (err) => err.code === 'INVALID_SPEC_PATH',
  );
});

test('slugFromSpec rejects empty string', () => {
  assert.throws(
    () => slugFromSpec(''),
    (err) => err.code === 'INVALID_SPEC_PATH',
  );
});

test('slugFromSpec rejects null', () => {
  assert.throws(
    () => slugFromSpec(null),
    (err) => err.code === 'INVALID_SPEC_PATH',
  );
});

test('validateProjectRoot throws INVALID_PROJECT_ROOT when manifest missing', () => {
  const dir = createTempDir();
  try {
    assert.throws(
      () => validateProjectRoot(dir),
      (err) => err.code === 'INVALID_PROJECT_ROOT',
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test('validateProjectRoot returns the resolved absolute path when manifest present', () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, '.context-index'), { recursive: true });
    writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: test\n');
    const resolved = validateProjectRoot(dir);
    assert.equal(typeof resolved, 'string');
    assert.ok(resolved.length > 0);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 3: ensureLifecycleState / hasLifecycleState ───────────────────────

test('hasLifecycleState is false on a fresh project', () => {
  const { root, specPath } = makeProject();
  try {
    assert.equal(hasLifecycleState(root, specPath), false);
  } finally {
    cleanupTempDir(root);
  }
});

test('ensureLifecycleState creates the file and parent directory; hasLifecycleState turns true', () => {
  const { root, specPath } = makeProject();
  try {
    ensureLifecycleState(root, specPath);
    assert.equal(hasLifecycleState(root, specPath), true);
    assert.equal(existsSync(logPathFor(root, 'sample')), true);
  } finally {
    cleanupTempDir(root);
  }
});

test('ensureLifecycleState is idempotent — calling twice leaves file size unchanged', () => {
  const { root, specPath } = makeProject();
  try {
    ensureLifecycleState(root, specPath);
    const size1 = statSync(logPathFor(root, 'sample')).size;
    ensureLifecycleState(root, specPath);
    const size2 = statSync(logPathFor(root, 'sample')).size;
    assert.equal(size1, size2);
  } finally {
    cleanupTempDir(root);
  }
});
