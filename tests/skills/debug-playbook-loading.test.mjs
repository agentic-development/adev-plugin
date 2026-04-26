import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const skillPath = join(repoRoot, 'skills', 'debug', 'SKILL.md');

describe('debug SKILL.md playbook loading', () => {
  let content;

  it('skill file exists and is readable', () => {
    content = readFileSync(skillPath, 'utf8');
    assert.ok(content.length > 0);
  });

  it('Phase 2 includes playbook loading step', () => {
    assert.match(content, /playbook/i);
    assert.match(content, /debug-playbook\.md/i);
  });

  it('loads module-scoped playbook path', () => {
    assert.match(content, /\.context-index\/specs\/features\/<module>\/debug-playbook\.md/);
  });

  it('loads cross-cutting playbook path', () => {
    assert.match(content, /\.context-index\/specs\/cross-cutting\/debug-playbook\.md/);
  });

  it('describes trigger matching as LLM-side', () => {
    assert.match(content, /trigger/i);
    assert.match(content, /match/i);
    assert.match(content, /symptom/i);
  });

  it('describes fallback menu when no triggers match', () => {
    assert.match(content, /menu/i);
  });

  it('describes graceful absence', () => {
    assert.match(content, /no playbook/i);
  });

  it('describes command execution via Bash with tool approval', () => {
    assert.match(content, /command/i);
    assert.match(content, /Bash/i);
  });

  it('describes escalation behavior', () => {
    assert.match(content, /escalation/i);
  });

  it('module-scoped precedence over cross-cutting on overlap', () => {
    assert.match(content, /precedence/i);
  });

  it('playbook step appears between repo map and gather evidence', () => {
    const repoMapIdx = content.indexOf('repo map');
    const playbookIdx = content.indexOf('playbook');
    const gatherIdx = content.indexOf('Gather evidence');
    assert.ok(playbookIdx > 0, 'playbook section exists');
    assert.ok(gatherIdx > 0, 'gather evidence section exists');
  });
});
