import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { createTempDir, cleanupTempDir, writeFixture } from '../../../tests/helpers.mjs';
import { loadDomainConfig } from '../../../lib/domains/domain-config.mjs';

describe('loadDomainConfig — core', () => {
  let tmpDir;
  let pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();

    // Bundled software profile
    writeFixture(pluginRoot, 'templates/domains/software/charter-template.md', '# Software Charter');
    writeFixture(pluginRoot, 'templates/domains/software/reviewers.yaml', 'merge_strategy: append\nreviewers:\n  - id: structural-architect');
    writeFixture(pluginRoot, 'templates/domains/software/gates.yaml', 'gates:\n  - id: test');
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('returns null for unknown config type (Behavior 6)', () => {
    const result = loadDomainConfig('software', 'unknown-type', tmpDir, pluginRoot);
    assert.equal(result, null);
  });

  it('returns string for markdown template (Behavior 10)', () => {
    const result = loadDomainConfig('software', 'charter-template', tmpDir, pluginRoot);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('# Software Charter'));
  });

  it('returns parsed object for structured config (Behavior 11)', () => {
    const result = loadDomainConfig('software', 'reviewers', tmpDir, pluginRoot);
    assert.equal(typeof result, 'object');
    assert.equal(result.merge_strategy, 'append');
  });

  it('returns null when no config file exists at any level (Behavior 8)', () => {
    const result = loadDomainConfig('software', 'verification', tmpDir, pluginRoot);
    assert.equal(result, null);
  });

  it('reads from bundled profile for software domain (Behavior 5)', () => {
    const result = loadDomainConfig('software', 'gates', tmpDir, pluginRoot);
    assert.ok(result);
    assert.ok(result.gates);
  });
});

describe('loadDomainConfig — extends', () => {
  let tmpDir, pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();

    // Bundled software profile
    writeFixture(pluginRoot, 'templates/domains/software/charter-template.md', '# Software Charter');
    writeFixture(pluginRoot, 'templates/domains/software/reviewers.yaml', 'merge_strategy: append');

    // Custom domain extending software
    writeFixture(tmpDir, '.context-index/domains/my-project/domain.yaml', 'extends: software');
    writeFixture(tmpDir, '.context-index/domains/my-project/charter-template.md', '# My Custom Charter');
    // reviewers.yaml NOT provided — should inherit from software
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('returns custom override when present (Behavior 7)', () => {
    const result = loadDomainConfig('my-project', 'charter-template', tmpDir, pluginRoot);
    assert.ok(result.includes('# My Custom Charter'));
  });

  it('falls back to parent via extends for missing config (Behavior 7)', () => {
    const result = loadDomainConfig('my-project', 'reviewers', tmpDir, pluginRoot);
    assert.equal(result.merge_strategy, 'append');
  });

  it('throws EXTENDS_NOT_FOUND for non-existent parent', () => {
    writeFixture(tmpDir, '.context-index/domains/bad-parent/domain.yaml', 'extends: nonexistent');
    assert.throws(
      () => loadDomainConfig('bad-parent', 'reviewers', tmpDir, pluginRoot),
      { code: 'EXTENDS_NOT_FOUND' }
    );
  });

  it('throws EXTENDS_DEPTH_EXCEEDED when extending non-bundled domain', () => {
    writeFixture(tmpDir, '.context-index/domains/chain-a/domain.yaml', 'extends: software');
    writeFixture(tmpDir, '.context-index/domains/chain-b/domain.yaml', 'extends: chain-a');
    assert.throws(
      () => loadDomainConfig('chain-b', 'reviewers', tmpDir, pluginRoot),
      { code: 'EXTENDS_DEPTH_EXCEEDED' }
    );
  });

  it('works without domain.yaml (no extends fallback)', () => {
    writeFixture(tmpDir, '.context-index/domains/standalone/charter-template.md', '# Standalone');
    const result = loadDomainConfig('standalone', 'charter-template', tmpDir, pluginRoot);
    assert.ok(result.includes('# Standalone'));
    const missing = loadDomainConfig('standalone', 'reviewers', tmpDir, pluginRoot);
    assert.equal(missing, null);
  });
});

describe('loadDomainConfig — bundled override guard', () => {
  let tmpDir, pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();
    writeFixture(pluginRoot, 'templates/domains/software/charter-template.md', '# Software');
    // User tries to override bundled domain
    writeFixture(tmpDir, '.context-index/domains/software/charter-template.md', '# Hacked');
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('throws BUNDLED_OVERRIDE_BLOCKED when .context-index/domains/ matches bundled name (Behavior 9)', () => {
    assert.throws(
      () => loadDomainConfig('software', 'charter-template', tmpDir, pluginRoot),
      { code: 'BUNDLED_OVERRIDE_BLOCKED' }
    );
  });

  it('includes guidance in error message', () => {
    try {
      loadDomainConfig('software', 'charter-template', tmpDir, pluginRoot);
      assert.fail('expected error');
    } catch (e) {
      assert.ok(e.message.includes('extends'));
      assert.ok(e.code === 'BUNDLED_OVERRIDE_BLOCKED');
    }
  });
});

describe('loadDomainConfig — error cases', () => {
  let tmpDir, pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();
    writeFixture(pluginRoot, 'templates/domains/software/charter-template.md', '# Software');
    writeFixture(pluginRoot, 'templates/domains/software/reviewers.yaml', 'merge_strategy: append');
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('throws DOMAIN_CONFIG_PARSE_ERROR for malformed YAML with project-relative path', () => {
    writeFixture(tmpDir, '.context-index/domains/parse-test/domain.yaml', 'extends: software');
    writeFixture(tmpDir, '.context-index/domains/parse-test/gates.yaml', 'gates:\n  - id: test\n bad-indent: oops');
    try {
      loadDomainConfig('parse-test', 'gates', tmpDir, pluginRoot);
      assert.fail('expected DOMAIN_CONFIG_PARSE_ERROR');
    } catch (e) {
      assert.equal(e.code, 'DOMAIN_CONFIG_PARSE_ERROR');
      assert.ok(e.message.includes('.context-index/domains/parse-test/gates.yaml'),
        `error message should contain project-relative path, got: ${e.message}`);
    }
  });

  it('throws DOMAIN_CONFIG_TOO_LARGE for files exceeding 512KB', () => {
    const largeContent = 'x'.repeat(512 * 1024 + 1);
    writeFixture(tmpDir, '.context-index/domains/large-test/charter-template.md', largeContent);
    try {
      loadDomainConfig('large-test', 'charter-template', tmpDir, pluginRoot);
      assert.fail('expected DOMAIN_CONFIG_TOO_LARGE');
    } catch (e) {
      assert.equal(e.code, 'DOMAIN_CONFIG_TOO_LARGE');
    }
  });

  it('returns empty string for empty markdown template', () => {
    writeFixture(tmpDir, '.context-index/domains/empty-md/charter-template.md', '');
    const result = loadDomainConfig('empty-md', 'charter-template', tmpDir, pluginRoot);
    assert.equal(result, '');
  });

  it('returns empty object for empty structured config', () => {
    writeFixture(tmpDir, '.context-index/domains/empty-yaml/gates.yaml', '');
    const result = loadDomainConfig('empty-yaml', 'gates', tmpDir, pluginRoot);
    assert.deepEqual(result, {});
  });

  it('custom domain prefers custom file over bundled for same domain name', () => {
    // custom domain "my-override" has its own reviewers.yaml and extends software
    writeFixture(tmpDir, '.context-index/domains/my-override/domain.yaml', 'extends: software');
    writeFixture(tmpDir, '.context-index/domains/my-override/reviewers.yaml', 'merge_strategy: replace');
    const result = loadDomainConfig('my-override', 'reviewers', tmpDir, pluginRoot);
    assert.equal(result.merge_strategy, 'replace');
  });

  it('custom domain inherits from parent when local file missing', () => {
    writeFixture(tmpDir, '.context-index/domains/inherit-test/domain.yaml', 'extends: software');
    // no local charter-template.md — should fall back to software
    const result = loadDomainConfig('inherit-test', 'charter-template', tmpDir, pluginRoot);
    assert.ok(result.includes('# Software'));
  });

  it('returns null for a domain that is neither bundled nor custom', () => {
    const result = loadDomainConfig('nonexistent-domain', 'charter-template', tmpDir, pluginRoot);
    assert.equal(result, null);
  });
});

describe('loadDomainConfig — deprecated type names', () => {
  let tmpDir, pluginRoot;

  before(() => {
    tmpDir = createTempDir();
    pluginRoot = createTempDir();
    writeFixture(pluginRoot, 'templates/domains/software/charter-template.md', '# Software Charter');
  });

  after(() => {
    cleanupTempDir(tmpDir);
    cleanupTempDir(pluginRoot);
  });

  it('returns null for deprecated charter-overlay type name', () => {
    const result = loadDomainConfig('software', 'charter-overlay', tmpDir, pluginRoot);
    assert.equal(result, null);
  });

  it('returns null for deprecated spec-overlay type name', () => {
    const result = loadDomainConfig('software', 'spec-overlay', tmpDir, pluginRoot);
    assert.equal(result, null);
  });
});

describe('resolveDomain — edge cases', () => {
  // Import separately for this describe block
  let resolveDomain;
  before(async () => {
    const mod = await import('../../../lib/domains/resolve.mjs');
    resolveDomain = mod.resolveDomain;
  });

  it('rejects domain names with backslash', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: 'foo\\bar' }, null),
      { code: 'INVALID_DOMAIN_NAME' }
    );
  });

  it('rejects domain names with double dots', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: '..traversal' }, null),
      { code: 'INVALID_DOMAIN_NAME' }
    );
  });

  it('rejects domain names with uppercase', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: 'HasUpper' }, null),
      { code: 'INVALID_DOMAIN_NAME' }
    );
  });

  it('validates domain at module level', () => {
    const manifest = {
      project: {},
      modules: [{ slug: 'mod', domain: '../bad' }],
    };
    assert.throws(
      () => resolveDomain(manifest, null, 'mod'),
      { code: 'INVALID_DOMAIN_NAME' }
    );
  });

  it('validates domain at project level', () => {
    // resolveDomain() reads the TOP-LEVEL `domain` key for project-level
    // resolution, not a nested `project.domain` (see lib/domains/resolve.mjs).
    const manifest = { domain: 'has/slash' };
    assert.throws(
      () => resolveDomain(manifest, null, null),
      { code: 'INVALID_DOMAIN_NAME' }
    );
  });

  it('handles manifest with empty modules array', () => {
    const manifest = { project: {}, modules: [] };
    const result = resolveDomain(manifest, null, 'anything');
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('handles charter with null domain', () => {
    const result = resolveDomain({ project: {} }, { domain: null }, null);
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('module-level domain takes precedence over project-level', () => {
    const manifest = {
      project: { domain: 'software' },
      modules: [{ slug: 'mod', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, null, 'mod');
    assert.equal(result.resolved_domain, 'data-engineering');
    assert.equal(result.source_level, 'module');
  });
});
