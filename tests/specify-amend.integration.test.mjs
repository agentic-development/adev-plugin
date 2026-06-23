/**
 * Integration tests for first-class spec amendments — Task 8 of
 * spec-amendment-artifacts.plan.md.
 *
 * Full round-trip: scaffold an amendment via the CLI verb against a temp base
 * spec → assert co-located file + frontmatter + spec_amended on the base log +
 * base unchanged → run amendment-graph traversal → assert relationship report +
 * effective revision (SA-2 validated-vs-unvalidated) → exercise cycle, dangling,
 * and incomplete error paths → assert --kind amendment rejection + flag
 * mutual-exclusion.
 *
 * Any integration gap surfaces as a real failure, not a skip.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { createTempDir, cleanupTempDir } from './helpers.mjs';
import {
  computeEffectiveRevision,
  reportRelationship,
  resolveAmendmentChain,
  auditAmendments,
} from '../lib/amendment-graph.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, '..', 'cli', 'index.mjs');

const BASE_DIR = '.context-index/specs/cross-cutting';
const BASE_REL = `${BASE_DIR}/checkout.spec.md`;

function seedRoot({ baseRevision = 3 } = {}) {
  const root = createTempDir();
  mkdirSync(join(root, BASE_DIR), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\n');
  writeFileSync(join(root, BASE_REL), [
    '# Live Spec: Checkout',
    '',
    '---',
    'charter: cross-cutting',
    'kind: behavioral',
    `revision: ${baseRevision}`,
    'charter-revision: 1',
    'created: 2026-05-01',
    'updated: 2026-05-01',
    'status: validated',
    '---',
    '',
    '## Behaviors',
    '',
    '1. **When** X **then** Y.',
    '',
  ].join('\n'));
  return root;
}

function runCli(root, args) {
  return spawnSync('node', [CLI, 'specify', ...args], { cwd: root, encoding: 'utf8' });
}

function readBaseLog(root) {
  const dir = join(root, '.context-index', 'lifecycle-state');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  }
  return out;
}

function writeSpec(root, rel, fields) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const fm = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  writeFileSync(abs, `---\n${fm}\n---\n\n# Spec\n`, 'utf8');
  return rel;
}

test('round-trip: CLI scaffold → co-located file + base log event + base unchanged → traversal', () => {
  const root = seedRoot({ baseRevision: 3 });
  try {
    const baseBefore = readFileSync(join(root, BASE_REL), 'utf8');

    // 1. Scaffold via the CLI verb.
    const result = runCli(root, ['amend', '--spec', BASE_REL, '--descriptor', 'drop-coupon']);
    assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
    const payload = JSON.parse(result.stdout.trim());
    const amendmentRel = payload.amendment_path;

    // 2. Co-located file + frontmatter.
    assert.equal(amendmentRel, `${BASE_DIR}/checkout-rev-4-drop-coupon.spec.md`);
    assert.ok(existsSync(join(root, amendmentRel)));
    const amText = readFileSync(join(root, amendmentRel), 'utf8');
    assert.match(amText, /amends:\s*\.context-index\/specs\/cross-cutting\/checkout\.spec\.md/);
    assert.match(amText, /target-revision:\s*4/);
    assert.match(amText, /status:\s*review-pending/);

    // 3. spec_amended on the base log.
    const evs = readBaseLog(root).filter(e => e.event === 'spec_amended');
    assert.equal(evs.length, 1);
    assert.equal(evs[0].target_revision, 4);
    assert.equal(evs[0].amendment_path, amendmentRel);

    // 4. Base unchanged.
    assert.equal(readFileSync(join(root, BASE_REL), 'utf8'), baseBefore);

    // 5. Traversal: relationship report from the amendment.
    const rel = reportRelationship(root, amendmentRel);
    assert.equal(rel.isAmendment, true);
    assert.equal(rel.amends, BASE_REL);
    assert.equal(rel.targetRevision, 4);
    assert.equal(rel.baseExists, true);

    // 6. Effective revision: the amendment is review-pending, so SA-2 excludes it.
    const eff = computeEffectiveRevision(root, BASE_REL);
    assert.equal(eff.baseRevision, 3);
    assert.equal(eff.effectiveRevision, 3, 'review-pending amendment must not raise effective revision');
    assert.equal(eff.pendingAmendments.length, 1);
    assert.equal(eff.validatedAmendments.length, 0);
  } finally {
    cleanupTempDir(root);
  }
});

test('SA-2: a validated amendment raises effective revision; pending does not', () => {
  const root = seedRoot({ baseRevision: 2 });
  try {
    // Pending amendment targeting rev 3.
    writeSpec(root, `${BASE_DIR}/checkout-rev-3-pending.spec.md`, {
      charter: 'cross-cutting', kind: 'behavioral', amends: BASE_REL,
      'target-revision': '3', status: 'review-pending', revision: '1',
    });
    let eff = computeEffectiveRevision(root, BASE_REL);
    assert.equal(eff.effectiveRevision, 2);

    // Validated amendment targeting rev 5.
    writeSpec(root, `${BASE_DIR}/checkout-rev-5-done.spec.md`, {
      charter: 'cross-cutting', kind: 'behavioral', amends: BASE_REL,
      'target-revision': '5', status: 'validated', revision: '1',
    });
    eff = computeEffectiveRevision(root, BASE_REL);
    assert.equal(eff.effectiveRevision, 5);
    assert.equal(eff.validatedAmendments.length, 1);
    assert.equal(eff.pendingAmendments.length, 1);
  } finally {
    cleanupTempDir(root);
  }
});

test('error path: CLI rejects --kind amendment with INVALID_KIND', () => {
  const root = seedRoot();
  try {
    const r = runCli(root, ['amend', '--spec', BASE_REL, '--descriptor', 'foo', '--kind', 'amendment']);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('INVALID_KIND'));
  } finally {
    cleanupTempDir(root);
  }
});

test('error path: CLI rejects --amend mutual-exclusion (CONFLICTING_FLAGS)', () => {
  const root = seedRoot();
  try {
    for (const flag of ['--revise', '--extract', '--refactor', '--from-diff', '--cross-cutting']) {
      const r = runCli(root, ['amend', '--spec', BASE_REL, '--descriptor', 'foo', flag]);
      assert.equal(r.status, 1, `${flag} should conflict`);
      assert.ok(r.stderr.includes('CONFLICTING_FLAGS'), `${flag}: ${r.stderr}`);
    }
  } finally {
    cleanupTempDir(root);
  }
});

test('error path: CLI rejects INVALID_TARGET_REVISION (override <= base)', () => {
  const root = seedRoot({ baseRevision: 4 });
  try {
    const r = runCli(root, ['amend', '--spec', BASE_REL, '--descriptor', 'foo', '--target-revision', '4']);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('INVALID_TARGET_REVISION'));
  } finally {
    cleanupTempDir(root);
  }
});

test('hygiene audit: dangling, incomplete, and cycle findings', () => {
  const root = seedRoot();
  try {
    // Dangling — amends a non-existent base.
    writeSpec(root, `${BASE_DIR}/orphan-rev-2-x.spec.md`, {
      amends: `${BASE_DIR}/ghost.spec.md`, 'target-revision': '2', status: 'review-pending', revision: '1',
    });
    // Incomplete — only amends.
    writeSpec(root, `${BASE_DIR}/half.spec.md`, {
      amends: BASE_REL, status: 'review-pending', revision: '1',
    });
    // Cycle.
    writeSpec(root, `${BASE_DIR}/p.spec.md`, {
      amends: `${BASE_DIR}/q.spec.md`, 'target-revision': '2', status: 'validated', revision: '1',
    });
    writeSpec(root, `${BASE_DIR}/q.spec.md`, {
      amends: `${BASE_DIR}/p.spec.md`, 'target-revision': '2', status: 'validated', revision: '1',
    });

    const { findings } = auditAmendments(root);
    const codes = findings.map(f => f.code);
    assert.ok(codes.includes('DANGLING_AMENDMENT'));
    assert.ok(codes.includes('INCOMPLETE_AMENDMENT_LINK'));
    assert.ok(codes.includes('AMENDMENT_CYCLE'));
  } finally {
    cleanupTempDir(root);
  }
});

test('chain: amendment-of-an-amendment resolves in order; cycle is reported not looped', () => {
  const root = seedRoot({ baseRevision: 1 });
  try {
    const a1 = writeSpec(root, `${BASE_DIR}/checkout-rev-2-a.spec.md`, {
      amends: BASE_REL, 'target-revision': '2', status: 'validated', revision: '1',
    });
    const a2 = writeSpec(root, `${BASE_DIR}/checkout-rev-2-a-rev-3-b.spec.md`, {
      amends: a1, 'target-revision': '3', status: 'validated', revision: '1',
    });
    const chain = resolveAmendmentChain(root, a2);
    assert.equal(chain.cycle, false);
    assert.deepEqual(chain.chain, [a2, a1, BASE_REL]);
  } finally {
    cleanupTempDir(root);
  }
});
