/**
 * CLI integration tests for `adev specify check-mechanisms` — Task 8 of
 * review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md.
 *
 * Reads the spec's current body and runs
 * lib/diagnostics/tier2/mechanism-existence.mjs::run() against it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, '../../cli/index.mjs');

function makeSpec(bodyLines) {
  const root = mkdtempSync(join(tmpdir(), 'adev-cli-check-mechanisms-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'), 'project:\n  name: test\n');
  writeFileSync(join(root, 'lib', 'foo.mjs'), 'export function bar() {\n  return 1;\n}\n');
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  writeFileSync(join(root, specPath), [
    '# Live Spec', '', '---', 'revision: 1', 'created: 2026-05-01',
    'updated: 2026-05-01', 'status: review-pending', '---', '',
    ...bodyLines,
  ].join('\n'));
  return { root, specPath };
}

function runCli(root, args) {
  return spawnSync('node', [CLI, 'specify', ...args], { cwd: root, encoding: 'utf8' });
}

test('adev specify check-mechanisms exits 0 when all referents resolve', () => {
  const { root, specPath } = makeSpec(['## Preconditions', '', 'See `lib/foo.mjs:2` for the return.', '']);
  try {
    const result = runCli(root, ['check-mechanisms', '--spec', specPath]);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.strictEqual(payload.fired, false);
    assert.deepStrictEqual(payload.unresolved, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify check-mechanisms exits 2 on an unresolved referent', () => {
  const { root, specPath } = makeSpec(['## Preconditions', '', 'See `lib/does-not-exist.mjs:1` for details.', '']);
  try {
    const result = runCli(root, ['check-mechanisms', '--spec', specPath]);
    assert.strictEqual(result.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify check-mechanisms prints unresolved detail sufficient to construct a blocker', () => {
  const { root, specPath } = makeSpec(['## Preconditions', '', 'See `../../etc/passwd:1` for details.', '']);
  try {
    const result = runCli(root, ['check-mechanisms', '--spec', specPath]);
    assert.equal(result.status, 2);
    const payload = JSON.parse(result.stdout.trim());
    assert.strictEqual(payload.unresolved.length, 1);
    assert.match(payload.unresolved[0].code, /MECHANISM_PATH_ESCAPE/);
    assert.ok(payload.unresolved[0].candidate);
    assert.ok(payload.unresolved[0].reason);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify check-mechanisms exits 0 when the spec cites no referents at all', () => {
  const { root, specPath } = makeSpec(['## Preconditions', '', 'Plain prose, nothing cited.', '']);
  try {
    const result = runCli(root, ['check-mechanisms', '--spec', specPath]);
    assert.equal(result.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify check-mechanisms rejects path-traversal — INVALID_SPEC_PATH', () => {
  const { root } = makeSpec(['## Preconditions', '']);
  try {
    const result = runCli(root, ['check-mechanisms', '--spec', '../../etc/passwd']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_SPEC_PATH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify check-mechanisms fails on missing --spec — exit 1', () => {
  const { root } = makeSpec(['## Preconditions', '']);
  try {
    const result = runCli(root, ['check-mechanisms']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('usage:'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
