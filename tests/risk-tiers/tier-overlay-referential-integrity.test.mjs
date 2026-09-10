/**
 * Verifies the bundled tier overlays only name ids that actually exist in the
 * bundled software domain's reviewers.yaml / validate.yaml. A tier overlay
 * naming a stale or misspelled id would silently no-op (with a warning)
 * rather than fail loudly, so this test catches drift between the tier
 * bundles and the domain bundle they're applied on top of.
 *
 * Two cases are covered, both exercised by /adev:init Step 7c.0 / Step 7d.0:
 * the full-bundle case above (every id present — the overlay's own
 * referential integrity against the domain bundle) and the partial-selection
 * case below (the operator selected only a subset at Step 7c/7d sub-step 3 —
 * governance-opt-in-dispatch.spec.md BEH-6 — so an overlay target outside
 * that subset must surface RISK_TIER_OVERLAY_UNKNOWN_ID rather than silently
 * doing nothing).
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
  for (const tier of ['prototype', 'strict']) {
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

  it('strict review-overlay re-enables reviewers the domain disabled by default', () => {
    const overlay = loadRiskTierConfig('strict', 'review-overlay', PLUGIN_ROOT);
    const { reviewers } = applyReviewTierOverlay(softwareReviewers, overlay);
    for (const id of overlay.enable) {
      assert.equal(reviewers.find(r => r.id === id).enabled, true);
    }
    // Every other bundled reviewer must survive untouched in the full result.
    assert.equal(reviewers.length, softwareReviewers.length);
  });
});

describe('tier overlays vs. a partial operator selection', () => {
  it('strict review-overlay warns exactly once, naming the id the operator did not select', () => {
    const removedId = 'structural-architect'; // named in strict's `enable:` list
    const partial = softwareReviewers.filter(r => r.id !== removedId);
    const overlay = loadRiskTierConfig('strict', 'review-overlay', PLUGIN_ROOT);
    const { reviewers, warnings } = applyReviewTierOverlay(partial, overlay);

    const unknownIdWarnings = warnings.filter(w => w.code === 'RISK_TIER_OVERLAY_UNKNOWN_ID');
    assert.equal(unknownIdWarnings.length, 1);
    assert.match(unknownIdWarnings[0].message, new RegExp(removedId));

    // security-reviewer (the overlay's other `enable:` target) IS in the partial
    // selection and still gets re-enabled; every other kept entry is untouched.
    assert.equal(reviewers.find(r => r.id === 'security-reviewer').enabled, true);
    assert.equal(reviewers.length, partial.length);
  });

  it('prototype review-overlay (severity_caps path) warns exactly once, naming the id the operator did not select', () => {
    const removedId = 'termination-reviewer'; // named in prototype's `severity_caps:` map
    // Exercises applyIdValueMap (severity_caps), the other overlay-application path
    // from the strict case above (applyIdListField, via strict's `enable:`).
    const partial = softwareReviewers.filter(r => r.id !== removedId);
    const overlay = loadRiskTierConfig('prototype', 'review-overlay', PLUGIN_ROOT);
    const { reviewers, warnings } = applyReviewTierOverlay(partial, overlay);

    const unknownIdWarnings = warnings.filter(w => w.code === 'RISK_TIER_OVERLAY_UNKNOWN_ID');
    assert.equal(unknownIdWarnings.length, 1);
    assert.match(unknownIdWarnings[0].message, new RegExp(removedId));
    assert.equal(reviewers.length, partial.length);
  });
});
