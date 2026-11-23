import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../../cli/index.mjs');
const SPEC = '.context-index/specs/cross-cutting/e2e.spec.md';
const SIDECAR = SPEC.replace(/\.spec\.md$/, '.blockers.md');
const ANCHOR = 'behaviors-1';
const ID = 'sa:y:0000d3c1';

function adev(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
}

function ok(root, args) {
  const r = adev(root, args);
  assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
}

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'adev-decisions-e2e-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\nbuild:\n  max_review_retries: 2\n');
  writeFileSync(join(root, SPEC), [
    '# Live Spec: E2E', '', '---', 'revision: 2', 'created: 2026-05-19', 'updated: 2026-05-19',
    'status: review-blocked', '---', '', '## Behaviors 1', '',
    '1. **When** invoked **then** does X (original).', '',
  ].join('\n'));
  writeFileSync(join(root, SPEC.replace(/\.spec\.md$/, '.review.md')), '# Architecture Review\n\n> Verdict: BLOCK\n');
  return root;
}

function writeDecisionFinding(root) {
  const findings = [{
    blocker_id: ID, section_anchor: ANCHOR, reviewer: 'sa', finding_class: 'decision',
    prose: 'Retry semantics need a human call.',
    question: 'Which retry semantics apply?',
    options: [
      { label: 'A', implications: 'Retry once then halt.' },
      { label: 'B', implications: 'Retry until budget exhausted.' },
    ],
  }];
  const r = adev(root, ['blockers', 'write', '--spec', SPEC, '--findings', JSON.stringify(findings), '--revision', '2', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).entries, 1);
}

const answers = JSON.stringify([{ blocker_ids: [ID], choice: 'A', note: null }]);
const authored = JSON.stringify({ [ANCHOR]: '1. **When** invoked **then** retries once then halts.' });

function assertReviseWritesDec1(root) {
  const revise = adev(root, ['specify', 'revise', '--spec', SPEC, '--auto', '--authored-sections', authored]);
  assert.equal(revise.status, 0, revise.stderr);
  assert.deepStrictEqual(JSON.parse(revise.stdout.trim()).decisions_written, [{ dec: 'DEC-1', blocker_ids: [ID] }]);
  const spec = readFileSync(join(root, SPEC), 'utf8');
  assert.ok(spec.includes(`<!-- adev:decision DEC-1 blockers=${ID} -->`), spec);
  assert.ok(spec.includes('- **DEC-1** — Which retry semantics apply? → **A**. Retry once then halt.'), spec);
  assert.ok(spec.includes('retries once then halts.'));
  assert.ok(!existsSync(join(root, SIDECAR)), '.blockers.md cleared after the atomic write');
}

test('record -> pending(answered) -> group-blockers(attached) -> revise(DEC-1, sidecar cleared) -> pending(decided)', () => {
  const root = makeProject();
  try {
    writeDecisionFinding(root);

    const p1 = ok(root, ['decisions', 'pending', '--spec', SPEC, '--json']);
    assert.deepStrictEqual(p1.pending.map(p => p.blocker_id), [ID]);
    assert.deepStrictEqual(p1.answered, []);

    const rec = adev(root, ['decisions', 'record', '--spec', SPEC, '--answers', answers]);
    assert.equal(rec.status, 0, rec.stderr);

    const p2 = ok(root, ['decisions', 'pending', '--spec', SPEC, '--json']);
    assert.deepStrictEqual(p2.pending, []);
    assert.deepStrictEqual(p2.answered.map(a => a.blocker_id), [ID]);
    assert.equal(p2.answered[0].decision_choice, 'A');

    const group = ok(root, ['specify', 'group-blockers', '--spec', SPEC]);
    assert.equal(group.anchors[ANCHOR].decisions.length, 1);
    assert.equal(group.anchors[ANCHOR].decisions[0].blocker_id, ID);
    assert.equal(group.anchors[ANCHOR].decisions[0].choice, 'A');
    assert.deepStrictEqual(group.decision_blocker_ids, []);

    assertReviseWritesDec1(root);

    const p3 = ok(root, ['decisions', 'pending', '--spec', SPEC, '--json']);
    assert.deepStrictEqual(p3.pending, []);
    assert.deepStrictEqual(p3.answered, []);
    assert.equal(p3.decided.length, 1);
    assert.equal(p3.decided[0].dec, 'DEC-1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resume-shaped re-entry: answers recorded after a DECISION_REQUIRED halt survive to group-blockers and revise with no review run in between (WR-5)', () => {
  const root = makeProject();
  try {
    writeDecisionFinding(root);

    const halted = ok(root, ['specify', 'group-blockers', '--spec', SPEC]);
    assert.deepStrictEqual(halted.decision_blocker_ids, [ID]);
    assert.deepStrictEqual(Object.keys(halted.anchors), []);

    const rec = adev(root, ['decisions', 'record', '--spec', SPEC, '--answers', answers]);
    assert.equal(rec.status, 0, rec.stderr);

    const resumed = ok(root, ['specify', 'group-blockers', '--spec', SPEC]);
    assert.deepStrictEqual(resumed.decision_blocker_ids, []);
    assert.equal(resumed.anchors[ANCHOR].decisions[0].blocker_id, ID);
    assert.equal(resumed.anchors[ANCHOR].decisions[0].choice, 'A');

    assertReviseWritesDec1(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
