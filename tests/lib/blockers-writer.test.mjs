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

// ─── Empty prose refusal (adev-plugin-heba) ────────────────────────────────
//
// writeBlockers() read only `e.prose`, defaulting to '' with no validation.
// A reviewer output shape that supplied finding text under a different key
// (message/finding/body) produced a well-formed-looking sidecar entry — valid
// blocker_id, section_anchor, reviewer name — with an EMPTY fenced body.
// Confirmed live 2026-08-18 on review-provenance.spec.md rev 2: both
// consistency-analyzer blocker entries wrote clean headers over blank fences,
// recoverable only from the sibling .review.md, defeating the whole point of
// .blockers.md being the machine-consumable source of truth.
//
// Fix direction 1 (the issue's own top recommendation): refuse the write
// rather than silently completing it — turn silent data loss into a loud,
// fixable error.

test('writeBlockers throws BLOCKER_BODY_EMPTY when a finding has no prose', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'consistency-analyzer:contract:e0ba7211',
        section_anchor: 'output-contract-b',
        reviewer: 'consistency-analyzer',
        // prose supplied under the wrong key — the writer never reads `message`
        message: 'The output contract is ambiguous.',
      },
    ];
    assert.throws(
      () => writeBlockers(root, specPath, findings, { revision: 1 }),
      (e) => e.code === 'BLOCKER_BODY_EMPTY' && /consistency-analyzer:contract:e0ba7211/.test(e.message),
    );
    assert.equal(existsSync(join(root, specPath.replace(/\.spec\.md$/, '.blockers.md'))), false,
      'a refused write must not leave a partial/prior sidecar in place');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers throws BLOCKER_BODY_EMPTY when prose is whitespace-only', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      { blocker_id: 'r:t:aaaaaaaa', section_anchor: 'x', reviewer: 'r', prose: '   \n  ' },
    ];
    assert.throws(
      () => writeBlockers(root, specPath, findings, { revision: 1 }),
      (e) => e.code === 'BLOCKER_BODY_EMPTY',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers still succeeds when every finding has real prose', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      { blocker_id: 'r:t:aaaaaaaa', section_anchor: 'x', reviewer: 'r', prose: 'Real finding text.' },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 1 });
    assert.equal(result.entries, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers reports every empty-prose finding, not just the first', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      { blocker_id: 'r:a:aaaaaaaa', section_anchor: 'x', reviewer: 'r', prose: '' },
      { blocker_id: 'r:b:bbbbbbbb', section_anchor: 'y', reviewer: 'r', prose: 'fine' },
      { blocker_id: 'r:c:cccccccc', section_anchor: 'z', reviewer: 'r', message: 'wrong key' },
    ];
    assert.throws(
      () => writeBlockers(root, specPath, findings, { revision: 1 }),
      (e) => e.code === 'BLOCKER_BODY_EMPTY'
        && /r:a:aaaaaaaa/.test(e.message)
        && /r:c:cccccccc/.test(e.message)
        && !/r:b:bbbbbbbb/.test(e.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── finding_class / remedy_ref sidecar schema + section_anchor BD-1 fix ───
//
// BEH-1: finding_class taxonomy (defect|decision|external) that routes
// blockers through different paths later in the pipeline. blockers-writer's
// posture is "refuse, don't sanitize, don't throw" — a bad field is forced
// to a safe default and logged as an advisory in the return value; the
// write always completes.

test('writeBlockers round-trips a present, valid finding_class into the YAML block', () => {
  const { root, specPath } = makeRepo();
  try {
    const findings = [
      {
        blocker_id: 'r:t:aaaaaaaa',
        section_anchor: 'beh-1',
        reviewer: 'x',
        prose: 'body',
        finding_class: 'decision',
      },
    ];
    const result = writeBlockers(root, specPath, findings, { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /finding_class: decision/);
    assert.ok(
      !result.advisories.some((a) => a.code === 'FINDING_CLASS_DEFAULTED' || a.code === 'FINDING_CLASS_REJECTED'),
      'a valid, present finding_class must not generate a defaulted/rejected advisory',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers defaults finding_class to defect when absent and logs FINDING_CLASS_DEFAULTED', () => {
  const { root, specPath } = makeRepo();
  try {
    const result = writeBlockers(root, specPath, [
      { blocker_id: 'r:t:aaaaaaaa', section_anchor: 'beh-1', reviewer: 'x', prose: 'body' },
    ], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /finding_class: defect/);
    assert.ok(result.advisories.some((a) => a.code === 'FINDING_CLASS_DEFAULTED'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers forces defect and logs FINDING_CLASS_REJECTED on an invalid enum value, without dropping the entry', () => {
  const { root, specPath } = makeRepo();
  try {
    const result = writeBlockers(root, specPath, [
      { blocker_id: 'r:t:aaaaaaaa', section_anchor: 'beh-1', reviewer: 'x', prose: 'body', finding_class: 'bogus' },
    ], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /finding_class: defect/);
    assert.ok(result.advisories.some((a) => a.code === 'FINDING_CLASS_REJECTED'));
    assert.equal(result.entries, 1, 'entry must not be dropped');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers omits an unsafe remedy_ref and logs REMEDY_REF_REJECTED, without dropping the entry', () => {
  const { root, specPath } = makeRepo();
  try {
    const result = writeBlockers(root, specPath, [
      {
        blocker_id: 'r:t:aaaaaaaa',
        section_anchor: 'beh-1',
        reviewer: 'x',
        prose: 'body',
        finding_class: 'external',
        remedy_ref: 'issue: {evil}',
      },
    ], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.doesNotMatch(text, /\{evil\}/);
    assert.doesNotMatch(text, /remedy_ref:/);
    assert.ok(result.advisories.some((a) => a.code === 'REMEDY_REF_REJECTED'));
    assert.equal(result.entries, 1, 'entry must not be dropped');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers preserves a safe remedy_ref when finding_class is external', () => {
  const { root, specPath } = makeRepo();
  try {
    const result = writeBlockers(root, specPath, [
      {
        blocker_id: 'r:t:aaaaaaaa',
        section_anchor: 'beh-1',
        reviewer: 'x',
        prose: 'body',
        finding_class: 'external',
        remedy_ref: 'ISSUE-123',
      },
    ], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.match(text, /remedy_ref: ISSUE-123/);
    assert.ok(!result.advisories.some((a) => a.code === 'REMEDY_REF_REJECTED'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeBlockers refuses an unsafe section_anchor and forces a safe default (BD-1)', () => {
  const { root, specPath } = makeRepo();
  try {
    const result = writeBlockers(root, specPath, [
      { blocker_id: 'r:t:aaaaaaaa', section_anchor: 'beh-1: {evil}', reviewer: 'x', prose: 'body' },
    ], { revision: 1 });
    const text = readFileSync(join(root, result.sidecarPath), 'utf8');
    assert.doesNotMatch(text, /\{evil\}/);
    assert.equal(result.entries, 1, 'entry must not be dropped');
    // The sidecar must still parse as clean, single-value YAML lines — no
    // stray unescaped colon-space sequence left in the section_anchor value.
    const anchorLine = text.split('\n').find((l) => l.trim().startsWith('section_anchor:'));
    assert.ok(anchorLine, 'section_anchor line must be present');
    assert.doesNotMatch(anchorLine, /:\s*\{|beh-1:\s/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
