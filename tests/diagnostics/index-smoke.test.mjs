/**
 * Smoke test for lib/diagnostics/index.mjs — verifies the module exports
 * `runDiagnostics` and `loadRegistry` and returns the stable response
 * shape on a minimal happy path.
 *
 * Full engine coverage (containment, timeout, redaction, duplicates,
 * filters) lives in tests/diagnostics/registry.test.mjs (plan Task 9).
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDiagnostics, loadRegistry } from '../../lib/diagnostics/index.mjs';

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
