/**
 * Unit tests for lib/lifecycle-state.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { existsSync, statSync, readFileSync, appendFileSync } from 'node:fs';
import {
  CANONICAL_EVENTS,
  slugFromSpec,
  validateProjectRoot,
  ensureLifecycleState,
  hasLifecycleState,
  appendEvent,
  readEvents,
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

// ── Task 4: appendEvent ─────────────────────────────────────────────────────

test('appendEvent writes one newline-terminated JSON line', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    const text = readFileSync(logPathFor(root, 'sample'), 'utf8');
    assert.equal(text.endsWith('\n'), true);
    const lines = text.split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const obj = JSON.parse(lines[0]);
    assert.equal(obj.event, 'lifecycle_step');
    assert.equal(obj.step, 'specify');
    assert.equal(obj.status, 'started');
    assert.ok(typeof obj.ts === 'string' && obj.ts.length > 0, 'ts should be stamped');
  } finally {
    cleanupTempDir(root);
  }
});

test('appendEvent writes two events in order on separate lines', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify', verdict: 'PASS' });
    const text = readFileSync(logPathFor(root, 'sample'), 'utf8');
    const lines = text.split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).event, 'lifecycle_step');
    assert.equal(JSON.parse(lines[1]).event, 'step_completed');
  } finally {
    cleanupTempDir(root);
  }
});

test('appendEvent throws EVENT_SCHEMA_INVALID when event field is missing', () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () => appendEvent(root, specPath, { step: 'specify' }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('appendEvent throws EVENT_SCHEMA_INVALID when event value is non-string', () => {
  const { root, specPath } = makeProject();
  try {
    assert.throws(
      () => appendEvent(root, specPath, { event: 42 }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('appendEvent preserves a caller-provided ts string', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { ts: '2026-01-01T00:00:00.000Z', event: 'lifecycle_step' });
    const text = readFileSync(logPathFor(root, 'sample'), 'utf8');
    const obj = JSON.parse(text.trim());
    assert.equal(obj.ts, '2026-01-01T00:00:00.000Z');
  } finally {
    cleanupTempDir(root);
  }
});

test('appendEvent creates the parent directory and file when missing', () => {
  const { root, specPath } = makeProject();
  try {
    // Skip ensureLifecycleState — appendEvent should bootstrap.
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    assert.equal(existsSync(logPathFor(root, 'sample')), true);
  } finally {
    cleanupTempDir(root);
  }
});

// ── Task 5: readEvents ──────────────────────────────────────────────────────

test('readEvents returns [] when the file does not exist', () => {
  const { root, specPath } = makeProject();
  try {
    assert.deepEqual(readEvents(root, specPath), []);
  } finally {
    cleanupTempDir(root);
  }
});

test('readEvents returns two events on disk in order', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify', verdict: 'PASS' });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 2);
    assert.equal(events[0].event, 'lifecycle_step');
    assert.equal(events[1].event, 'step_completed');
  } finally {
    cleanupTempDir(root);
  }
});

test('readEvents skips a truncated final line silently', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    // Simulate a mid-write crash: write a partial JSON object with no trailing newline.
    appendFileSync(logPathFor(root, 'sample'), '{"event":"step_completed","step":"specif');
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'lifecycle_step');
  } finally {
    cleanupTempDir(root);
  }
});

test('readEvents skips a malformed interior line and keeps remaining events', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    // Inject a malformed interior line.
    appendFileSync(logPathFor(root, 'sample'), 'not-json{{{\n');
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify' });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 2);
    assert.equal(events[0].event, 'lifecycle_step');
    assert.equal(events[1].event, 'step_completed');
  } finally {
    cleanupTempDir(root);
  }
});
