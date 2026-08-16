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
  writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
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

test('normaliseEventInPlace docstring reflects the closed-discriminator / mode-dependent stance', () => {
  // diagnostic-registry.spec.md rev 2 AC: the docstring at the
  // normaliseEventInPlace declaration must reflect rev 2 amendment 8.
  // We read the source file and grep for the load-bearing strings; this
  // catches regressions where a future edit removes the wording.
  const __fname = fileURLToPath(import.meta.url);
  const __dir = pathDirname(__fname);
  const libPath = join(pathDirname(pathDirname(__dir)), 'lib', 'lifecycle-state.mjs');
  const src = readFileSync(libPath, 'utf8');

  // Find the docstring block that precedes the normaliseEventInPlace declaration.
  const declIdx = src.indexOf('function normaliseEventInPlace');
  assert.ok(declIdx > 0, 'normaliseEventInPlace declaration must exist');
  const docBlockStart = src.lastIndexOf('/**', declIdx);
  assert.ok(docBlockStart > 0, 'docstring must precede the declaration');
  const docBlock = src.slice(docBlockStart, declIdx);

  // Required talking points per diagnostic-registry.spec.md rev 2 AC.
  assert.match(docBlock, /closed/i, 'must mention closed-discriminator stance');
  assert.match(docBlock, /mode-dependent/i, 'must mention mode-dependent enforcement');
  assert.match(docBlock, /lifecycle\.event_diagnostics/, 'must cite the manifest knob');
  assert.match(docBlock, /strict/i, 'must mention strict mode');
  assert.match(docBlock, /tag/i, 'must mention tag mode');
  assert.match(docBlock, /off/i, 'must mention off mode');
  assert.match(docBlock, /event-schemas\.mjs/, 'must cite the mirror module');
  assert.match(docBlock, /unknownEvents/, 'must mention StateProjection.unknownEvents');
  assert.match(docBlock, /deprecated/i, 'must mark unknownEvents deprecated');
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
    writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
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

// The project's MATERIALIZED registry is the first source, not the domain
// overlay. Reading the overlay first was a surviving run-time composition path:
// after `adev governance materialize`, a project's reviewers live in its own
// `governance/review.yaml`, and resolving against the overlay reported them as
// undeclared and stamped `warning` over the severity they actually declare.

test('_resolveActorSeverity reads the PROJECT registry before the domain overlay', () => {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index', 'governance'), { recursive: true });
  writeFileSync(
    join(root, '.context-index', 'governance', 'review.yaml'),
    'reviewers:\n  - id: structural-architect\n    severity_cap: suggestion\n\nmaterialized_at: 2026-08-15T00:00:00Z\n',
  );

  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'reviewer',
    actorName: 'structural-architect',
    repoRoot: root,
    pluginRoot: PLUGIN_ROOT,
  });
  // The overlay says `blocker` for this id; the project's own file says
  // `suggestion`, and the project's file is what dispatches.
  assert.equal(sev, 'suggestion');
  cleanupTempDir(root);
});

test('_resolveActorSeverity resolves a validator from the project validate.yaml', () => {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index', 'governance'), { recursive: true });
  writeFileSync(
    join(root, '.context-index', 'governance', 'validate.yaml'),
    'checks:\n  - id: validate.check-8-boundaries\n    severity: error\n',
  );

  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'validator',
    actorName: 'validate.check-8-boundaries',
    repoRoot: root,
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'error');
  cleanupTempDir(root);
});

test('a malformed project registry degrades to the overlay rather than throwing', () => {
  const root = createTempDir();
  mkdirSync(join(root, '.context-index', 'governance'), { recursive: true });
  writeFileSync(join(root, '.context-index', 'governance', 'review.yaml'), 'reviewers: [\n  - broken');

  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'reviewer',
    actorName: 'structural-architect',
    repoRoot: root,
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'blocker', 'the overlay still answers when the project file is unreadable');
  cleanupTempDir(root);
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

test('_resolveActorSeverity returns validator severity for a known check in validate.yaml', () => {
  // The bundled software validate.yaml declares "validate.check-2-spec-compliance"
  // with severity: error. Validator severities now resolve from validate.yaml
  // (single-source model), not gates.yaml.
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'validator',
    actorName: 'validate.check-2-spec-compliance',
    repoRoot: '/tmp/__lifecycle_severity_validate__',
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'error');
});

test('_resolveActorSeverity returns warning-severity validator from validate.yaml', () => {
  // validate.check-1.5-source-manifest is declared with severity: warning.
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'validator',
    actorName: 'validate.check-1.5-source-manifest',
    repoRoot: '/tmp/__lifecycle_severity_validate_warn__',
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'warning');
});

test('_resolveActorSeverity returns "warning" for an unknown validator', () => {
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'validator',
    actorName: 'validate.check-does-not-exist',
    repoRoot: '/tmp/__lifecycle_severity_validate_unknown__',
    pluginRoot: PLUGIN_ROOT,
  });
  assert.equal(sev, 'warning');
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

test('_resolveActorSeverity self-derives the plugin root when pluginRoot is omitted (consumer-repo CLI path)', () => {
  // Regression: the `adev report` CLI never threads a pluginRoot, so the lib
  // received pluginRoot === undefined and fell back to repoRoot. In a consumer
  // repo (repoRoot is NOT the plugin tree) the bundled domain config was never
  // found, every event degraded to "warning" with DOMAIN_CONFIG_DEGRADED.
  // The lib must locate its own bundled templates regardless of caller.
  const sev = _resolveActorSeverity({
    domain: 'software',
    actorKind: 'reviewer',
    actorName: 'structural-architect', // severity_cap: blocker in bundled software domain
    repoRoot: '/tmp/__consumer_repo_not_plugin_tree__',
    // pluginRoot intentionally omitted — mirrors the CLI's args object.
  });
  assert.equal(sev, 'blocker');
});

test('reportReviewer stamps the domain severity_cap without an explicit pluginRoot', () => {
  // End-to-end mirror of the CLI path: lib/cli/report.mjs builds args with no
  // pluginRoot. The event on disk must carry the configured blocker severity,
  // not a degraded warning.
  const { root, specPath } = makeProject();
  try {
    reportReviewer(root, specPath, {
      step: 'review',
      reviewer: 'structural-architect',
      verdict: 'FAIL',
      // pluginRoot intentionally omitted.
    });
    const events = readEvents(root, specPath);
    const ev = events.find((e) => e.event === 'reviewer_report');
    assert.equal(ev.severity, 'blocker');
  } finally {
    cleanupTempDir(root);
  }
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
    // Severity now resolves from validate.yaml (single-source model). Use a
    // check id that the bundled software starter declares with severity: error.
    reportValidator(root, specPath, {
      step: 'validate',
      validator: 'validate.check-2-spec-compliance',
      verdict: 'PASS',
      duration_ms: 1200,
      pluginRoot: PLUGIN_ROOT,
    });
    const events = readEvents(root, specPath);
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.event, 'validator_report');
    assert.equal(ev.validator, 'validate.check-2-spec-compliance');
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

test('currentState projects test_depth_assigned events under testDepthAssignments, not unknownEvents', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: 'test_depth_assigned',
      plan: 'p.plan.md',
      task_id: 't1',
      depth: 'standard',
      source: 'chain',
      escalated: false,
      floor_applied: false,
      floor_legs: [],
      floor_inputs: 'available',
    });
    const s = currentState(root, specPath);
    assert.equal(s.unknownEvents.length, 0, 'test_depth_assigned must not land in unknownEvents[]');
    assert.ok(s.testDepthAssignments, 'testDepthAssignments field should exist');
    const key = 'p.plan.md::t1';
    assert.ok(s.testDepthAssignments[key], 'testDepthAssignments should be keyed by plan::task_id');
    assert.equal(s.testDepthAssignments[key].depth, 'standard');
    assert.equal(s.testDepthAssignments[key].plan, 'p.plan.md');
    assert.equal(s.testDepthAssignments[key].task_id, 't1');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState folds test_depth_assigned events for the same plan+task_id — last in append order wins', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: 'test_depth_assigned',
      plan: 'p.plan.md',
      task_id: 't1',
      depth: 'standard',
      source: 'chain',
      escalated: false,
      floor_applied: false,
      floor_legs: [],
      floor_inputs: 'available',
    });
    appendEvent(root, specPath, {
      event: 'test_depth_assigned',
      plan: 'p.plan.md',
      task_id: 't1',
      depth: 'thorough',
      source: 'escalation',
      escalated: true,
      floor_applied: true,
      floor_legs: ['sensitive-path'],
      floor_inputs: 'available',
    });
    // A different task_id under the same plan must not collide.
    appendEvent(root, specPath, {
      event: 'test_depth_assigned',
      plan: 'p.plan.md',
      task_id: 't2',
      depth: 'minimal',
      source: 'chain',
      escalated: false,
      floor_applied: false,
      floor_legs: [],
      floor_inputs: 'unavailable',
    });
    const s = currentState(root, specPath);
    const t1Key = 'p.plan.md::t1';
    const t2Key = 'p.plan.md::t2';
    assert.equal(s.unknownEvents.length, 0);
    assert.equal(Object.keys(s.testDepthAssignments).length, 2);
    assert.equal(s.testDepthAssignments[t1Key].depth, 'thorough', 'most recent event (append order) wins');
    assert.equal(s.testDepthAssignments[t1Key].source, 'escalation');
    assert.deepEqual(s.testDepthAssignments[t1Key].floor_legs, ['sensitive-path']);
    assert.equal(s.testDepthAssignments[t2Key].depth, 'minimal');
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

// ── issue-584: BLOCK is first-class lifecycle vocabulary ───────────────────
//
// A reviewer_report carrying the consolidated BLOCK verdict used to match no
// branch in aggregateReports and fell through to `{verdict: PASS}` — a blocked
// review projected as a pass whenever the explicit step_completed event was
// missing (e.g. the run died between emitting reviewer reports and the step
// exit). These tests pin BLOCK as a non-passing synthesized verdict.

test('aggregation: BLOCK report -> step BLOCK/completed (never PASS)', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'blocker', 'BLOCK');
    rawReviewer(root, specPath, 'review', 'b', 'error', 'PASS');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'BLOCK');
    assert.equal(s.steps.review.status, 'completed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: BLOCK outranks PASS_WITH_NOTES and warning-severity FAIL', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'warning', 'FAIL');
    rawReviewer(root, specPath, 'review', 'b', 'warning', 'PASS_WITH_NOTES');
    rawReviewer(root, specPath, 'review', 'c', 'blocker', 'BLOCK');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'BLOCK');
    assert.equal(s.steps.review.status, 'completed');
  } finally { cleanupTempDir(root); }
});

test('aggregation: blocker/error FAIL still outranks BLOCK', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'error', 'FAIL');
    rawReviewer(root, specPath, 'review', 'b', 'blocker', 'BLOCK');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'FAIL');
    assert.equal(s.steps.review.status, 'failed');
  } finally { cleanupTempDir(root); }
});

test('requireGate blocks downstream steps on a synthesized BLOCK review verdict', () => {
  const { root, specPath } = makeProject();
  try {
    rawReviewer(root, specPath, 'review', 'a', 'blocker', 'BLOCK');
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'BLOCK');
    assert.throws(
      () => requireGate(s, 'plan', { mode: 'strict' }),
      (err) => err.code === 'GATE_BLOCKED',
      'BLOCK must not read as a passing verdict',
    );
  } finally { cleanupTempDir(root); }
});

test('requireGate blocks downstream steps on an explicit step_completed BLOCK verdict', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: 'step_completed',
      step: 'review',
      verdict: 'BLOCK',
    });
    const s = currentState(root, specPath);
    assert.equal(s.steps.review.verdict, 'BLOCK');
    assert.equal(s.steps.review.status, 'completed');
    assert.throws(
      () => requireGate(s, 'plan', { mode: 'strict' }),
      (err) => err.code === 'GATE_BLOCKED',
      'BLOCK must not read as a passing verdict',
    );
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
    writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
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

// ── Task 13: renderMarkdown body (markdown-rendering-layer spec) ───────────
// (was the foundation-spec stub; body now implemented per spec rev 1)

test('renderMarkdown returns a string with DO-NOT-EDIT header and spec ref', () => {
  const state = { spec: 'foo.spec.md', status: 'pending', steps: {}, planTasks: {}, interventions: [], unknownEvents: [] };
  const md = renderMarkdown(state);
  // Updated to match the markdown-rendering-layer canonical generated-header.
  assert.match(md, /<!-- DO NOT EDIT/);
  assert.match(md, /generated by `adev status --render`/);
  assert.match(md, /foo\.spec\.md/);
});

test('renderMarkdown body is stable modulo the trailing regen timestamp', () => {
  // The body includes a Date.now()-based regeneration footer, so byte-equality
  // does not hold across two calls. The full body up to the footer must match.
  const state = { spec: 'x.spec.md', status: 'in_progress', steps: {}, planTasks: {}, interventions: [], unknownEvents: [] };
  const a = renderMarkdown(state);
  const b = renderMarkdown(state);
  // Strip the regeneration footer (`<!-- regenerated from ... on ... -->`).
  const stripFooter = (s) => s.replace(/<!-- regenerated from .*? on .*? -->$/, '');
  assert.equal(stripFooter(a), stripFooter(b));
});

// ── Task 18: manifest documents lifecycle.gate_mode ───────────────────────

test('project manifest documents lifecycle.gate_mode (commented or active)', () => {
  // Resolve the project manifest two levels up from this test file.
  const manifestPath = pathDirname(pathDirname(__dirname)) + '/.context-index/manifest.yaml';
  const raw = readFileSync(manifestPath, 'utf8');
  assert.match(raw, /lifecycle\.gate_mode|lifecycle:\s*[\s\S]*?gate_mode:/, 'manifest should reference lifecycle.gate_mode');
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
    writeFileSync(join(root, '.context-index', 'manifest.yaml'), 'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
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

// ── byRevision[N] projection (review-block-auto-retry Task 3) ──────────────

test('currentState projects state.steps.<step>.byRevision[N] when events carry revision', () => {
  const { root, specPath } = makeProject();
  try {
    // rev 1 review FAIL → BLOCK
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect', verdict: 'FAIL',
      notes: 'block on rev 1', revision: 1,
    });
    reportStep(root, specPath, { step: 'review', status: 'failed', verdict: 'FAIL', revision: 1 });
    // rev 2 review PASS
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect', verdict: 'PASS',
      notes: 'rev 2 ok', revision: 2,
    });
    reportStep(root, specPath, { step: 'review', status: 'completed', verdict: 'PASS', revision: 2 });

    const state = currentState(root, specPath);
    const review = state.steps.review;
    assert.ok(review.byRevision, 'review step must expose byRevision');
    assert.ok(review.byRevision[1], 'byRevision[1] must exist');
    assert.ok(review.byRevision[2], 'byRevision[2] must exist');
    assert.equal(review.byRevision[1].verdict, 'FAIL');
    assert.equal(review.byRevision[2].verdict, 'PASS');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState top-level state.steps.<step> reflects the latest revision (no breaking change)', () => {
  const { root, specPath } = makeProject();
  try {
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect', verdict: 'FAIL',
      notes: 'block', revision: 1,
    });
    reportStep(root, specPath, { step: 'review', status: 'failed', verdict: 'FAIL', revision: 1 });
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect', verdict: 'PASS',
      notes: 'fixed', revision: 2,
    });
    reportStep(root, specPath, { step: 'review', status: 'completed', verdict: 'PASS', revision: 2 });

    const state = currentState(root, specPath);
    // Top-level reflects latest revision
    assert.equal(state.steps.review.verdict, 'PASS');
    assert.equal(state.steps.review.status, 'completed');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState folds legacy events without revision into byRevision[1]', () => {
  const { root, specPath } = makeProject();
  try {
    // No revision: field — legacy emitter
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect', verdict: 'PASS',
      notes: 'legacy',
    });
    reportStep(root, specPath, { step: 'review', status: 'completed', verdict: 'PASS' });

    const state = currentState(root, specPath);
    assert.ok(state.steps.review.byRevision, 'byRevision projection always present');
    assert.ok(state.steps.review.byRevision[1], 'legacy events fold into revision 1');
    assert.equal(state.steps.review.byRevision[1].verdict, 'PASS');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState byRevision[N] entries carry verdict + completed_at + blockers', () => {
  const { root, specPath } = makeProject();
  try {
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'security-reviewer', verdict: 'FAIL',
      notes: 'block', revision: 1,
    });
    reportStep(root, specPath, { step: 'review', status: 'failed', verdict: 'FAIL', revision: 1 });
    const state = currentState(root, specPath);
    const rev1 = state.steps.review.byRevision[1];
    assert.equal(rev1.verdict, 'FAIL');
    assert.ok(typeof rev1.completed_at === 'string' && rev1.completed_at.length > 0);
    assert.ok(Array.isArray(rev1.blockers));
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState byRevision works across multiple step names (review, plan, implement)', () => {
  const { root, specPath } = makeProject();
  try {
    reportStep(root, specPath, { step: 'plan', status: 'completed', verdict: 'PASS', revision: 1 });
    reportStep(root, specPath, { step: 'review', status: 'failed', verdict: 'FAIL', revision: 1 });
    reportStep(root, specPath, { step: 'implement', status: 'completed', verdict: 'PASS', revision: 1 });
    const state = currentState(root, specPath);
    assert.ok(state.steps.plan.byRevision[1]);
    assert.ok(state.steps.review.byRevision[1]);
    assert.ok(state.steps.implement.byRevision[1]);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState reports spec_revised events as part of the projection (folds without crash)', () => {
  const { root, specPath } = makeProject();
  try {
    // Emit a spec_revised event directly
    appendEvent(root, specPath, {
      event: 'spec_revised',
      from_revision: 1,
      to_revision: 2,
      addressed_blocker_ids: ['x:y:abc12345'],
      unresolved_blocker_ids: [],
    });
    // Should not throw and not appear under unknownEvents
    const state = currentState(root, specPath);
    assert.equal(state.unknownEvents.length, 0, 'spec_revised must be recognized as canonical');
  } finally {
    cleanupTempDir(root);
  }
});

// ── Drift + amendment projection (jsonl-drift-events.spec.md Behaviors 3/5,
//    spec-amendment-artifacts.spec.md Behavior 4) ───────────────────────────

/**
 * Write raw JSONL lines straight to a spec's log, bypassing `appendEvent`.
 * Used by the canonical-coverage test so write-time schema diagnostics cannot
 * confound what is purely a *reducer* assertion.
 */
function writeRawLog(root, specPath, events) {
  const slug = slugFromSpec(specPath);
  const dir = join(root, '.context-index', 'lifecycle-state');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.jsonl`),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
}

test('currentState projects code_drift_detected under state.drift (not unknownEvents)', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: 'code_drift_detected',
      drift_source: 'skills/work/SKILL.md',
      drift_at: '2026-08-13T03:10:54.621Z',
      ts: '2026-08-13T03:10:54.622Z',
    });
    const state = currentState(root, specPath);
    assert.equal(state.unknownEvents.length, 0, 'code_drift_detected must not fall through to unknownEvents');
    assert.ok(state.drift, 'state.drift must be populated');
    assert.equal(state.drift.source, 'skills/work/SKILL.md');
    assert.equal(state.drift.at, '2026-08-13T03:10:54.621Z');
    assert.equal(state.drift.ts, '2026-08-13T03:10:54.622Z');
    // CON-2 / AC "no snake_case keys on the projection".
    for (const k of Object.keys(state.drift)) {
      assert.ok(!k.includes('_'), `projection key ${k} must be camelCase`);
    }
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState leaves state.drift null when no drift event was ever recorded', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    const state = currentState(root, specPath);
    assert.equal(state.drift, null);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState: a later code_drift_cleared cancels a prior code_drift_detected', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: 'code_drift_detected',
      drift_source: 'lib/lifecycle-state.mjs',
      drift_at: '2026-08-13T03:10:54.621Z',
    });
    assert.ok(currentState(root, specPath).drift, 'precondition: drift is detected');

    appendEvent(root, specPath, {
      event: 'code_drift_cleared',
      drift_at: '2026-08-13T04:00:00.000Z',
    });
    const state = currentState(root, specPath);
    assert.equal(state.drift, null, 'code_drift_cleared must supersede the prior detection');
    assert.equal(state.unknownEvents.length, 0, 'code_drift_cleared must not fall through to unknownEvents');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState: a re-armed detection after a clear wins (latest unresolved event)', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'code_drift_detected', drift_source: 'first.mjs', drift_at: '2026-08-13T01:00:00.000Z' });
    appendEvent(root, specPath, { event: 'code_drift_cleared', drift_at: '2026-08-13T02:00:00.000Z' });
    appendEvent(root, specPath, { event: 'code_drift_detected', drift_source: 'second.mjs', drift_at: '2026-08-13T03:00:00.000Z' });
    const state = currentState(root, specPath);
    assert.ok(state.drift);
    assert.equal(state.drift.source, 'second.mjs', 'latest unresolved detection wins');
    assert.equal(state.drift.at, '2026-08-13T03:00:00.000Z');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState: code_drift_cleared with no prior detection is a no-op, not a crash', () => {
  // Legacy pre-migration specs can carry a bare clear event.
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'code_drift_cleared', drift_at: '2026-08-13T02:00:00.000Z' });
    const state = currentState(root, specPath);
    assert.equal(state.drift, null);
    assert.equal(state.unknownEvents.length, 0);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState: a malformed drift payload projects null fields rather than raw values', () => {
  const { root, specPath } = makeProject();
  try {
    writeRawLog(root, specPath, [
      { event: 'code_drift_detected', drift_source: 42, drift_at: null, ts: '2026-08-13T03:10:54.622Z' },
    ]);
    const state = currentState(root, specPath);
    assert.ok(state.drift, 'a malformed payload still registers a detection');
    assert.equal(state.drift.source, null, 'non-string drift_source is normalised to null (mirrors lib/cli/verify.mjs)');
    assert.equal(state.drift.at, null);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState: drift is advisory — it does not move status or currentStep', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify', verdict: 'PASS' });
    const before = currentState(root, specPath);

    appendEvent(root, specPath, {
      event: 'code_drift_detected',
      drift_source: 'skills/work/SKILL.md',
      drift_at: '2026-08-13T03:10:54.621Z',
    });
    const after = currentState(root, specPath);

    assert.equal(after.status, before.status, 'drift must not change the aggregate status');
    assert.equal(after.currentStep, before.currentStep, 'drift must not change currentStep');
    assert.deepEqual(after.steps.specify.verdict, before.steps.specify.verdict);
    assert.deepEqual(after.steps.specify.status, before.steps.specify.status);
  } finally {
    cleanupTempDir(root);
  }
});

test('requireGate behaves identically with and without a drift event in the log', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'lifecycle_step', step: 'specify', status: 'started' });
    appendEvent(root, specPath, { event: 'step_completed', step: 'specify', verdict: 'PASS' });
    // Gate on "review" — its predecessor "specify" passed, so it must not throw.
    assert.doesNotThrow(() => requireGate(currentState(root, specPath), 'review', { mode: 'strict' }));

    appendEvent(root, specPath, {
      event: 'code_drift_detected',
      drift_source: 'lib/lifecycle-state.mjs',
      drift_at: '2026-08-13T03:10:54.621Z',
    });
    const drifted = currentState(root, specPath);
    assert.ok(drifted.drift, 'precondition: the projection sees the drift');
    assert.doesNotThrow(
      () => requireGate(drifted, 'review', { mode: 'strict' }),
      'drift must never block a gate',
    );
    // And a gate that was already blocked stays blocked for the same reason.
    assert.throws(() => requireGate(drifted, 'implement', { mode: 'strict' }), /Lifecycle gate blocked/);
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState projects spec_amended under specAmendments[] (not unknownEvents)', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, {
      event: 'spec_amended',
      amendment_slug: 'sample.extra-guard',
      amendment_path: '.context-index/specs/features/test/sample.extra-guard.spec.md',
      target_revision: 3,
    });
    const state = currentState(root, specPath);
    assert.equal(state.unknownEvents.length, 0, 'spec_amended must be recognized by the reducer');
    assert.ok(Array.isArray(state.specAmendments), 'specAmendments[] must be created lazily on first event');
    assert.equal(state.specAmendments.length, 1);
    assert.equal(state.specAmendments[0].amendment_slug, 'sample.extra-guard');
    assert.equal(state.specAmendments[0].target_revision, 3);
    // Amendment is a relationship overlay, not a lifecycle position.
    assert.equal(state.currentStep, null);
    assert.equal(state.status, 'pending');
  } finally {
    cleanupTempDir(root);
  }
});

test('currentState accumulates multiple spec_amended events in append order', () => {
  const { root, specPath } = makeProject();
  try {
    appendEvent(root, specPath, { event: 'spec_amended', amendment_slug: 'a', target_revision: 2 });
    appendEvent(root, specPath, { event: 'spec_amended', amendment_slug: 'b', target_revision: 3 });
    const state = currentState(root, specPath);
    assert.deepEqual(state.specAmendments.map((e) => e.amendment_slug), ['a', 'b']);
  } finally {
    cleanupTempDir(root);
  }
});

test('every CANONICAL_EVENTS discriminator has a reducer case (none land in unknownEvents)', () => {
  // The CANONICAL_EVENTS gate in `currentState` precedes the switch, so any
  // canonical discriminator reaching `unknownEvents` can only have come from
  // the switch's `default:` branch — i.e. a missing reducer case. This is the
  // regression guard for the writer/reducer contract split that let
  // code_drift_detected, code_drift_cleared, and spec_amended be accepted on
  // write and silently discarded on read.
  const { root, specPath } = makeProject();
  try {
    writeRawLog(
      root,
      specPath,
      [...CANONICAL_EVENTS].map((event) => ({ event, ts: '2026-08-13T03:10:54.622Z' })),
    );
    const state = currentState(root, specPath);
    assert.deepEqual(
      state.unknownEvents.map((e) => e.event),
      [],
      'every canonical event must be handled by an explicit reducer case',
    );
  } finally {
    cleanupTempDir(root);
  }
});
