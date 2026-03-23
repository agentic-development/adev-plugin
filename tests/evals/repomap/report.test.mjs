import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from './report.mjs';

describe('generateReport', () => {
  const groundTruth = { symbolCount: 142, edgeCount: 87 };

  const treeSitterResult = {
    symbols: { precision: 0.95, recall: 0.92, matched: 131, missing: Array(11).fill({ name: 'x', file: 'y.ts', line: 1 }), extra: Array(7).fill({ name: 'z', file: 'w.ts', line: 2 }) },
    edges: { precision: 0.91, recall: 0.89, matched: 78, missing: Array(9).fill({ from: 'a.ts', to: 'b.ts' }), extra: Array(8).fill({ from: 'c.ts', to: 'd.ts' }) },
  };

  const regexResult = {
    symbols: { precision: 0.88, recall: 0.71, matched: 101, missing: Array(41).fill({ name: 'q', file: 'r.ts', line: 3 }), extra: Array(14).fill({ name: 's', file: 't.ts', line: 4 }) },
    edges: null,
  };

  it('generates markdown with expected headers', () => {
    const md = generateReport('zod', 'https://github.com/colinhacks/zod.git', 'a'.repeat(40), groundTruth, treeSitterResult, regexResult);

    assert.ok(md.includes('# Eval Report: zod'));
    assert.ok(md.includes('## Symbol Accuracy'));
    assert.ok(md.includes('## Edge Accuracy (tree-sitter only)'));
    assert.ok(md.includes('## Missing Symbols (tree-sitter)'));
    assert.ok(md.includes('## Extra Symbols (tree-sitter)'));
    assert.ok(md.includes('## Missing Symbols (regex)'));
  });

  it('includes repo metadata', () => {
    const md = generateReport('zod', 'https://github.com/colinhacks/zod.git', 'a'.repeat(40), groundTruth, treeSitterResult, regexResult);

    assert.ok(md.includes('https://github.com/colinhacks/zod.git'));
    assert.ok(md.includes('a'.repeat(40)));
    assert.ok(md.includes('142 symbols'));
    assert.ok(md.includes('87 edges'));
  });

  it('includes correct precision/recall values in table', () => {
    const md = generateReport('zod', 'https://github.com/colinhacks/zod.git', 'a'.repeat(40), groundTruth, treeSitterResult, regexResult);

    assert.ok(md.includes('0.95'));
    assert.ok(md.includes('0.92'));
    assert.ok(md.includes('0.88'));
    assert.ok(md.includes('0.71'));
    assert.ok(md.includes('| 131 |'));
    assert.ok(md.includes('| 101 |'));
  });

  it('includes edge accuracy table values', () => {
    const md = generateReport('zod', 'https://github.com/colinhacks/zod.git', 'a'.repeat(40), groundTruth, treeSitterResult, regexResult);

    assert.ok(md.includes('0.91'));
    assert.ok(md.includes('0.89'));
    assert.ok(md.includes('| 78 |'));
  });

  it('includes generated timestamp', () => {
    const md = generateReport('zod', 'https://github.com/colinhacks/zod.git', 'a'.repeat(40), groundTruth, treeSitterResult, regexResult);

    // Should contain ISO-like timestamp
    assert.ok(/\d{4}-\d{2}-\d{2}T/.test(md), 'should contain ISO timestamp');
  });

  it('handles null edge result for tree-sitter', () => {
    const tsResultNoEdges = {
      symbols: treeSitterResult.symbols,
      edges: null,
    };
    const md = generateReport('zod', 'https://github.com/colinhacks/zod.git', 'a'.repeat(40), groundTruth, tsResultNoEdges, regexResult);

    assert.ok(md.includes('## Edge Accuracy (tree-sitter only)'));
    assert.ok(md.includes('No edge data'));
  });
});
