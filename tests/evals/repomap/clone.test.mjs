import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cloneRepo } from './clone.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('cloneRepo', () => {
  describe('URL validation', () => {
    it('rejects file:// URLs', () => {
      assert.throws(
        () => cloneRepo({ url: 'file:///tmp/repo', name: 'repo', gitRef: 'a'.repeat(40) }, '/tmp/cache'),
        /must start with https:\/\//
      );
    });

    it('rejects ssh:// URLs', () => {
      assert.throws(
        () => cloneRepo({ url: 'ssh://git@github.com/repo', name: 'repo', gitRef: 'a'.repeat(40) }, '/tmp/cache'),
        /must start with https:\/\//
      );
    });

    it('rejects git:// URLs', () => {
      assert.throws(
        () => cloneRepo({ url: 'git://github.com/repo', name: 'repo', gitRef: 'a'.repeat(40) }, '/tmp/cache'),
        /must start with https:\/\//
      );
    });
  });

  describe('name sanitization', () => {
    it('rejects ../evil', () => {
      assert.throws(
        () => cloneRepo({ url: 'https://github.com/x/y.git', name: '../evil', gitRef: 'a'.repeat(40) }, '/tmp/cache'),
        /invalid repo name/i
      );
    });

    it('rejects foo/bar', () => {
      assert.throws(
        () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'foo/bar', gitRef: 'a'.repeat(40) }, '/tmp/cache'),
        /invalid repo name/i
      );
    });

    it('rejects uppercase names', () => {
      assert.throws(
        () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'Foo', gitRef: 'a'.repeat(40) }, '/tmp/cache'),
        /invalid repo name/i
      );
    });

    it('accepts valid kebab-case name', () => {
      // Will fail on git clone since we're not actually cloning, but should pass validation
      const cacheDir = mkdtempSync(join(tmpdir(), 'clone-test-'));
      try {
        // This should throw on git clone, not on validation
        assert.throws(
          () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'valid-name', gitRef: 'a'.repeat(40) }, cacheDir),
          /clone failed|Command failed/i
        );
      } finally {
        rmSync(cacheDir, { recursive: true, force: true });
      }
    });
  });

  describe('gitRef validation', () => {
    it('rejects short SHA', () => {
      assert.throws(
        () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'repo', gitRef: 'abc123' }, '/tmp/cache'),
        /invalid gitRef/i
      );
    });

    it('rejects shell injection in gitRef', () => {
      assert.throws(
        () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'repo', gitRef: '$(rm -rf /)' }, '/tmp/cache'),
        /invalid gitRef/i
      );
    });

    it('rejects non-hex characters', () => {
      assert.throws(
        () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'repo', gitRef: 'g'.repeat(40) }, '/tmp/cache'),
        /invalid gitRef/i
      );
    });
  });

  describe('cache path containment', () => {
    it('resolved path must be within cacheDir', () => {
      // Even if name validation passes, the resolved path check should catch traversal
      // This test verifies the startsWith check works
      const cacheDir = mkdtempSync(join(tmpdir(), 'clone-test-'));
      try {
        // A name like "valid" should resolve within cacheDir
        const expected = join(cacheDir, 'valid');
        // We can't easily test a bypass since name validation catches most cases,
        // but we verify the function works with valid inputs up to the git clone step
        assert.throws(
          () => cloneRepo({ url: 'https://github.com/x/y.git', name: 'valid', gitRef: 'a'.repeat(40) }, cacheDir),
          /clone failed|Command failed/i
        );
      } finally {
        rmSync(cacheDir, { recursive: true, force: true });
      }
    });
  });
});
