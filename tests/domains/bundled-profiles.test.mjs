/**
 * Bundled domain profiles content validation tests.
 *
 * Verifies that all three bundled domain profiles (software, data-engineering,
 * process-automation) contain the correct overlay files with expected structure
 * and content per the bundled-domain-profiles spec.
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
const DE_DIR = join(DOMAINS_DIR, 'data-engineering');
const PA_DIR = join(DOMAINS_DIR, 'process-automation');

const EXPECTED_FILES = [
  'charter-overlay.md',
  'spec-overlay.md',
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

  it('charter-overlay.md is non-empty markdown', () => {
    const content = readFileSync(join(SW_DIR, 'charter-overlay.md'), 'utf8');
    assert.ok(content.trim().length > 0, 'charter-overlay.md should not be empty');
    assert.ok(content.includes('##'), 'charter-overlay.md should contain H2 headings');
  });

  it('spec-overlay.md is non-empty markdown', () => {
    const content = readFileSync(join(SW_DIR, 'spec-overlay.md'), 'utf8');
    assert.ok(content.trim().length > 0, 'spec-overlay.md should not be empty');
    assert.ok(content.includes('##'), 'spec-overlay.md should contain H2 headings');
  });
});

// ── Data-Engineering Profile ──────────────────────────────────────────

describe('data-engineering profile', () => {
  it('contains exactly 7 overlay files', () => {
    const files = readdirSync(DE_DIR).sort();
    assert.deepStrictEqual(files, EXPECTED_FILES.slice().sort());
    assert.equal(files.length, 7);
  });

  it('charter overlay contains data domain vocabulary', () => {
    const content = readFileSync(join(DE_DIR, 'charter-overlay.md'), 'utf8');
    assert.ok(content.includes('Data Contract'), 'should contain "Data Contract"');
    assert.ok(content.includes('Pipeline Stages'), 'should contain "Pipeline Stages"');
    assert.ok(content.includes('Data Lineage'), 'should contain "Data Lineage"');
    assert.ok(content.includes('Data Model'), 'should contain "Data Model"');
  });

  it('spec overlay contains data domain vocabulary', () => {
    const content = readFileSync(join(DE_DIR, 'spec-overlay.md'), 'utf8');
    assert.ok(content.includes('Failure Mode'), 'should contain "Failure Mode"');
    assert.ok(content.includes('Recovery Action'), 'should contain "Recovery Action"');
    assert.ok(content.includes('Data Quality Expectations'), 'should contain "Data Quality Expectations"');
    assert.ok(content.includes('Output Schema'), 'should contain "Output Schema"');
  });

  it('reviewers.yaml has data-contract-reviewer with merge_strategy: append', () => {
    const content = readFileSync(join(DE_DIR, 'reviewers.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.reviewers), 'reviewers should be an array');
    const dcr = parsed.reviewers.find(r => r.id === 'data-contract-reviewer');
    assert.ok(dcr, 'should have data-contract-reviewer');
    assert.equal(parsed.merge_strategy, 'append');
  });

  it('gates.yaml has data-quality gate', () => {
    const content = readFileSync(join(DE_DIR, 'gates.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.gates), 'gates should be an array');
    const dq = parsed.gates.find(g => g.id === 'data-quality');
    assert.ok(dq, 'should have data-quality gate');
  });

  it('verification.yaml has type: output, tool: none', () => {
    const content = readFileSync(join(DE_DIR, 'verification.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.equal(parsed.type, 'output');
    assert.equal(parsed.tool, 'none');
  });

  it('gate-config.yaml includes data-specific exclusions and passthrough', () => {
    const content = readFileSync(join(DE_DIR, 'gate-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(parsed.file_exclusions.includes('*.parquet'), 'should include *.parquet');
    assert.ok(parsed.file_exclusions.includes('*.duckdb'), 'should include *.duckdb');
    assert.ok(parsed.file_exclusions.includes('seeds/**'), 'should include seeds/**');
    assert.ok(parsed.file_exclusions.includes('target/**'), 'should include target/**');
    assert.ok(parsed.bash_passthrough.includes('dbt run'), 'should include dbt run');
    assert.ok(parsed.bash_passthrough.includes('dbt test'), 'should include dbt test');
    assert.ok(parsed.bash_passthrough.includes('dbt build'), 'should include dbt build');
    assert.ok(parsed.bash_passthrough.includes('python -m pytest'), 'should include python -m pytest');
  });

  it('test-config.yaml has correct data-engineering config', () => {
    const content = readFileSync(join(DE_DIR, 'test-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(parsed.permitted_tools.includes('pytest'), 'should include pytest');
    assert.ok(parsed.permitted_tools.includes('dbt test'), 'should include dbt test');
    assert.equal(parsed.max_test_file_size, 1048576);
  });
});

// ── Process-Automation Profile ────────────────────────────────────────

describe('process-automation profile', () => {
  it('contains exactly 7 overlay files', () => {
    const files = readdirSync(PA_DIR).sort();
    assert.deepStrictEqual(files, EXPECTED_FILES.slice().sort());
    assert.equal(files.length, 7);
  });

  it('charter overlay contains workflow domain vocabulary', () => {
    const content = readFileSync(join(PA_DIR, 'charter-overlay.md'), 'utf8');
    assert.ok(content.includes('Integration Points'), 'should contain "Integration Points"');
    assert.ok(content.includes('Workflow Steps'), 'should contain "Workflow Steps"');
    assert.ok(content.includes('Recovery & Compensation'), 'should contain "Recovery & Compensation"');
  });

  it('spec overlay contains workflow domain vocabulary', () => {
    const content = readFileSync(join(PA_DIR, 'spec-overlay.md'), 'utf8');
    assert.ok(content.includes('Trigger'), 'should contain "Trigger"');
    assert.ok(content.includes('Outcome'), 'should contain "Outcome"');
    assert.ok(content.includes('Integration Points'), 'should contain "Integration Points"');
    assert.ok(content.includes('Recovery Actions'), 'should contain "Recovery Actions"');
  });

  it('reviewers.yaml has integration-reviewer with merge_strategy: append', () => {
    const content = readFileSync(join(PA_DIR, 'reviewers.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.reviewers), 'reviewers should be an array');
    const ir = parsed.reviewers.find(r => r.id === 'integration-reviewer');
    assert.ok(ir, 'should have integration-reviewer');
    assert.equal(parsed.merge_strategy, 'append');
  });

  it('gates.yaml has flow-coverage gate', () => {
    const content = readFileSync(join(PA_DIR, 'gates.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(Array.isArray(parsed.gates), 'gates should be an array');
    const fc = parsed.gates.find(g => g.id === 'flow-coverage');
    assert.ok(fc, 'should have flow-coverage gate');
  });

  it('verification.yaml has type: flow, tool: none', () => {
    const content = readFileSync(join(PA_DIR, 'verification.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.equal(parsed.type, 'flow');
    assert.equal(parsed.tool, 'none');
  });

  it('gate-config.yaml includes automation-specific exclusions and passthrough', () => {
    const content = readFileSync(join(PA_DIR, 'gate-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(parsed.file_exclusions.includes('*.workflow.yaml'), 'should include *.workflow.yaml');
    assert.ok(parsed.file_exclusions.includes('*.bpmn'), 'should include *.bpmn');
    assert.ok(parsed.file_exclusions.includes('flows/**'), 'should include flows/**');
    assert.ok(parsed.bash_passthrough.includes('python -m pytest'), 'should include python -m pytest');
    assert.ok(parsed.bash_passthrough.includes('npm test'), 'should include npm test');
    assert.ok(parsed.bash_passthrough.includes('npx jest'), 'should include npx jest');
  });

  it('test-config.yaml has correct process-automation config', () => {
    const content = readFileSync(join(PA_DIR, 'test-config.yaml'), 'utf8');
    const parsed = parseYaml(content);
    assert.ok(parsed.permitted_tools.includes('pytest'), 'should include pytest');
    assert.ok(parsed.permitted_tools.includes('node:test'), 'should include node:test');
    assert.ok(parsed.permitted_tools.includes('jest'), 'should include jest');
    assert.equal(parsed.max_test_file_size, 524288);
  });
});

// ── Cross-Profile Validation ──────────────────────────────────────────

describe('cross-profile validation', () => {
  it('all 3 profiles contain exactly 7 files each', () => {
    for (const [name, dir] of [['software', SW_DIR], ['data-engineering', DE_DIR], ['process-automation', PA_DIR]]) {
      const files = readdirSync(dir).sort();
      assert.equal(files.length, 7, `${name} should have 7 files`);
      assert.deepStrictEqual(files, EXPECTED_FILES.slice().sort(), `${name} files should match expected`);
    }
  });

  it('all YAML overlays parse without errors', () => {
    const yamlFiles = EXPECTED_FILES.filter(f => f.endsWith('.yaml'));
    for (const name of ['software', 'data-engineering', 'process-automation']) {
      const dir = join(DOMAINS_DIR, name);
      for (const f of yamlFiles) {
        const content = readFileSync(join(dir, f), 'utf8');
        const parsed = parseYaml(content);
        assert.ok(parsed !== null && typeof parsed === 'object', `${name}/${f} should parse`);
      }
    }
  });

  it('markdown overlays are non-empty strings', () => {
    const mdFiles = EXPECTED_FILES.filter(f => f.endsWith('.md'));
    for (const name of ['software', 'data-engineering', 'process-automation']) {
      const dir = join(DOMAINS_DIR, name);
      for (const f of mdFiles) {
        const content = readFileSync(join(dir, f), 'utf8');
        assert.ok(content.trim().length > 0, `${name}/${f} should not be empty`);
      }
    }
  });

  it('no gate ID collisions between data-engineering and process-automation', () => {
    const deContent = readFileSync(join(DE_DIR, 'gates.yaml'), 'utf8');
    const paContent = readFileSync(join(PA_DIR, 'gates.yaml'), 'utf8');
    const deGates = parseYaml(deContent);
    const paGates = parseYaml(paContent);
    const deIds = new Set(deGates.gates.map(g => g.id));
    const paIds = new Set(paGates.gates.map(g => g.id));
    for (const id of deIds) {
      assert.ok(!paIds.has(id), `Gate ID "${id}" collides between data-engineering and process-automation`);
    }
  });

  it('data-engineering and process-automation both use merge_strategy: append', () => {
    const deContent = readFileSync(join(DE_DIR, 'reviewers.yaml'), 'utf8');
    const paContent = readFileSync(join(PA_DIR, 'reviewers.yaml'), 'utf8');
    assert.equal(parseYaml(deContent).merge_strategy, 'append');
    assert.equal(parseYaml(paContent).merge_strategy, 'append');
  });
});

// ── Documentation ─────────────────────────────────────────────────────

describe('documentation', () => {
  it('docs/project-types.md mentions all 3 domain profiles', () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'docs', 'project-types.md'), 'utf8');
    assert.ok(content.includes('software'), 'should mention software');
    assert.ok(content.includes('data-engineering'), 'should mention data-engineering');
    assert.ok(content.includes('process-automation'), 'should mention process-automation');
  });

  it('docs/getting-started.md has domain profile selection section', () => {
    const content = readFileSync(join(PLUGIN_ROOT, 'docs', 'getting-started.md'), 'utf8');
    assert.ok(content.includes('domain'), 'should mention domain');
    assert.ok(content.includes('profile') || content.includes('Domain Profile'), 'should mention profile or Domain Profile');
  });
});
