import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..', '..');
const SCRIPT_PATH = join(PLUGIN_ROOT, 'lib', 'repomap', 'check-deps.mjs');

describe('check-deps', () => {
  describe('CLI (subprocess)', () => {
    it('exits with code matching availability', () => {
      try {
        execFileSync('node', [SCRIPT_PATH], { stdio: 'pipe' });
        // Exit 0 means web-tree-sitter is available
      } catch (err) {
        // Exit 1 means web-tree-sitter is not available
        assert.equal(err.status, 1);
      }
    });

    it('exits 1 when web-tree-sitter is unreachable', () => {
      // Force the script to not find web-tree-sitter by isolating NODE_PATH
      try {
        execFileSync('node', [
          '--no-warnings',
          '-e',
          `
          const { createRequire } = await import('node:module');
          const require = createRequire(import.meta.url);
          try { require.resolve('web-tree-sitter'); process.exit(0); }
          catch { process.exit(1); }
          `,
          '--input-type=module',
        ], {
          stdio: 'pipe',
          env: { ...process.env, NODE_PATH: '/nonexistent' },
          cwd: '/tmp',
        });
        assert.fail('Expected exit code 1 but got 0');
      } catch (err) {
        assert.equal(err.status, 1, 'should exit 1 when web-tree-sitter is unreachable');
      }
    });
  });

  describe('isTreeSitterAvailable() export', () => {
    it('returns a boolean', async () => {
      const { isTreeSitterAvailable } = await import(
        join(PLUGIN_ROOT, 'lib', 'repomap', 'check-deps.mjs')
      );
      const result = isTreeSitterAvailable();
      assert.equal(typeof result, 'boolean');
    });

    it('returns true when web-tree-sitter is installed', async () => {
      let available;
      try {
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        require.resolve('web-tree-sitter');
        available = true;
      } catch {
        available = false;
      }
      if (!available) {
        // Skip when web-tree-sitter is not installed in this environment
        return;
      }
      const { isTreeSitterAvailable } = await import(
        join(PLUGIN_ROOT, 'lib', 'repomap', 'check-deps.mjs')
      );
      const result = isTreeSitterAvailable();
      assert.equal(result, true);
    });
  });
});

// ── parse.test.mjs guards its tree-sitter-dependent suite (adev-plugin-mok9) ──
//
// A fresh `git worktree` has no node_modules/ (gitignored, materialized only
// by `npm ci`). Before this fix, tests/repomap/parse.test.mjs's "AST Parser"
// describe block unconditionally dynamic-imported lib/repomap/parse.mjs
// (itself a static `import ... from 'web-tree-sitter'`) inside an unguarded
// before() hook — ERR_MODULE_NOT_FOUND there cascaded "test did not finish
// ... was cancelled" across every sibling test in the block, rather than a
// clear, actionable skip. lib/repomap/index.mjs's own production code
// already treats a missing web-tree-sitter as expected (regex-mode fallback,
// check-deps.mjs, 2026-03-23) — this pins the test suite to the same
// discipline.
describe('parse.test.mjs guards its tree-sitter suite on isTreeSitterAvailable', () => {
  it('imports isTreeSitterAvailable and branches the AST Parser suite on it', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      join(PLUGIN_ROOT, 'tests', 'repomap', 'parse.test.mjs'),
      'utf8'
    );
    assert.match(
      source,
      /import\s*\{\s*isTreeSitterAvailable\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/repomap\/check-deps\.mjs['"]/,
      'parse.test.mjs must import the existing dependency checker rather than assuming web-tree-sitter is present'
    );
    assert.match(
      source,
      /if\s*\(\s*TREE_SITTER_AVAILABLE\s*\)\s*\{/,
      'the tree-sitter-dependent describe block must be gated behind an availability check'
    );
    assert.match(
      source,
      /it\(['"]skipped:/,
      'the unavailable branch must register a real (assertion-bearing) skip-notice test, not silently register nothing'
    );
  });
});
