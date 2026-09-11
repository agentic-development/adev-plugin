import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { resolveImplementationModeFromProjectRoot } from '../../lib/implementation-modes/resolve.mjs';

test('write-then-read round trip: /adev:init writes test-required, resolve reads it back', async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, '.context-index/manifest.yaml', 'project:\n  name: "fixture"\n');

  const { run } = await import('../../lib/cli/init-prompt-implementation-mode.mjs');
  await run({ projectRoot: dir, argv: [], manifest: null, __scriptedInput: ['test-required'] });

  const result = resolveImplementationModeFromProjectRoot(dir, undefined);
  assert.equal(result.mode, 'test-required');
  assert.equal(result.source, 'manifest');
});

test('write-then-read round trip: agent-default is written despite the bypass warning', async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, '.context-index/manifest.yaml', 'project:\n  name: "fixture"\n');

  const { run } = await import('../../lib/cli/init-prompt-implementation-mode.mjs');
  await run({ projectRoot: dir, argv: [], manifest: null, __scriptedInput: ['agent-default'] });

  const result = resolveImplementationModeFromProjectRoot(dir, undefined);
  assert.equal(result.mode, 'agent-default');
  assert.equal(result.source, 'manifest');
});

test('write-then-read round trip: prompt overwrites an existing implementation_mode value', async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(
    dir,
    '.context-index/manifest.yaml',
    'project:\n  name: "fixture"\nimplementation_mode: tdd\n'
  );

  const { run } = await import('../../lib/cli/init-prompt-implementation-mode.mjs');
  await run({ projectRoot: dir, argv: [], manifest: null, __scriptedInput: ['test-required'] });

  const result = resolveImplementationModeFromProjectRoot(dir, undefined);
  assert.equal(result.mode, 'test-required');
  assert.equal(result.source, 'manifest');
});
