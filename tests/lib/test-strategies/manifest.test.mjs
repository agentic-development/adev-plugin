/**
 * Tests for lib/test-strategies/manifest.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTestStrategies,
  matchStrategy,
  matchGlob,
} from '../../../lib/test-strategies/manifest.mjs';

// ---------------------------------------------------------------------------
// parseTestStrategies
// ---------------------------------------------------------------------------

describe('parseTestStrategies', () => {
  it('returns empty strategies and no warnings when manifest has no test_strategies key', () => {
    const result = parseTestStrategies({});
    assert.deepEqual(result, { strategies: [], warnings: [] });
  });

  it('returns empty strategies and no warnings when manifest is null', () => {
    const result = parseTestStrategies(null);
    assert.deepEqual(result, { strategies: [], warnings: [] });
  });

  it('returns empty strategies and no warnings when test_strategies is an empty array', () => {
    const result = parseTestStrategies({ test_strategies: [] });
    assert.deepEqual(result, { strategies: [], warnings: [] });
  });

  it('parses a valid entry with all fields correctly', () => {
    const manifest = {
      test_strategies: [
        {
          strategy_id: 'unit',
          command: ['node', '--test'],
          tier: 'fast',
          paths: ['src/**/*.mjs'],
        },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(warnings.length, 0);
    assert.equal(strategies.length, 1);
    assert.deepEqual(strategies[0], {
      strategy_id: 'unit',
      command: ['node', '--test'],
      tier: 'fast',
      paths: ['src/**/*.mjs'],
    });
  });

  it('warns and skips entry with unknown strategy_id', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'nonexistent', paths: ['src/**/*.mjs'] },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("Unknown strategy_id 'nonexistent'"));
  });

  it('warns and skips entry with missing paths', () => {
    const manifest = {
      test_strategies: [{ strategy_id: 'unit' }],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("Missing paths for strategy 'unit'"));
  });

  it('warns and skips entry with empty paths array', () => {
    const manifest = {
      test_strategies: [{ strategy_id: 'unit', paths: [] }],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("Missing paths for strategy 'unit'"));
  });

  it('warns and skips entry when a path glob contains ../', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'unit', paths: ['../outside/**/*.mjs'] },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('contains traversal or absolute path'));
  });

  it('warns and skips entry when a path glob starts with /', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'unit', paths: ['/absolute/path/*.mjs'] },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('contains traversal or absolute path'));
  });

  it('warns and skips entry when command is a string (not array)', () => {
    const manifest = {
      test_strategies: [
        {
          strategy_id: 'unit',
          command: 'node --test',
          paths: ['src/**/*.mjs'],
        },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('must be an array'));
  });

  it('sets command to null when command is omitted', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'unit', paths: ['src/**/*.mjs'] },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(warnings.length, 0);
    assert.equal(strategies.length, 1);
    assert.equal(strategies[0].command, null);
  });

  it('defaults tier to fast when tier is omitted', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'unit', paths: ['src/**/*.mjs'] },
      ],
    };
    const { strategies } = parseTestStrategies(manifest);
    assert.equal(strategies[0].tier, 'fast');
  });

  it('returns all valid entries when multiple entries are provided', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'unit', paths: ['src/**/*.mjs'], tier: 'fast' },
        { strategy_id: 'smoke', paths: ['e2e/**/*.mjs'], tier: 'e2e' },
        { strategy_id: 'visual', paths: ['components/**/*.mjs'], tier: 'integration' },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(warnings.length, 0);
    assert.equal(strategies.length, 3);
    assert.equal(strategies[0].strategy_id, 'unit');
    assert.equal(strategies[1].strategy_id, 'smoke');
    assert.equal(strategies[2].strategy_id, 'visual');
  });

  it('skips invalid entries and returns valid ones in mixed array', () => {
    const manifest = {
      test_strategies: [
        { strategy_id: 'unit', paths: ['src/**/*.mjs'] },
        { strategy_id: 'bogus', paths: ['tests/**/*.mjs'] },
        { strategy_id: 'smoke', paths: ['e2e/**/*.mjs'] },
      ],
    };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(warnings.length, 1);
    assert.equal(strategies.length, 2);
    assert.equal(strategies[0].strategy_id, 'unit');
    assert.equal(strategies[1].strategy_id, 'smoke');
  });

  it('accepts all 8 known strategy ids', () => {
    const knownIds = [
      'contract', 'fixture', 'policy', 'schema',
      'smoke', 'threshold', 'unit', 'visual',
    ];
    for (const id of knownIds) {
      const manifest = {
        test_strategies: [{ strategy_id: id, paths: ['src/**/*.mjs'] }],
      };
      const { strategies, warnings } = parseTestStrategies(manifest);
      assert.equal(warnings.length, 0, `Expected no warnings for strategy_id '${id}'`);
      assert.equal(strategies.length, 1, `Expected 1 strategy for '${id}'`);
    }
  });

  it('returns a warning and no strategies when test_strategies is not an array', () => {
    const manifest = { test_strategies: 'unit' };
    const { strategies, warnings } = parseTestStrategies(manifest);
    assert.equal(strategies.length, 0);
    assert.equal(warnings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// matchStrategy
// ---------------------------------------------------------------------------

describe('matchStrategy', () => {
  const strategies = [
    {
      strategy_id: 'unit',
      command: null,
      tier: 'fast',
      paths: ['src/**/*.mjs', 'lib/**/*.mjs'],
    },
    {
      strategy_id: 'smoke',
      command: null,
      tier: 'e2e',
      paths: ['e2e/**/*.mjs'],
    },
  ];

  it('returns the first matching strategy for a file in src/', () => {
    const match = matchStrategy('src/foo/bar.mjs', strategies);
    assert.ok(match);
    assert.equal(match.strategy_id, 'unit');
  });

  it('returns the first matching strategy for a file in lib/', () => {
    const match = matchStrategy('lib/issues/registry.mjs', strategies);
    assert.ok(match);
    assert.equal(match.strategy_id, 'unit');
  });

  it('returns the correct strategy for an e2e file', () => {
    const match = matchStrategy('e2e/flows/login.mjs', strategies);
    assert.ok(match);
    assert.equal(match.strategy_id, 'smoke');
  });

  it('returns null for a file that matches no strategy', () => {
    const match = matchStrategy('tests/helpers.mjs', strategies);
    assert.equal(match, null);
  });

  it('returns null when strategies array is empty', () => {
    const match = matchStrategy('src/foo.mjs', []);
    assert.equal(match, null);
  });

  it('first-match-wins when globs overlap', () => {
    const overlapping = [
      {
        strategy_id: 'unit',
        command: null,
        tier: 'fast',
        paths: ['src/**/*.mjs'],
      },
      {
        strategy_id: 'visual',
        command: null,
        tier: 'integration',
        paths: ['src/components/**/*.mjs'],
      },
    ];
    // src/components/Button.mjs matches both globs; unit wins (declared first)
    const match = matchStrategy('src/components/Button.mjs', overlapping);
    assert.ok(match);
    assert.equal(match.strategy_id, 'unit');
  });

  it('returns second strategy when first does not match', () => {
    const ordered = [
      {
        strategy_id: 'policy',
        command: null,
        tier: 'fast',
        paths: ['infra/**/*.tf'],
      },
      {
        strategy_id: 'unit',
        command: null,
        tier: 'fast',
        paths: ['src/**/*.mjs'],
      },
    ];
    const match = matchStrategy('src/util.mjs', ordered);
    assert.ok(match);
    assert.equal(match.strategy_id, 'unit');
  });
});

// ---------------------------------------------------------------------------
// matchGlob (unit tests for the glob matcher itself)
// ---------------------------------------------------------------------------

describe('matchGlob', () => {
  it('matches ** across multiple path segments', () => {
    assert.ok(matchGlob('src/**/*.mjs', 'src/lib/issues/registry.mjs'));
  });

  it('matches * within a single segment', () => {
    assert.ok(matchGlob('src/*.mjs', 'src/index.mjs'));
    assert.ok(!matchGlob('src/*.mjs', 'src/lib/index.mjs'));
  });

  it('matches exact path', () => {
    assert.ok(matchGlob('hooks/merge-guard.sh', 'hooks/merge-guard.sh'));
    assert.ok(!matchGlob('hooks/merge-guard.sh', 'hooks/other.sh'));
  });

  it('does not match partial paths without glob', () => {
    assert.ok(!matchGlob('src/foo.mjs', 'src/foo.mjs.bak'));
  });

  it('matches top-level wildcard', () => {
    assert.ok(matchGlob('*.mjs', 'index.mjs'));
    assert.ok(!matchGlob('*.mjs', 'src/index.mjs'));
  });
});
