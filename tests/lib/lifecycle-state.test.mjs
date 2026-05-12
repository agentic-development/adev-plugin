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
  currentState,
  requireGate,
  resolveGateMode,
  listLifecycleStates,
  filterEvents,
  renderMarkdown,
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

// ── Task 8: currentState base reducer ──────────────────────────────────────

test('currentState returns the empty projection shape on an empty log', () => {
  const { root, specPath } = makeProject();
  try {
    const s = currentState(root, specPath);
    assert.equal(s.spec, specPath);
    assert.equal(s.status, 'pending');
    assert.equal(s.currentStep, null);
    assert.equal(s.currentTask, null);
    assert.deepEqual(s.steps, {});
    assert.deepEqual(s.planTasks, {});
    assert.deepEqual(s.interventions, []);
    assert.deepEqual(s.unknownEvents, []);
    assert.equal(s.startedAt, null);
    assert.equal(s.updatedAt, null);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState transitions currentStep and tracks startedAt/updatedAt', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { ts: '2026-01-01T00:00:00.000Z', event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { ts: '2026-01-01T00:05:00.000Z', event: 'lifecycle_step', step: 'review', status: 'started' });
    const s = currentState(root, specPath);
    assert.equal(s.currentStep, 'review');
    assert.equal(s.startedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(s.updatedAt, '2026-01-01T00:05:00.000Z');
    assert.ok(s.steps.specify, 'specify step should exist');
    assert.ok(s.steps.review, 'review step should exist');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState preserves unknown event variants under unknownEvents[]', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { event: 'my_domain_custom_event', payload: { foo: 'bar' } });
    const s = currentState(root, specPath);
    assert.equal(s.unknownEvents.length, 1);
    assert.equal(s.unknownEvents[0].event, 'my_domain_custom_event');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState is deterministic — same input yields same output', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { ts: '2026-01-01T00:00:00.000Z', event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { ts: '2026-01-01T00:05:00.000Z', event: 'step_completed', step: 'specify', verdict: 'PASS' });
    const a = currentState(root, specPath);
    const b = currentState(root, specPath);
    assert.deepEqual(a, b);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState projection keys are camelCase', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    const s = currentState(root, specPath);
    const camelRegex = /^[a-z][a-zA-Z0-9]*$/;
    for (const key of Object.keys(s)) {
      assert.ok(camelRegex.test(key), `projection key "${key}" is not camelCase`);
    }
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState collects plan_task events under planTasks keyed by task_id', () => {
  const { root, specPath } = makeProject();
  try {
    reportPlanTask(root, specPath, { plan: 'p.plan.md', task_id: 't1', status: 'in_progress' });
    reportPlanTask(root, specPath, { plan: 'p.plan.md', task_id: 't1', status: 'completed' });
    reportPlanTask(root, specPath, { plan: 'p.plan.md', task_id: 't2', status: 'in_progress' });
    const s = currentState(root, specPath);
    assert.ok(s.planTasks.t1, 'planTasks.t1 should exist');
    assert.ok(s.planTasks.t2, 'planTasks.t2 should exist');
    // Latest status wins
    assert.equal(s.planTasks.t1.status, 'completed');
    assert.equal(s.planTasks.t2.status, 'in_progress');
  } finally {
    cleanupTempDir(root);
  }
});

// ── Task 9: aggregation algorithm (severity x verdict) ─────────────────────

// Helper: write a `reviewer_report` directly with explicit severity/verdict
// without going through severity resolution.
function rawReviewer(root, specPath, step, reviewer, severity, verdict) {
  appendEvent(root, specPath, {
    event: 'reviewer_report',
    step,
    reviewer,
    severity,
    verdict,
  });
}

test('aggregation: blocker FAIL -> step FAIL/failed', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'blocker', 'FAIL');
    rawReviewer(root, specPath, 'review', 'b', 'error', 'PASS');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'FAIL');
    assert.equal(s.steps.review.status, 'failed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: error FAIL -> step FAIL/failed', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'error', 'FAIL');
    rawReviewer(root, specPath, 'review', 'b', 'warning', 'PASS');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'FAIL');
    assert.equal(s.steps.review.status, 'failed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: warning FAIL -> step PASS_WITH_NOTES/completed', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'warning', 'FAIL');
    rawReviewer(root, specPath, 'review', 'b', 'blocker', 'PASS');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'PASS_WITH_NOTES');
    assert.equal(s.steps.review.status, 'completed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: advisory FAIL -> step PASS_WITH_NOTES/completed', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'advisory', 'FAIL');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'PASS_WITH_NOTES');
    assert.equal(s.steps.review.status, 'completed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: no FAILs + at least one PASS_WITH_NOTES -> PASS_WITH_NOTES/completed', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'blocker', 'PASS');
    rawReviewer(root, specPath, 'review', 'b', 'blocker', 'PASS_WITH_NOTES');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'PASS_WITH_NOTES');
    assert.equal(s.steps.review.status, 'completed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: all PASS -> PASS/completed', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'blocker', 'PASS');
    rawReviewer(root, specPath, 'review', 'b', 'error', 'PASS');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'PASS');
    assert.equal(s.steps.review.status, 'completed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: explicit step_completed overrides synthesized verdict but records aggregated_from discrepancy', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'blocker', 'FAIL');
    // An explicit step_completed event arrives later overriding the synthesized FAIL.
    appendEvent(root, specPath, {
      event: 'step_completed',
      step: 'review',
      verdict: 'PASS_WITH_NOTES',
      aggregated_from: ['manual-override'],
    });
    const s = currentState(root, specPath);
    // Explicit event takes precedence.
    assert.equal(s.steps.review.verdict, 'PASS_WITH_NOTES');
    assert.equal(s.steps.review.status, 'completed');
    assert.ok(Array.isArray(s.steps.review.aggregated_from));
    assert.ok(s.steps.review.aggregated_discrepancy === true, 'discrepancy flag should be set');
  } finally { cleanupTempDir(root); }
});

// ── Task 10: requireGate + resolveGateMode ─────────────────────────────────

test('requireGate throws GateError when prior step missing in strict mode', () => {
  const state = currentState; // dummy; we'll build minimal state inline
  const minimal = { spec: 'x', status: 'pending', steps: {}, planTasks: {}, interventions: [], unknownEvents: [] };
  assert.throws(
    () => requireGate(minimal, 'plan', { mode: 'strict' }),
    (err) => err.code === 'GATE_BLOCKED',
  );
});

test('requireGate logs warning and returns in advisory mode when prior missing', () => {
  const minimal = { spec: 'x', status: 'pending', steps: {}, planTasks: {}, interventions: [], unknownEvents: [] };
  // Spy on console.warn
  const orig = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    assert.doesNotThrow(() => requireGate(minimal, 'plan', { mode: 'advisory' }));
    assert.equal(warned, true);
  } finally {
    console.warn = orig;
  }
});

test('requireGate passes when prior step completed with PASS', () => {
  const minimal = {
    spec: 'x', status: 'in_progress',
    steps: { review: { name: 'review', status: 'completed', verdict: 'PASS', reports: [] } },
    planTasks: {}, interventions: [], unknownEvents: [],
  };
  assert.doesNotThrow(() => requireGate(minimal, 'plan', { mode: 'strict' }));
});

test('requireGate passes when prior step completed with PASS_WITH_NOTES', () => {
  const minimal = {
    spec: 'x', status: 'in_progress',
    steps: { review: { name: 'review', status: 'completed', verdict: 'PASS_WITH_NOTES', reports: [] } },
    planTasks: {}, interventions: [], unknownEvents: [],
  };
  assert.doesNotThrow(() => requireGate(minimal, 'plan', { mode: 'strict' }));
});

test('requireGate throws when prior step failed even in strict mode', () => {
  const minimal = {
    spec: 'x', status: 'failed',
    steps: { review: { name: 'review', status: 'failed', verdict: 'FAIL', reports: [] } },
    planTasks: {}, interventions: [], unknownEvents: [],
  };
  assert.throws(
    () => requireGate(minimal, 'plan', { mode: 'strict' }),
    (err) => err.code === 'GATE_BLOCKED',
  );
});

test('resolveGateMode returns "advisory" when manifest sets it', () => {
  assert.equal(resolveGateMode({ lifecycle: { gate_mode: 'advisory' } }), 'advisory');
});

test('resolveGateMode returns "strict" by default', () => {
  assert.equal(resolveGateMode({}), 'strict');
  assert.equal(resolveGateMode(null), 'strict');
  assert.equal(resolveGateMode(undefined), 'strict');
});

test('resolveGateMode returns "strict" and warns on unknown gate_mode value', () => {
  const orig = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    assert.equal(resolveGateMode({ lifecycle: { gate_mode: 'bogus' } }), 'strict');
    assert.equal(warned, true);
  } finally {
    console.warn = orig;
  }
});

// ── Task 11: listLifecycleStates ───────────────────────────────────────────

test('listLifecycleStates returns [] when the directory is missing', () => {
  const { root } = makeProject();
  try {
    const list = listLifecycleStates(root);
    assert.deepEqual(list, []);
  } finally {
    cleanupTempDir(root);
  }
});

test('listLifecycleStates returns one entry per <slug>.jsonl file', () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index'), { recursive: true });
    writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\n');
    const specA = '.context-index/specs/features/test/a.spec.md';
    const specB = '.context-index/specs/features/test/b.spec.md';
    const specC = '.context-index/specs/features/test/c.spec.md';
    appendEvent(root, specA, { event: 'lifecycle_step', step: 'specify', status: 'started', spec: specA });
    appendEvent(root, specB, { event: 'lifecycle_step', step: 'specify', status: 'started', spec: specB });
    appendEvent(root, specC, { event: 'lifecycle_step', step: 'review', status: 'started', spec: specC });
    const list = listLifecycleStates(root);
    assert.equal(list.length, 3);
    const slugs = list.map((e) => e.slug).sort();
    assert.deepEqual(slugs, ['a', 'b', 'c']);
    for (const entry of list) {
      assert.ok('spec' in entry);
      assert.ok('slug' in entry);
      assert.ok('status' in entry);
      assert.ok('currentStep' in entry);
      assert.ok('updated' in entry);
    }
  } finally {
    cleanupTempDir(root);
  }
});

// ── Task 12: filterEvents ──────────────────────────────────────────────────

test('filterEvents returns only events matching the predicate', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    reportPlanTask(root, specPath, { plan: 'p.plan.md', task_id: 't1', status: 'in_progress' });
    reportPlanTask(root, specPath, { plan: 'p.plan.md', task_id: 't2', status: 'in_progress' });
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify', verdict: 'PASS' });

    const planTaskEvents = filterEvents(root, specPath, (e) => e.event === 'plan_task');
    assert.equal(planTaskEvents.length, 2);
    assert.equal(planTaskEvents[0].task_id, 't1');
    assert.equal(planTaskEvents[1].task_id, 't2');
  } finally {
    cleanupTempDir(root);
  }
});

test('filterEvents returns [] when nothing matches', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    const out = filterEvents(root, specPath, () => false);
    assert.deepEqual(out, []);
  } finally {
    cleanupTempDir(root);
  }
});

test('filterEvents does not mutate the underlying log', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' });
    const sizeBefore = statSync(logPathFor(root, 'sample')).size;
    filterEvents(root, specPath, () => true);
    const sizeAfter = statSync(logPathFor(root, 'sample')).size;
    assert.equal(sizeBefore, sizeAfter);
  } finally {
    cleanupTempDir(root);
  }
});

// ── Task 13: renderMarkdown stub ───────────────────────────────────────────

test('renderMarkdown returns a deterministic string with DO-NOT-EDIT header and spec ref', () => {
  const state = { spec: 'foo.spec.md', status: 'pending', steps: {}, planTasks: {}, interventions: [], unknownEvents: [] };
  const md = renderMarkdown(state);
  assert.match(md, /<!-- DO NOT EDIT — generated -->/);
  assert.match(md, /foo\.spec\.md/);
});

test('renderMarkdown is byte-identical for the same input', () => {
  const state = { spec: 'x.spec.md', status: 'in_progress', steps: {}, planTasks: {}, interventions: [], unknownEvents: [] };
  const a = renderMarkdown(state);
  const b = renderMarkdown(state);
  assert.equal(a, b);
});

// ── Task 14: size caps ─────────────────────────────────────────────────────

test('appendEvent throws EVENT_TOO_LARGE when serialized event exceeds 1 MB', () => {
  const { root, specPath } = makeProject();
  try {
    const huge = 'x'.repeat(1_100_000);
    assert.throws(
      () => appendEvent(root, specPath, { event: 'lifecycle_step', huge }),
      (err) => err.code === 'EVENT_TOO_LARGE',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('appendEvent throws LOG_TOO_LARGE when the file is already >= 50 MB', () => {
  const { root, specPath } = makeProject();
  try {
    // Bootstrap, then fake a 50 MB log via a single big append directly to disk.
    ensureLifecycleState(root, specPath);
    const path = logPathFor(root, 'sample');
    // Write 50 MB of newline-terminated empty objects; cheap enough at 50 MB.
    const filler = Buffer.alloc(50 * 1024 * 1024, '\n');
    appendFileSync(path, filler);
    assert.throws(
      () => appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify' }),
      (err) => err.code === 'LOG_TOO_LARGE',
    );
  } finally {
    cleanupTempDir(root);
  }
});

test('reportReviewer truncates notes > 4 KB and emits NOTES_TRUNCATED warning', () => {
  const { root, specPath } = makeProject();
  const orig = console.warn;
  let warnings = [];
  console.warn = (msg) => { warnings.push(String(msg)); };
  try {
    const giantNotes = 'A'.repeat(5000);
    reportReviewer(root, specPath, {
      step: 'review',
      reviewer: 'structural-architect',
      verdict: 'PASS',
      notes: giantNotes,
      pluginRoot: PLUGIN_ROOT,
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    assert.ok(events[0].notes.length <= 4096 + 32, 'notes should be truncated');
    assert.ok(events[0].notes.endsWith('…[truncated]'), 'truncation marker should be appended');
    assert.ok(warnings.some((w) => w.includes('NOTES_TRUNCATED')), 'should have warned NOTES_TRUNCATED');
  } finally {
    console.warn = orig;
    cleanupTempDir(root);
  }
});

test('listLifecycleStates skips a malformed file mid-glob and continues', () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index', 'lifecycle-state'), { recursive: true });
    writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\n');
    // One valid log
    appendEvent(root, '.context-index/specs/.../good.spec.md', { event: 'lifecycle_step', step: 'specify', status: 'started' });
    // One file whose name passes the .jsonl filter but contains only garbage
    writeFileSync(join(root, '.context-index', 'lifecycle-state', 'bad.jsonl'), '{{{not-json\n');
    const list = listLifecycleStates(root);
    // The bad file is skipped silently (zero readable events) but still
    // produces an entry — the projection is just empty. Both files appear.
    const slugs = list.map((e) => e.slug).sort();
    assert.ok(slugs.includes('good'));
  } finally {
    cleanupTempDir(root);
  }
});
