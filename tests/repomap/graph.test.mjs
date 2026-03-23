import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../../lib/repomap/graph.mjs';

// Helper to build minimal parsedFiles entries
function file(filePath, exports = [], imports = []) {
  return {
    filePath,
    symbols: exports.map((name, i) => ({ name, kind: 'function', line: i + 1 })),
    imports,
  };
}

function imp(source, symbols = [], { isTypeOnly = false, isDynamic = false } = {}) {
  return { source, symbols, isTypeOnly, isDynamic };
}

const PROJECT_ROOT = '/project';

describe('buildGraph', () => {
  it('builds graph from simple 3-file setup: A→B, B→C', () => {
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [imp('./b', ['doB'])]),
      file('/project/src/b.ts', ['doB'], [imp('./c', ['doC'])]),
      file('/project/src/c.ts', ['doC'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.nodes.length, 3);
    assert.equal(graph.edges.length, 2);

    const edgeAB = graph.edges.find(e => e.from === 'src/a.ts' && e.to === 'src/b.ts');
    assert.ok(edgeAB, 'edge A→B should exist');
    assert.deepStrictEqual(edgeAB.symbols, ['doB']);
    assert.equal(edgeAB.type, 'import');

    const edgeBC = graph.edges.find(e => e.from === 'src/b.ts' && e.to === 'src/c.ts');
    assert.ok(edgeBC, 'edge B→C should exist');
  });

  it('excludes external imports (non-relative sources)', () => {
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [
        imp('fs', ['readFileSync']),
        imp('lodash', ['map']),
        imp('./b', ['doB']),
      ]),
      file('/project/src/b.ts', ['doB'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].from, 'src/a.ts');
    assert.equal(graph.edges[0].to, 'src/b.ts');
  });

  it('handles circular imports: A→B and B→A', () => {
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [imp('./b', ['doB'])]),
      file('/project/src/b.ts', ['doB'], [imp('./a', ['doA'])]),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 2);

    const edgeAB = graph.edges.find(e => e.from === 'src/a.ts' && e.to === 'src/b.ts');
    const edgeBA = graph.edges.find(e => e.from === 'src/b.ts' && e.to === 'src/a.ts');
    assert.ok(edgeAB, 'A→B edge should exist');
    assert.ok(edgeBA, 'B→A edge should exist');
  });

  it('enforces path containment: import resolving outside project root creates no edge', () => {
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [imp('../../outside/evil', ['hack'])]),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 0);
  });

  it('assigns correct module based on modules config', () => {
    const parsedFiles = [
      file('/project/src/core/utils.ts', ['helper'], []),
      file('/project/src/api/handler.ts', ['handle'], []),
      file('/project/src/orphan.ts', ['alone'], []),
    ];

    const modules = [
      { slug: 'core', paths: ['src/core'] },
      { slug: 'api', paths: ['src/api'] },
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, modules);

    const coreNode = graph.nodes.find(n => n.path === 'src/core/utils.ts');
    const apiNode = graph.nodes.find(n => n.path === 'src/api/handler.ts');
    const orphanNode = graph.nodes.find(n => n.path === 'src/orphan.ts');

    assert.equal(coreNode.module, 'core');
    assert.equal(apiNode.module, 'api');
    assert.equal(orphanNode.module, null);
  });

  it('detects re-export edges when barrel file re-exports symbols', () => {
    // index.ts exports 'User' and imports 'User' from ./types
    const parsedFiles = [
      file('/project/src/index.ts', ['User'], [imp('./types', ['User'])]),
      file('/project/src/types.ts', ['User'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 1);
    const edge = graph.edges[0];
    assert.equal(edge.from, 'src/index.ts');
    assert.equal(edge.to, 'src/types.ts');
    assert.equal(edge.type, 're-export');
  });

  it('marks type-only imports with correct edge type', () => {
    const parsedFiles = [
      file('/project/src/service.ts', ['run'], [
        imp('./types', ['Task'], { isTypeOnly: true }),
      ]),
      file('/project/src/types.ts', ['Task'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].type, 'type-import');
  });

  it('marks dynamic imports with correct edge type', () => {
    const parsedFiles = [
      file('/project/src/loader.ts', ['load'], [
        imp('./plugin', ['Plugin'], { isDynamic: true }),
      ]),
      file('/project/src/plugin.ts', ['Plugin'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].type, 'dynamic-import');
  });

  it('resolves imports with extension fallback', () => {
    // Import source is './utils' but file is '/project/src/utils.ts'
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [imp('./utils', ['helper'])]),
      file('/project/src/utils.ts', ['helper'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].to, 'src/utils.ts');
  });

  it('resolves index file imports', () => {
    // Import source is './lib' but file is '/project/src/lib/index.ts'
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [imp('./lib', ['thing'])]),
      file('/project/src/lib/index.ts', ['thing'], []),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].to, 'src/lib/index.ts');
  });

  it('returns graph with generated timestamp and commit fields', () => {
    const graph = buildGraph([], PROJECT_ROOT, []);

    assert.equal(typeof graph.generated, 'string');
    // Should be ISO 8601
    assert.ok(!isNaN(Date.parse(graph.generated)), 'generated should be valid ISO date');
    assert.equal(typeof graph.commit, 'string');
    assert.ok(Array.isArray(graph.nodes));
    assert.ok(Array.isArray(graph.edges));
  });

  it('skips imports that do not resolve to any parsed file', () => {
    const parsedFiles = [
      file('/project/src/a.ts', ['doA'], [imp('./missing', ['gone'])]),
    ];

    const graph = buildGraph(parsedFiles, PROJECT_ROOT, []);

    assert.equal(graph.edges.length, 0);
  });
});
