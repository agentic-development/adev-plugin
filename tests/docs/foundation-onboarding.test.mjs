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
