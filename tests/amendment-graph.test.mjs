// tests/amendment-graph.test.mjs
//
// Tests for the shared amendment-graph traversal consumed by /adev:status and
// /adev:hygiene (spec-amendment-artifacts.spec.md).
//
// Task 1 contributes the frontmatter-parse cases (read `amends:` +
// `target-revision:` as a paired contract; detect exactly-one-present as an
// incomplete link). Task 6 extends this suite with effective-revision (SA-2),
// chain, cycle (AMENDMENT_CYCLE), dangling, and incomplete-link traversal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

import { createTempDir, cleanupTempDir } from './helpers.mjs';
import {
  readAmendmentLink,
  resolveAmendmentChain,
  computeEffectiveRevision,
  reportRelationship,
  auditAmendments,
} from '../lib/amendment-graph.mjs';

function writeSpec(root, rel, frontmatter) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(abs, `---\n${fm}\n---\n\n# Spec\n`, 'utf8');
  return abs;
}

test('readAmendmentLink: reads amends + target-revision as a paired contract', () => {
  const root = createTempDir();
  try {
    writeSpec(root, 'a/base.spec.md', { status: 'validated', revision: '1' });
    const abs = writeSpec(root, 'a/base-rev-2-fix.spec.md', {
      amends: 'a/base.spec.md',
      'target-revision': '2',
      status: 'review-pending',
      revision: '1',
    });
    const link = readAmendmentLink(abs);
    assert.equal(link.amends, 'a/base.spec.md');
    assert.equal(link.targetRevision, 2);
    assert.equal(link.complete, true);
    assert.equal(link.incomplete, false);
  } finally {
    cleanupTempDir(root);
  }
});

test('readAmendmentLink: returns no link for a plain spec (neither field)', () => {
  const root = createTempDir();
  try {
    const abs = writeSpec(root, 'a/plain.spec.md', { status: 'validated', revision: '1' });
    const link = readAmendmentLink(abs);
    assert.equal(link.amends, null);
    assert.equal(link.targetRevision, null);
    assert.equal(link.isAmendment, false);
    assert.equal(link.incomplete, false);
  } finally {
    cleanupTempDir(root);
  }
});

test('readAmendmentLink: only amends present → INCOMPLETE_AMENDMENT_LINK signal', () => {
  const root = createTempDir();
  try {
    const abs = writeSpec(root, 'a/half.spec.md', {
      amends: 'a/base.spec.md',
      status: 'review-pending',
      revision: '1',
    });
    const link = readAmendmentLink(abs);
    assert.equal(link.amends, 'a/base.spec.md');
    assert.equal(link.targetRevision, null);
    assert.equal(link.incomplete, true);
    assert.equal(link.complete, false);
  } finally {
    cleanupTempDir(root);
  }
});

test('readAmendmentLink: only target-revision present → incomplete', () => {
  const root = createTempDir();
  try {
    const abs = writeSpec(root, 'a/half2.spec.md', {
      'target-revision': '2',
      status: 'review-pending',
      revision: '1',
    });
    const link = readAmendmentLink(abs);
    assert.equal(link.amends, null);
    assert.equal(link.targetRevision, 2);
    assert.equal(link.incomplete, true);
  } finally {
    cleanupTempDir(root);
  }
});

// ── Task 6: traversal (effective-revision SA-2, chain, cycle, dangling) ──────

function writeSpecAt(root, rel, frontmatter) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  const fm = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n');
  writeFileSync(abs, `---\n${fm}\n---\n\n# Spec\n`, 'utf8');
  return rel;
}

test('computeEffectiveRevision: excludes a non-validated amendment, includes a validated one (SA-2)', () => {
  const root = createTempDir();
  try {
    writeSpecAt(root, 'a/base.spec.md', { status: 'validated', revision: '2' });
    // A review-pending amendment targeting rev 3 must NOT raise effective revision.
    writeSpecAt(root, 'a/base-rev-3-pending.spec.md', {
      amends: 'a/base.spec.md', 'target-revision': '3', status: 'review-pending', revision: '1',
    });
    let eff = computeEffectiveRevision(root, 'a/base.spec.md');
    assert.equal(eff.effectiveRevision, 2, 'review-pending amendment excluded');
    assert.equal(eff.baseRevision, 2);

    // A validated amendment targeting rev 4 SHOULD raise it.
    writeSpecAt(root, 'a/base-rev-4-done.spec.md', {
      amends: 'a/base.spec.md', 'target-revision': '4', status: 'validated', revision: '1',
    });
    eff = computeEffectiveRevision(root, 'a/base.spec.md');
    assert.equal(eff.effectiveRevision, 4, 'validated amendment included');
  } finally {
    cleanupTempDir(root);
  }
});

test('reportRelationship: amendment reports its base + target + status', () => {
  const root = createTempDir();
  try {
    writeSpecAt(root, 'a/base.spec.md', { status: 'validated', revision: '2' });
    const amRel = writeSpecAt(root, 'a/base-rev-3-x.spec.md', {
      amends: 'a/base.spec.md', 'target-revision': '3', status: 'review-pending', revision: '1',
    });
    const rel = reportRelationship(root, amRel);
    assert.equal(rel.amends, 'a/base.spec.md');
    assert.equal(rel.targetRevision, 3);
    assert.equal(rel.amendmentStatus, 'review-pending');
    assert.match(rel.line, /amends/);
  } finally {
    cleanupTempDir(root);
  }
});

test('resolveAmendmentChain: reports the full chain (amendment of an amendment)', () => {
  const root = createTempDir();
  try {
    writeSpecAt(root, 'a/base.spec.md', { status: 'validated', revision: '1' });
    writeSpecAt(root, 'a/base-rev-2-x.spec.md', {
      amends: 'a/base.spec.md', 'target-revision': '2', status: 'validated', revision: '1',
    });
    const tip = writeSpecAt(root, 'a/base-rev-2-x-rev-3-y.spec.md', {
      amends: 'a/base-rev-2-x.spec.md', 'target-revision': '3', status: 'validated', revision: '1',
    });
    const chain = resolveAmendmentChain(root, tip);
    assert.equal(chain.cycle, false);
    assert.deepEqual(chain.chain, [
      'a/base-rev-2-x-rev-3-y.spec.md',
      'a/base-rev-2-x.spec.md',
      'a/base.spec.md',
    ]);
  } finally {
    cleanupTempDir(root);
  }
});

test('resolveAmendmentChain: detects a cycle → AMENDMENT_CYCLE (no infinite loop)', () => {
  const root = createTempDir();
  try {
    writeSpecAt(root, 'a/x.spec.md', { amends: 'a/y.spec.md', 'target-revision': '2', status: 'validated', revision: '1' });
    writeSpecAt(root, 'a/y.spec.md', { amends: 'a/x.spec.md', 'target-revision': '2', status: 'validated', revision: '1' });
    const chain = resolveAmendmentChain(root, 'a/x.spec.md');
    assert.equal(chain.cycle, true);
    assert.equal(chain.cycleCode, 'AMENDMENT_CYCLE');
  } finally {
    cleanupTempDir(root);
  }
});

test('auditAmendments: DANGLING_AMENDMENT when base is missing (non-fatal)', () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
    writeSpecAt(root, '.context-index/specs/cross-cutting/orphan-rev-2-x.spec.md', {
      amends: '.context-index/specs/cross-cutting/gone.spec.md', 'target-revision': '2', status: 'review-pending', revision: '1',
    });
    const { findings } = auditAmendments(root);
    const dangling = findings.filter(f => f.code === 'DANGLING_AMENDMENT');
    assert.equal(dangling.length, 1);
    assert.equal(dangling[0].severity, 'warn');
  } finally {
    cleanupTempDir(root);
  }
});

test('auditAmendments: INCOMPLETE_AMENDMENT_LINK when only one of the pair is present', () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
    writeSpecAt(root, '.context-index/specs/cross-cutting/half.spec.md', {
      amends: '.context-index/specs/cross-cutting/base.spec.md', status: 'review-pending', revision: '1',
    });
    writeSpecAt(root, '.context-index/specs/cross-cutting/base.spec.md', { status: 'validated', revision: '1' });
    const { findings } = auditAmendments(root);
    const incomplete = findings.filter(f => f.code === 'INCOMPLETE_AMENDMENT_LINK');
    assert.equal(incomplete.length, 1);
  } finally {
    cleanupTempDir(root);
  }
});

test('auditAmendments: AMENDMENT_CYCLE finding emitted for a cyclic link', () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
    writeSpecAt(root, '.context-index/specs/cross-cutting/p.spec.md', {
      amends: '.context-index/specs/cross-cutting/q.spec.md', 'target-revision': '2', status: 'validated', revision: '1',
    });
    writeSpecAt(root, '.context-index/specs/cross-cutting/q.spec.md', {
      amends: '.context-index/specs/cross-cutting/p.spec.md', 'target-revision': '2', status: 'validated', revision: '1',
    });
    const { findings } = auditAmendments(root);
    assert.ok(findings.some(f => f.code === 'AMENDMENT_CYCLE'));
  } finally {
    cleanupTempDir(root);
  }
});
