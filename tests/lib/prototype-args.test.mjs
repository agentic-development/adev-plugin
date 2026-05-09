import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

describe('prototype-args', () => {
  describe('validateModuleName', () => {
    it('accepts valid kebab-case names', async () => {
      const { validateModuleName } = await import('../../lib/prototype-args.mjs');
      assert.equal(validateModuleName('task-boards'), true);
      assert.equal(validateModuleName('a'), true);
      assert.equal(validateModuleName('my-module-123'), true);
    });

    it('rejects names with invalid characters', async () => {
      const { validateModuleName } = await import('../../lib/prototype-args.mjs');
      assert.equal(validateModuleName('Task-Boards'), false);     // uppercase
      assert.equal(validateModuleName('my.module'), false);       // dots
      assert.equal(validateModuleName('my/module'), false);       // path separator
      assert.equal(validateModuleName('my module'), false);       // spaces
      assert.equal(validateModuleName('-starts-dash'), false);    // starts with dash
      assert.equal(validateModuleName(''), false);                // empty
    });

    it('rejects names exceeding 64 characters', async () => {
      const { validateModuleName } = await import('../../lib/prototype-args.mjs');
      const longName = 'a'.repeat(65);
      assert.equal(validateModuleName(longName), false);
      assert.equal(validateModuleName('a'.repeat(64)), true);
    });
  });

  describe('discoverCharters', () => {
    it('exports discoverCharters function', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      assert.equal(typeof discoverCharters, 'function');
    });

    it('returns empty array when no charters exist', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      const tmpDir = createTempDir();
      const result = discoverCharters(tmpDir);
      assert.deepEqual(result, []);
      cleanupTempDir(tmpDir);
    });

    it('discovers single charter with title', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      const tmpDir = createTempDir();
      writeFixture(tmpDir, '.context-index/specs/features/task-boards/charter.md',
        '# Feature Charter: Task Management Boards\n\nContent here.');
      const result = discoverCharters(tmpDir);
      assert.equal(result.length, 1);
      assert.equal(result[0].module, 'task-boards');
      assert.equal(result[0].title, 'Task Management Boards');
      cleanupTempDir(tmpDir);
    });

    it('discovers multiple charters', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      const tmpDir = createTempDir();
      writeFixture(tmpDir, '.context-index/specs/features/task-boards/charter.md',
        '# Feature Charter: Tasks\n');
      writeFixture(tmpDir, '.context-index/specs/features/notifications/charter.md',
        '# Feature Charter: Notifications\n');
      const result = discoverCharters(tmpDir);
      assert.equal(result.length, 2);
      cleanupTempDir(tmpDir);
    });

    it('skips directories without charter.md', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      const tmpDir = createTempDir();
      writeFixture(tmpDir, '.context-index/specs/features/task-boards/charter.md',
        '# Feature Charter: Tasks\n');
      writeFixture(tmpDir, '.context-index/specs/features/orphan/some-spec.md',
        '# Not a charter\n');
      const result = discoverCharters(tmpDir);
      assert.equal(result.length, 1);
      assert.equal(result[0].module, 'task-boards');
      cleanupTempDir(tmpDir);
    });

    it('falls back to directory name when charter has no heading', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      const tmpDir = createTempDir();
      writeFixture(tmpDir, '.context-index/specs/features/my-module/charter.md',
        'No heading here, just content.');
      const result = discoverCharters(tmpDir);
      assert.equal(result.length, 1);
      assert.equal(result[0].module, 'my-module');
      assert.equal(result[0].title, 'my-module');
      cleanupTempDir(tmpDir);
    });
  });
});
