import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  OVERLAY_TYPES,
  OVERLAY_FILENAMES,
  BUNDLED_DOMAIN_NAMES,
  DOMAIN_NAME_PATTERN,
  STRUCTURED_OVERLAY_TYPES,
  DEPRECATED_OVERLAY_TYPES,
  DEFAULT_DOMAIN,
  MAX_OVERLAY_SIZE,
} from '../../../lib/domains/constants.mjs';

describe('domains/constants', () => {
  it('exports all 7 overlay types', () => {
    assert.equal(OVERLAY_TYPES.size, 7);
    for (const t of ['charter-template', 'spec-template', 'reviewers', 'gates', 'verification', 'gate-config', 'test-config']) {
      assert.ok(OVERLAY_TYPES.has(t), `missing overlay type: ${t}`);
    }
    assert.ok(!OVERLAY_TYPES.has('charter-overlay'), 'charter-overlay should not be in OVERLAY_TYPES');
    assert.ok(!OVERLAY_TYPES.has('spec-overlay'), 'spec-overlay should not be in OVERLAY_TYPES');
  });

  it('maps each overlay type to its filename', () => {
    assert.equal(OVERLAY_FILENAMES.get('charter-template'), 'charter-template.md');
    assert.equal(OVERLAY_FILENAMES.get('spec-template'), 'spec-template.md');
    assert.equal(OVERLAY_FILENAMES.get('reviewers'), 'reviewers.yaml');
    assert.equal(OVERLAY_FILENAMES.get('gates'), 'gates.yaml');
    assert.equal(OVERLAY_FILENAMES.get('verification'), 'verification.yaml');
    assert.equal(OVERLAY_FILENAMES.get('gate-config'), 'gate-config.yaml');
    assert.equal(OVERLAY_FILENAMES.get('test-config'), 'test-config.yaml');
  });

  it('exports the 3 bundled domain names', () => {
    assert.equal(BUNDLED_DOMAIN_NAMES.size, 3);
    assert.ok(BUNDLED_DOMAIN_NAMES.has('software'));
    assert.ok(BUNDLED_DOMAIN_NAMES.has('data-engineering'));
    assert.ok(BUNDLED_DOMAIN_NAMES.has('process-automation'));
  });

  it('exports domain name validation pattern', () => {
    assert.ok(DOMAIN_NAME_PATTERN instanceof RegExp);
    assert.ok(DOMAIN_NAME_PATTERN.test('software'));
    assert.ok(DOMAIN_NAME_PATTERN.test('my-custom-domain'));
    assert.ok(DOMAIN_NAME_PATTERN.test('data-engineering'));
    assert.ok(!DOMAIN_NAME_PATTERN.test('../traversal'));
    assert.ok(!DOMAIN_NAME_PATTERN.test('has/slash'));
    assert.ok(!DOMAIN_NAME_PATTERN.test(''));
    assert.ok(!DOMAIN_NAME_PATTERN.test('Has-Upper'));
  });

  it('exports structured overlay types set', () => {
    assert.ok(STRUCTURED_OVERLAY_TYPES instanceof Set);
    assert.equal(STRUCTURED_OVERLAY_TYPES.size, 5);
    assert.ok(STRUCTURED_OVERLAY_TYPES.has('reviewers'));
    assert.ok(STRUCTURED_OVERLAY_TYPES.has('gates'));
    assert.ok(STRUCTURED_OVERLAY_TYPES.has('verification'));
    assert.ok(STRUCTURED_OVERLAY_TYPES.has('gate-config'));
    assert.ok(STRUCTURED_OVERLAY_TYPES.has('test-config'));
    assert.ok(!STRUCTURED_OVERLAY_TYPES.has('charter-template'));
    assert.ok(!STRUCTURED_OVERLAY_TYPES.has('spec-template'));
  });

  it('exports deprecated overlay types map', () => {
    assert.ok(DEPRECATED_OVERLAY_TYPES instanceof Map);
    assert.equal(DEPRECATED_OVERLAY_TYPES.size, 2);
    assert.equal(DEPRECATED_OVERLAY_TYPES.get('charter-overlay'), 'charter-template');
    assert.equal(DEPRECATED_OVERLAY_TYPES.get('spec-overlay'), 'spec-template');
  });

  it('exports default domain as software', () => {
    assert.equal(DEFAULT_DOMAIN, 'software');
  });

  it('exports max overlay size as 512KB', () => {
    assert.equal(MAX_OVERLAY_SIZE, 512 * 1024);
  });
});
