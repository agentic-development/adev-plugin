import { describe, it, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { loadRiskTierConfig } from '../../lib/risk-tiers/tier-config.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const PLUGIN_ROOT = join(import.meta.dirname, '..', '..');

describe('loadRiskTierConfig', () => {
  it('resolves standard risk-policies to the legacy fixed template path', () => {
    const config = loadRiskTierConfig('standard', 'risk-policies', PLUGIN_ROOT);
    assert.ok(config && typeof config === 'object');
    assert.ok(config.policies.high);
    assert.equal(config.policies.high.test_depth, 'thorough');
  });

  it('returns null for standard tier overlays (no overlay files exist)', () => {
    assert.equal(loadRiskTierConfig('standard', 'review-overlay', PLUGIN_ROOT), null);
    assert.equal(loadRiskTierConfig('standard', 'validate-overlay', PLUGIN_ROOT), null);
  });

  it('resolves prototype risk-policies from templates/risk-tiers/prototype/', () => {
    const config = loadRiskTierConfig('prototype', 'risk-policies', PLUGIN_ROOT);
    assert.equal(config.policies.high.review_mode, 'quick');
    assert.equal(config.policies.high.require_hitl_approval, false);
  });

  it('resolves prototype review-overlay', () => {
    const overlay = loadRiskTierConfig('prototype', 'review-overlay', PLUGIN_ROOT);
    assert.equal(overlay.severity_caps['referent-integrity'], 'warning');
  });

  it('resolves prototype validate-overlay', () => {
    const overlay = loadRiskTierConfig('prototype', 'validate-overlay', PLUGIN_ROOT);
    assert.ok(overlay.disable.includes('validate.check-11-visual-verification'));
  });

  it('resolves regulated risk-policies with full rigor', () => {
    const config = loadRiskTierConfig('regulated', 'risk-policies', PLUGIN_ROOT);
    assert.equal(config.policies.low.require_hitl_approval, true);
    assert.equal(config.policies.low.test_depth, 'thorough');
  });

  it('resolves regulated review-overlay', () => {
    const overlay = loadRiskTierConfig('regulated', 'review-overlay', PLUGIN_ROOT);
    assert.deepStrictEqual(overlay.enable, ['structural-architect', 'security-reviewer']);
  });

  it('resolves regulated validate-overlay with extra_checks', () => {
    const overlay = loadRiskTierConfig('regulated', 'validate-overlay', PLUGIN_ROOT);
    assert.equal(overlay.extra_checks[0].id, 'project.regulated-compliance');
  });

  it('throws INVALID_RISK_TIER_ARG for an unrecognized tier', () => {
    assert.throws(() => loadRiskTierConfig('nope', 'risk-policies', PLUGIN_ROOT), (err) => err.code === 'INVALID_RISK_TIER_ARG');
  });

  it('returns null for an unrecognized config type', () => {
    assert.equal(loadRiskTierConfig('standard', 'not-a-real-type', PLUGIN_ROOT), null);
  });
});

describe('loadRiskTierConfig — error cases (fake plugin root)', () => {
  it('throws RISK_TIER_CONFIG_PARSE_ERROR for malformed YAML with plugin-relative path', () => {
    const fakePluginRoot = createTempDir();
    writeFixture(fakePluginRoot, 'templates/risk-tiers/prototype/review-overlay.yaml', 'severity_caps:\n  - id: test\n bad-indent: oops');
    assert.throws(
      () => loadRiskTierConfig('prototype', 'review-overlay', fakePluginRoot),
      (err) => err.code === 'RISK_TIER_CONFIG_PARSE_ERROR' &&
        err.message.includes('templates/risk-tiers/prototype/review-overlay.yaml')
    );
    cleanupTempDir(fakePluginRoot);
  });

  it('throws RISK_TIER_CONFIG_TOO_LARGE for files exceeding 512KB', () => {
    const fakePluginRoot = createTempDir();
    const largeContent = 'x'.repeat(512 * 1024 + 1);
    writeFixture(fakePluginRoot, 'templates/risk-tiers/regulated/validate-overlay.yaml', largeContent);
    assert.throws(
      () => loadRiskTierConfig('regulated', 'validate-overlay', fakePluginRoot),
      (err) => err.code === 'RISK_TIER_CONFIG_TOO_LARGE'
    );
    cleanupTempDir(fakePluginRoot);
  });

  it('returns empty object for an empty overlay file', () => {
    const fakePluginRoot = createTempDir();
    writeFixture(fakePluginRoot, 'templates/risk-tiers/prototype/review-overlay.yaml', '');
    const result = loadRiskTierConfig('prototype', 'review-overlay', fakePluginRoot);
    assert.deepEqual(result, {});
    cleanupTempDir(fakePluginRoot);
  });
});
