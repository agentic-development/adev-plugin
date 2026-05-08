/**
 * Tests for lib/visual-references.mjs — visual reference capture library.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import {
  validateSourcePath,
  slugifyDescription,
  isSupportedFormat,
  copyVisualReference,
  resolveTargetPath,
} from '../../lib/visual-references.mjs';

// ─── validateSourcePath ───────────────────────────────────────────────────────

describe('validateSourcePath', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  it('rejects non-existent path', () => {
    const result = validateSourcePath('/no/such/file.png', tmpDir);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'IMAGE_NOT_FOUND');
  });

  it('rejects symlinks', () => {
    const realFile = join(tmpDir, 'real.png');
    writeFileSync(realFile, Buffer.alloc(10));
    const linkPath = join(tmpDir, 'link.png');
    symlinkSync(realFile, linkPath);

    const result = validateSourcePath(linkPath, tmpDir);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'IMAGE_SYMLINK');
  });

  it('rejects files over 10 MB', () => {
    const bigFile = join(tmpDir, 'big.png');
    writeFileSync(bigFile, Buffer.alloc(11 * 1024 * 1024)); // 11 MB

    const result = validateSourcePath(bigFile, tmpDir);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'IMAGE_TOO_LARGE');
  });

  it('rejects unsupported formats', () => {
    const tiffFile = join(tmpDir, 'image.tiff');
    writeFileSync(tiffFile, Buffer.alloc(10));

    const result = validateSourcePath(tiffFile, tmpDir);
    assert.equal(result.valid, false);
    assert.equal(result.code, 'UNSUPPORTED_FORMAT');
  });

  it('flags external paths', () => {
    const projectDir = join(tmpDir, 'project');
    mkdirSync(projectDir);
    const extFile = join(tmpDir, 'outside.png');
    writeFileSync(extFile, Buffer.alloc(10));

    const result = validateSourcePath(extFile, projectDir);
    assert.equal(result.external, true);
    assert.equal(result.valid, true);
  });

  it('accepts valid internal file', () => {
    const imgFile = join(tmpDir, 'screenshot.png');
    writeFileSync(imgFile, Buffer.alloc(100));

    const result = validateSourcePath(imgFile, tmpDir);
    assert.equal(result.valid, true);
    assert.equal(result.external, false);
    assert.equal(result.ext, '.png');
  });

  it('rejects directory path', () => {
    const dir = join(tmpDir, 'subdir');
    mkdirSync(dir);

    const result = validateSourcePath(dir, tmpDir);
    assert.equal(result.valid, false);
    // Should fail because it's not a regular file
  });

  it('accepts case-insensitive extensions (.PNG, .Jpg)', () => {
    const imgFile = join(tmpDir, 'screenshot.PNG');
    writeFileSync(imgFile, Buffer.alloc(100));

    const result = validateSourcePath(imgFile, tmpDir);
    assert.equal(result.valid, true);
  });
});

// ─── slugifyDescription ───────────────────────────────────────────────────────

describe('slugifyDescription', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(slugifyDescription('Homepage Hero Layout'), 'homepage-hero-layout');
  });

  it('strips special characters', () => {
    assert.equal(slugifyDescription('my image!!! @#$'), 'my-image');
  });

  it('truncates at 60 chars on word boundary', () => {
    const long = 'this is a very long description that exceeds sixty characters and should be truncated';
    const result = slugifyDescription(long);
    assert.ok(result.length <= 60);
    assert.ok(!result.endsWith('-'));
  });

  it('returns empty string for all-emoji input', () => {
    assert.equal(slugifyDescription('\u{1F389}\u{1F38A}'), '');
  });

  it('handles consecutive special characters', () => {
    assert.equal(slugifyDescription('a---b___c'), 'a-b-c');
  });

  it('handles leading/trailing whitespace', () => {
    assert.equal(slugifyDescription('  hello world  '), 'hello-world');
  });

  it('truncates at word boundary, not mid-word', () => {
    // Build a string where 60th char falls mid-word
    const words = 'abcdefghij '.repeat(7).trim(); // "abcdefghij abcdefghij ..." — 76 chars
    const result = slugifyDescription(words);
    assert.ok(result.length <= 60);
    // Should not cut mid-word
    assert.ok(!result.match(/-$/));
  });
});

// ─── isSupportedFormat ────────────────────────────────────────────────────────

describe('isSupportedFormat', () => {
  it('accepts png, jpg, jpeg, webp', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      assert.equal(isSupportedFormat(ext), true, `expected ${ext} to be supported`);
    }
  });

  it('rejects tiff, bmp, svg, psd', () => {
    for (const ext of ['.tiff', '.bmp', '.svg', '.psd']) {
      assert.equal(isSupportedFormat(ext), false, `expected ${ext} to be unsupported`);
    }
  });

  it('accepts uppercase extensions', () => {
    assert.equal(isSupportedFormat('.PNG'), true);
    assert.equal(isSupportedFormat('.JPG'), true);
  });
});

// ─── copyVisualReference ──────────────────────────────────────────────────────

describe('copyVisualReference', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  it('copies file to references directory with slugified name', () => {
    const sourceContent = Buffer.from('PNG-FAKE-CONTENT');
    const srcFile = join(tmpDir, 'source.png');
    writeFileSync(srcFile, sourceContent);
    mkdirSync(join(tmpDir, '.context-index'), { recursive: true });

    const result = copyVisualReference({
      sourcePath: srcFile,
      module: 'my-module',
      description: 'Hero Layout',
      projectRoot: tmpDir,
    });

    const expectedDir = join(tmpDir, '.context-index', 'references', 'my-module', 'visuals');
    assert.ok(result.destinationPath.startsWith(expectedDir));
    assert.equal(result.slug, 'hero-layout');
    assert.equal(result.source, 'user-upload');

    // Verify file was actually copied
    const copied = readFileSync(result.destinationPath);
    assert.deepEqual(copied, sourceContent);
  });

  it('creates references directory recursively if missing', () => {
    const srcFile = join(tmpDir, 'img.png');
    writeFileSync(srcFile, Buffer.alloc(10));
    // No .context-index directory exists

    const result = copyVisualReference({
      sourcePath: srcFile,
      module: 'test-mod',
      description: 'test image',
      projectRoot: tmpDir,
    });

    assert.ok(existsSync(result.destinationPath));
  });

  it('appends numeric suffix on filename collision', () => {
    const srcFile = join(tmpDir, 'img.png');
    writeFileSync(srcFile, Buffer.alloc(10));

    // Create existing file at the target location
    const targetDir = join(tmpDir, '.context-index', 'references', 'mod', 'visuals');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'test.png'), Buffer.alloc(5));

    const result = copyVisualReference({
      sourcePath: srcFile,
      module: 'mod',
      description: 'test',
      projectRoot: tmpDir,
    });

    assert.ok(result.destinationPath.endsWith('test-2.png'));
  });

  it('increments suffix when multiple collisions exist', () => {
    const srcFile = join(tmpDir, 'img.png');
    writeFileSync(srcFile, Buffer.alloc(10));

    const targetDir = join(tmpDir, '.context-index', 'references', 'mod', 'visuals');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'test.png'), Buffer.alloc(5));
    writeFileSync(join(targetDir, 'test-2.png'), Buffer.alloc(5));

    const result = copyVisualReference({
      sourcePath: srcFile,
      module: 'mod',
      description: 'test',
      projectRoot: tmpDir,
    });

    assert.ok(result.destinationPath.endsWith('test-3.png'));
  });

  it('falls back to reference.<ext> when slug is empty', () => {
    const srcFile = join(tmpDir, 'img.png');
    writeFileSync(srcFile, Buffer.alloc(10));

    const result = copyVisualReference({
      sourcePath: srcFile,
      module: 'mod',
      description: '\u{1F389}',
      projectRoot: tmpDir,
    });

    assert.ok(result.destinationPath.includes('reference.png'));
    assert.equal(result.slug, 'reference');
  });

  it('preserves original file content (no resizing/conversion)', () => {
    const content = Buffer.from('EXACT-BYTES-12345-ABCDE');
    const srcFile = join(tmpDir, 'photo.jpg');
    writeFileSync(srcFile, content);

    const result = copyVisualReference({
      sourcePath: srcFile,
      module: 'mod',
      description: 'photo test',
      projectRoot: tmpDir,
    });

    const copied = readFileSync(result.destinationPath);
    assert.deepEqual(copied, content);
  });
});
