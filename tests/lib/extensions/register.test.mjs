/**
 * Tests for lib/extensions/register.mjs — provider detection, skill registration, hook registration.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import { detectProviders } from '../../../lib/extensions/register.mjs';

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
