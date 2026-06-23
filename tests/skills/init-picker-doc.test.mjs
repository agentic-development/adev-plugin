/**
 * Verifies that skills/init/SKILL.md documents the init-time domain
 * extension picker using the canonical wording (per Behavior #8 +
 * Integration Point #4 of init-extension-picker.spec.md).
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

describe('skills/init/SKILL.md picker walkthrough', () => {
  const md = readFileSync(join(PLUGIN_ROOT, 'skills', 'init', 'SKILL.md'), 'utf8');

  it('documents the domain extension picker section', () => {
    assert.match(md, /domain extension picker/i);
  });

  it('uses the canonical Domain: <name> banner wording', () => {
    assert.match(md, /Domain: <name>/);
  });

  it('documents the re-run path via adev extension install', () => {
    assert.match(md, /adev extension install/);
  });

  it('mentions each picker option (software, catalog entries, skip)', () => {
    assert.match(md, /software/i);
    assert.match(md, /skip/i);
  });
});
