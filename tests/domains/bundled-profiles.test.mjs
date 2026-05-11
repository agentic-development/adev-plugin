/**
 * Bundled domain profiles content validation tests.
 *
 * Verifies that the bundled software domain profile contains the correct
 * overlay files with expected structure and content per the
 * bundled-domain-profiles spec.
 *
 * Note: data-engineering and process-automation were extracted to extension
 * packages in extensions/ and are no longer bundled.
 *
 * @module tests/domains/bundled-profiles
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '../../lib/profiles/yaml.mjs';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');
const DOMAINS_DIR = join(PLUGIN_ROOT, 'templates', 'domains');
const SW_DIR = join(DOMAINS_DIR, 'software');

const EXPECTED_FILES = [
  'charter-template.md',
  'spec-template.md',
  'reviewers.yaml',
  'gates.yaml',
  'verification.yaml',
  'gate-config.yaml',
  'test-config.yaml',
];

// ── Software Profile ──────────────────────────────────────────────────

describe('software profile', () => {
  it('contains exactly 7 overlay files', () => {
    const files = readdirSync(SW_DIR).sort();
    assert.deepStrictEqual(files, EXPECTED_FILES.slice().sort());
    assert.equal(files.length, 7);
  });

  it('YAML files are parseable', () => {
    const yamlFiles = EXPECTED_FILES.filter(f => f.endsWith('.yaml'));
    for (const f of yamlFiles) {
      const content = readFileSync(join(SW_DIR, f), 'utf8');
      const parsed = parseYaml(content);
      assert.ok(parsed !== null && typeof parsed === 'object', `${f} should parse to an object`);
    }
  });

  it('reviewers.yaml has 3 reviewers with correct IDs', () => {
    const content = readFileSync(join(SW_DIR, 'reviewers.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.reviewers), 'reviewers should be an array');
    assert.equal(parsed.reviewers.length, 3);
    const ids = parsed.reviewers.map(r => r.id);
    assert.ok(ids.includes('structural-architect'));
    assert.ok(ids.includes('security-reviewer'));
    assert.ok(ids.includes('consistency-analyzer'));
  });

  it('reviewers.yaml has merge_strategy: append and blocker_threshold: 1', () => {
    const content = readFileSync(join(SW_DIR, 'reviewers.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.equal(parsed.merge_strategy, 'append');
    assert.equal(parsed.blocker_threshold, 1);
  });

  it('gate-config.yaml has 27 file_exclusions and 31 bash_passthrough', () => {
    const content = readFileSync(join(SW_DIR, 'gate-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.file_exclusions), 'file_exclusions should be an array');
    assert.equal(parsed.file_exclusions.length, 27, `Expected 27 file_exclusions, got ${parsed.file_exclusions.length}`);
    assert.ok(Array.isArray(parsed.bash_passthrough), 'bash_passthrough should be an array');
    assert.equal(parsed.bash_passthrough.length, 31, `Expected 31 bash_passthrough, got ${parsed.bash_passthrough.length}`);
  });

  it('test-config.yaml has correct permitted_tools', () => {
    const content = readFileSync(join(SW_DIR, 'test-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    const expected = ['node:test', 'jest', 'vitest', 'mocha', 'pytest', 'go test', 'cargo test'];
    assert.deepStrictEqual(parsed.permitted_tools, expected);
  });

  it('test-config.yaml has max_test_file_size: 512000', () => {
    const content = readFileSync(join(SW_DIR, 'test-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.equal(parsed.max_test_file_size, 512000);
  });

  it('test-config.yaml has 7 skip_patterns', () => {
    const content = readFileSync(join(SW_DIR, 'test-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.skip_patterns), 'skip_patterns should be an array');
    assert.equal(parsed.skip_patterns.length, 7, `Expected 7 skip_patterns, got ${parsed.skip_patterns.length}`);
  });

  it('verification.yaml has type: visual, tool: playwright', () => {
    const content = readFileSync(join(SW_DIR, 'verification.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.equal(parsed.type, 'visual');
    assert.equal(parsed.tool, 'playwright');
  });

  it('charter-template.md is non-empty markdown', () => {
    const content = readFileSync(join(SW_DIR, 'charter-template.md'), 'utf8');
    assert.ok(content.trim().length > 0, 'charter-template.md should not be empty');
    assert.ok(content.includes('##'), 'charter-template.md should contain H2 headings');
  });

  it('spec-template.md is non-empty markdown', () => {
    const content = readFileSync(join(SW_DIR, 'spec-template.md'), 'utf8');
    assert.ok(content.trim().length > 0, 'spec-template.md should not be empty');
    assert.ok(content.includes('##'), 'spec-template.md should contain H2 headings');
  });
});

// ── Cross-Profile Validation ──────────────────────────────────────────

describe('cross-profile validation', () => {
  it('only software profile remains bundled', () => {
    const entries = readdirSync(DOMAINS_DIR);
    assert.deepStrictEqual(entries.sort(), ['software'], 'only software should be bundled');
  });

  it('software profile contains exactly 7 files', () => {
    const files = readdirSync(SW_DIR).sort();
    assert.equal(files.length, 7, 'software should have 7 files');
    assert.deepStrictEqual(files, EXPECTED_FILES.slice().sort(), 'software files should match expected');
  });

  it('all software YAML overlays parse without errors', () => {
    const yamlFiles = EXPECTED_FILES.filter(f => f.endsWith('.yaml'));
    for (const f of yamlFiles) {
      const content = readFileSync(join(SW_DIR, f), 'utf8');
      const parsed = parseYaml(content);
      assert.ok(parsed !== null && typeof parsed === 'object', `software/${f} should parse`);
    }
  });

  it('software markdown templates are non-empty strings', () => {
    const mdFiles = EXPECTED_FILES.filter(f => f.endsWith('.md'));
    for (const f of mdFiles) {
      const content = readFileSync(join(SW_DIR, f), 'utf8');
      assert.ok(content.trim().length > 0, `software/${f} should not be empty`);
    }
  });
});

// ── Documentation ─────────────────────────────────────────────────────

describe('documentation', () => {
  it('docs/project-types.md mentions domain profiles', () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'docs', 'project-types.md'), 'utf8');
    assert.ok(content.includes('software'), 'should mention software');
  });

  it('docs/getting-started.md has domain profile selection section', () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'docs', 'getting-started.md'), 'utf8');
    assert.ok(content.includes('domain'), 'should mention domain');
    assert.ok(content.includes('profile') || content.includes('Domain Profile'), 'should mention profile or Domain Profile');
  });
});
