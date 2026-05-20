// tests/lib/retro-session-metrics.test.mjs
//
// Tests for the session-metrics rollup. One describe block per sub-helper.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseToolUseDistribution,
  countPerSpec,
  aggregateCostTokens,
  joinClosedIssueXref,
  scanContextGaps,
} from '../../lib/retro/session-metrics.mjs';

describe('parseToolUseDistribution', () => {
  test('counts ### Tool headings (hook-mode only)', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: '### Read\nfoo\n### Bash\nbar\n### Read\n',
      },
    ];
    const result = parseToolUseDistribution(sessions);
    const read = result.find((r) => r.tool === 'Read');
    const bash = result.find((r) => r.tool === 'Bash');
    assert.equal(read.count, 2);
    assert.equal(bash.count, 1);
  });

  test('counts **Tool:** lines', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: '**Tool:** Grep\n**Tool:** Grep\n**Tool:** Edit\n',
      },
    ];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.find((r) => r.tool === 'Grep').count, 2);
    assert.equal(result.find((r) => r.tool === 'Edit').count, 1);
  });

  test('combines both patterns in same body', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: '### Read\nbody\n**Tool:** Read\n',
      },
    ];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.find((r) => r.tool === 'Read').count, 2);
  });

  test('ignores non-hook-mode sessions (post-commit, unknown)', () => {
    const sessions = [
      {
        format: 'post-commit',
        frontmatter: { type: 'commit', agent: 'git-hook' },
        body: '### Read\n',
      },
      { format: 'unknown', frontmatter: {}, body: '### Read\n' },
    ];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.length, 0);
  });

  test('top-10 ordering: descending by count, alphabetical tie-break', () => {
    // Construct 12 distinct tools with controlled counts.
    const lines = [];
    const tools = ['Apple', 'Bear', 'Cat', 'Dog', 'Eel', 'Fox', 'Goat', 'Hare', 'Ibis', 'Jay', 'Kite', 'Lynx'];
    // Apple:12, Bear:11, ... Lynx:1
    tools.forEach((t, i) => {
      const n = 12 - i;
      for (let j = 0; j < n; j++) lines.push(`### ${t}`);
    });
    const sessions = [{ format: 'hook', frontmatter: { kind: 'session-end' }, body: lines.join('\n') }];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.length, 10);
    assert.equal(result[0].tool, 'Apple');
    assert.equal(result[0].count, 12);
    assert.equal(result[9].tool, 'Jay');
  });

  test('alphabetical tie-break when counts equal', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: '### Zebra\n### Alpha\n### Mango\n',
      },
    ];
    const result = parseToolUseDistribution(sessions);
    // All count = 1; tie-break alphabetical → Alpha, Mango, Zebra
    assert.deepEqual(result.map((r) => r.tool), ['Alpha', 'Mango', 'Zebra']);
  });

  test('empty input → empty array', () => {
    assert.deepEqual(parseToolUseDistribution([]), []);
    assert.deepEqual(parseToolUseDistribution(null), []);
    assert.deepEqual(parseToolUseDistribution(undefined), []);
  });

  test('ignores patterns NOT at line start (defense per SA-3)', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        // ' ### Read' (leading space) is not at line start → ignored
        body: ' ### Read\n#### Read\n##### Read\nprefix ### Read suffix\n',
      },
    ];
    const result = parseToolUseDistribution(sessions);
    assert.equal(result.length, 0);
  });

  test('case-sensitive (per SA-3)', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: '### read\n### READ\n### Read\n',
      },
    ];
    const result = parseToolUseDistribution(sessions);
    // All three count as distinct tools.
    assert.equal(result.length, 3);
    assert.equal(result.find((r) => r.tool === 'Read').count, 1);
    assert.equal(result.find((r) => r.tool === 'read').count, 1);
    assert.equal(result.find((r) => r.tool === 'READ').count, 1);
  });
});

// Stubbed sections for sub-helpers added in Tasks 8–11.
describe('countPerSpec (stub — Task 8)', () => {
  test('exists', () => {
    assert.equal(typeof countPerSpec, 'function');
  });
});

describe('aggregateCostTokens (stub — Task 9)', () => {
  test('exists', () => {
    assert.equal(typeof aggregateCostTokens, 'function');
  });
});

describe('joinClosedIssueXref (stub — Task 10)', () => {
  test('exists', () => {
    assert.equal(typeof joinClosedIssueXref, 'function');
  });
});

describe('scanContextGaps (stub — Task 11)', () => {
  test('exists', () => {
    assert.equal(typeof scanContextGaps, 'function');
  });
});
