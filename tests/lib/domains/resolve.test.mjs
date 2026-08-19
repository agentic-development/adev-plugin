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
    const manifest = { domain: 'process-automation' };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'process-automation');
    assert.equal(result.source_level, 'project');
  });

  it('a nested-only project.domain (no known real producer) does NOT resolve — falls through to default', () => {
    // resolveDomain() reads the TOP-LEVEL `domain` key, not `project.domain`.
    // No real writer or manifest ever produces the nested shape, so a
    // manifest with only the nested form is treated the same as one with
    // no domain declared at all.
    const manifest = { project: { domain: 'process-automation' } };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'default');
  });

  it('reads a TOP-LEVEL manifest.domain key (the shape real writers produce)', () => {
    // writeDomainKey() in lib/cli/domain-extension-picker.mjs writes a bare
    // top-level `domain: <name>` key (see its doc comment + the regex
    // `/^domain:[^\n]*$/m`), NOT nested under `project:`. Every real
    // manifest (this repo's own .context-index/manifest.yaml, and the
    // scaffold template) uses this top-level shape.
    const manifest = { domain: 'web-service' };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'web-service');
    assert.equal(result.source_level, 'project');
  });

  it('prefers the TOP-LEVEL domain key over a nested project.domain when both are present', () => {
    // Top-level is what real writers/manifests use; nested project.domain
    // has no known real producer. Top-level wins when they disagree.
    const manifest = { domain: 'web-service', project: { domain: 'process-automation' } };
    const result = resolveDomain(manifest, null, null);
    assert.equal(result.resolved_domain, 'web-service');
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
      { domain: 'process-automation' },
      { domain: '' },
      null
    );
    assert.equal(result.resolved_domain, 'process-automation');
    assert.equal(result.source_level, 'project');
  });

  it('skips unmatched module slug', () => {
    const manifest = {
      domain: 'software',
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
    const manifest = { domain: 'data-engineering' };
    const r1 = resolveDomain(manifest, null, null);
    const r2 = resolveDomain(manifest, null, null);
    assert.deepEqual(r1, r2);
  });

  it('charter takes precedence over module and project', () => {
    const manifest = {
      domain: 'process-automation',
      modules: [{ slug: 'mod', domain: 'data-engineering' }],
    };
    const result = resolveDomain(manifest, { domain: 'software' }, 'mod');
    assert.equal(result.resolved_domain, 'software');
    assert.equal(result.source_level, 'charter');
  });
});
