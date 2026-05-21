/**
 * Tests for lib/blockers-writer.mjs — `.blockers.md` sidecar writer keyed by
 * canonical blocker_id (Task 5 of review-block-auto-retry.plan.md).
 *
 * Covers:
 *   - Entries grouped by blocker_id; prose preserved per finding
 *   - `section_anchor` carried per entry (SA-1)
 *   - Two reviewers emitting the same blocker_id are deduplicated with
 *     BLOCKER_ID_COLLISION advisory (Error Cases table)
 *   - Existing redaction set (.env*, *.pem, etc.) applied (SEC-3 cross-ref)
 *   - 8 KiB per-prose truncation cap honored
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeBlockers, _redactForBlockers, BLOCKER_PROSE_CAP } from '../../lib/blockers-writer.mjs';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'adev-blockers-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  const specPath = '.context-index/specs/cross-cutting/sample.spec.md';
  writeFileSync(join(root, specPath), '# Sample\n');
  return { root, specPath };
}

test('writeBlockers writes a .blockers.md sidecar adjacent to the spec', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'structural-architect:missing-precondition:abc12345',
        section_anchor: 'preconditions',
        reviewer: 'structural-architect',
        prose: 'No precondition documents the .review.md+.blockers.md sidecar invariant.',
      },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 1 });
    assert.ok(result.sidecarPath.endsWith('sample.blockers.md'));
    assert.ok(existsSync(join(root, result.sidecarPath)));
    const body = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.ok(body.includes('structural-architect:missing-precondition:abc12345'));
    assert.ok(body.includes('section_anchor: preconditions'));
    assert.ok(body.includes('No precondition documents'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers groups entries by blocker_id', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'security-reviewer:path-traversal:11111111',
        section_anchor: 'sec-1',
        reviewer: 'security-reviewer',
        prose: 'First reviewer finding for the same ID.',
      },
      {
        blocker_id: 'security-reviewer:path-traversal:11111111',
        section_anchor: 'sec-1',
        reviewer: 'consistency-analyzer',
        prose: 'Second reviewer finding for the same ID (collision).',
      },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 1 });
    const body = readFileSync(join(root, result.sidecarPath), 'utf8');
    // Both prose entries present
    assert.ok(body.includes('First reviewer finding'));
    assert.ok(body.includes('Second reviewer finding'));
    // Collision advisory recorded
    assert.ok(result.collisions.length === 1, `expected 1 collision; got ${result.collisions.length}`);
    assert.equal(result.collisions[0].blocker_id, 'security-reviewer:path-traversal:11111111');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers redacts secret-like content', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'security-reviewer:secrets-leak:22222222',
        section_anchor: 'secrets',
        reviewer: 'security-reviewer',
        prose: 'Found AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE in the example.',
      },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 1 });
    const body = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.ok(!body.includes('AKIAIOSFODNN7EXAMPLE'), 'literal AWS access key should be redacted');
    assert.ok(body.includes('[REDACTED]') || body.includes('REDACTED'), 'redaction marker should appear');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('_redactForBlockers redacts known secret patterns (env-style and key markers)', () => {
  const samples = [
    'AKIAIOSFODNN7EXAMPLE',
    'aws_secret_access_key=hunter2',
    'token=sk_live_abcdef12345678901234567890',
    'AWS_SECRET_ACCESS_KEY=foo',
  ];
  for (const s of samples) {
    const redacted = _redactForBlockers(s);
    assert.ok(redacted.includes('[REDACTED]'), `expected redaction for: ${s} (got: ${redacted})`);
  }
});

test('writeBlockers truncates prose exceeding 8 KiB cap', () => {
  const { root, specPath } = makeRepo();
  try {
    const longProse = 'x'.repeat(BLOCKER_PROSE_CAP + 500);
    const findings = [
      {
        blocker_id: 'structural-architect:overlong:33333333',
        section_anchor: 'long',
        reviewer: 'structural-architect',
        prose: longProse,
      },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 1 });
    const body = readFileSync(join(root, result.sidecarPath), 'utf8');
    // The full original prose must not be present verbatim
    assert.ok(!body.includes(longProse), 'overlong prose must be truncated');
    assert.ok(body.includes('truncated'), 'truncation marker must appear');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers with empty findings clears (deletes or empties) any prior sidecar', () => {
  const { root, specPath } = makeRepo();
  try {
    // Pre-existing sidecar
    const sidecar = join(root, '.context-index/specs/cross-cutting/sample.blockers.md');
    writeFileSync(sidecar, '# Stale blockers\n');
    const result = writeBlockers(root, specPath, [], { revision: 1 });
    // Either deleted or rewritten to empty marker — both are acceptable.
    if (existsSync(sidecar)) {
      const body = readFileSync(sidecar, 'utf8');
      assert.ok(!body.includes('Stale blockers'), 'stale content must be cleared');
    }
    assert.equal(result.entries, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers preserves section_anchor on each entry', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'consistency-analyzer:terminology:44444444',
        section_anchor: 'behaviors-1',
        reviewer: 'consistency-analyzer',
        prose: 'Inconsistent terminology in Behaviors §1.',
      },
      {
        blocker_id: 'consistency-analyzer:terminology:55555555',
        section_anchor: 'behaviors-7',
        reviewer: 'consistency-analyzer',
        prose: 'Likewise in Behaviors §7.',
      },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 2 });
    const body = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.ok(body.includes('section_anchor: behaviors-1'));
    assert.ok(body.includes('section_anchor: behaviors-7'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers rejects malformed blocker_id with INVALID_BLOCKER_ID', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'Not A Valid ID',
        section_anchor: 'x',
        reviewer: 'r',
        prose: 'p',
      },
    ];
    assert.throws(
      () => writeBlockers(root, specPath, findings, { revision: 1 }),
      (e) => e.code === 'INVALID_BLOCKER_ID',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
