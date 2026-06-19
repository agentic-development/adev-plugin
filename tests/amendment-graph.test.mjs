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
import { readAmendmentLink } from '../lib/amendment-graph.mjs';

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
