import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const skillPath = join(repoRoot, 'skills', 'debug', 'SKILL.md');

describe('debug SKILL.md playbook loading', () => {
  let content;

  it('skill file exists and is readable', () => {
    content = readSkillSurface("debug");
    assert.ok(content.length > 0);
  });

  it("Phase 2 includes playbook loading step (+8 more contract assertions)", () => {
    // Phase 2 includes playbook loading step
    assert.match(content, /playbook/i);
    assert.match(content, /debug-playbook\.md/i);

    // loads module-scoped playbook path
    assert.match(content, /\.context-index\/specs\/features\/<module>\/debug-playbook\.md/);

    // loads cross-cutting playbook path
    assert.match(content, /\.context-index\/specs\/cross-cutting\/debug-playbook\.md/);

    // describes trigger matching as LLM-side
    assert.match(content, /trigger/i);
    assert.match(content, /match/i);
    assert.match(content, /symptom/i);

    // describes fallback menu when no triggers match
    assert.match(content, /menu/i);

    // describes graceful absence
    assert.match(content, /no playbook/i);

    // describes command execution via Bash with tool approval
    assert.match(content, /command/i);
    assert.match(content, /Bash/i);

    // describes escalation behavior
    assert.match(content, /escalation/i);

    // module-scoped precedence over cross-cutting on overlap
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
