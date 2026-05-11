import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkVersionCompatibility } from '../../../lib/extensions/version-check.mjs';

describe('extensions/version-check', () => {
  it('passes when requires is null', () => {
    const result = checkVersionCompatibility(null, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('passes when requires is undefined', () => {
    const result = checkVersionCompatibility(undefined, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('passes when requires.adev is absent', () => {
    const result = checkVersionCompatibility({}, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('passes when installed version satisfies >= range', () => {
    const result = checkVersionCompatibility({ adev: '>=0.20.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('fails when installed version does not satisfy >= range', () => {
    const result = checkVersionCompatibility({ adev: '>=1.0.0' }, '0.22.0');
    assert.equal(result.compatible, false);
    assert.equal(result.code, 'INCOMPATIBLE_VERSION');
    assert.ok(result.message.includes('>=1.0.0'));
    assert.ok(result.message.includes('0.22.0'));
  });

  it('passes with exact version match', () => {
    const result = checkVersionCompatibility({ adev: '0.22.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('fails with exact version mismatch', () => {
    const result = checkVersionCompatibility({ adev: '0.22.0' }, '0.23.0');
    assert.equal(result.compatible, false);
    assert.equal(result.code, 'INCOMPATIBLE_VERSION');
  });

  it('passes with caret range (minor bump)', () => {
    const result = checkVersionCompatibility({ adev: '^0.22.0' }, '0.22.5');
    assert.equal(result.compatible, true);
  });

  it('fails with caret range when major.minor differs (0.x)', () => {
    // For ^0.22.0, only 0.22.x matches (caret behavior for 0.x)
    const result = checkVersionCompatibility({ adev: '^0.22.0' }, '0.23.0');
    assert.equal(result.compatible, false);
  });

  it('passes with caret range for 1.x (major match)', () => {
    const result = checkVersionCompatibility({ adev: '^1.0.0' }, '1.5.0');
    assert.equal(result.compatible, true);
  });

  it('fails with caret range when major differs (1.x)', () => {
    const result = checkVersionCompatibility({ adev: '^1.0.0' }, '2.0.0');
    assert.equal(result.compatible, false);
  });

  it('passes with tilde range (patch bump)', () => {
    const result = checkVersionCompatibility({ adev: '~0.22.0' }, '0.22.5');
    assert.equal(result.compatible, true);
  });

  it('fails with tilde range when minor differs', () => {
    const result = checkVersionCompatibility({ adev: '~0.22.0' }, '0.23.0');
    assert.equal(result.compatible, false);
  });

  it('passes with <= range', () => {
    const result = checkVersionCompatibility({ adev: '<=1.0.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('fails with <= range when version exceeds', () => {
    const result = checkVersionCompatibility({ adev: '<=0.20.0' }, '0.22.0');
    assert.equal(result.compatible, false);
  });

  it('passes with > range', () => {
    const result = checkVersionCompatibility({ adev: '>0.20.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });

  it('fails with > range on exact match', () => {
    const result = checkVersionCompatibility({ adev: '>0.22.0' }, '0.22.0');
    assert.equal(result.compatible, false);
  });

  it('passes with < range', () => {
    const result = checkVersionCompatibility({ adev: '<1.0.0' }, '0.22.0');
    assert.equal(result.compatible, true);
  });
});
