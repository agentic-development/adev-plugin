/**
 * Backward-compatibility test suite for the software domain profile.
 *
 * Verifies that the software profile produces identical behavior to the
 * pre-domain-profiles framework when loaded through the overlay pipeline.
 *
 * @module tests/domains/backward-compat
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { mergeGateConfig } from '../../lib/domains/merge-gate-config.mjs';
import { mergeTestConfig } from '../../lib/domains/merge-test-config.mjs';
import { mergeReviewers } from '../../lib/domains/merge-reviewers.mjs';
import { mergeVerification } from '../../lib/domains/merge-verification.mjs';
import { mergeGates } from '../../lib/domains/merge-gates.mjs';
import { parseYaml } from '../../lib/profiles/yaml.mjs';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');
// Use a non-existent repo root so no custom domain directory interferes
const REPO_ROOT = join(PLUGIN_ROOT, 'tests', 'fixtures', 'empty-repo-root');

describe('backward-compat: software profile through overlay pipeline', () => {
  // ── Gate Config ───────────────────────────────────────────────────

  it('merged gate-config matches pre-domain-profiles file exclusions', () => {
    const overlay = loadDomainConfig('software', 'gate-config', REPO_ROOT, PLUGIN_ROOT);
    const { config } = mergeGateConfig(overlay);

    const expectedExclusions = [
      '.context-index/**',
      '*.test.*',
      '*.spec.*',
      '__tests__/**',
      'README.md',
      'README.*.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'LICENSE*',
      'docs/**',
      'package.json',
      'package-lock.json',
      '*.config.*',
      'tsconfig*',
      '.eslintrc*',
      '.prettierrc*',
      '.gitignore',
      '.gitmodules',
      'node_modules/**',
      '.git/**',
      '.claude-plugin/**',
      '.adev/**',
      'CLAUDE.md',
      'AGENTS.md',
      '.cursorrules',
      'providers/**',
      'templates/**',
    ];

    assert.deepStrictEqual(config.file_exclusions, expectedExclusions);
  });

  it('merged gate-config matches pre-domain-profiles bash passthrough', () => {
    const overlay = loadDomainConfig('software', 'gate-config', REPO_ROOT, PLUGIN_ROOT);
    const { config } = mergeGateConfig(overlay);

    const expectedPassthrough = [
      'git status',
      'git log',
      'git diff',
      'git branch',
      'git show',
      'git blame',
      'ls',
      'cat',
      'head',
      'tail',
      'find',
      'grep',
      'rg',
      'wc',
      'file',
      'which',
      'echo',
      'printf',
      'node --test',
      'npm test',
      'npm run test',
      'npm run lint',
      'npm run typecheck',
      'npx jest',
      'npx vitest',
      'npx tsc --noEmit',
      'pwd',
      'env',
      'whoami',
      'date',
      'uname',
    ];

    assert.deepStrictEqual(config.bash_passthrough, expectedPassthrough);
  });

  // ── Test Config ───────────────────────────────────────────────────

  it('merged test-config matches pre-domain-profiles permitted_tools', () => {
    const overlay = loadDomainConfig('software', 'test-config', REPO_ROOT, PLUGIN_ROOT);
    const { config } = mergeTestConfig(overlay);

    assert.deepStrictEqual(config.permitted_tools, [
      'node:test', 'jest', 'vitest', 'mocha', 'pytest', 'go test', 'cargo test',
    ]);
  });

  it('merged test-config matches pre-domain-profiles max_test_file_size', () => {
    const overlay = loadDomainConfig('software', 'test-config', REPO_ROOT, PLUGIN_ROOT);
    const { config } = mergeTestConfig(overlay);
    assert.equal(config.max_test_file_size, 512000);
  });

  it('merged test-config matches pre-domain-profiles skip_patterns', () => {
    const overlay = loadDomainConfig('software', 'test-config', REPO_ROOT, PLUGIN_ROOT);
    const { config } = mergeTestConfig(overlay);
    assert.equal(config.skip_patterns.length, 7);
    // Verify the patterns match the original SKIP_RE components
    assert.ok(config.skip_patterns.some(p => p.includes('.skip')));
    assert.ok(config.skip_patterns.some(p => p.includes('xit')));
    assert.ok(config.skip_patterns.some(p => p.includes('xdescribe')));
    assert.ok(config.skip_patterns.some(p => p.includes('.todo')));
  });

  // ── Reviewers ─────────────────────────────────────────────────────

  it('merged reviewers match pre-domain-profiles defaults', () => {
    const overlay = loadDomainConfig('software', 'reviewers', REPO_ROOT, PLUGIN_ROOT);
    const { reviewers } = mergeReviewers(overlay, null);

    // Expected defaults from templates/review-specs/defaults.yaml
    const expectedDefaults = parseYaml(
      readFileSync(join(PLUGIN_ROOT, 'templates', 'review-specs', 'defaults.yaml'), 'utf8')
    );

    assert.equal(reviewers.length, 3, 'Should have 3 reviewers');

    for (const expected of expectedDefaults.reviewers) {
      const actual = reviewers.find(r => r.id === expected.id);
      assert.ok(actual, `Reviewer ${expected.id} should exist`);
      assert.equal(actual.name, expected.name, `${expected.id} name`);
      assert.equal(actual.profile, expected.profile, `${expected.id} profile`);
      assert.equal(actual.dispatch, expected.dispatch, `${expected.id} dispatch`);
    }
  });

  // ── Verification ──────────────────────────────────────────────────

  it('merged verification matches pre-domain-profiles visual defaults', () => {
    const overlay = loadDomainConfig('software', 'verification', REPO_ROOT, PLUGIN_ROOT);
    const { config } = mergeVerification(overlay);

    assert.equal(config.type, 'visual');
    assert.equal(config.tool, 'playwright');
    assert.deepStrictEqual(config.trigger_patterns, [
      '*.html', '*.jsx', '*.tsx', '*.vue', '*.svelte',
    ]);
  });

  // ── Gates ─────────────────────────────────────────────────────────

  it('merged gates load without errors', () => {
    const overlay = loadDomainConfig('software', 'gates', REPO_ROOT, PLUGIN_ROOT);
    const { gates, warnings } = mergeGates(overlay, null);
    assert.ok(gates.length > 0, 'Should have at least one gate');
    // No error-level warnings
    const errors = warnings.filter(w => w.code === 'INVALID_GATE');
    assert.equal(errors.length, 0, 'No invalid gate warnings');
  });

  // ── Markdown Overlays ─────────────────────────────────────────────

  it('charter template loads as non-empty string', () => {
    const template = loadDomainConfig('software', 'charter-template', REPO_ROOT, PLUGIN_ROOT);
    assert.equal(typeof template, 'string');
    assert.ok(template.trim().length > 0);
    assert.ok(template.includes('## Business Intent'), 'should contain Business Intent section');
    assert.ok(template.includes('## Domain Model'), 'should contain Domain Model section');
  });

  it('spec template loads as non-empty string', () => {
    const template = loadDomainConfig('software', 'spec-template', REPO_ROOT, PLUGIN_ROOT);
    assert.equal(typeof template, 'string');
    assert.ok(template.trim().length > 0);
    assert.ok(template.includes('## Behavioral Contract'), 'should contain Behavioral Contract section');
    assert.ok(template.includes('## Acceptance Criteria'), 'should contain Acceptance Criteria section');
  });
});
