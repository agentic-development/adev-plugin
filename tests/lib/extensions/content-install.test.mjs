/**
 * Tests for lib/extensions/content-install.mjs — content installation.
 *
 * Spec: .context-index/specs/features/extensions/content-installation.spec.md
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import {
  installDomainProfile,
  planGovernanceMerge,
  mergeGovernanceEntries,
  installSamples,
  checkSkillConflicts,
} from '../../../lib/extensions/content-install.mjs';
import { CAPS } from '../../../lib/extensions/governance-values.mjs';

// ── Task 1: Domain profiles ────────────────────────────────────────────

describe('extensions/content-install — domain profiles', () => {
  let projectRoot, extDir;
  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, '.context-index'), { recursive: true });
    extDir = createTempDir();
  });
  afterEach(() => { cleanupTempDir(projectRoot); cleanupTempDir(extDir); });

  it('installs domain profile with domain.yaml', () => {
    writeFileSync(join(extDir, 'reviewers.yaml'), 'reviewers: []\n');
    const report = installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    const domainYaml = readFileSync(join(projectRoot, '.context-index/domains/my-domain/domain.yaml'), 'utf8');
    assert.ok(domainYaml.includes('extends: software'));
    assert.ok(report.filesWritten.length > 0);
  });

  it('copies all recognized domain profile files', () => {
    writeFileSync(join(extDir, 'reviewers.yaml'), 'reviewers: []\n');
    writeFileSync(join(extDir, 'gates.yaml'), 'gates: []\n');
    writeFileSync(join(extDir, 'charter-template.md'), '# Charter\n');
    writeFileSync(join(extDir, 'spec-template.md'), '# Spec\n');
    installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    const domainDir = join(projectRoot, '.context-index/domains/my-domain');
    assert.ok(existsSync(join(domainDir, 'reviewers.yaml')));
    assert.ok(existsSync(join(domainDir, 'gates.yaml')));
    assert.ok(existsSync(join(domainDir, 'charter-template.md')));
    assert.ok(existsSync(join(domainDir, 'spec-template.md')));
    assert.ok(existsSync(join(domainDir, 'domain.yaml')));
  });

  it('rejects bundled domain name', () => {
    assert.throws(
      () => installDomainProfile(projectRoot, extDir, { name: 'software', extends: 'software' }),
      (err) => err.code === 'BUNDLED_COLLISION'
    );
  });

  it('rejects non-kebab-case name', () => {
    assert.throws(
      () => installDomainProfile(projectRoot, extDir, { name: 'MyDomain', extends: 'software' }),
      (err) => err.code === 'INVALID_DOMAIN_NAME'
    );
  });

  it('overwrites on re-install (idempotent)', () => {
    writeFileSync(join(extDir, 'reviewers.yaml'), 'reviewers: []\n');
    installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    assert.ok(existsSync(join(projectRoot, '.context-index/domains/my-domain/domain.yaml')));
  });
});

// ── Task 2: Governance merge ────────────────────────────────────────────

describe('extensions/content-install — governance merge', () => {
  let projectRoot, extDir;
  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, '.context-index/governance'), { recursive: true });
    extDir = createTempDir();
  });
  afterEach(() => { cleanupTempDir(projectRoot); cleanupTempDir(extDir); });

  it('validates governance entry schema — missing id', () => {
    assert.throws(
      () => planGovernanceMerge(projectRoot, 'review.yaml', [{ dispatch: 'always' }]),
      (err) => err.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  });

  it('rejects an id longer than the scalar cap', () => {
    assert.throws(
      () => planGovernanceMerge(projectRoot, 'review.yaml', [{ id: 'a'.repeat(CAPS.scalarChars + 1) }]),
      (err) => err.code === 'GOVERNANCE_LIMIT_EXCEEDED'
    );
  });

  it('rejects a field outside the target registry allowlist', () => {
    assert.throws(
      () => planGovernanceMerge(projectRoot, 'review.yaml', [{ id: 'test', config: { nested: true } }]),
      (err) => err.code === 'GOVERNANCE_FIELD_NOT_ALLOWED'
    );
  });

  it('rejects nested objects in entry values', () => {
    assert.throws(
      () => planGovernanceMerge(projectRoot, 'review.yaml', [{ id: 'test', package: { skill: { deep: true } } }]),
      (err) => err.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  });

  it('rejects fields that are not contributable — tags and count', () => {
    // Previously accepted by the target-blind `validateGovernanceEntry`. The
    // allowlist is per registry, and review.yaml contributes neither field.
    assert.throws(
      () => planGovernanceMerge(projectRoot, 'review.yaml',
        [{ id: 'test-entry', dispatch: 'always', tags: ['a', 'b'], enabled: true, count: 3 }]),
      (err) => err.code === 'GOVERNANCE_FIELD_NOT_ALLOWED'
    );
  });

  it('accepts a valid governance entry', () => {
    const plan = planGovernanceMerge(projectRoot, 'review.yaml',
      [{ id: 'test-entry', dispatch: 'always', enabled: true }]);
    assert.deepEqual(plan.mergesApplied, ['appended: test-entry']);
  });

  it('rejects dispatch: triggered', () => {
    assert.throws(
      () => planGovernanceMerge(projectRoot, 'review.yaml', [{ id: 'new-one', dispatch: 'triggered' }]),
      (err) => err.code === 'GOVERNANCE_FIELD_VALUE_INVALID'
    );
  });

  it('merges new entries into existing governance file', () => {
    writeFileSync(join(projectRoot, '.context-index/governance/review.yaml'),
      'reviewers:\n  - id: existing\n    dispatch: always\n');
    mergeGovernanceEntries(projectRoot, 'review.yaml', [{ id: 'new-one', dispatch: 'always' }]);
    const content = readFileSync(join(projectRoot, '.context-index/governance/review.yaml'), 'utf8');
    assert.ok(content.includes('existing'));
    assert.ok(content.includes('new-one'));
  });

  it('skips a colliding id and leaves the existing entry byte-identical', () => {
    const src = 'reviewers:\n  - id: shared\n    dispatch: always\n';
    const overlay = join(projectRoot, '.context-index/governance/review.yaml');
    writeFileSync(overlay, src);
    const report = mergeGovernanceEntries(projectRoot, 'review.yaml',
      [{ id: 'shared', dispatch: 'never', enabled: false }]);
    // No field of the extension entry reaches the project entry — not even one
    // the project left unset. The old fill-gap merge was an execution lever.
    assert.equal(readFileSync(overlay, 'utf8'), src);
    assert.deepEqual(report.mergesApplied, ['skipped: shared']);
  });

  it('auto-creates governance file when missing', () => {
    // Remove the governance dir to test auto-creation
    const govDir = join(projectRoot, '.context-index/governance');
    rmSync(govDir, { recursive: true, force: true });
    mergeGovernanceEntries(projectRoot, 'review.yaml', [{ id: 'first', dispatch: 'always' }]);
    assert.ok(existsSync(join(projectRoot, '.context-index/governance/review.yaml')));
  });
});

// ── Task 3: Samples ────────────────────────────────────────────────────

describe('extensions/content-install — samples', () => {
  let projectRoot, extDir;
  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, '.context-index'), { recursive: true });
    extDir = createTempDir();
  });
  afterEach(() => { cleanupTempDir(projectRoot); cleanupTempDir(extDir); });

  it('copies sample file to .context-index/samples/', () => {
    writeFileSync(join(extDir, 'my-sample.md'), '# Sample');
    const report = installSamples(projectRoot, extDir, ['my-sample.md']);
    assert.ok(existsSync(join(projectRoot, '.context-index/samples/my-sample.md')));
    assert.ok(report.filesWritten.length > 0);
  });

  it('rejects source-side path traversal', () => {
    writeFileSync(join(extDir, 'legit.md'), 'content');
    assert.throws(
      () => installSamples(projectRoot, extDir, ['../../etc/passwd']),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('rejects dest-side path traversal via crafted filename', () => {
    const maliciousName = '../domains/evil.yaml';
    writeFileSync(join(extDir, 'innocent.md'), 'content');
    assert.throws(
      () => installSamples(projectRoot, extDir, [{ src: 'innocent.md', dest: maliciousName }]),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('warns on overwrite of existing sample', () => {
    mkdirSync(join(projectRoot, '.context-index/samples'), { recursive: true });
    writeFileSync(join(projectRoot, '.context-index/samples/existing.md'), 'old');
    writeFileSync(join(extDir, 'existing.md'), 'new');
    const report = installSamples(projectRoot, extDir, ['existing.md']);
    assert.ok(report.warnings.some(w => w.includes('existing.md')));
  });
});

// ── Task 4: Skill conflict detection ────────────────────────────────────

describe('extensions/content-install — skill conflict', () => {
  it('passes when no collision with bundled skills', () => {
    const result = checkSkillConflicts(['my-custom-skill']);
    assert.equal(result.conflicts.length, 0);
  });

  it('blocks when skill name matches a bundled skill', () => {
    assert.throws(
      () => checkSkillConflicts(['brainstorm']),
      (err) => err.code === 'SKILL_COLLISION'
    );
  });

  it('lists all conflicting names', () => {
    try {
      checkSkillConflicts(['brainstorm', 'plan', 'my-skill']);
      assert.fail('Expected SKILL_COLLISION to be thrown');
    } catch (err) {
      assert.equal(err.code, 'SKILL_COLLISION');
      assert.ok(err.conflicts.includes('brainstorm'));
      assert.ok(err.conflicts.includes('plan'));
      assert.equal(err.conflicts.length, 2);
    }
  });
});
