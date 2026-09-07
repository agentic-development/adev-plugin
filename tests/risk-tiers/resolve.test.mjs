import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveRiskTier } from '../../lib/risk-tiers/resolve.mjs';

describe('resolveRiskTier', () => {
  it('defaults to standard when manifest is null', () => {
    assert.deepStrictEqual(resolveRiskTier(null), { resolved_tier: 'standard', source: 'default' });
  });

  it('defaults to standard when manifest has no risk_tier key', () => {
    assert.deepStrictEqual(resolveRiskTier({ domain: 'software' }), { resolved_tier: 'standard', source: 'default' });
  });

  it('resolves an explicit standard tier as source manifest, not default', () => {
    assert.deepStrictEqual(resolveRiskTier({ risk_tier: 'standard' }), { resolved_tier: 'standard', source: 'manifest' });
  });

  it('resolves an explicit prototype tier', () => {
    assert.deepStrictEqual(resolveRiskTier({ risk_tier: 'prototype' }), { resolved_tier: 'prototype', source: 'manifest' });
  });

  it('resolves an explicit regulated tier', () => {
    assert.deepStrictEqual(resolveRiskTier({ risk_tier: 'regulated' }), { resolved_tier: 'regulated', source: 'manifest' });
  });

  it('throws INVALID_RISK_TIER for an unrecognized value', () => {
    assert.throws(() => resolveRiskTier({ risk_tier: 'super-strict' }), (err) => err.code === 'INVALID_RISK_TIER');
  });

  it('throws INVALID_RISK_TIER for a non-string value', () => {
    assert.throws(() => resolveRiskTier({ risk_tier: 42 }), (err) => err.code === 'INVALID_RISK_TIER');
  });
});
