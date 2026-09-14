import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyReviewTierOverlay } from '../../lib/risk-tiers/merge-review-overlay.mjs';

const BASE_REVIEWERS = [
  { id: 'referent-integrity', severity_cap: 'blocker' },
  { id: 'structural-architect', severity_cap: 'blocker', enabled: false },
  { id: 'security-reviewer', severity_cap: 'blocker', enabled: false },
];

describe('applyReviewTierOverlay', () => {
  it('returns the input list unchanged when overlay is null', () => {
    const { reviewers, warnings } = applyReviewTierOverlay(BASE_REVIEWERS, null);
    assert.deepStrictEqual(reviewers, BASE_REVIEWERS);
    assert.deepStrictEqual(warnings, []);
  });

  it('enables named reviewers without dropping untouched ones', () => {
    const { reviewers, warnings } = applyReviewTierOverlay(BASE_REVIEWERS, {
      enable: ['structural-architect', 'security-reviewer'],
    });
    assert.equal(reviewers.length, 3);
    assert.equal(reviewers.find(r => r.id === 'structural-architect').enabled, true);
    assert.equal(reviewers.find(r => r.id === 'security-reviewer').enabled, true);
    assert.equal(reviewers.find(r => r.id === 'referent-integrity').enabled, undefined);
    assert.deepStrictEqual(warnings, []);
  });

  it('disables named reviewers', () => {
    const { reviewers } = applyReviewTierOverlay(BASE_REVIEWERS, { disable: ['referent-integrity'] });
    assert.equal(reviewers.find(r => r.id === 'referent-integrity').enabled, false);
  });

  it('overrides severity_cap for named reviewers', () => {
    const { reviewers } = applyReviewTierOverlay(BASE_REVIEWERS, {
      severity_caps: { 'referent-integrity': 'warning' },
    });
    assert.equal(reviewers.find(r => r.id === 'referent-integrity').severity_cap, 'warning');
    assert.equal(reviewers.find(r => r.id === 'structural-architect').severity_cap, 'blocker');
  });

  it('warns and skips unknown ids without throwing', () => {
    const { reviewers, warnings } = applyReviewTierOverlay(BASE_REVIEWERS, { enable: ['not-a-real-reviewer'] });
    assert.equal(reviewers.length, 3);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'RISK_TIER_OVERLAY_UNKNOWN_ID');
  });

  it('never mutates the input array or its entries', () => {
    const snapshot = JSON.parse(JSON.stringify(BASE_REVIEWERS));
    applyReviewTierOverlay(BASE_REVIEWERS, { enable: ['structural-architect'] });
    assert.deepStrictEqual(BASE_REVIEWERS, snapshot);
  });
});
