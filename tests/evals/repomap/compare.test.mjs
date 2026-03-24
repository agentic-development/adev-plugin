import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareSymbols, compareEdges } from './compare.mjs';

describe('compareSymbols', () => {
  it('perfect match returns P=1.0, R=1.0', () => {
    const symbols = [
      { name: 'User', file: 'src/types.ts', kind: 'interface', line: 1 },
      { name: 'Task', file: 'src/types.ts', kind: 'interface', line: 7 },
    ];
    const result = compareSymbols(symbols, symbols);
    assert.equal(result.precision, 1.0);
    assert.equal(result.recall, 1.0);
    assert.equal(result.matched, 2);
    assert.equal(result.missing.length, 0);
    assert.equal(result.extra.length, 0);
  });

  it('partial match computes correct missing/extra', () => {
    const parser = [
      { name: 'User', file: 'src/types.ts', kind: 'interface', line: 1 },
      { name: 'Ghost', file: 'src/types.ts', kind: 'interface', line: 99 },
    ];
    const truth = [
      { name: 'User', file: 'src/types.ts', kind: 'interface', line: 1 },
      { name: 'Task', file: 'src/types.ts', kind: 'interface', line: 7 },
    ];
    const result = compareSymbols(parser, truth);
    assert.equal(result.precision, 0.5);
    assert.equal(result.recall, 0.5);
    assert.equal(result.matched, 1);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].name, 'Task');
    assert.equal(result.extra.length, 1);
    assert.equal(result.extra[0].name, 'Ghost');
  });

  it('empty parser output: P=0, R=0', () => {
    const truth = [
      { name: 'User', file: 'src/types.ts', kind: 'interface', line: 1 },
    ];
    const result = compareSymbols([], truth);
    assert.equal(result.precision, 0);
    assert.equal(result.recall, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.missing.length, 1);
  });

  it('empty ground truth: P=0, R=1.0', () => {
    const parser = [
      { name: 'User', file: 'src/types.ts', kind: 'interface', line: 1 },
    ];
    const result = compareSymbols(parser, []);
    assert.equal(result.precision, 0);
    assert.equal(result.recall, 1.0);
    assert.equal(result.matched, 0);
    assert.equal(result.extra.length, 1);
  });

  it('matching is case-insensitive for file paths', () => {
    const parser = [
      { name: 'User', file: 'SRC/Types.ts', kind: 'interface', line: 1 },
    ];
    const truth = [
      { name: 'User', file: 'src/types.ts', kind: 'interface', line: 1 },
    ];
    const result = compareSymbols(parser, truth);
    assert.equal(result.matched, 1);
    assert.equal(result.precision, 1.0);
    assert.equal(result.recall, 1.0);
  });
});

describe('compareEdges', () => {
  it('perfect match returns P=1.0, R=1.0', () => {
    const edges = [
      { from: 'src/db.ts', to: 'src/config.ts', symbols: ['DB_PATH'] },
    ];
    const result = compareEdges(edges, edges);
    assert.equal(result.precision, 1.0);
    assert.equal(result.recall, 1.0);
    assert.equal(result.matched, 1);
  });

  it('returns null if parserEdges is null', () => {
    const truth = [{ from: 'a.ts', to: 'b.ts', symbols: ['x'] }];
    const result = compareEdges(null, truth);
    assert.equal(result, null);
  });

  it('partial match computes correct missing/extra', () => {
    const parser = [
      { from: 'src/a.ts', to: 'src/b.ts', symbols: ['x'] },
      { from: 'src/a.ts', to: 'src/c.ts', symbols: ['y'] },
    ];
    const truth = [
      { from: 'src/a.ts', to: 'src/b.ts', symbols: ['x'] },
      { from: 'src/d.ts', to: 'src/e.ts', symbols: ['z'] },
    ];
    const result = compareEdges(parser, truth);
    assert.equal(result.precision, 0.5);
    assert.equal(result.recall, 0.5);
    assert.equal(result.matched, 1);
    assert.equal(result.missing.length, 1);
    assert.equal(result.extra.length, 1);
  });

  it('empty parser edges: P=0, R=0', () => {
    const truth = [{ from: 'a.ts', to: 'b.ts', symbols: ['x'] }];
    const result = compareEdges([], truth);
    assert.equal(result.precision, 0);
    assert.equal(result.recall, 0);
  });

  it('empty ground truth edges: P=0, R=1.0', () => {
    const parser = [{ from: 'a.ts', to: 'b.ts', symbols: ['x'] }];
    const result = compareEdges(parser, []);
    assert.equal(result.precision, 0);
    assert.equal(result.recall, 1.0);
  });
});
