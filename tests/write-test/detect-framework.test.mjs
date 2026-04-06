import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { detectFramework } from '../../skills/write-test/detect-framework.mjs';

test('detects vitest from package.json devDependencies', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'vitest');
  assert.equal(result.command, 'npx vitest run');
  assert.ok(result.filePattern);
});

test('detects jest from package.json devDependencies', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ devDependencies: { jest: '^29.0.0' } }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'jest');
  assert.equal(result.command, 'npx jest');
});

test('detects node:test as default for Node.js >= 18 project (no framework dep)', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ dependencies: {} }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'node:test');
  assert.equal(result.command, 'node --test');
});

test('prefers vitest over jest when both present', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({
    devDependencies: { vitest: '^1.0.0', jest: '^29.0.0' }
  }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'vitest');
});

test('falls back to file scan when package.json has no match — infers jest from .test.js import', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({}));
  await writeFixture(dir, 'tests/foo.test.js', "import { describe, it, expect } from '@jest/globals';");
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'jest');
});

test('returns null when no framework is detectable', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({}));
  const result = await detectFramework(dir);
  assert.equal(result, null);
});

test('skips malformed package.json and falls back to file scan', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', 'not valid json {{{{');
  const result = await detectFramework(dir);
  assert.equal(result, null);
});

test('file scan reads at most 4096 bytes per file', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({}));
  // Large file — framework keyword is beyond 4096 bytes
  const padding = 'x'.repeat(4200);
  await writeFixture(dir, 'tests/foo.test.js', padding + "\nimport { describe } from 'jest';");
  const result = await detectFramework(dir);
  // Should not detect jest because relevant content is past 4096 bytes
  assert.equal(result, null);
});

test('detects mocha from package.json devDependencies', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ devDependencies: { mocha: '^10.0.0' } }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'mocha');
  assert.equal(result.command, 'npx mocha');
});

test('detects jasmine from package.json devDependencies', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({ devDependencies: { jasmine: '^5.0.0' } }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'jasmine');
  assert.equal(result.command, 'npx jasmine');
});

test('detects pytest from pyproject.toml marker file', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'pyproject.toml', '[tool.pytest.ini_options]');
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'pytest');
  assert.equal(result.command, 'pytest');
});

test('detects go test from go.mod marker file', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'go.mod', 'module example.com/myapp\n\ngo 1.21');
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'go test');
  assert.equal(result.command, 'go test ./...');
});

test('detects cargo test from Cargo.toml marker file', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'Cargo.toml', '[package]\nname = "my-crate"');
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'cargo test');
  assert.equal(result.command, 'cargo test');
});

test('prefers jest over mocha when both present', async (t) => {
  const dir = await createTempDir();
  t.after(() => cleanupTempDir(dir));
  await writeFixture(dir, 'package.json', JSON.stringify({
    devDependencies: { jest: '^29.0.0', mocha: '^10.0.0' }
  }));
  const result = await detectFramework(dir);
  assert.equal(result.framework, 'jest');
});
