/**
 * CLI integration tests for `adev specify group-blockers` — Task 7 of
 * review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md.
 *
 * The verb reads a spec's current body + its `.blockers.md` sidecar,
 * resolves heading anchors, and groups `defect`-classed blocker ids by
 * anchor — so `/adev:specify`'s Revise Mode can dispatch one authoring
 * subagent per anchor via a named CLI verb (cli-driver-surface charter)
 * instead of importing `groupBlockersByAnchor` as inline logic in SKILL.md.
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

function makeSpecWithBlockers({ blockersYaml } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adev-cli-group-blockers-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'), 'project:\n  name: test\n');
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  writeFileSync(join(root, specPath), [
    '# Live Spec', '', '---', 'revision: 1', 'created: 2026-05-01',
    'updated: 2026-05-01', 'status: review-blocked', '---', '',
    '## Preconditions', '', 'Pre text.', '',
    '## Behaviors', '', 'Beh text.', '',
  ].join('\n'));
  if (blockersYaml) {
    writeFileSync(join(root, specPath.replace(/\.spec\.md$/, '.blockers.md')), blockersYaml);
  }
  return { root, specPath };
}

function runCli(root, args) {
  return spawnSync('node', [CLI, 'specify', ...args], { cwd: root, encoding: 'utf8' });
}

test('adev specify group-blockers groups defect-classed blockers by anchor with current section text', () => {
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: preconditions',
    'finding_class: defect',
    '```',
    '```',
    'prose one',
    '```',
    '## a:2:22222222',
    '```yaml',
    'blocker_id: a:2:22222222',
    'section_anchor: behaviors',
    'finding_class: defect',
    '```',
    '```',
    'prose two',
    '```',
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.anchors.preconditions.blocker_ids, ['a:1:11111111']);
    assert.ok(payload.anchors.preconditions.current_text.includes('Pre text.'));
    assert.deepStrictEqual(payload.anchors.behaviors.blocker_ids, ['a:2:22222222']);
    assert.ok(payload.anchors.behaviors.current_text.includes('Beh text.'));
    assert.deepStrictEqual(payload.anchors_not_found, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers excludes decision/external-classed blockers', () => {
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: preconditions',
    'finding_class: decision',
    '```',
    '```',
    'needs a human call',
    '```',
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.anchors, {}, 'decision-classed blocker must not appear in any authoring group');
    assert.deepStrictEqual(payload.decision_blocker_ids, ['a:1:11111111']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers reports external_blockers with remedy_ref for the build loop\'s External Remedies line', () => {
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: preconditions',
    'finding_class: external',
    'remedy_ref: see ADR-0022',
    '```',
    '```',
    'needs an external system change',
    '```',
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.anchors, {}, 'external-classed blocker must not appear in any authoring group');
    assert.deepStrictEqual(payload.external_blockers, [
      { blocker_id: 'a:1:11111111', section_anchor: 'preconditions', remedy_ref: 'see ADR-0022' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers reports empty decision_blocker_ids/external_blockers when all blockers are defect-classed', () => {
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: preconditions',
    'finding_class: defect',
    '```',
    '```',
    'prose',
    '```',
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.decision_blocker_ids, []);
    assert.deepStrictEqual(payload.external_blockers, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers reports anchors_not_found for an anchor with no matching heading', () => {
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: nonexistent-section',
    'finding_class: defect',
    '```',
    '```',
    'prose',
    '```',
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.anchors_not_found, ['nonexistent-section']);
    assert.deepStrictEqual(payload.anchors['nonexistent-section'].blocker_ids, ['a:1:11111111']);
    assert.strictEqual(payload.anchors['nonexistent-section'].current_text, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers with no .blockers.md yields empty anchors', () => {
  const { root, specPath } = makeSpecWithBlockers();
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(payload.anchors, {});
    assert.deepStrictEqual(payload.anchors_not_found, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers rejects path-traversal — INVALID_SPEC_PATH', () => {
  const { root } = makeSpecWithBlockers();
  try {
    const result = runCli(root, ['group-blockers', '--spec', '../../etc/passwd']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('INVALID_SPEC_PATH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers fails on missing --spec — exit 1', () => {
  const { root } = makeSpecWithBlockers();
  try {
    const result = runCli(root, ['group-blockers']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('usage:'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
