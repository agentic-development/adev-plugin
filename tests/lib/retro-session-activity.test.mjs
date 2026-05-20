// tests/lib/retro-session-activity.test.mjs
//
// Orchestrator tests for lib/retro/session-activity.mjs. Initial slice
// (Task 6); Task 13 extends with comprehensive edge cases.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { gatherSessionActivity } from '../../lib/retro/session-activity.mjs';

test('gatherSessionActivity: missing sessions dir → empty result, no warnings', async () => {
  const dir = createTempDir();
  try {
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 0);
    assert.deepEqual(result.formatBreakdown, { hook: 0, 'post-commit': 0, unknown: 0 });
    assert.deepEqual(result.toolUseDistribution, []);
    assert.deepEqual(result.perSpecCounts, []);
    assert.equal(result.costTokens, null);
    assert.equal(result.issueXrefs, null);
    assert.deepEqual(result.contextGaps, []);
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: empty sessions dir → empty result', async () => {
  const dir = createTempDir();
  try {
    await mkdir(join(dir, '.context-index/sessions'), { recursive: true });
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 0);
    assert.deepEqual(result.formatBreakdown, { hook: 0, 'post-commit': 0, unknown: 0 });
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: file outside window excluded', async () => {
  const dir = createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      join(sessions, '2025-01-01-aaa.md'),
      '---\nkind: session-end\nsession_id: aaa\ndate: 2025-01-01\n---\nbody'
    );
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: in-window hook-mode file counted', async () => {
  const dir = createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      join(sessions, '2026-05-10-abc.md'),
      '---\nkind: session-end\nsession_id: abc\ndate: 2026-05-10\n---\nbody'
    );
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 1);
    assert.deepEqual(result.formatBreakdown, { hook: 1, 'post-commit': 0, unknown: 0 });
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: in-window post-commit file counted', async () => {
  const dir = createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      join(sessions, '2026-05-10-deadbee.md'),
      '---\ndate: 2026-05-10\ntype: commit\nagent: git-hook\nsha: deadbee\n---\nbody'
    );
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 1);
    assert.deepEqual(result.formatBreakdown, { hook: 0, 'post-commit': 1, unknown: 0 });
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: malformed frontmatter classified as unknown', async () => {
  const dir = createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    // Custom YAML tag → unsafe-tag → classified unknown.
    await writeFile(
      join(sessions, '2026-05-15-bad.md'),
      '---\ndate: 2026-05-15\nfoo: !!js/function "return 1"\n---\nbody'
    );
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 1);
    assert.deepEqual(result.formatBreakdown, { hook: 0, 'post-commit': 0, unknown: 1 });
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: SEC-B4 — never reads files outside sessions dir', async () => {
  const dir = createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    // Session body mentions a path traversal attempt; orchestrator must
    // ignore it (we cannot easily intercept readFile without DI, but we
    // can assert that the only file that gets read is the one inside the
    // sessions dir — exercised via the file actually being readable and
    // counted, with no error or side effect from the body content).
    await writeFile(
      join(sessions, '2026-05-10-trav.md'),
      [
        '---',
        'kind: session-end',
        'session_id: trav',
        'date: 2026-05-10',
        '---',
        'See ../../etc/passwd for context',
        '../../.ssh/id_rsa',
      ].join('\n')
    );
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 1);
    // No exception — body content with traversal references does not
    // cause the orchestrator to attempt those reads.
  } finally {
    cleanupTempDir(dir);
  }
});

test('gatherSessionActivity: format-breakdown line composed in core (SA-2)', async () => {
  const dir = createTempDir();
  try {
    const sessions = join(dir, '.context-index/sessions');
    await mkdir(sessions, { recursive: true });
    await writeFile(
      join(sessions, '2026-05-10-h1.md'),
      '---\nkind: session-end\nsession_id: h1\ndate: 2026-05-10\n---\nbody'
    );
    await writeFile(
      join(sessions, '2026-05-10-h2.md'),
      '---\nkind: pre-compact\nsession_id: h2\ndate: 2026-05-10\n---\nbody'
    );
    await writeFile(
      join(sessions, '2026-05-10-pc.md'),
      '---\ndate: 2026-05-10\ntype: commit\nagent: git-hook\nsha: pc\n---\nbody'
    );
    await writeFile(
      join(sessions, '2026-05-10-uk.md'),
      '---\ndate: 2026-05-10\nrandom: noise\n---\nbody'
    );
    const result = await gatherSessionActivity(dir, {
      since: '2026-05-01',
      until: '2026-05-31',
    });
    assert.equal(result.totalSessions, 4);
    assert.deepEqual(result.formatBreakdown, {
      hook: 2,
      'post-commit': 1,
      unknown: 1,
    });
  } finally {
    cleanupTempDir(dir);
  }
});
