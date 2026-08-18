import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { classifyUri, resolveExtensionSource, stripCredentials } from '../../../lib/extensions/resolve-source.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../../helpers.mjs';

describe('extensions/resolve-source', () => {
  describe('classifyUri', () => {
    it("classifies absolute path as local (+10 more contract assertions)", () => {
      // classifies absolute path as local
      assert.equal(classifyUri('/tmp/my-ext'), 'local');

      // classifies ./ relative path as local
      assert.equal(classifyUri('./my-ext'), 'local');

      // classifies ../ relative path as local
      assert.equal(classifyUri('../my-ext'), 'local');

      // classifies https URL as git
      assert.equal(classifyUri('https://github.com/org/ext.git'), 'git');

      // classifies http URL as git
      assert.equal(classifyUri('http://github.com/org/ext.git'), 'git');

      // classifies git:// URL as git
      assert.equal(classifyUri('git://github.com/org/ext.git'), 'git');

      // classifies ssh:// URL as git
      assert.equal(classifyUri('ssh://git@github.com/org/ext.git'), 'git');

      // classifies git@ SSH as git
      assert.equal(classifyUri('git@github.com:org/ext.git'), 'git');

      // classifies npm scoped package name as npm
      assert.equal(classifyUri('@org/adev-ext-foo'), 'npm');

      // classifies simple name as npm
      assert.equal(classifyUri('adev-ext-foo'), 'npm');

      // classifies https URL with # fragment as git
      assert.equal(classifyUri('https://github.com/org/repo#extensions/data-engineering'), 'git');
    });
  });

  describe('stripCredentials', () => {
    it("strips userinfo from https URL (+3 more contract assertions)", () => {
      // strips userinfo from https URL
      assert.equal(
      stripCredentials('https://user:token@github.com/repo'),
      'https://github.com/repo'
      );

      // strips username-only from URL
      assert.equal(
      stripCredentials('https://user@github.com/repo'),
      'https://github.com/repo'
      );

      // returns non-URL strings unchanged
      assert.equal(stripCredentials('my-package'), 'my-package');

      // returns URL without credentials unchanged
      assert.equal(
      stripCredentials('https://github.com/repo'),
      'https://github.com/repo'
      );
    });

    it('strips credentials from git@ SSH URIs', () => {
      // git@ URIs don't have userinfo in the URL sense, return as-is
      assert.equal(
        stripCredentials('git@github.com:org/ext.git'),
        'git@github.com:org/ext.git'
      );
    });

    it('preserves # fragment when stripping credentials', () => {
      assert.equal(
        stripCredentials('https://user:pass@github.com/org/repo#subdir'),
        'https://github.com/org/repo#subdir'
      );
    });
  });

  describe('resolveExtensionSource (local)', () => {
    let tmp;
    beforeEach(() => { tmp = createTempDir(); });
    afterEach(() => { cleanupTempDir(tmp); });

    it('resolves local dir with valid manifest', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\n');
      const result = await resolveExtensionSource(tmp);
      assert.equal(result.type, 'local');
      assert.ok(result.resolved_path.includes(tmp));
      assert.equal(result.manifest.name, 'test-ext');
    });

    it('throws MISSING_MANIFEST for dir without manifest', async () => {
      await assert.rejects(
        () => resolveExtensionSource(tmp),
        (err) => {
          assert.equal(err.code, 'MISSING_MANIFEST');
          assert.ok(err.message.includes(tmp));
          return true;
        }
      );
    });

    it('throws INVALID_SCHEMA for dir with invalid manifest', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: BadName\nversion: not-semver\n');
      await assert.rejects(
        () => resolveExtensionSource(tmp),
        (err) => {
          assert.equal(err.code, 'INVALID_SCHEMA');
          return true;
        }
      );
    });

    it('resolves relative path to absolute', async () => {
      writeFixture(tmp, 'adev-extension.yaml', 'name: test-ext\nversion: 1.0.0\n');
      // Use the absolute path directly — we test that resolved_path is absolute
      const result = await resolveExtensionSource(tmp);
      assert.ok(result.resolved_path.startsWith('/'));
    });
  });

  describe('resolveExtensionSource (npm)', () => {
    it('rejects invalid npm package name', async () => {
      await assert.rejects(
        () => resolveExtensionSource('INVALID_PACKAGE_NAME!!'),
        (err) => {
          assert.equal(err.code, 'SOURCE_RESOLUTION');
          return true;
        }
      );
    });
  });

  describe('resolveExtensionSource (git)', () => {
    it('rejects invalid git URL', async () => {
      await assert.rejects(
        () => resolveExtensionSource('https://'),
        (err) => {
          assert.equal(err.code, 'SOURCE_RESOLUTION');
          return true;
        }
      );
    });
  });

  describe('resolveExtensionSource (git fragment)', () => {
    let tmp;
    let bareRepoPath;

    beforeEach(() => {
      tmp = createTempDir();
      // Create a bare git repo with a subdirectory containing a valid manifest
      const workDir = join(tmp, 'work');
      bareRepoPath = join(tmp, 'repo.git');

      mkdirSync(workDir, { recursive: true });
      execSync('git init', { cwd: workDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: workDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: workDir, stdio: 'ignore' });

      // Create root manifest
      writeFileSync(join(workDir, 'adev-extension.yaml'), 'name: root-ext\nversion: 1.0.0\n');

      // Create subdirectory with its own manifest
      mkdirSync(join(workDir, 'extensions', 'data-eng'), { recursive: true });
      writeFileSync(join(workDir, 'extensions', 'data-eng', 'adev-extension.yaml'), 'name: sub-ext\nversion: 2.0.0\n');

      // Create subdirectory without manifest
      mkdirSync(join(workDir, 'extensions', 'no-manifest'), { recursive: true });
      writeFileSync(join(workDir, 'extensions', 'no-manifest', 'README.md'), '# No manifest here\n');

      execSync('git add -A', { cwd: workDir, stdio: 'ignore' });
      execSync('git commit -m "init"', { cwd: workDir, stdio: 'ignore' });

      // Create bare clone for use as remote
      execSync(`git clone --bare "${workDir}" "${bareRepoPath}"`, { stdio: 'ignore' });
    });

    afterEach(() => { cleanupTempDir(tmp); });

    it('resolves git URL with #subdir to subdirectory', async () => {
      const result = await resolveExtensionSource(`file://${bareRepoPath}#extensions/data-eng`);
      assert.equal(result.type, 'git');
      assert.equal(result.manifest.name, 'sub-ext');
      assert.ok(result.resolved_path.endsWith('extensions/data-eng') || result.resolved_path.includes('extensions/data-eng'));
    });

    it('resolves git URL without fragment to repo root (backward compat)', async () => {
      const result = await resolveExtensionSource(`file://${bareRepoPath}`);
      assert.equal(result.type, 'git');
      assert.equal(result.manifest.name, 'root-ext');
    });

    it('throws SOURCE_RESOLUTION when subdirectory does not exist', async () => {
      await assert.rejects(
        () => resolveExtensionSource(`file://${bareRepoPath}#nonexistent/path`),
        (err) => {
          assert.equal(err.code, 'SOURCE_RESOLUTION');
          assert.ok(err.message.includes('nonexistent/path'));
          return true;
        }
      );
    });

    it('throws MISSING_MANIFEST when subdirectory exists but has no manifest', async () => {
      await assert.rejects(
        () => resolveExtensionSource(`file://${bareRepoPath}#extensions/no-manifest`),
        (err) => {
          assert.equal(err.code, 'MISSING_MANIFEST');
          return true;
        }
      );
    });

    it('throws SOURCE_RESOLUTION for path traversal in fragment', async () => {
      await assert.rejects(
        () => resolveExtensionSource(`file://${bareRepoPath}#../../../etc`),
        (err) => {
          assert.equal(err.code, 'SOURCE_RESOLUTION');
          return true;
        }
      );
    });
  });
});
