import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveDomain } from '../../../lib/domains/resolve.mjs';

describe('resolveDomain', () => {
  it('returns charter-level domain when present (Behavior 1)', () => {
    const result = resolveDomain(
      { project: {} },
      { domain: 'data-engineering' },
      null
    );
    assert.equal(result.resolved_domain, 'data-engineering');
    assert.equal(result.source_level, 'charter');
  });

  it('returns module-level domain when no charter domain (Behavior 2)', () => {
    const manifest = {
      project: {},
      modules: [{ slug: 'pipelines', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, null, 'pipelines');
    assert.equal(result.resolved_domain, 'data-engineering');
    assert.equal(result.source_level, 'module');
  });

  it('returns project-level domain when no charter or module domain (Behavior 3)', () => {
    const manifest = { project: { domain: 'process-automation' } };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'process-automation');
    assert.equal(result.source_level, 'project');
  });

  it('returns "software" default when no domain declared (Behavior 4)', () => {
    const result = resolveDomain({ project: {} }, null, null);
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('rejects invalid domain names (Behavior 12)', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: '../traversal' }, null),
      /INVALID_DOMAIN_NAME/
    );
  });

  it('rejects domain names with path separators', () => {
    assert.throws(
      () => resolveDomain({ project: {} }, { domain: 'foo/bar' }, null),
      /INVALID_DOMAIN_NAME/
    );
  });

  it('skips empty charter domain value', () => {
    const result = resolveDomain(
      { project: { domain: 'process-automation' } },
      { domain: '' },
      null
    );
    assert.equal(result.resolved_domain, 'process-automation');
    assert.equal(result.source_level, 'project');
  });

  it('skips unmatched module slug', () => {
    const manifest = {
      project: { domain: 'software' },
      modules: [{ slug: 'other', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, null, 'pipelines');
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'project');
  });

  it('gracefully falls back when manifest is null', () => {
    const result = resolveDomain(null, null, null);
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('is deterministic — same inputs produce same output', () => {
    const manifest = { project: { domain: 'data-engineering' } };
    const r1 = resolveDomain(manifest, null, null);
    const r2 = resolveDomain(manifest, null, null);
    assert.deepEqual(r1, r2);
  });

  it('charter takes precedence over module and project', () => {
    const manifest = {
      project: { domain: 'process-automation' },
      modules: [{ slug: 'mod', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, { domain: 'software' }, 'mod');
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'charter');
  });
});
