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
    it('exits 1 when web-tree-sitter is not available', () => {
      // web-tree-sitter is not installed in this project, so the script should exit 1
      try {
        execFileSync('node', [SCRIPT_PATH], { stdio: 'pipe' });
        // If we reach here, it exited 0 — that's only ok if web-tree-sitter happens to be installed
        // In this project it should NOT be installed, so fail:
        assert.fail('Expected exit code 1 but got 0');
      } catch (err) {
        assert.equal(err.status, 1, 'should exit with code 1 when web-tree-sitter is missing');
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

    it('returns false when web-tree-sitter is not installed', async () => {
      const { isTreeSitterAvailable } = await import(
        join(PLUGIN_ROOT, 'lib', 'repomap', 'check-deps.mjs')
      );
      // web-tree-sitter is not in this project's dependencies
      const result = isTreeSitterAvailable();
      assert.equal(result, false);
    });
  });
});
