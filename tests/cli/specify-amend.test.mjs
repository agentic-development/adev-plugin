/**
 * CLI integration tests for `adev specify amend` — Task 4 of
 * spec-amendment-artifacts.plan.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, '../../cli/index.mjs');

function makeBase({ revision = 3, kind = 'behavioral', status = 'validated' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adev-cli-amend-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
  const specPath = '.context-index/specs/cross-cutting/checkout.spec.md';
  writeFileSync(join(root, specPath),
    [
      '# Live Spec: Checkout',
      '',
      '---',
      'charter: cross-cutting',
      `kind: ${kind}`,
      `revision: ${revision}`,
      'charter-revision: 1',
      'created: 2026-05-01',
      'updated: 2026-05-01',
      `status: ${status}`,
      '---',
      '',
      '## Behaviors',
      '',
      '1. **When** X **then** Y.',
      '',
    ].join('\n'));
  return { root, specPath };
}

function runCli(root, args) {
  return spawnSync('node', [CLI, 'specify', ...args], { cwd: root, encoding: 'utf8' });
}

test('adev specify amend scaffolds the amendment + JSON output (exit 0)', () => {
  const { root, specPath } = makeBase({ revision: 3 });
  try {
    const result = runCli(root, ['amend', '--spec', specPath, '--descriptor', 'drop-coupon']);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.target_revision, 4);
    assert.equal(payload.amendment_path, '.context-index/specs/cross-cutting/checkout-rev-4-drop-coupon.spec.md');
    assert.ok(existsSync(join(root, payload.amendment_path)));
    const body = readFileSync(join(root, payload.amendment_path), 'utf8');
    assert.match(body, /amends:\s*\.context-index\/specs\/cross-cutting\/checkout\.spec\.md/);
    assert.match(body, /target-revision:\s*4/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend rejects --kind amendment with INVALID_KIND (exit 1)', () => {
  const { root, specPath } = makeBase();
  try {
    const result = runCli(root, ['amend', '--spec', specPath, '--descriptor', 'foo', '--kind', 'amendment']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_KIND'),
      `expected INVALID_KIND in stderr; got: ${result.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend rejects --amend mutual-exclusion with --revise — CONFLICTING_FLAGS', () => {
  const { root, specPath } = makeBase();
  try {
    const result = runCli(root, ['amend', '--spec', specPath, '--descriptor', 'foo', '--revise']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('CONFLICTING_FLAGS'),
      `expected CONFLICTING_FLAGS in stderr; got: ${result.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend rejects --cross-cutting — CONFLICTING_FLAGS', () => {
  const { root, specPath } = makeBase();
  try {
    const result = runCli(root, ['amend', '--spec', specPath, '--descriptor', 'foo', '--cross-cutting']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('CONFLICTING_FLAGS'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend rejects path-traversal — INVALID_SPEC_PATH (exit 1)', () => {
  const { root } = makeBase();
  try {
    const result = runCli(root, ['amend', '--spec', '../../etc/passwd.spec.md', '--descriptor', 'foo']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_SPEC_PATH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend rejects illegal descriptor — INVALID_AMENDMENT_DESCRIPTOR', () => {
  const { root, specPath } = makeBase();
  try {
    const result = runCli(root, ['amend', '--spec', specPath, '--descriptor', '../evil']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_AMENDMENT_DESCRIPTOR'),
      `expected INVALID_AMENDMENT_DESCRIPTOR; got: ${result.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend fails on missing --spec — exit 1', () => {
  const { root } = makeBase();
  try {
    const result = runCli(root, ['amend', '--descriptor', 'foo']);
    assert.equal(result.status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify amend prints help via amend --help', () => {
  const { root } = makeBase();
  try {
    const result = runCli(root, ['amend', '--help']);
    assert.ok(result.stdout.includes('adev specify amend') || result.stderr.includes('adev specify amend'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
