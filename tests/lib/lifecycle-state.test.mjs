/**
 * Unit tests for lib/lifecycle-state.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { existsSync, statSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname as pathDirname } from 'node:path';
import {
  CANONICAL_EVENTS,
  slugFromSpec,
  validateProjectRoot,
  ensureLifecycleState,
  hasLifecycleState,
  appendEvent,
  readEvents,
  _resolveActorSeverity,
  reportReviewer,
  reportValidator,
  reportStep,
  reportPlanTask,
  reportIntervention,
} from '../../lib/lifecycle-state.mjs';

const __dirname = pathDirname(fileURLToPath(import.meta.url));
// Plugin root lives two levels up from this test file (tests/lib/ → tests/ → project)
const PLUGIN_ROOT = pathDirname(pathDirname(__dirname));

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

// ── Task 6: severity-resolution helper ─────────────────────────────────────

test('_resolveActorSeverity returns reviewer severity_cap for a known reviewer', () => {
  // Use the bundled "software" domain — structural-architect has severity_cap: blocker.
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'reviewer',
    actorName: 'structural-architect',
    repoRoot: '/tmp/__lifecycle_severity_known__',
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'blocker');
});

test('_resolveActorSeverity returns "warning" for an unknown reviewer', () => {
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'reviewer',
    actorName: 'no-such-reviewer-xyz',
    repoRoot: '/tmp/__lifecycle_severity_unknown__',
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'warning');
});

test('_resolveActorSeverity returns validator severity for a known gate', () => {
  // The bundled software gates.yaml declares "quality-gate" with severity: error.
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'validator',
    actorName: 'quality-gate',
    repoRoot: '/tmp/__lifecycle_severity_gate__',
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'error');
});

test('_resolveActorSeverity returns "warning" when domain config lookup throws', () => {
  // Force an error by passing a non-existent plugin root with a bundled
  // domain name — loadDomainConfig will throw or return null. Either way,
  // the fallback must yield "warning".
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'reviewer',
    actorName: 'structural-architect',
    repoRoot: '/tmp/__lifecycle_severity_broken__',
    pluginRoot: '/tmp/__nonexistent_plugin_root_xyz__',
  });
  assert.equal(sev, 'warning');
});

// ── Task 7: convenience writers ─────────────────────────────────────────────

test('reportReviewer appends a reviewer_report event with stamped severity', () => {
  const { root, specPath } = makeProject();
  try {
    reportReviewer(root, specPath, {
      step: 'review',
      reviewer: 'structural-architect',
      verdict: 'PASS',
      notes: null,
      pluginRoot: PLUGIN_ROOT,
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.event, 'reviewer_report');
    assert.equal(ev.step, 'review');
    assert.equal(ev.reviewer, 'structural-architect');
    assert.equal(ev.verdict, 'PASS');
    assert.equal(ev.severity, 'blocker');
  } finally {
    cleanupTempDir(root);
  }
});

test('reportValidator appends a validator_report event with stamped severity', () => {
  const { root, specPath } = makeProject();
  try {
    reportValidator(root, specPath, {
      step: 'validate',
      validator: 'quality-gate',
      verdict: 'PASS',
      duration_ms: 1200,
      pluginRoot: PLUGIN_ROOT,
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.event, 'validator_report');
    assert.equal(ev.validator, 'quality-gate');
    assert.equal(ev.severity, 'error');
    assert.equal(ev.duration_ms, 1200);
  } finally {
    cleanupTempDir(root);
  }
});

test('reportStep chooses discriminator based on status', () => {
  const { root, specPath } = makeProject();
  try {
    reportStep(root, specPath, { step: 'specify', status: 'started' });
    reportStep(root, specPath, { step: 'specify', status: 'completed', verdict: 'PASS' });
    reportStep(root, specPath, { step: 'review', status: 'failed', verdict: 'FAIL' });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 3);
    assert.equal(events[0].event, 'lifecycle_step');
    assert.equal(events[1].event, 'step_completed');
    assert.equal(events[2].event, 'step_failed');
  } finally {
    cleanupTempDir(root);
  }
});

test('reportPlanTask appends a plan_task event', () => {
  const { root, specPath } = makeProject();
  try {
    reportPlanTask(root, specPath, {
      plan: '.context-index/specs/.../foo.plan.md',
      task_id: 't2',
      status: 'in_progress',
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'plan_task');
    assert.equal(events[0].task_id, 't2');
    assert.equal(events[0].status, 'in_progress');
  } finally {
    cleanupTempDir(root);
  }
});

test('reportIntervention appends a debug_intervention event', () => {
  const { root, specPath } = makeProject();
  try {
    reportIntervention(root, specPath, { kind: 'debug', note: 'ran adev:debug between tasks' });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'debug_intervention');
    assert.equal(events[0].note, 'ran adev:debug between tasks');
  } finally {
    cleanupTempDir(root);
  }
});

test('every actor event ends up with severity stamped on disk', () => {
  const { root, specPath } = makeProject();
  try {
    reportReviewer(root, specPath, { step: 'review', reviewer: 'structural-architect', verdict: 'PASS', pluginRoot: PLUGIN_ROOT });
    reportValidator(root, specPath, { step: 'validate', validator: 'quality-gate', verdict: 'PASS', pluginRoot: PLUGIN_ROOT });
    reportStep(root, specPath, { step: 'specify', status: 'started' });
    const events = readEvents(root, specPath);
    const actorEvents = events.filter((e) => e.event === 'reviewer_report' || e.event === 'validator_report');
    assert.equal(actorEvents.length, 2);
    for (const ev of actorEvents) {
      assert.ok(typeof ev.severity === 'string' && ev.severity.length > 0, `actor event missing severity: ${JSON.stringify(ev)}`);
    }
  } finally {
    cleanupTempDir(root);
  }
});
