import { test } from "node:test";
import { strict as assert } from "node:assert";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadRegistry, normaliseMessage, runDiagnostics } from "../../lib/diagnostics/index.mjs";
import { stampMarker } from "../../lib/governance/registry-marker.mjs";

/**
 * Engine-level coverage for lib/diagnostics/index.mjs.
 *
 * Covers Behavior 1–6, Behavior 10, and every Error Case row in
 * .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md
 * rev 2.
 *
 * Containment tests build temp projects with carefully constructed
 * `.context-index/diagnostics/` symlinks. Timeout tests use deliberately
 * slow / hung runners. Redaction tests use throwing runners with absolute
 * paths embedded in error messages.
 *
 * Fixtures live under `tests/diagnostics/fixtures/runners/` and are copied
 * into each temp project's `.context-index/diagnostics/` so they fall under
 * the legitimate `project:` allowlist root.
 */










const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_RUNNERS = join(__dirname, 'fixtures', 'runners');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-diagnostics-test-')));
  mkdirSync(join(dir, '.context-index', 'governance'), { recursive: true });
  mkdirSync(join(dir, '.context-index', 'diagnostics'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  return dir;
}

function copyFixture(dir, name) {
  copyFileSync(
    join(FIXTURE_RUNNERS, name),
    join(dir, '.context-index', 'diagnostics', name),
  );
}

/**
 * Fixture maintenance (Task 10): `diagnostics.yaml` is a MARKED registry, so
 * `loadRegistry` now fails closed on a file with no `materialized_at` marker.
 * Every fixture here is about entry validation, containment and dispatch — none
 * is about materialization — so each is seeded already-materialized, the state
 * `adev governance materialize` leaves behind. No assertion below is weakened;
 * the guard simply runs before the code these tests exercise. The one test that
 * IS about the absent-registry path deletes the file rather than writing it,
 * and absence is deliberately not a guard failure.
 */
function writeRegistry(dir, yaml) {
  writeFileSync(
    join(dir, '.context-index', 'governance', 'diagnostics.yaml'),
    stampMarker(yaml, '2026-08-15T00:00:00Z'),
  );
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Containment (Behavior 2 Steps A–D, 6 cases per AC) ─────────────────────

test('containment: rejects raw ".." traversal in runner path', async () => {
  const dir = makeTempProject();
  try {
    writeRegistry(dir,
`diagnostics:
  - id: adev/bad-traversal
    runner: project:../../etc/passwd
    severity: error
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.ok(inv, 'expected adev/diagnostic-runner-invalid for ".." input');
    assert.equal(inv.severity, 'error');
  } finally { cleanup(dir); }
});

test('containment: rejects absolute paths', async () => {
  const dir = makeTempProject();
  try {
    writeRegistry(dir,
`diagnostics:
  - id: adev/bad-absolute
    runner: /etc/passwd
    severity: error
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.ok(inv, 'expected adev/diagnostic-runner-invalid for absolute path input');
  } finally { cleanup(dir); }
});

test('containment: rejects unprefixed relative paths', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'conforming.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/bad-bare
    runner: conforming.mjs
    severity: error
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.ok(inv, 'expected adev/diagnostic-runner-invalid for unprefixed runner');
  } finally { cleanup(dir); }
});

test('containment: rejects symlink-escape from .context-index/diagnostics to elsewhere', async () => {
  const dir = makeTempProject();
  try {
    // Create an "escape" symlink: .context-index/diagnostics/escape.mjs → /etc/hosts
    // The realpath will resolve outside the allowlist root.
    symlinkSync('/etc/hosts', join(dir, '.context-index', 'diagnostics', 'escape.mjs'));
    writeRegistry(dir,
`diagnostics:
  - id: adev/symlink-escape
    runner: project:escape.mjs
    severity: error
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.ok(inv, 'expected adev/diagnostic-runner-invalid for symlink that escapes the diagnostics root');
  } finally { cleanup(dir); }
});

test('containment: admits a legitimate project: runner under .context-index/diagnostics/', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'firing.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/legit-project
    runner: project:firing.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    // No containment error — runner ran and fired.
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.equal(inv, undefined, 'legitimate runner should not produce containment failure');
    const f = result.fired.find((v) => v.id === 'adev/legit-project');
    assert.ok(f, 'expected runner to fire');
    assert.ok(f.runner_path?.includes('.context-index/diagnostics/firing.mjs'), 'verdict must be stamped with the resolved runner_path');
  } finally { cleanup(dir); }
});

test('containment: admits a legitimate plugin: runner under lib/diagnostics/', async () => {
  // The plugin's own bundled producers (Tier-1 set) use the plugin: prefix.
  // Exercising one of them through the engine validates plugin-root containment.
  const dir = makeTempProject();
  try {
    writeRegistry(dir,
`diagnostics:
  - id: adev/event-schema-valid
    runner: plugin:tier1/event-schema-valid.mjs
    severity: error
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({
      projectRoot: dir,
      tier: 1,
      event: { event: 'reviewer_report', step: 's', reviewer: 'r', verdict: 'PASS', severity: 'error', ts: '2026-01-01T00:00:00Z' },
    });
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.equal(inv, undefined, 'legitimate plugin: runner should be admitted');
    // The event is well-formed → producer returns fired: false.
    const fired = result.fired.find((v) => v.id === 'adev/event-schema-valid');
    assert.equal(fired, undefined, 'well-formed event should not fire the schema producer');
  } finally { cleanup(dir); }
});

// ── Timeout (Behavior 5 Stage 2, 3 cases per AC) ────────────────────────────

test('timeout: slow runner (~250 ms) emits diagnostic-slow but completes', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'slow.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/slow-test
    runner: project:slow.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const t0 = Date.now();
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const elapsed = Date.now() - t0;
    // Must NOT have been abandoned via hard timeout.
    const timeout = result.errors.find((e) => e.id === 'adev/diagnostic-timeout');
    assert.equal(timeout, undefined, 'slow (not hung) runner should not trigger hard timeout');
    // SHOULD have emitted the soft-budget diagnostic.
    const slow = result.errors.find((e) => e.id === 'adev/diagnostic-slow');
    assert.ok(slow, 'expected adev/diagnostic-slow for a 250 ms runner');
    assert.equal(slow.severity, 'info');
    assert.ok(elapsed < 1000, `slow runner should complete near 250 ms; took ${elapsed}`);
  } finally { cleanup(dir); }
});

test('timeout: hung runner is abandoned within ~600 ms and emits diagnostic-timeout', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'hung.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/hung-test
    runner: project:hung.mjs
    severity: error
    tier: 1
    scope: event-impact
`);
    const t0 = Date.now();
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const elapsed = Date.now() - t0;
    const timeout = result.errors.find((e) => e.id === 'adev/diagnostic-timeout');
    assert.ok(timeout, 'expected adev/diagnostic-timeout for a hung runner');
    assert.equal(timeout.severity, 'error');
    assert.ok(elapsed >= 500, `should wait the hard timeout; elapsed=${elapsed}`);
    assert.ok(elapsed < 1500, `should not wait much past the timeout; elapsed=${elapsed}`);
  } finally { cleanup(dir); }
});

test('timeout: engine continues to invoke remaining runners after a timeout', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'hung.mjs');
    copyFixture(dir, 'firing.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/hung-first
    runner: project:hung.mjs
    severity: error
    tier: 1
    scope: event-impact
  - id: adev/firing-second
    runner: project:firing.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const timeout = result.errors.find((e) => e.id === 'adev/diagnostic-timeout');
    assert.ok(timeout, 'first runner should have timed out');
    const fired = result.fired.find((v) => v.id === 'adev/firing-second');
    assert.ok(fired, 'second runner must have been invoked despite first timing out');
  } finally { cleanup(dir); }
});

// ── Redaction (Behavior 3, 3 cases per AC) ──────────────────────────────────

test('redaction: project-root absolute path is rewritten to project: prefix', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'throws-project-path.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/throws-project
    runner: project:throws-project-path.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const errMsg = result.errors.find((e) => e.id === 'adev/throws-project')?.message;
    assert.ok(errMsg, 'expected a runtime error message');
    assert.ok(errMsg.includes('project:'), `message should rewrite project root to "project:"; got: ${errMsg}`);
    assert.ok(!errMsg.includes(dir), `message must not contain the literal projectRoot; got: ${errMsg}`);
    // V8 stack frames have the shape "  at fn (/path:line:col)" — verify none
    // survive. The fixture's error message contains the word "at" in plain
    // English ("failed at <path>"), which is NOT a stack frame; the regex
    // below targets the file:line:col triplet that only stack frames carry.
    assert.ok(!/at [^\s]+:\d+:\d+/.test(errMsg), `message must not contain V8 stack frame markers; got: ${errMsg}`);
  } finally { cleanup(dir); }
});

test('redaction: $HOME path (outside both roots) is rewritten to ~/', async () => {
  // Only run if HOME is set and doesn't contain the temp dir (avoid false negative
  // when the OS tmpdir is itself under HOME — common on macOS).
  const home = homedir();
  const dir = makeTempProject();
  // If the temp dir is under $HOME, the project: redaction wins first, masking the
  // ~/ check. Skip in that case.
  if (dir.startsWith(home + '/') || dir === home) {
    cleanup(dir);
    // Use a different temp location outside HOME. /tmp on macOS resolves to
    // /private/tmp via realpath, which is outside $HOME.
    return;
  }
  try {
    copyFixture(dir, 'throws-home-path.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/throws-home
    runner: project:throws-home-path.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const errMsg = result.errors.find((e) => e.id === 'adev/throws-home')?.message;
    assert.ok(errMsg, 'expected a runtime error message');
    assert.ok(errMsg.includes('~'), `message should rewrite $HOME to "~"; got: ${errMsg}`);
    assert.ok(!errMsg.includes(home), `message must not contain the literal $HOME; got: ${errMsg}`);
  } finally { cleanup(dir); }
});

test('redaction: external absolute path is replaced with <external-path-redacted>', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'throws-external-path.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/throws-external
    runner: project:throws-external-path.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const errMsg = result.errors.find((e) => e.id === 'adev/throws-external')?.message;
    assert.ok(errMsg, 'expected a runtime error message');
    assert.ok(errMsg.includes('<external-path-redacted>'), `message should redact external paths; got: ${errMsg}`);
    assert.ok(!errMsg.includes('/opt/some-external'), `message must not contain the literal external path; got: ${errMsg}`);
  } finally { cleanup(dir); }
});

// ── First-wins duplicate ────────────────────────────────────────────────────

test('duplicate-id: first entry wins, second emits diagnostic-duplicate-id warning', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'conforming.mjs');
    copyFixture(dir, 'firing.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/dup-test
    runner: project:conforming.mjs
    severity: warning
    tier: 1
    scope: event-impact
  - id: adev/dup-test
    runner: project:firing.mjs
    severity: error
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const dup = result.errors.find((e) => e.id === 'adev/diagnostic-duplicate-id');
    assert.ok(dup, 'expected adev/diagnostic-duplicate-id warning');
    assert.equal(dup.severity, 'warning');
    // First entry won → conforming.mjs ran → no fired verdict for adev/dup-test.
    const fired = result.fired.find((v) => v.id === 'adev/dup-test');
    assert.equal(fired, undefined, 'first-wins: conforming runner should have run, not firing');
  } finally { cleanup(dir); }
});

// ── Missing runner ─────────────────────────────────────────────────────────

test('missing-runner: rejected at containment (no such file)', async () => {
  const dir = makeTempProject();
  try {
    writeRegistry(dir,
`diagnostics:
  - id: adev/missing
    runner: project:does-not-exist.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    // Containment guard fails to realpath the missing file, so the entry
    // is rejected with diagnostic-runner-invalid before any import is attempted.
    const inv = result.errors.find((e) => e.id === 'adev/diagnostic-runner-invalid');
    assert.ok(inv, 'expected adev/diagnostic-runner-invalid for missing runner file');
  } finally { cleanup(dir); }
});

// ── Tier / scope / only filters ────────────────────────────────────────────

test('tier filter: tier:2 entry is skipped when requesting tier:1', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'firing.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/tier2-only
    runner: project:firing.mjs
    severity: warning
    tier: 2
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const fired = result.fired.find((v) => v.id === 'adev/tier2-only');
    assert.equal(fired, undefined, 'tier-2 entry should not fire when tier:1 was requested');
    const skip = result.skipped.find((s) => s.id === 'adev/tier2-only');
    assert.ok(skip, 'tier-2 entry should appear in skipped');
  } finally { cleanup(dir); }
});

test('scope filter: spec-scoped entry is skipped when requesting event-impact', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'firing.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/spec-scoped
    runner: project:firing.mjs
    severity: warning
    tier: 1
    scope: spec
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1, scope: 'event-impact' });
    const fired = result.fired.find((v) => v.id === 'adev/spec-scoped');
    assert.equal(fired, undefined, 'broader-scoped entry should be skipped');
  } finally { cleanup(dir); }
});

test('only filter: allowlist restricts dispatch to listed IDs', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'firing.mjs');
    copyFixture(dir, 'conforming.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/wanted
    runner: project:firing.mjs
    severity: warning
    tier: 1
    scope: event-impact
  - id: adev/unwanted
    runner: project:conforming.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1, only: ['adev/wanted'] });
    assert.ok(result.fired.find((v) => v.id === 'adev/wanted'), 'allowlist entry should fire');
    const skip = result.skipped.find((s) => s.id === 'adev/unwanted');
    assert.ok(skip, 'non-allowlist entry should appear in skipped');
  } finally { cleanup(dir); }
});

// ── Response shape (Behavior 10) ────────────────────────────────────────────

test('response shape: { fired, skipped, errors } always present', async () => {
  const dir = makeTempProject();
  try {
    // Empty registry — still expect the stable shape.
    writeRegistry(dir, `diagnostics: []\n`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    assert.ok(Array.isArray(result.fired));
    assert.ok(Array.isArray(result.skipped));
    assert.ok(Array.isArray(result.errors));
    assert.equal(result.fired.length, 0);
    assert.equal(result.errors.length, 0);
  } finally { cleanup(dir); }
});

test('missing-registry: returns shape with adev/registry-missing warning', async () => {
  const dir = makeTempProject();
  // intentionally do NOT write registry
  try {
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const missing = result.errors.find((e) => e.id === 'adev/registry-missing');
    assert.ok(missing);
    assert.equal(missing.severity, 'warning');
  } finally { cleanup(dir); }
});

// ── Schema validation ───────────────────────────────────────────────────────

test('schema: invalid severity rejects entry as SCHEMA_INVALID', async () => {
  const dir = makeTempProject();
  try {
    writeRegistry(dir,
`diagnostics:
  - id: adev/bad-sev
    runner: project:conforming.mjs
    severity: critical
    tier: 1
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const err = result.errors.find((e) => e.id === 'adev/bad-sev');
    assert.ok(err, 'expected schema-invalid error for severity=critical');
    assert.ok(err.message.includes('SCHEMA_INVALID'));
  } finally { cleanup(dir); }
});

test('schema: invalid tier rejects entry as SCHEMA_INVALID', async () => {
  const dir = makeTempProject();
  try {
    writeRegistry(dir,
`diagnostics:
  - id: adev/bad-tier
    runner: project:conforming.mjs
    severity: error
    tier: 7
    scope: event-impact
`);
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    const err = result.errors.find((e) => e.id === 'adev/bad-tier');
    assert.ok(err, 'expected schema-invalid error for tier=7');
    assert.ok(err.message.includes('SCHEMA_INVALID'));
  } finally { cleanup(dir); }
});

// ── Direct unit test of normaliseMessage ────────────────────────────────────

test('normaliseMessage: strips stack frames', () => {
  const msg = 'failed\n    at someFn (/abs/path/file.mjs:10:5)\n    at other (/elsewhere.mjs:1:1)';
  const out = normaliseMessage(msg, { realProjectRoot: '/no/match', realPluginRoot: '/no/match2', home: '/nope' });
  assert.ok(!/\bat \b/.test(out), `expected no "at " frames; got: ${JSON.stringify(out)}`);
});

test('normaliseMessage: leaves non-path content unchanged', () => {
  const msg = 'runner exceeded 500 ms hard timeout: adev/some-id';
  const out = normaliseMessage(msg, { realProjectRoot: '/no/match', realPluginRoot: '/no/match2', home: '/nope' });
  assert.equal(out, msg);
});

// ── spec-not-found ─────────────────────────────────────────────────────────

test('spec-not-found: missing spec path emits adev/spec-not-found', async () => {
  const dir = makeTempProject();
  try {
    writeRegistry(dir, `diagnostics: []\n`);
    const result = await runDiagnostics({
      projectRoot: dir,
      spec: '.context-index/specs/features/missing/missing.spec.md',
      tier: 1,
    });
    const err = result.errors.find((e) => e.id === 'adev/spec-not-found');
    assert.ok(err, 'expected adev/spec-not-found self-diagnostic');
    assert.equal(err.severity, 'error');
  } finally { cleanup(dir); }
});

// ── loadRegistry directly ───────────────────────────────────────────────────

test('loadRegistry: returns entries array on a valid registry', async () => {
  const dir = makeTempProject();
  try {
    copyFixture(dir, 'conforming.mjs');
    writeRegistry(dir,
`diagnostics:
  - id: adev/x
    runner: project:conforming.mjs
    severity: warning
    tier: 1
    scope: event-impact
`);
    const reg = await loadRegistry(dir);
    assert.equal(reg.entries.length, 1);
    assert.equal(reg.entries[0].id, 'adev/x');
    assert.ok(reg.entries[0].runner_path.includes('conforming.mjs'));
    assert.equal(reg.missing, false);
  } finally { cleanup(dir); }
});

// ─── merged from tests/diagnostics/index-smoke.test.mjs ──────────────────────────────────────────────
{
  /**
   * Smoke test for lib/diagnostics/index.mjs — verifies the module exports
   * `runDiagnostics` and `loadRegistry` and returns the stable response
   * shape on a minimal happy path.
   *
   * Full engine coverage (containment, timeout, redaction, duplicates,
   * filters) lives in tests/diagnostics/registry.test.mjs (plan Task 9).
   */








  test('module exports runDiagnostics and loadRegistry', () => {
    assert.equal(typeof runDiagnostics, 'function');
    assert.equal(typeof loadRegistry, 'function');
  });

  test('runDiagnostics returns the stable response shape even when registry is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'adev-diagnostics-smoke-'));
    mkdirSync(join(dir, '.context-index/governance'), { recursive: true });
    writeFileSync(
      join(dir, '.context-index/manifest.yaml'),
      'project:\n  name: t\n  adev_version: "0.22.0"\n',
    );
    const result = await runDiagnostics({ projectRoot: dir, tier: 1 });
    assert.ok(Array.isArray(result.fired));
    assert.ok(Array.isArray(result.skipped));
    assert.ok(Array.isArray(result.errors));
    // Missing registry surfaces as a self-diagnostic in errors.
    const missing = result.errors.find((e) => e.id === 'adev/registry-missing');
    assert.ok(missing, 'expected adev/registry-missing self-diagnostic when governance/diagnostics.yaml is absent');
    assert.equal(missing.severity, 'warning');
  });
}
