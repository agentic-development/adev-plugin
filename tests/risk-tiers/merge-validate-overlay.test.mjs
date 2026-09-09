import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyValidateTierOverlay } from '../../lib/risk-tiers/merge-validate-overlay.mjs';

const BASE_VALIDATE = {
  checks: [
    { id: 'validate.check-2-spec-compliance', severity: 'error' },
    { id: 'validate.check-11-visual-verification', severity: 'warning' },
  ],
};

describe('applyValidateTierOverlay', () => {
  it('returns the checks list unchanged when overlay is null', () => {
    const { checks, warnings } = applyValidateTierOverlay(BASE_VALIDATE, null);
    assert.deepStrictEqual(checks, BASE_VALIDATE.checks);
    assert.deepStrictEqual(warnings, []);
  });

  it('disables named checks without dropping untouched ones', () => {
    const { checks } = applyValidateTierOverlay(BASE_VALIDATE, { disable: ['validate.check-11-visual-verification'] });
    assert.equal(checks.length, 2);
    assert.equal(checks.find(c => c.id === 'validate.check-11-visual-verification').enabled, false);
    assert.equal(checks.find(c => c.id === 'validate.check-2-spec-compliance').enabled, undefined);
  });

  it('overrides severity for named checks', () => {
    const { checks } = applyValidateTierOverlay(BASE_VALIDATE, {
      severity_overrides: { 'validate.check-2-spec-compliance': 'warning' },
    });
    assert.equal(checks.find(c => c.id === 'validate.check-2-spec-compliance').severity, 'warning');
    assert.equal(checks.find(c => c.id === 'validate.check-11-visual-verification').severity, 'warning');
  });

  it('appends extra_checks that do not collide with existing ids', () => {
    const { checks, warnings } = applyValidateTierOverlay(BASE_VALIDATE, {
      extra_checks: [{ id: 'project.strict-compliance', kind: 'subagent-review' }],
    });
    assert.equal(checks.length, 3);
    assert.ok(checks.find(c => c.id === 'project.strict-compliance'));
    assert.deepStrictEqual(warnings, []);
  });

  it('warns and skips an extra_checks entry colliding with an existing id', () => {
    const { checks, warnings } = applyValidateTierOverlay(BASE_VALIDATE, {
      extra_checks: [{ id: 'validate.check-2-spec-compliance', kind: 'quality-gate' }],
    });
    assert.equal(checks.length, 2);
    assert.equal(warnings[0].code, 'RISK_TIER_OVERLAY_DUPLICATE_ID');
  });

  it('warns and skips a second extra_checks entry colliding with an earlier one in the same overlay', () => {
    const { checks, warnings } = applyValidateTierOverlay(BASE_VALIDATE, {
      extra_checks: [
        { id: 'project.strict-compliance', kind: 'subagent-review' },
        { id: 'project.strict-compliance', kind: 'quality-gate' },
      ],
    });
    assert.equal(checks.length, 3);
    assert.equal(checks.filter(c => c.id === 'project.strict-compliance').length, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'RISK_TIER_OVERLAY_DUPLICATE_ID');
  });

  it('warns and skips an extra_checks entry missing an id', () => {
    const { checks, warnings } = applyValidateTierOverlay(BASE_VALIDATE, { extra_checks: [{ kind: 'quality-gate' }] });
    assert.equal(checks.length, 2);
    assert.equal(warnings[0].code, 'RISK_TIER_OVERLAY_INVALID_EXTRA_CHECK');
  });

  it('warns and skips unknown ids in enable/disable/severity_overrides', () => {
    const { warnings } = applyValidateTierOverlay(BASE_VALIDATE, {
      enable: ['nope'],
      disable: ['also-nope'],
      severity_overrides: { 'still-nope': 'error' },
    });
    assert.equal(warnings.length, 3);
    assert.ok(warnings.every(w => w.code === 'RISK_TIER_OVERLAY_UNKNOWN_ID'));
  });

  it('never mutates the input', () => {
    const snapshot = JSON.parse(JSON.stringify(BASE_VALIDATE));
    applyValidateTierOverlay(BASE_VALIDATE, { disable: ['validate.check-11-visual-verification'] });
    assert.deepStrictEqual(BASE_VALIDATE, snapshot);
  });
});
