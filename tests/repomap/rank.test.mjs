import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRanks } from '../../lib/repomap/rank.mjs';

/**
 * Helper to build a mock DependencyGraph.
 */
function makeGraph(nodes, edges) {
  return {
    generated: '2026-03-23T14:30:00.000Z',
    commit: 'abc1234',
    nodes,
    edges,
  };
}

function makeSymbolDetails(entries) {
  const map = new Map();
  for (const [path, symbols] of entries) {
    map.set(path, symbols);
  }
  return map;
}

describe('computeRanks', () => {
  it('scores sum to 1.0 (±0.001) for a multi-node graph', () => {
    const graph = makeGraph(
      [
        { path: 'src/a.ts', exports: ['A1', 'A2'], module: 'core' },
        { path: 'src/b.ts', exports: ['B1'], module: 'core' },
        { path: 'src/c.ts', exports: ['C1'], module: 'core' },
      ],
      [
        { from: 'src/a.ts', to: 'src/b.ts', type: 'import', symbols: ['B1'] },
        { from: 'src/a.ts', to: 'src/c.ts', type: 'import', symbols: ['C1'] },
        { from: 'src/b.ts', to: 'src/c.ts', type: 'import', symbols: ['C1'] },
      ],
    );
    const details = makeSymbolDetails([
      ['src/a.ts', [{ name: 'A1', kind: 'function', line: 1 }, { name: 'A2', kind: 'function', line: 5 }]],
      ['src/b.ts', [{ name: 'B1', kind: 'class', line: 1 }]],
      ['src/c.ts', [{ name: 'C1', kind: 'interface', line: 1 }]],
    ]);

    const result = computeRanks(graph, details);
    const total = result.symbols.reduce((sum, s) => sum + s.score, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001, `scores sum to ${total}, expected ~1.0`);
  });

  it('symbols are sorted by score descending', () => {
    const graph = makeGraph(
      [
        { path: 'src/a.ts', exports: ['A1'], module: null },
        { path: 'src/b.ts', exports: ['B1'], module: null },
      ],
      [
        { from: 'src/a.ts', to: 'src/b.ts', type: 'import', symbols: ['B1'] },
      ],
    );
    const details = makeSymbolDetails([
      ['src/a.ts', [{ name: 'A1', kind: 'function', line: 1 }]],
      ['src/b.ts', [{ name: 'B1', kind: 'function', line: 1 }]],
    ]);

    const result = computeRanks(graph, details);
    for (let i = 1; i < result.symbols.length; i++) {
      assert.ok(
        result.symbols[i - 1].score >= result.symbols[i].score,
        `symbol ${result.symbols[i - 1].name} (${result.symbols[i - 1].score}) should be >= ${result.symbols[i].name} (${result.symbols[i].score})`,
      );
    }
  });

  it('single-node graph: file score is 1.0', () => {
    const graph = makeGraph(
      [{ path: 'src/only.ts', exports: ['Only'], module: 'core' }],
      [],
    );
    const details = makeSymbolDetails([
      ['src/only.ts', [{ name: 'Only', kind: 'class', line: 10 }]],
    ]);

    const result = computeRanks(graph, details);
    assert.equal(result.symbols.length, 1);
    assert.ok(Math.abs(result.symbols[0].score - 1.0) < 0.001, `single node score is ${result.symbols[0].score}`);
    assert.equal(result.symbols[0].file, 'src/only.ts');
  });

  it('hub file (imported by many) gets higher score than leaf file', () => {
    // types.ts is imported by a.ts, b.ts, c.ts — it's a hub
    const graph = makeGraph(
      [
        { path: 'src/types.ts', exports: ['User'], module: 'core' },
        { path: 'src/a.ts', exports: ['A1'], module: null },
        { path: 'src/b.ts', exports: ['B1'], module: null },
        { path: 'src/c.ts', exports: ['C1'], module: null },
      ],
      [
        { from: 'src/a.ts', to: 'src/types.ts', type: 'import', symbols: ['User'] },
        { from: 'src/b.ts', to: 'src/types.ts', type: 'import', symbols: ['User'] },
        { from: 'src/c.ts', to: 'src/types.ts', type: 'import', symbols: ['User'] },
      ],
    );
    const details = makeSymbolDetails([
      ['src/types.ts', [{ name: 'User', kind: 'interface', line: 5 }]],
      ['src/a.ts', [{ name: 'A1', kind: 'function', line: 1 }]],
      ['src/b.ts', [{ name: 'B1', kind: 'function', line: 1 }]],
      ['src/c.ts', [{ name: 'C1', kind: 'function', line: 1 }]],
    ]);

    const result = computeRanks(graph, details);
    const userSymbol = result.symbols.find(s => s.name === 'User');
    const a1Symbol = result.symbols.find(s => s.name === 'A1');
    assert.ok(userSymbol.score > a1Symbol.score, `hub symbol User (${userSymbol.score}) should score higher than leaf A1 (${a1Symbol.score})`);
  });

  it('empty graph returns empty symbols', () => {
    const graph = makeGraph([], []);
    const details = makeSymbolDetails([]);

    const result = computeRanks(graph, details);
    assert.equal(result.symbols.length, 0);
    assert.equal(result.generated, '2026-03-23T14:30:00.000Z');
    assert.equal(result.commit, 'abc1234');
  });

  it('dangling nodes (zero outgoing edges) do not break convergence', () => {
    // dangling.ts has no outgoing edges — it's a sink node
    const graph = makeGraph(
      [
        { path: 'src/entry.ts', exports: ['main'], module: null },
        { path: 'src/dangling.ts', exports: ['Dangle'], module: null },
      ],
      [
        { from: 'src/entry.ts', to: 'src/dangling.ts', type: 'import', symbols: ['Dangle'] },
      ],
    );
    const details = makeSymbolDetails([
      ['src/entry.ts', [{ name: 'main', kind: 'function', line: 1 }]],
      ['src/dangling.ts', [{ name: 'Dangle', kind: 'class', line: 1 }]],
    ]);

    const result = computeRanks(graph, details);
    // Should not throw and scores should sum to ~1.0
    const total = result.symbols.reduce((sum, s) => sum + s.score, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001, `scores sum to ${total} with dangling node`);
    assert.equal(result.symbols.length, 2);
  });

  it('references count is correct (number of distinct files importing the symbol)', () => {
    const graph = makeGraph(
      [
        { path: 'src/types.ts', exports: ['User', 'Task'], module: 'core' },
        { path: 'src/a.ts', exports: ['A1'], module: null },
        { path: 'src/b.ts', exports: ['B1'], module: null },
        { path: 'src/c.ts', exports: ['C1'], module: null },
      ],
      [
        { from: 'src/a.ts', to: 'src/types.ts', type: 'import', symbols: ['User', 'Task'] },
        { from: 'src/b.ts', to: 'src/types.ts', type: 'import', symbols: ['User'] },
        { from: 'src/c.ts', to: 'src/types.ts', type: 'import', symbols: ['Task'] },
      ],
    );
    const details = makeSymbolDetails([
      ['src/types.ts', [{ name: 'User', kind: 'interface', line: 1 }, { name: 'Task', kind: 'interface', line: 5 }]],
      ['src/a.ts', [{ name: 'A1', kind: 'function', line: 1 }]],
      ['src/b.ts', [{ name: 'B1', kind: 'function', line: 1 }]],
      ['src/c.ts', [{ name: 'C1', kind: 'function', line: 1 }]],
    ]);

    const result = computeRanks(graph, details);
    const userSym = result.symbols.find(s => s.name === 'User');
    const taskSym = result.symbols.find(s => s.name === 'Task');
    // User is imported by a.ts and b.ts = 2 references
    assert.equal(userSym.references, 2);
    // Task is imported by a.ts and c.ts = 2 references
    assert.equal(taskSym.references, 2);
    // A1, B1, C1 have 0 references (nobody imports them)
    const a1Sym = result.symbols.find(s => s.name === 'A1');
    assert.equal(a1Sym.references, 0);
  });

  it('symbol kind and line are preserved in output', () => {
    const graph = makeGraph(
      [{ path: 'src/types.ts', exports: ['User'], module: 'core' }],
      [],
    );
    const details = makeSymbolDetails([
      ['src/types.ts', [{ name: 'User', kind: 'interface', line: 42 }]],
    ]);

    const result = computeRanks(graph, details);
    assert.equal(result.symbols[0].name, 'User');
    assert.equal(result.symbols[0].kind, 'interface');
    assert.equal(result.symbols[0].line, 42);
    assert.equal(result.symbols[0].file, 'src/types.ts');
    assert.equal(result.symbols[0].module, 'core');
  });
});

// ---------------------------------------------------------------------------
// Post-rank annotation (Behavior 4 of non-code-reference-detection.spec.md)
// ---------------------------------------------------------------------------

describe('post-rank annotation (doc-references + public-api)', () => {
  it('PageRank score sum is unchanged after annotation', () => {
    const graph = makeGraph(
      [
        { path: 'a.ts', exports: ['A'], module: null },
        { path: 'b.ts', exports: ['B'], module: null },
      ],
      [{ from: 'a.ts', to: 'b.ts', type: 'import', symbols: ['B'] }],
    );
    const details = makeSymbolDetails([
      ['a.ts', [{ name: 'A', kind: 'function', line: 1 }]],
      ['b.ts', [{ name: 'B', kind: 'function', line: 1 }]],
    ]);

    const baseline = computeRanks(graph, details);
    const baselineSum = baseline.symbols.reduce((s, x) => s + x.score, 0);

    const annotated = computeRanks(graph, details, {
      docReferenceEdges: [
        { type: 'doc-reference', from: 'skills/x/SKILL.md', to: 'b.ts', symbols: [], count: 1 },
      ],
      publicApiPaths: ['a.ts'],
    });
    const annotatedSum = annotated.symbols.reduce((s, x) => s + x.score, 0);
    assert.ok(
      Math.abs(baselineSum - annotatedSum) < 0.001,
      `score sum must not change (baseline=${baselineSum}, annotated=${annotatedSum})`,
    );
  });

  it('public-api-entry symbols get referenceSources containing "package-exports"', () => {
    const graph = makeGraph(
      [
        { path: 'cli.ts', exports: ['main'], module: null, tags: ['public-api-entry'] },
        { path: 'lib.ts', exports: ['helper'], module: null },
      ],
      [],
    );
    const details = makeSymbolDetails([
      ['cli.ts', [{ name: 'main', kind: 'function', line: 1 }]],
      ['lib.ts', [{ name: 'helper', kind: 'function', line: 1 }]],
    ]);

    const result = computeRanks(graph, details, {
      docReferenceEdges: [],
      publicApiPaths: ['cli.ts'],
    });
    const mainSym = result.symbols.find(s => s.name === 'main');
    assert.ok(mainSym.referenceSources);
    assert.ok(mainSym.referenceSources.includes('package-exports'));
    assert.ok(mainSym.references >= 1, 'public-api references must be at least 1');
    const helperSym = result.symbols.find(s => s.name === 'helper');
    // Helper has no annotations.
    assert.equal(
      (helperSym.referenceSources || []).includes('package-exports'),
      false,
    );
  });

  it('doc-reference target symbols get referenceSources containing "doc-reference"', () => {
    const graph = makeGraph(
      [
        { path: 'lib.ts', exports: ['helper'], module: null },
        { path: 'other.ts', exports: ['other'], module: null },
      ],
      [],
    );
    const details = makeSymbolDetails([
      ['lib.ts', [{ name: 'helper', kind: 'function', line: 1 }]],
      ['other.ts', [{ name: 'other', kind: 'function', line: 1 }]],
    ]);

    const result = computeRanks(graph, details, {
      docReferenceEdges: [
        { type: 'doc-reference', from: 'skills/a/SKILL.md', to: 'lib.ts', symbols: [], count: 1 },
        { type: 'doc-reference', from: 'skills/b/SKILL.md', to: 'lib.ts', symbols: [], count: 3 },
      ],
      publicApiPaths: [],
    });
    const helperSym = result.symbols.find(s => s.name === 'helper');
    assert.ok(helperSym.referenceSources.includes('doc-reference'));
    // Two distinct source skills (a, b) each contribute 1 → references += 2.
    assert.equal(helperSym.references, 2, 'one per distinct source skill, capped');
    const otherSym = result.symbols.find(s => s.name === 'other');
    assert.equal(
      (otherSym.referenceSources || []).includes('doc-reference'),
      false,
    );
  });

  it('cap of one contribution per distinct source skill file', () => {
    const graph = makeGraph(
      [{ path: 'lib.ts', exports: ['helper'], module: null }],
      [],
    );
    const details = makeSymbolDetails([
      ['lib.ts', [{ name: 'helper', kind: 'function', line: 1 }]],
    ]);
    // Three edges from the SAME skill source — should contribute 1 reference.
    const result = computeRanks(graph, details, {
      docReferenceEdges: [
        { type: 'doc-reference', from: 'skills/a/SKILL.md', to: 'lib.ts', symbols: [], count: 7 },
        { type: 'doc-reference', from: 'skills/a/SKILL.md', to: 'lib.ts', symbols: [], count: 1 },
      ],
      publicApiPaths: [],
    });
    const helperSym = result.symbols.find(s => s.name === 'helper');
    assert.equal(helperSym.references, 1);
  });

  it('a symbol with both annotations gets both labels and both increments', () => {
    const graph = makeGraph(
      [
        { path: 'cli.ts', exports: ['main'], module: null, tags: ['public-api-entry'] },
      ],
      [],
    );
    const details = makeSymbolDetails([
      ['cli.ts', [{ name: 'main', kind: 'function', line: 1 }]],
    ]);
    const result = computeRanks(graph, details, {
      docReferenceEdges: [
        { type: 'doc-reference', from: 'skills/x/SKILL.md', to: 'cli.ts', symbols: [], count: 1 },
      ],
      publicApiPaths: ['cli.ts'],
    });
    const mainSym = result.symbols[0];
    assert.ok(mainSym.referenceSources.includes('package-exports'));
    assert.ok(mainSym.referenceSources.includes('doc-reference'));
    // public-api +1 and doc-reference +1
    assert.equal(mainSym.references, 2);
  });

  it('omitting options arg leaves prior behavior unchanged', () => {
    const graph = makeGraph(
      [{ path: 'a.ts', exports: ['A'], module: null }],
      [],
    );
    const details = makeSymbolDetails([
      ['a.ts', [{ name: 'A', kind: 'function', line: 1 }]],
    ]);
    const result = computeRanks(graph, details);
    // referenceSources should be undefined or empty when no annotations were applied.
    const sym = result.symbols[0];
    assert.equal(sym.references, 0);
    assert.ok(
      sym.referenceSources === undefined ||
        (Array.isArray(sym.referenceSources) && sym.referenceSources.length === 0),
    );
  });
});
