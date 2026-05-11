/**
 * Tests for lib/extensions/register.mjs — provider detection, skill registration, hook registration.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import { detectProviders, registerSkill, registerHook } from '../../../lib/extensions/register.mjs';

describe('extensions/register — provider detection', () => {
  let projectRoot;
  beforeEach(() => { projectRoot = createTempDir(); });
  afterEach(() => { cleanupTempDir(projectRoot); });

  it('detects .claude/ directory as claude-code provider', () => {
    mkdirSync(join(projectRoot, '.claude'));
    const providers = detectProviders(projectRoot);
    assert.ok(providers.some(p => p.name === 'claude-code'));
  });

  it('detects .codex/ directory as codex provider', () => {
    mkdirSync(join(projectRoot, '.codex'));
    const providers = detectProviders(projectRoot);
    assert.ok(providers.some(p => p.name === 'codex'));
  });

  it('detects .opencode/ directory as opencode provider', () => {
    mkdirSync(join(projectRoot, '.opencode'));
    const providers = detectProviders(projectRoot);
    assert.ok(providers.some(p => p.name === 'opencode'));
  });

  it('detects multiple providers', () => {
    mkdirSync(join(projectRoot, '.claude'));
    mkdirSync(join(projectRoot, '.codex'));
    const providers = detectProviders(projectRoot);
    assert.equal(providers.length, 2);
  });

  it('returns empty array when no providers found', () => {
    const providers = detectProviders(projectRoot);
    assert.equal(providers.length, 0);
  });

  it('includes hooksJsonPath for each detected provider', () => {
    mkdirSync(join(projectRoot, '.claude'));
    const providers = detectProviders(projectRoot);
    const claude = providers.find(p => p.name === 'claude-code');
    assert.ok(claude.hooksJsonPath.endsWith('.claude/hooks.json'));
  });
});

describe('extensions/register — skill registration', () => {
  let projectRoot;
  let pluginRoot;
  let extDir;

  beforeEach(() => {
    projectRoot = createTempDir();
    pluginRoot = createTempDir();
    extDir = createTempDir();
    // Create skills/ dir in pluginRoot
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(pluginRoot);
    cleanupTempDir(extDir);
  });

  it('copies SKILL.md and registers in hooks.json', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'SKILL.md'), '# My Skill');
    const result = registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'my-skill', description: 'A skill'
    });
    // Verify skill file copied
    const skillPath = join(pluginRoot, 'skills', 'my-ext-my-skill', 'SKILL.md');
    assert.ok(existsSync(skillPath));
    assert.equal(readFileSync(skillPath, 'utf8'), '# My Skill');
    // Verify hooks.json updated
    const hooksJson = JSON.parse(readFileSync(join(projectRoot, '.claude/hooks.json'), 'utf8'));
    assert.ok(hooksJson.skills.some(s => s.name === 'my-skill'));
  });

  it('auto-creates hooks.json when missing', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'Test'
    });
    assert.ok(existsSync(join(projectRoot, '.claude/hooks.json')));
  });

  it('updates existing entry on re-install (idempotent)', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'v1'
    });
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'v2'
    });
    const hooksJson = JSON.parse(readFileSync(join(projectRoot, '.claude/hooks.json'), 'utf8'));
    assert.equal(hooksJson.skills.filter(s => s.name === 'test').length, 1);
    assert.equal(hooksJson.skills.find(s => s.name === 'test').description, 'v2');
  });

  it('emits WARN_NO_PROVIDER when no provider dirs exist', () => {
    // projectRoot has no .claude/, .codex/, or .opencode/
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    const result = registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'test', description: 'Test'
    });
    assert.ok(result.warnings.some(w => w.code === 'WARN_NO_PROVIDER'));
  });

  it('registers in all detected providers', () => {
    mkdirSync(join(projectRoot, '.claude'));
    mkdirSync(join(projectRoot, '.codex'));
    writeFileSync(join(extDir, 'SKILL.md'), '# Skill');
    registerSkill(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', skillName: 'multi', description: 'Multi'
    });
    const claudeHooks = JSON.parse(readFileSync(join(projectRoot, '.claude/hooks.json'), 'utf8'));
    const codexHooks = JSON.parse(readFileSync(join(projectRoot, '.codex/hooks.json'), 'utf8'));
    assert.ok(claudeHooks.skills.some(s => s.name === 'multi'));
    assert.ok(codexHooks.skills.some(s => s.name === 'multi'));
  });
});

describe('extensions/register — hook registration', () => {
  let projectRoot;
  let pluginRoot;
  let extDir;

  beforeEach(() => {
    projectRoot = createTempDir();
    pluginRoot = createTempDir();
    extDir = createTempDir();
    mkdirSync(join(pluginRoot, 'hooks'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(projectRoot);
    cleanupTempDir(pluginRoot);
    cleanupTempDir(extDir);
  });

  it('copies hook script and registers in hooks.json', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'hook.sh'), '#!/bin/bash\necho hello');
    const result = registerHook(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', event: 'PreToolUse', command: 'hook.sh'
    });
    // Verify hook file copied
    const hookPath = join(pluginRoot, 'hooks', 'my-ext-PreToolUse.sh');
    assert.ok(existsSync(hookPath));
    // Verify hooks.json updated
    const hooksJson = JSON.parse(readFileSync(join(projectRoot, '.claude/hooks.json'), 'utf8'));
    assert.ok(hooksJson.hooks);
    assert.ok(Object.keys(hooksJson.hooks).length > 0 || Array.isArray(hooksJson.hooks));
  });

  it('rejects path traversal in hook event name', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'hook.sh'), '#!/bin/bash\necho hello');
    assert.throws(
      () => registerHook(projectRoot, pluginRoot, extDir, {
        extensionName: 'evil', event: '../../escape', command: 'hook.sh'
      }),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('rejects path traversal in hook command source', () => {
    mkdirSync(join(projectRoot, '.claude'));
    assert.throws(
      () => registerHook(projectRoot, pluginRoot, extDir, {
        extensionName: 'evil', event: 'PreToolUse', command: '../../etc/passwd'
      }),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('auto-creates hooks.json when missing for hooks', () => {
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(extDir, 'hook.sh'), '#!/bin/bash\necho hello');
    registerHook(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', event: 'PostToolUse', command: 'hook.sh'
    });
    assert.ok(existsSync(join(projectRoot, '.claude/hooks.json')));
  });

  it('emits WARN_NO_PROVIDER when no provider dirs exist', () => {
    writeFileSync(join(extDir, 'hook.sh'), '#!/bin/bash\necho hello');
    const result = registerHook(projectRoot, pluginRoot, extDir, {
      extensionName: 'my-ext', event: 'PreToolUse', command: 'hook.sh'
    });
    assert.ok(result.warnings.some(w => w.code === 'WARN_NO_PROVIDER'));
  });
});
