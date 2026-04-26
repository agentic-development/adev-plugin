import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const templatePath = join(repoRoot, 'templates', 'debug-playbook-template.md');

describe('debug-playbook-template', () => {
  let content;

  it('template file exists', () => {
    content = readFileSync(templatePath, 'utf8');
    assert.ok(content.length > 0);
  });

  it('has YAML frontmatter with last-verified field', () => {
    assert.match(content, /^---\n/);
    assert.match(content, /last-verified:/);
  });

  it('has at least one failure mode section with required fields', () => {
    assert.match(content, /## Failure Mode:/i);
    assert.match(content, /id:/i);
    assert.match(content, /triggers:/i);
    assert.match(content, /escalation:/i);
  });

  it('has ordered diagnostic steps', () => {
    assert.match(content, /### Steps/i);
    assert.match(content, /1\./);
  });

  it('diagnostic steps include description field', () => {
    assert.match(content, /description:/i);
  });

  it('has command and expected fields documented', () => {
    assert.match(content, /command:/i);
    assert.match(content, /expected:/i);
  });

  it('failure mode ids are unique slugs (kebab-case)', () => {
    const ids = [...content.matchAll(/id:\s*(\S+)/g)].map(m => m[1]);
    assert.ok(ids.length >= 1, 'at least one failure mode id');
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'all ids are unique');
    for (const id of ids) {
      assert.match(id, /^[a-z0-9-]+$/, `id "${id}" should be kebab-case`);
    }
  });

  it('escalation includes condition and target', () => {
    assert.match(content, /condition:/i);
    assert.match(content, /target:/i);
  });

  it('template has HTML comments explaining sections', () => {
    assert.match(content, /<!--/);
  });
});
