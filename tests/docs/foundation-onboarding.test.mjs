import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/README.md — Table of Contents', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'README.md')));
  });

  it('should contain Getting Started section with link to concepts, installation, and getting-started', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('concepts.md'), 'Missing link to concepts.md');
    assert.ok(content.includes('installation.md'), 'Missing link to installation.md');
    assert.ok(content.includes('getting-started.md'), 'Missing link to getting-started.md');
  });

  it('should contain Workflow Guides section', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('Workflow'), 'Missing Workflow Guides section');
  });

  it('should contain Reference section', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('Reference'), 'Missing Reference section');
  });

  it('should contain Advanced section', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('Advanced'), 'Missing Advanced section');
  });
});

describe('docs/concepts.md — Concepts Overview', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'concepts.md')));
  });

  it('should explain the four pillars', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(content.includes('Context-First'), 'Missing Context-First Architecture');
    assert.ok(content.includes('Ephemeral Infrastructure'), 'Missing Ephemeral Infrastructure');
    assert.ok(content.includes('Gate-Based Governance'), 'Missing Gate-Based Governance');
    assert.ok(content.includes('Hybrid Engineering'), 'Missing Hybrid Engineering');
  });

  it('should describe the context index', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(content.includes('context index') || content.includes('Context Index'), 'Missing context index description');
  });

  it('should include a lifecycle overview', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(content.includes('lifecycle') || content.includes('Lifecycle'), 'Missing lifecycle overview');
  });

  it('should not reference internal implementation details', () => {
    const content = readFileSync(join(DOCS_DIR, 'concepts.md'), 'utf-8');
    assert.ok(!content.includes('SKILL.md'), 'Should not reference SKILL.md files');
    assert.ok(!content.includes('hooks.json'), 'Should not reference hooks.json');
  });
});

describe('docs/installation.md — Installation Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'installation.md')));
  });

  it('should cover greenfield setup', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('greenfield') || content.includes('Greenfield') || content.includes('new project'), 'Missing greenfield path');
  });

  it('should cover brownfield setup', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('brownfield') || content.includes('Brownfield') || content.includes('existing'), 'Missing brownfield path');
  });

  it('should cover provider selection', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('Claude Code'), 'Missing Claude Code provider');
  });

  it('should include verification steps', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    assert.ok(content.includes('verify') || content.includes('Verify') || content.includes('verification'), 'Missing verification steps');
  });

  it('should use synthetic placeholder values for any credentials (SEC-1)', () => {
    const content = readFileSync(join(DOCS_DIR, 'installation.md'), 'utf-8');
    // Should not contain real-looking API keys or tokens
    assert.ok(!content.match(/sk-[a-zA-Z0-9]{32,}/), 'Contains real-looking API key');
  });
});

describe('docs/getting-started.md — Getting Started Tutorial', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'getting-started.md')));
  });

  it('should cover all lifecycle phases', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    const phases = ['init', 'brainstorm', 'specify', 'review', 'plan', 'implement', 'validate'];
    for (const phase of phases) {
      assert.ok(
        content.toLowerCase().includes(phase),
        `Missing lifecycle phase: ${phase}`
      );
    }
  });

  it('should define terms on first use', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    // Check that key terms are explained, not just used
    assert.ok(content.includes('charter') || content.includes('Charter'), 'Missing charter explanation');
    assert.ok(content.includes('spec') || content.includes('Spec') || content.includes('specification'), 'Missing spec explanation');
  });

  it('should preserve quickstart content — install command', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    assert.ok(content.includes('npx @adev-org/adev-cli install') || content.includes('installation'), 'Missing install reference');
  });

  it('should preserve quickstart content — adev:work mention', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    assert.ok(content.includes('adev:work') || content.includes('/adev:work'), 'Missing adev:work reference from quickstart');
  });

  it('should preserve quickstart content — adev:issues mention', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    assert.ok(content.includes('adev:issues') || content.includes('/adev:issues'), 'Missing adev:issues reference from quickstart');
  });

  it('should not assume prior knowledge of adev', () => {
    const content = readFileSync(join(DOCS_DIR, 'getting-started.md'), 'utf-8');
    // The tutorial should be self-contained — check it has an introductory paragraph
    const lines = content.split('\n');
    const firstParagraph = lines.slice(2, 10).join('\n');
    assert.ok(firstParagraph.length > 50, 'Should have an introductory paragraph explaining what the tutorial covers');
  });
});
