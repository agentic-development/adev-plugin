/**
 * Validate registry tier-overlay merge function.
 *
 * Applies a risk tier's validate overlay (enable/disable/severity_overrides/
 * extra_checks) onto an already-scaffolded `checks` list — the one Step
 * 7d.0 of /adev:init copies verbatim from the resolved domain's starter
 * (validate-config-single-source.spec.md). Risk tier is a patch layer on top
 * of that single-source scaffold, applied once at scaffold time; it does not
 * replace the single-source model, since the result is what gets written to
 * the project's own governance/validate.yaml.
 *
 * Pure function — never mutates inputs, returns a new object.
 *
 * @module lib/risk-tiers/merge-validate-overlay
 */

import { applyIdListField, applyIdValueMap } from './overlay-helpers.mjs';

/**
 * @param {object} validateConfig - Parsed validate.yaml object (`{ checks: [...] }`)
 * @param {object|null} overlay - Tier validate overlay: `{ enable?: string[], disable?: string[], severity_overrides?: Record<string, string>, extra_checks?: object[] }`
 * @returns {{ checks: object[], warnings: Array<{ code: string, message: string }> }}
 */
export function applyValidateTierOverlay(validateConfig, overlay) {
  const warnings = [];
  const checks = Array.isArray(validateConfig?.checks) ? validateConfig.checks : [];

  if (!overlay || typeof overlay !== 'object') {
    return { checks, warnings };
  }

  const byId = new Map(checks.map(entry => [entry.id, entry]));
  const result = checks.map(entry => ({ ...entry }));
  const resultById = new Map(result.map(entry => [entry.id, entry]));

  applyIdListField({ ids: overlay.enable, byId, resultById, field: 'enabled', value: true, overlayKey: 'enable', noun: 'check', warnings });
  applyIdListField({ ids: overlay.disable, byId, resultById, field: 'enabled', value: false, overlayKey: 'disable', noun: 'check', warnings });
  applyIdValueMap({ map: overlay.severity_overrides, byId, resultById, field: 'severity', overlayKey: 'severity_overrides', noun: 'check', warnings });

  for (const extra of overlay.extra_checks ?? []) {
    if (!extra || typeof extra !== 'object' || !extra.id) {
      warnings.push({ code: 'RISK_TIER_OVERLAY_INVALID_EXTRA_CHECK', message: 'Risk tier overlay extra_checks entry missing required id field — skipped.' });
      continue;
    }
    if (resultById.has(extra.id)) {
      warnings.push({ code: 'RISK_TIER_OVERLAY_DUPLICATE_ID', message: `Risk tier overlay extra_checks id "${extra.id}" collides with an existing check — skipped.` });
      continue;
    }
    const entry = { ...extra };
    result.push(entry);
    resultById.set(extra.id, entry);
  }

  return { checks: result, warnings };
}
