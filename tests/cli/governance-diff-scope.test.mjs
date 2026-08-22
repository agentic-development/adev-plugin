/**
 * CLI integration tests for `adev governance diff-scope` — Task 10 of
 * review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md.
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

function sh(root, args) {
  const r = spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${args.join(' ')} failed: ${r.stderr}`);
  return r;
}

function runCli(root, args) {
  return spawnSync('node', [CLI, 'governance', ...args], { cwd: root, encoding: 'utf8' });
}

function makeGitRoot() {
  const root = mkdtempSync(join(tmpdir(), 'adev-diff-scope-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'), 'project:\n  name: test\n');
  sh(root, ['git', 'init', '-q']);
  sh(root, ['git', 'config', 'user.email', 'test@test.com']);
  sh(root, ['git', 'config', 'user.name', 'test']);
  return root;
}

function writeSpec(root, specPath, revision, sections) {
  const lines = [
    '# Live Spec', '', '---', `revision: ${revision}`, 'created: 2026-05-01',
    'updated: 2026-05-01', 'status: review-pending', '---', '', ...sections,
  ];
  writeFileSync(join(root, specPath), lines.join('\n'));
}

test('adev governance diff-scope reports scoped:false on a spec\'s first review (no completed review event yet)', () => {
  const root = makeGitRoot();
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  try {
    writeSpec(root, specPath, 1, ['## Preconditions', '', 'Text.', '']);
    const result = runCli(root, ['diff-scope', '--spec', specPath, '--json']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.strictEqual(payload.scoped, false);
    assert.strictEqual(payload.reason, 'first-review');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev governance diff-scope scopes to changed + cross-referenced sections on a re-review', () => {
  const root = makeGitRoot();
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  try {
    // rev 1, committed, reviewed and completed.
    writeSpec(root, specPath, 1, [
      '## Preconditions', '', 'Original text.', '',
      '## Behaviors', '', 'Unrelated, never touched.', '',
      '## Notes', '', 'See the Preconditions section for context.', '',
    ]);
    sh(root, ['git', 'add', '.']);
    sh(root, ['git', 'commit', '-q', '-m', 'rev1']);
    sh(root, ['node', CLI, 'report', '--type', 'step', '--spec', specPath, '--step', 'review', '--status', 'started', '--revision', '1']);
    sh(root, ['node', CLI, 'report', '--type', 'step', '--spec', specPath, '--step', 'review', '--status', 'completed', '--verdict', 'BLOCK', '--revision', '1']);

    // rev 2 on disk (uncommitted): only Preconditions actually changed.
    writeSpec(root, specPath, 2, [
      '## Preconditions', '', 'Revised text.', '',
      '## Behaviors', '', 'Unrelated, never touched.', '',
      '## Notes', '', 'See the Preconditions section for context.', '',
    ]);

    const result = runCli(root, ['diff-scope', '--spec', specPath, '--json']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.strictEqual(payload.scoped, true);
    assert.strictEqual(payload.reason, 'diff-scoped');
    assert.ok(payload.changed_anchors.includes('preconditions'));
    // Notes cites Preconditions by name -> cross-reference expansion pulls it in.
    assert.ok(payload.changed_anchors.includes('notes'));
    assert.ok(!payload.changed_anchors.includes('behaviors'));
    assert.ok(payload.content.includes('Revised text.'));
    assert.ok(!payload.content.includes('Unrelated, never touched.'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev governance diff-scope reports scoped:false (git-unavailable) when the spec is not committed', () => {
  const root = makeGitRoot();
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  try {
    writeSpec(root, specPath, 1, ['## Preconditions', '', 'Text.', '']);
    // No commit at all -- git show HEAD:<path> will fail (no HEAD, or file untracked).
    sh(root, ['node', CLI, 'report', '--type', 'step', '--spec', specPath, '--step', 'review', '--status', 'started', '--revision', '1']);
    sh(root, ['node', CLI, 'report', '--type', 'step', '--spec', specPath, '--step', 'review', '--status', 'completed', '--verdict', 'BLOCK', '--revision', '1']);
    writeSpec(root, specPath, 2, ['## Preconditions', '', 'Revised.', '']);

    const result = runCli(root, ['diff-scope', '--spec', specPath, '--json']);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.strictEqual(payload.scoped, false);
    assert.strictEqual(payload.reason, 'git-unavailable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev governance diff-scope rejects path-traversal — INVALID_SPEC_PATH', () => {
  const root = makeGitRoot();
  try {
    const result = runCli(root, ['diff-scope', '--spec', '../../etc/passwd']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_SPEC_PATH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev governance diff-scope fails on missing --spec — exit 1', () => {
  const root = makeGitRoot();
  try {
    const result = runCli(root, ['diff-scope']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('usage:'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
