import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
  });
});
