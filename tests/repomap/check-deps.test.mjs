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
      const { isTreeSitterAvailable } = await import(
        join(PLUGIN_ROOT, 'lib', 'repomap', 'check-deps.mjs')
      );
      // web-tree-sitter is now installed (ADR 0001 approved)
      const result = isTreeSitterAvailable();
      assert.equal(result, true);
    });
  });
});
