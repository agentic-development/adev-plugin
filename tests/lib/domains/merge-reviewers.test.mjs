import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mergeReviewers } from '../../../lib/domains/merge-reviewers.mjs';

describe('mergeReviewers', () => {
  it('should merge domain and governance reviewers (append mode)', () => {
    const domain = { reviewers: [{ id: 'r1', dispatch: 'always' }] };
    const governance = { reviewers: [{ id: 'g1', dispatch: 'triggered' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 2);
  });

  it('should override domain reviewer when governance has same id', () => {
    const domain = { reviewers: [{ id: 'r1', dispatch: 'always' }] };
    const governance = { reviewers: [{ id: 'r1', dispatch: 'triggered' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 1);
    assert.equal(result.reviewers[0].dispatch, 'triggered');
    assert.equal(result.reviewers[0].__source, 'governance');
  });

  it('should use replace strategy to drop base reviewers', () => {
    const domain = { reviewers: [{ id: 'r1' }], merge_strategy: 'replace' };
    const governance = { reviewers: [{ id: 'g1' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers.length, 2);
    assert.ok(result.warnings.some(w => w.message.includes('replaced base reviewers')));
  });

  it('should skip entries missing id with DOMAIN_CONFIG_MERGE_WARN', () => {
    const domain = { reviewers: [{ dispatch: 'always' }, { id: 'r1' }] };
    const result = mergeReviewers(domain, null);
    assert.equal(result.reviewers.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'DOMAIN_CONFIG_MERGE_WARN'));
  });

  it('should treat unknown merge_strategy as append with warning', () => {
    const domain = { reviewers: [{ id: 'r1' }], merge_strategy: 'invalid' };
    const result = mergeReviewers(domain, null);
    assert.equal(result.reviewers.length, 1);
    assert.ok(result.warnings.some(w => w.code === 'DOMAIN_CONFIG_MERGE_WARN'));
  });

  it('should apply defaults for missing optional fields', () => {
    const domain = { reviewers: [{ id: 'r1' }] };
    const result = mergeReviewers(domain, null);
    assert.equal(result.reviewers[0].dispatch, 'always');
    assert.equal(result.reviewers[0].profile, 'reviewer-capable');
    assert.equal(result.reviewers[0].severity_cap, 'blocker');
    assert.equal(result.reviewers[0].context_pack, 'base');
  });

  it('should track entry provenance (__source)', () => {
    const domain = { reviewers: [{ id: 'r1' }] };
    const governance = { reviewers: [{ id: 'g1' }] };
    const result = mergeReviewers(domain, governance);
    assert.equal(result.reviewers[0].__source, 'domain');
    assert.equal(result.reviewers[1].__source, 'governance');
  });

  it('should handle null domain and null governance', () => {
    const result = mergeReviewers(null, null);
    assert.equal(result.reviewers.length, 0);
    assert.ok(result.warnings.length > 0);
  });

  it('should return new object, never mutate inputs', () => {
    const domain = Object.freeze({ reviewers: Object.freeze([Object.freeze({ id: 'r1' })]) });
    const governance = Object.freeze({ reviewers: Object.freeze([Object.freeze({ id: 'g1' })]) });
    assert.doesNotThrow(() => mergeReviewers(domain, governance));
  });
});
