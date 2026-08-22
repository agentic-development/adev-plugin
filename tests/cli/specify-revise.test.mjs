/**
 * CLI integration tests for `adev specify revise` — Task 9 of
 * review-block-auto-retry.plan.md.
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

function makeBlockedSpec({ revision = 1, status = 'review-blocked' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adev-cli-revise-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  writeFileSync(join(root, specPath),
    [
      '# Live Spec',
      '',
      '---',
      `revision: ${revision}`,
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
  writeFileSync(join(root, specPath.replace(/\.spec\.md$/, '.review.md')),
    '# Review\nBLOCK\n');
  writeFileSync(join(root, specPath.replace(/\.spec\.md$/, '.blockers.md')),
    [
      '# Blockers',
      '## sa:x:11111111',
      '```yaml',
      'blocker_id: sa:x:11111111',
      'section_anchor: preconditions',
      '```',
      '```',
      'prose',
      '```',
    ].join('\n'));
  return { root, specPath };
}

function runCli(root, args) {
  return spawnSync('node', [CLI, 'specify', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('adev specify revise succeeds on a properly-blocked spec (exit 0)', () => {
  const { root, specPath } = makeBlockedSpec({ revision: 1 });
  try {
    const result = runCli(root, ['revise', '--spec', specPath]);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    // JSON line on stdout
    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.from_revision, 1);
    assert.equal(payload.to_revision, 2);
    // Spec was updated on disk
    const body = readFileSync(join(root, specPath), 'utf8');
    assert.ok(body.includes('revision: 2'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise (Task 6 real-diff): CLI does not yet wire authoredSections, so nothing is addressed by blanket acknowledgement', () => {
  // Regression guard for the defect this task fixes: prior to Task 6,
  // addressed_blocker_ids echoed the full blocker set unconditionally.
  // The CLI verb does not pass `authoredSections` (that wiring is Task 7's
  // job), so a plain `adev specify revise` must now report nothing
  // addressed and everything unresolved — never a fabricated "addressed".
  const { root, specPath } = makeBlockedSpec({ revision: 1 });
  try {
    const result = runCli(root, ['revise', '--spec', specPath]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.addressed_blocker_ids, []);
    assert.deepStrictEqual(payload.unresolved_blocker_ids, ['sa:x:11111111']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise rejects path-traversal — INVALID_SPEC_PATH (exit 1)', () => {
  const { root } = makeBlockedSpec();
  try {
    const result = runCli(root, ['revise', '--spec', '../../etc/passwd']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_SPEC_PATH'),
      `expected INVALID_SPEC_PATH in stderr; got: ${result.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise rejects spec outside projectRoot — INVALID_SPEC_PATH', () => {
  const { root } = makeBlockedSpec();
  const otherRoot = mkdtempSync(join(tmpdir(), 'adev-other-'));
  try {
    const outsidePath = join(otherRoot, 'outside.spec.md');
    writeFileSync(outsidePath, '---\nrevision: 1\n---\n');
    const result = runCli(root, ['revise', '--spec', outsidePath]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_SPEC_PATH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

test('adev specify revise rejects --extract with --revise — CONFLICTING_FLAGS', () => {
  const { root, specPath } = makeBlockedSpec();
  try {
    const result = runCli(root, ['revise', '--spec', specPath, '--extract']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('CONFLICTING_FLAGS'),
      `expected CONFLICTING_FLAGS in stderr; got: ${result.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise rejects --refactor with --revise — CONFLICTING_FLAGS', () => {
  const { root, specPath } = makeBlockedSpec();
  try {
    const result = runCli(root, ['revise', '--spec', specPath, '--refactor']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('CONFLICTING_FLAGS'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise rejects non-blocked spec under --auto — exit 2', () => {
  const { root, specPath } = makeBlockedSpec({ status: 'review-passed' });
  try {
    const result = runCli(root, ['revise', '--spec', specPath, '--auto']);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('SPEC_NOT_BLOCKED'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise prints help via --help', () => {
  const { root } = makeBlockedSpec();
  try {
    const result = runCli(root, ['revise', '--help']);
    // help() returns 0
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Usage: adev specify revise'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise fails on missing --spec — exit 1', () => {
  const { root } = makeBlockedSpec();
  try {
    const result = runCli(root, ['revise']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('usage:'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify revise fails on missing sidecars — NO_REVIEW_SIDECARS', () => {
  const { root, specPath } = makeBlockedSpec();
  // Remove the sidecars
  rmSync(join(root, specPath.replace(/\.spec\.md$/, '.review.md')));
  rmSync(join(root, specPath.replace(/\.spec\.md$/, '.blockers.md')));
  try {
    const result = runCli(root, ['revise', '--spec', specPath]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('NO_REVIEW_SIDECARS'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
