import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');
const SCRIPT_PATH = join(PLUGIN_ROOT, 'lib', 'repomap', 'index.mjs');

function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'repomap-index-test-'));
}

function cleanupTempDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

describe('repomap/index orchestrator', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('argument parsing', () => {
    it('extracts --root correctly', () => {
      // Create a minimal project with no source files
      mkdirSync(join(tempDir, '.context-index', 'hygiene'), { recursive: true });

      const result = execFileSync('node', [SCRIPT_PATH, '--root', tempDir], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Should exit 0 (no error thrown)
      // The repo-map.md should exist
      const repoMap = readFileSync(
        join(tempDir, '.context-index', 'hygiene', 'repo-map.md'),
        'utf-8',
      );
      assert.ok(repoMap.includes('# Repository Map'));
    });

    it('prints usage and exits 1 when --root is missing', () => {
      try {
        execFileSync('node', [SCRIPT_PATH], {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.fail('Should have exited with code 1');
      } catch (err) {
        assert.equal(err.status, 1);
        assert.ok(
          err.stderr.includes('Usage') || err.stderr.includes('--root'),
          'stderr should mention usage or --root',
        );
      }
    });
  });

  describe('manifest reading', () => {
    it('uses defaults when manifest is missing', () => {
      // No .context-index/manifest.yaml exists
      const result = execFileSync('node', [SCRIPT_PATH, '--root', tempDir], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Should still succeed and create repo-map.md
      const repoMapPath = join(tempDir, '.context-index', 'hygiene', 'repo-map.md');
      assert.ok(existsSync(repoMapPath), 'repo-map.md should be created');
    });

    it('reads exclude patterns from manifest', () => {
      // Create a manifest with custom exclude
      mkdirSync(join(tempDir, '.context-index'), { recursive: true });
      writeFileSync(
        join(tempDir, '.context-index', 'manifest.yaml'),
        [
          'repomap:',
          '  exclude:',
          '    - "node_modules/**"',
          '    - "vendor/**"',
        ].join('\n'),
      );

      // Create a source file in vendor/ that should be excluded
      mkdirSync(join(tempDir, 'vendor'), { recursive: true });
      writeFileSync(join(tempDir, 'vendor', 'lib.ts'), 'export const x = 1;');

      // Create a source file outside vendor/ that should be included
      writeFileSync(join(tempDir, 'main.ts'), 'export const y = 2;');

      execFileSync('node', [SCRIPT_PATH, '--root', tempDir], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const repoMap = readFileSync(
        join(tempDir, '.context-index', 'hygiene', 'repo-map.md'),
        'utf-8',
      );

      // vendor/lib.ts should be excluded
      assert.ok(!repoMap.includes('vendor/lib.ts'), 'vendor file should be excluded');
      // main.ts should be included
      assert.ok(repoMap.includes('main.ts'), 'main.ts should be included');
    });
  });

  describe('empty project', () => {
    it('writes empty repo-map with warning when no source files found', () => {
      // Create empty project dir — no .ts/.js files
      mkdirSync(join(tempDir, 'data'), { recursive: true });
      writeFileSync(join(tempDir, 'data', 'config.json'), '{}');

      const result = execFileSync('node', [SCRIPT_PATH, '--root', tempDir], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const repoMapPath = join(tempDir, '.context-index', 'hygiene', 'repo-map.md');
      assert.ok(existsSync(repoMapPath), 'repo-map.md should exist');

      const content = readFileSync(repoMapPath, 'utf-8');
      assert.ok(
        content.includes('No source files found'),
        'should contain warning about no source files',
      );
    });
  });

  describe('output structure', () => {
    it('creates hygiene directory if it does not exist', () => {
      // No hygiene dir pre-created
      execFileSync('node', [SCRIPT_PATH, '--root', tempDir], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      assert.ok(
        existsSync(join(tempDir, '.context-index', 'hygiene')),
        'hygiene dir should be created',
      );
    });

    it('repo-map.md contains parser annotation', () => {
      writeFileSync(join(tempDir, 'index.ts'), 'export const a = 1;');

      execFileSync('node', [SCRIPT_PATH, '--root', tempDir], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const content = readFileSync(
        join(tempDir, '.context-index', 'hygiene', 'repo-map.md'),
        'utf-8',
      );

      assert.ok(
        content.includes('Parser: tree-sitter') || content.includes('Parser: regex'),
        'should contain parser annotation',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests — full pipeline against fixture project
// ---------------------------------------------------------------------------

describe('integration - full pipeline', () => {
  const FIXTURE_ROOT = join(__dirname, '..', 'fixtures', 'sample-project');
  const HYGIENE_DIR = join(FIXTURE_ROOT, '.context-index', 'hygiene');

  const VALID_EDGE_TYPES = new Set([
    'import',
    'require',
    're-export',
    'dynamic-import',
    'type-import',
  ]);

  let graph;
  let ranks;
  let repoMapContent;

  before(() => {
    // Run the full pipeline once for all integration tests
    execFileSync('node', [SCRIPT_PATH, '--root', FIXTURE_ROOT], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Read outputs
    repoMapContent = readFileSync(join(HYGIENE_DIR, 'repo-map.md'), 'utf-8');
    graph = JSON.parse(readFileSync(join(HYGIENE_DIR, 'dependency-graph.json'), 'utf-8'));
    ranks = JSON.parse(readFileSync(join(HYGIENE_DIR, 'symbol-ranks.json'), 'utf-8'));
  });

  after(() => {
    // Clean up generated artifacts
    rmSync(HYGIENE_DIR, { recursive: true, force: true });
    // Also remove .context-index if empty
    try {
      const ciDir = join(FIXTURE_ROOT, '.context-index');
      if (existsSync(ciDir)) {
        const entries = readFileSync; // not used, just check emptiness via rmSync
        rmSync(ciDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  // --- repo-map.md ---

  it('repo-map.md exists and has tree-sitter parser annotation', () => {
    assert.ok(existsSync(join(HYGIENE_DIR, 'repo-map.md')), 'repo-map.md should exist');
    assert.ok(
      repoMapContent.includes('Parser: tree-sitter'),
      'repo-map.md should annotate Parser: tree-sitter',
    );
  });

  // --- dependency-graph.json schema ---

  it('dependency-graph.json exists with correct top-level schema', () => {
    assert.ok(existsSync(join(HYGIENE_DIR, 'dependency-graph.json')), 'dependency-graph.json should exist');
    assert.ok(typeof graph.generated === 'string', 'generated should be a string');
    // Verify ISO timestamp format
    assert.ok(!isNaN(Date.parse(graph.generated)), 'generated should be an ISO timestamp');
    assert.ok(typeof graph.commit === 'string', 'commit should be a string');
    assert.ok(Array.isArray(graph.nodes), 'nodes should be an array');
    assert.ok(Array.isArray(graph.edges), 'edges should be an array');
  });

  it('graph nodes have path, exports, module fields', () => {
    for (const node of graph.nodes) {
      assert.ok(typeof node.path === 'string', `node should have a string path, got ${typeof node.path}`);
      assert.ok(Array.isArray(node.exports), `node ${node.path} should have exports array`);
      assert.ok('module' in node, `node ${node.path} should have module field`);
    }
  });

  it('graph edges have from, to, type, symbols fields', () => {
    for (const edge of graph.edges) {
      assert.ok(typeof edge.from === 'string', 'edge should have string from');
      assert.ok(typeof edge.to === 'string', 'edge should have string to');
      assert.ok(typeof edge.type === 'string', 'edge should have string type');
      assert.ok(Array.isArray(edge.symbols), `edge ${edge.from}->${edge.to} should have symbols array`);
    }
  });

  it('all edge types are valid', () => {
    for (const edge of graph.edges) {
      assert.ok(
        VALID_EDGE_TYPES.has(edge.type),
        `edge ${edge.from} -> ${edge.to} has invalid type "${edge.type}". Valid: ${[...VALID_EDGE_TYPES].join(', ')}`,
      );
    }
  });

  // --- External packages excluded ---

  it('external package imports are not in the graph', () => {
    for (const edge of graph.edges) {
      assert.ok(
        !edge.to.includes('node_modules'),
        `edge to ${edge.to} references node_modules`,
      );
      // 'fs' is the known external import in db.ts
      assert.notEqual(edge.to, 'fs', 'external package "fs" should not appear as edge target');
    }
  });

  // --- symbol-ranks.json schema ---

  it('symbol-ranks.json exists with correct top-level schema', () => {
    assert.ok(existsSync(join(HYGIENE_DIR, 'symbol-ranks.json')), 'symbol-ranks.json should exist');
    assert.ok(typeof ranks.generated === 'string', 'generated should be a string');
    assert.ok(!isNaN(Date.parse(ranks.generated)), 'generated should be an ISO timestamp');
    assert.ok(typeof ranks.commit === 'string', 'commit should be a string');
    assert.ok(Array.isArray(ranks.symbols), 'symbols should be an array');
  });

  it('each symbol has name, kind, file, line, score, references, module', () => {
    for (const sym of ranks.symbols) {
      assert.ok(typeof sym.name === 'string', 'symbol name should be a string');
      assert.ok(typeof sym.kind === 'string', 'symbol kind should be a string');
      assert.ok(typeof sym.file === 'string', 'symbol file should be a string');
      assert.ok(typeof sym.line === 'number', 'symbol line should be a number');
      assert.ok(typeof sym.score === 'number', 'symbol score should be a number');
      assert.ok(typeof sym.references === 'number', 'symbol references should be a number');
      assert.ok('module' in sym, 'symbol should have module field');
    }
  });

  // --- PageRank scores sum to <= 1.0 ---

  it('PageRank scores sum to at most 1.0 (file-level PageRank is conserved)', () => {
    const totalScore = ranks.symbols.reduce((sum, s) => sum + s.score, 0);
    // Symbol-level scores may be less than 1.0 because symbols with 0 references
    // in a file that has other referenced symbols receive score 0 (by design).
    // File-level PageRank sums to 1.0; symbol distribution is always <= 1.0.
    assert.ok(
      totalScore <= 1.0 + 0.001,
      `symbol scores should not exceed 1.0, got ${totalScore}`,
    );
    assert.ok(
      totalScore > 0.5,
      `symbol scores should retain a significant portion of PageRank, got ${totalScore}`,
    );
  });

  // --- Sorted by score descending ---

  it('symbols are sorted by score descending', () => {
    for (let i = 1; i < ranks.symbols.length; i++) {
      assert.ok(
        ranks.symbols[i - 1].score >= ranks.symbols[i].score,
        `symbol at index ${i - 1} (score ${ranks.symbols[i - 1].score}) should be >= symbol at index ${i} (score ${ranks.symbols[i].score})`,
      );
    }
  });

  // --- Coverage of known exports ---

  it('captures at least 95% of known exports from the fixture', () => {
    // All expected symbols from README
    const expectedSymbols = [
      // src/types.ts
      'User', 'Task', 'TaskFilter', 'TaskStatus',
      // src/config.ts
      'APP_NAME', 'MAX_RETRIES', 'DEFAULT_PAGE_SIZE', 'DB_PATH',
      // src/db.ts
      'Database',
      // src/utils.ts
      'format', 'toUpperCase', 'parse', 'stringify', 'clamp',
      // src/services/task-service.ts
      'createTask', 'listTasks',
      // src/services/user-service.ts
      'getUser', 'getAssigneeName', 'getUserTasks',
      // src/services/index.ts — barrel re-exports (symbols are re-exported, may or may not appear as exports)
      // src/helpers/format.ts
      'formatDate', 'formatCurrency', 'formatPercent',
      // src/helpers/validate.ts
      'isArray', 'isNonEmpty', 'validateUser', 'validateTask',
      // src/index.ts
      'main',
    ];

    const foundNames = new Set(ranks.symbols.map(s => s.name));
    const captured = expectedSymbols.filter(s => foundNames.has(s));
    const coverage = captured.length / expectedSymbols.length;

    assert.ok(
      coverage >= 0.95,
      `should capture >= 95% of known exports, got ${(coverage * 100).toFixed(1)}% (${captured.length}/${expectedSymbols.length}). Missing: ${expectedSymbols.filter(s => !foundNames.has(s)).join(', ')}`,
    );
  });

  // --- Circular imports ---

  it('circular imports between task-service and user-service exist as edges in both directions', () => {
    const taskToUser = graph.edges.find(
      e => e.from.includes('task-service') && e.to.includes('user-service'),
    );
    const userToTask = graph.edges.find(
      e => e.from.includes('user-service') && e.to.includes('task-service'),
    );

    assert.ok(taskToUser, 'should have edge from task-service to user-service');
    assert.ok(userToTask, 'should have edge from user-service to task-service');
  });

  // --- Expected edges ---

  it('has the expected number of edges (13)', () => {
    assert.equal(
      graph.edges.length,
      13,
      `should have 13 edges, got ${graph.edges.length}. Edges:\n${graph.edges.map(e => `  ${e.from} -> ${e.to} (${e.type})`).join('\n')}`,
    );
  });

  it('has 10 file nodes', () => {
    assert.equal(graph.nodes.length, 10, `should have 10 nodes, got ${graph.nodes.length}`);
  });

  // --- Symlink exclusion ---

  it('excludes symlinks pointing outside the project', () => {
    // Create a temp file outside the fixture
    const tempOutsideDir = mkdtempSync(join(tmpdir(), 'repomap-symlink-test-'));
    const outsideFile = join(tempOutsideDir, 'external.ts');
    writeFileSync(outsideFile, 'export const sneaky = 42;');

    const symlinkPath = join(FIXTURE_ROOT, 'src', 'external-link.ts');

    try {
      // Create symlink inside fixture pointing to external file
      symlinkSync(outsideFile, symlinkPath);

      // Run pipeline again
      execFileSync('node', [SCRIPT_PATH, '--root', FIXTURE_ROOT], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const graphWithSymlink = JSON.parse(
        readFileSync(join(HYGIENE_DIR, 'dependency-graph.json'), 'utf-8'),
      );

      // Verify no node or edge references the symlinked file
      const hasSymlinkNode = graphWithSymlink.nodes.some(n => n.path.includes('external-link'));
      const hasSymlinkEdge = graphWithSymlink.edges.some(
        e => e.from.includes('external-link') || e.to.includes('external-link'),
      );

      assert.ok(!hasSymlinkNode, 'symlinked file should not appear as a node');
      assert.ok(!hasSymlinkEdge, 'symlinked file should not appear in any edge');
    } finally {
      // Clean up symlink and temp dir
      rmSync(symlinkPath, { force: true });
      rmSync(tempOutsideDir, { recursive: true, force: true });
    }
  });
});
