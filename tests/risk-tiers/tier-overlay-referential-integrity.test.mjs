/**
 * Verifies the bundled tier overlays only name ids that actually exist in the
 * bundled software domain's reviewers.yaml / validate.yaml — the same
 * end-to-end path Step 7c.0 / Step 7d.0 of /adev:init exercises. A tier
 * overlay naming a stale or misspelled id would silently no-op (with a
 * warning) rather than fail loudly, so this test catches drift between the
 * tier bundles and the domain bundle they're applied on top of.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { loadDomainConfig } from '../../lib/domains/domain-config.mjs';
import { loadRiskTierConfig } from '../../lib/risk-tiers/tier-config.mjs';
import { applyReviewTierOverlay } from '../../lib/risk-tiers/merge-review-overlay.mjs';
import { applyValidateTierOverlay } from '../../lib/risk-tiers/merge-validate-overlay.mjs';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');
const softwareReviewers = loadDomainConfig('software', 'reviewers', PLUGIN_ROOT, PLUGIN_ROOT).reviewers;
const softwareValidate = loadDomainConfig('software', 'validate', PLUGIN_ROOT, PLUGIN_ROOT);

describe('tier overlays vs. bundled software domain', () => {
  for (const tier of ['prototype', 'regulated']) {
    it(`${tier} review-overlay names only real reviewer ids`, () => {
      const overlay = loadRiskTierConfig(tier, 'review-overlay', PLUGIN_ROOT);
      const { warnings } = applyReviewTierOverlay(softwareReviewers, overlay);
      assert.deepStrictEqual(warnings, []);
    });

    it(`${tier} validate-overlay names only real check ids`, () => {
      const overlay = loadRiskTierConfig(tier, 'validate-overlay', PLUGIN_ROOT);
      const { warnings } = applyValidateTierOverlay(softwareValidate, overlay);
      assert.deepStrictEqual(warnings, []);
    });
  }

  it('regulated review-overlay re-enables reviewers the domain disabled by default', () => {
    const overlay = loadRiskTierConfig('regulated', 'review-overlay', PLUGIN_ROOT);
    const { reviewers } = applyReviewTierOverlay(softwareReviewers, overlay);
    for (const id of overlay.enable) {
      assert.equal(reviewers.find(r => r.id === id).enabled, true);
    }
    // Every other bundled reviewer must survive untouched in the full result.
    assert.equal(reviewers.length, softwareReviewers.length);
  });
});
