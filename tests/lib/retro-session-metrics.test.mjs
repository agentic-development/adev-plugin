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

describe('countPerSpec', () => {
  test('frontmatter spec: field counts toward that spec', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', spec: '.context-index/specs/features/foo/bar.spec.md' },
        body: '',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r.length, 1);
    assert.equal(r[0].spec, '.context-index/specs/features/foo/bar.spec.md');
    assert.equal(r[0].count, 1);
  });

  test('body grep finds spec path references', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: 'mentions .context-index/specs/features/foo/bar.spec.md somewhere',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r.length, 1);
    assert.equal(r[0].spec, '.context-index/specs/features/foo/bar.spec.md');
  });

  test('frontmatter + body both contribute when distinct', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', spec: '.context-index/specs/features/foo/a.spec.md' },
        body: 'see .context-index/specs/features/bar/b.spec.md',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r.length, 2);
    const a = r.find((x) => x.spec.endsWith('a.spec.md'));
    const b = r.find((x) => x.spec.endsWith('b.spec.md'));
    assert.equal(a.count, 1);
    assert.equal(b.count, 1);
  });

  test('dedupe per (session, spec): body mentioning same spec twice counts once', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end' },
        body: '.context-index/specs/features/x/y.spec.md once\n.context-index/specs/features/x/y.spec.md twice',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r[0].count, 1);
  });

  test('frontmatter + body referencing same spec dedupes per session', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', spec: '.context-index/specs/features/x/y.spec.md' },
        body: '.context-index/specs/features/x/y.spec.md mentioned in body too',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r.length, 1);
    assert.equal(r[0].count, 1);
  });

  test('two sessions touching same spec accumulate', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', spec: '.context-index/specs/features/x/y.spec.md' },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', spec: '.context-index/specs/features/x/y.spec.md' },
        body: '',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r.length, 1);
    assert.equal(r[0].count, 2);
  });

  test('zero-count specs omitted (nothing to omit if input empty)', () => {
    assert.deepEqual(countPerSpec([]), []);
  });

  test('sort: descending by count, ties broken by spec slug ascending', () => {
    const mk = (spec) => ({
      format: 'hook',
      frontmatter: { kind: 'session-end', spec },
      body: '',
    });
    const sessions = [
      mk('.context-index/specs/features/c/c.spec.md'), // count 1
      mk('.context-index/specs/features/a/a.spec.md'), // count 2
      mk('.context-index/specs/features/a/a.spec.md'),
      mk('.context-index/specs/features/b/b.spec.md'), // count 2
      mk('.context-index/specs/features/b/b.spec.md'),
    ];
    const r = countPerSpec(sessions);
    assert.equal(r[0].spec, '.context-index/specs/features/a/a.spec.md');
    assert.equal(r[0].count, 2);
    assert.equal(r[1].spec, '.context-index/specs/features/b/b.spec.md');
    assert.equal(r[1].count, 2);
    assert.equal(r[2].spec, '.context-index/specs/features/c/c.spec.md');
    assert.equal(r[2].count, 1);
  });

  test('all session formats counted (not just hook-mode)', () => {
    // Behavior 8 does not narrow to hook-mode.
    const sessions = [
      {
        format: 'post-commit',
        frontmatter: { type: 'commit', agent: 'git-hook' },
        body: 'see .context-index/specs/features/x/y.spec.md',
      },
    ];
    const r = countPerSpec(sessions);
    assert.equal(r.length, 1);
  });
});

describe('aggregateCostTokens', () => {
  test('returns null when no session-end has any cost field', () => {
    const sessions = [
      { format: 'hook', frontmatter: { kind: 'session-end' }, body: '' },
      { format: 'hook', frontmatter: { kind: 'pre-compact', cost_usd: 0.05 }, body: '' },
    ];
    // pre-compact excluded (XS-2); no session-end has cost → null
    assert.equal(aggregateCostTokens(sessions), null);
  });

  test('returns null on empty input', () => {
    assert.equal(aggregateCostTokens([]), null);
    assert.equal(aggregateCostTokens(null), null);
  });

  test('aggregates totals across session-end sessions', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          cost_usd: 0.05,
          input_tokens: 1000,
          output_tokens: 200,
          model: 'sonnet',
        },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          cost_usd: 0.10,
          input_tokens: 2000,
          output_tokens: 400,
          model: 'opus',
        },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    assert.ok(r);
    assert.ok(Math.abs(r.totals.cost_usd - 0.15) < 1e-9);
    assert.equal(r.totals.input_tokens, 3000);
    assert.equal(r.totals.output_tokens, 600);
  });

  test('per-model breakdown', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          cost_usd: 0.05,
          input_tokens: 1000,
          output_tokens: 200,
          model: 'sonnet',
        },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          cost_usd: 0.03,
          input_tokens: 500,
          output_tokens: 100,
          model: 'sonnet',
        },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          cost_usd: 0.10,
          input_tokens: 2000,
          output_tokens: 400,
          model: 'opus',
        },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    // Per-model approximate equal (floating-point safe).
    assert.ok(Math.abs(r.perModel.sonnet.cost_usd - 0.08) < 1e-9);
    assert.equal(r.perModel.sonnet.input_tokens, 1500);
    assert.equal(r.perModel.opus.cost_usd, 0.10);
  });

  test('per-spec breakdown using frontmatter spec field', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          spec: '.context-index/specs/features/foo/bar.spec.md',
          cost_usd: 0.05,
          input_tokens: 1000,
        },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    const specKey = '.context-index/specs/features/foo/bar.spec.md';
    assert.equal(r.perSpec[specKey].cost_usd, 0.05);
    assert.equal(r.perSpec[specKey].input_tokens, 1000);
  });

  test('excludes sessions missing a particular field from that field aggregate', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          cost_usd: 0.05,
          input_tokens: 1000,
        },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: {
          kind: 'session-end',
          // no cost_usd
          input_tokens: 500,
        },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    assert.equal(r.totals.cost_usd, 0.05);
    assert.equal(r.totals.input_tokens, 1500);
  });

  test('non-numeric cost_usd recorded as parseError, excluded from aggregate', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', cost_usd: '$0.05' },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', cost_usd: 0.10 },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    assert.equal(r.totals.cost_usd, 0.10);
    assert.equal(r.parseErrors.length, 1);
    assert.equal(r.parseErrors[0].field, 'cost_usd');
    assert.equal(r.parseErrors[0].value, '$0.05');
  });

  test('XS-2: pre-compact and placeholder sessions excluded', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'pre-compact', cost_usd: 5.0, input_tokens: 99999 },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: { kind: 'placeholder', cost_usd: 3.0, input_tokens: 88888 },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', cost_usd: 0.01, input_tokens: 100 },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    assert.equal(r.totals.cost_usd, 0.01);
    assert.equal(r.totals.input_tokens, 100);
  });

  test('numeric cost_usd parses cleanly with integers and floats', () => {
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', cost_usd: 1, input_tokens: 1 },
        body: '',
      },
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', cost_usd: 2.5, input_tokens: 2 },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    assert.equal(r.totals.cost_usd, 3.5);
    assert.equal(r.totals.input_tokens, 3);
  });

  test('numeric strings (parseable) accepted as cost values', () => {
    // YAML frontmatter is parsed as strings; '0.05' should aggregate.
    const sessions = [
      {
        format: 'hook',
        frontmatter: { kind: 'session-end', cost_usd: '0.05' },
        body: '',
      },
    ];
    const r = aggregateCostTokens(sessions);
    assert.equal(r.totals.cost_usd, 0.05);
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
