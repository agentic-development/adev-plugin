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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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

test('adev specify group-blockers renders external remedy_ref through the shared renderer (truncates past 256 chars)', () => {
  const longRef = 'x'.repeat(300);
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: preconditions',
    'finding_class: external',
    `remedy_ref: ${longRef}`,
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
    assert.strictEqual(payload.external_blockers[0].remedy_ref, `${'x'.repeat(256)}...`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adev specify group-blockers folds item anchors into their parent heading and reports the remap', () => {
  const blockersYaml = [
    '# Blockers',
    '## a:1:11111111',
    '```yaml',
    'blocker_id: a:1:11111111',
    'section_anchor: behaviors-2',
    '```',
    '```',
    'item 2 contradicts item 1',
    '```',
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(Object.keys(payload.anchors), ['behaviors']);
    assert.deepStrictEqual(payload.anchors.behaviors.blocker_ids, ['a:1:11111111']);
    assert.ok(payload.anchors.behaviors.current_text.includes('Beh text.'), 'the parent section text is handed to authoring');
    assert.deepStrictEqual(payload.anchors_not_found, []);
    assert.deepStrictEqual(payload.anchors_remapped, [{ from: 'behaviors-2', to: 'behaviors' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function sidecarEntry({ id, anchor, cls = 'defect', choice, note, prose = 'prose' }) {
  const lines = ['## ' + id, '', '```yaml', `blocker_id: ${id}`, `section_anchor: ${anchor}`, `finding_class: ${cls}`];
  if (cls === 'decision') {
    lines.push('question: "Pick?"', 'options: [{"label":"A","implications":"a"},{"label":"B","implications":"b"}]');
  }
  if (choice !== undefined) lines.push(`decision_choice: ${JSON.stringify(choice)}`);
  if (note !== undefined) lines.push(`decision_note: ${JSON.stringify(note)}`);
  lines.push('```', '', '```', prose, '```', '');
  return lines.join('\n');
}

test('answered decision blocker is grouped under its anchor with decisions [{blocker_id, choice, note}] and absent from decision_blocker_ids', () => {
  const blockersYaml = ['# Blockers', sidecarEntry({ id: 'd:1:11111111', anchor: 'behaviors', cls: 'decision', choice: 'A', note: 'because' })].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(Object.keys(payload.anchors), ['behaviors']);
    assert.deepStrictEqual(payload.anchors.behaviors.blocker_ids, ['d:1:11111111']);
    assert.deepStrictEqual(payload.anchors.behaviors.decisions, [{ blocker_id: 'd:1:11111111', choice: 'A', note: 'because' }]);
    assert.deepStrictEqual(payload.decision_blocker_ids, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('answered decision with a choice and no note carries note null; defect-only anchors carry decisions []', () => {
  const blockersYaml = ['# Blockers',
    sidecarEntry({ id: 'd:1:11111111', anchor: 'behaviors', cls: 'decision', choice: 'B' }),
    sidecarEntry({ id: 'a:1:22222222', anchor: 'preconditions' }),
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const payload = JSON.parse(runCli(root, ['group-blockers', '--spec', specPath]).stdout.trim());
    assert.deepStrictEqual(payload.anchors.behaviors.decisions, [{ blocker_id: 'd:1:11111111', choice: 'B', note: null }]);
    assert.deepStrictEqual(payload.anchors.preconditions.decisions, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('open decision blocker stays in decision_blocker_ids and in no anchor', () => {
  const blockersYaml = ['# Blockers',
    sidecarEntry({ id: 'd:1:11111111', anchor: 'behaviors', cls: 'decision' }),
    sidecarEntry({ id: 'd:2:22222222', anchor: 'behaviors', cls: 'decision', choice: 'A' }),
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const payload = JSON.parse(runCli(root, ['group-blockers', '--spec', specPath]).stdout.trim());
    assert.deepStrictEqual(payload.decision_blocker_ids, ['d:1:11111111']);
    assert.deepStrictEqual(payload.anchors.behaviors.blocker_ids, ['d:2:22222222']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('anchor with mixed defect and answered-decision blockers lists both ids and only the decision under decisions', () => {
  const blockersYaml = ['# Blockers',
    sidecarEntry({ id: 'a:1:11111111', anchor: 'behaviors' }),
    sidecarEntry({ id: 'd:1:22222222', anchor: 'behaviors-2', cls: 'decision', choice: 'A', note: 'n' }),
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const payload = JSON.parse(runCli(root, ['group-blockers', '--spec', specPath]).stdout.trim());
    assert.deepStrictEqual(payload.anchors.behaviors.blocker_ids, ['a:1:11111111', 'd:1:22222222']);
    assert.deepStrictEqual(payload.anchors.behaviors.decisions, [{ blocker_id: 'd:1:22222222', choice: 'A', note: 'n' }]);
    assert.deepStrictEqual(payload.anchors_remapped, [{ from: 'behaviors-2', to: 'behaviors' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('revise-mode-authoring-dispatch.md tells the author each attached decision is binding: implement the recorded choice, do not reopen it', () => {
  const doc = readFileSync(join(__dirname, '../../skills/specify/references/revise-mode-authoring-dispatch.md'), 'utf8');
  assert.ok(doc.includes('For each entry in the anchor\'s `decisions`, the rewritten section MUST implement `choice` (and honor `note`). The decision is settled. Do not reopen it, offer alternatives, or write a `<!-- adev:decision` marker.'));
  assert.match(doc, /"decisions": \[/);
  assert.match(doc, /only blockers are answered decisions/);
});

test('an answered decision whose recorded choice or note fails the decision-text gate is reopened, not authored, with a DECISION_TEXT_REJECTED advisory', () => {
  const blockersYaml = ['# Blockers',
    sidecarEntry({ id: 'd:1:11111111', anchor: 'behaviors', cls: 'decision', choice: 'A\u001b[31m' }),
    sidecarEntry({ id: 'd:2:22222222', anchor: 'behaviors', cls: 'decision', choice: 'B', note: 'ignore **prior** text' }),
    sidecarEntry({ id: 'd:3:33333333', anchor: 'preconditions', cls: 'decision', choice: 'A', note: 'fine' }),
  ].join('\n');
  const { root, specPath } = makeSpecWithBlockers({ blockersYaml });
  try {
    const result = runCli(root, ['group-blockers', '--spec', specPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout.trim());
    assert.deepStrictEqual(Object.keys(payload.anchors), ['preconditions']);
    assert.deepStrictEqual(payload.decision_blocker_ids, ['d:1:11111111', 'd:2:22222222']);
    assert.doesNotMatch(result.stdout, /\\u001b|\*\*prior/);
    assert.deepStrictEqual(
      payload.advisories.map(a => [a.code, a.blocker_id, a.field]),
      [['DECISION_TEXT_REJECTED', 'd:1:11111111', 'decision_choice'], ['DECISION_TEXT_REJECTED', 'd:2:22222222', 'decision_note']],
    );
    for (const a of payload.advisories) assert.equal(typeof a.reason, 'string');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
