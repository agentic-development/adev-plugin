import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
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
