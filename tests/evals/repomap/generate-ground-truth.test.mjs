import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateGroundTruth } from './generate-ground-truth.mjs';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const FIXTURE_PATH = join(import.meta.dirname, '..', '..', 'fixtures', 'sample-project');

describe('generateGroundTruth', () => {
  let outputDir;

  it('generates symbols and edges for sample-project', () => {
    outputDir = mkdtempSync(join(tmpdir(), 'gt-test-'));
    const result = generateGroundTruth(FIXTURE_PATH, outputDir);

    assert.ok(result.symbolCount > 0, 'should find symbols');
    assert.ok(result.edgeCount > 0, 'should find edges');

    // Read generated files
    const symbolsData = JSON.parse(readFileSync(join(outputDir, 'ground-truth-symbols.json'), 'utf-8'));
    const edgesData = JSON.parse(readFileSync(join(outputDir, 'ground-truth-edges.json'), 'utf-8'));

    assert.ok(symbolsData.generated, 'symbols should have generated timestamp');
    assert.ok(edgesData.generated, 'edges should have generated timestamp');

    const symbols = symbolsData.symbols;
    const edges = edgesData.edges;

    // Check known symbols exist
    const symbolNames = symbols.map(s => s.name);
    const expectedSymbols = [
      'User', 'Task', 'TaskStatus', 'TaskFilter',
      'Database',
      'APP_NAME', 'MAX_RETRIES', 'DEFAULT_PAGE_SIZE', 'DB_PATH',
      'format', 'toUpperCase', 'clamp',
      'createTask', 'listTasks',
      'getUser', 'getAssigneeName', 'getUserTasks',
      'formatDate', 'formatCurrency', 'formatPercent',
      'validateUser', 'validateTask', 'isNonEmpty',
      'main',
    ];
    for (const name of expectedSymbols) {
      assert.ok(symbolNames.includes(name), `missing symbol: ${name}`);
    }

    // Check known edges exist
    const edgeKeys = edges.map(e => `${e.from}->${e.to}`);
    const expectedEdges = [
      'src/db.ts->src/config.ts',
      'src/services/task-service.ts->src/types.ts',
      'src/services/task-service.ts->src/db.ts',
      'src/services/task-service.ts->src/utils.ts',
      'src/services/task-service.ts->src/services/user-service.ts',
      'src/services/user-service.ts->src/types.ts',
      'src/services/user-service.ts->src/db.ts',
      'src/services/user-service.ts->src/services/task-service.ts',
      'src/services/index.ts->src/services/task-service.ts',
      'src/services/index.ts->src/services/user-service.ts',
      'src/helpers/validate.ts->src/types.ts',
      'src/index.ts->src/services/index.ts',
      'src/index.ts->src/config.ts',
    ];
    for (const edge of expectedEdges) {
      assert.ok(edgeKeys.includes(edge), `missing edge: ${edge}`);
    }

    // External import (fs) should NOT appear
    const fsEdges = edges.filter(e => e.to === 'fs' || e.to.includes('node_modules'));
    assert.equal(fsEdges.length, 0, 'external import (fs) should be excluded');

    // Verify edge count matches expected
    assert.equal(edges.length, 13, `expected 13 edges, got ${edges.length}`);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('symbols have correct structure', () => {
    outputDir = mkdtempSync(join(tmpdir(), 'gt-test-'));
    generateGroundTruth(FIXTURE_PATH, outputDir);
    const symbolsData = JSON.parse(readFileSync(join(outputDir, 'ground-truth-symbols.json'), 'utf-8'));

    for (const sym of symbolsData.symbols) {
      assert.ok(sym.name, 'symbol must have name');
      assert.ok(sym.kind, 'symbol must have kind');
      assert.ok(sym.file, 'symbol must have file');
      assert.ok(typeof sym.line === 'number' && sym.line >= 1, 'symbol must have valid line number');
    }

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('edges have correct structure', () => {
    outputDir = mkdtempSync(join(tmpdir(), 'gt-test-'));
    generateGroundTruth(FIXTURE_PATH, outputDir);
    const edgesData = JSON.parse(readFileSync(join(outputDir, 'ground-truth-edges.json'), 'utf-8'));

    for (const edge of edgesData.edges) {
      assert.ok(edge.from, 'edge must have from');
      assert.ok(edge.to, 'edge must have to');
      assert.ok(Array.isArray(edge.symbols), 'edge must have symbols array');
      assert.ok(edge.symbols.length > 0, 'edge must have at least one symbol');
    }

    rmSync(outputDir, { recursive: true, force: true });
  });
});
