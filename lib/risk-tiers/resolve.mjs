/**
 * Risk tier resolution function.
 *
 * Resolves the active project risk tier from the top-level `risk_tier` key in
 * manifest.yaml. Unlike domain resolution (lib/domains/resolve.mjs), risk
 * tier has no charter/module precedence chain: the issue that motivated this
 * module frames risk tier as the operator characterizing the PROJECT's
 * overall posture, a single project-wide setting, not something that varies
 * per spec or module.
 *
 * Pure function — deterministic, no side effects, no file I/O.
 *
 * @module lib/risk-tiers/resolve
 */

import { RISK_TIER_NAMES, DEFAULT_RISK_TIER, RISK_TIER_NAME_PATTERN } from './constants.mjs';

/**
 * @param {object|null} manifest - Pre-parsed manifest.yaml object
 * @returns {{ resolved_tier: string, source: "manifest"|"default" }}
 */
export function resolveRiskTier(manifest) {
  const value = manifest?.risk_tier;

  if (value === undefined || value === null) {
    return { resolved_tier: DEFAULT_RISK_TIER, source: 'default' };
  }

  validateRiskTierName(value);
  return { resolved_tier: value, source: 'manifest' };
}

/**
 * Validate a risk tier name against the allowed pattern and closed set.
 * @param {string} name
 * @throws {Error} With code INVALID_RISK_TIER
 */
function validateRiskTierName(name) {
  if (typeof name !== 'string' || !RISK_TIER_NAME_PATTERN.test(name) || !RISK_TIER_NAMES.has(name)) {
    const err = new Error(
      `INVALID_RISK_TIER: manifest.yaml risk_tier value "${name}" is not one of: ${[...RISK_TIER_NAMES].join(', ')}.`
    );
    err.code = 'INVALID_RISK_TIER';
    throw err;
  }
}
