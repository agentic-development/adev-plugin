/**
 * Review registry tier-overlay merge function.
 *
 * Applies a risk tier's review overlay (enable/disable/severity_caps) onto an
 * already-resolved reviewers list — the same list `mergeReviewers()`
 * (lib/domains/merge-reviewers.mjs) produces from the domain + governance
 * layers. Risk tier is a third, later layer: it wins on conflicting fields
 * for entries it names, and leaves every other entry untouched.
 *
 * Pure function — never mutates inputs, returns a new array.
 *
 * @module lib/risk-tiers/merge-review-overlay
 */

import { applyIdListField, applyIdValueMap } from './overlay-helpers.mjs';

/**
 * @param {object[]} reviewers - Resolved reviewer entries (each has an `id`)
 * @param {object|null} overlay - Tier review overlay: `{ enable?: string[], disable?: string[], severity_caps?: Record<string, string> }`
 * @returns {{ reviewers: object[], warnings: Array<{ code: string, message: string }> }}
 */
export function applyReviewTierOverlay(reviewers, overlay) {
  const warnings = [];
  const list = Array.isArray(reviewers) ? reviewers : [];

  if (!overlay || typeof overlay !== 'object') {
    return { reviewers: list, warnings };
  }

  const byId = new Map(list.map(entry => [entry.id, entry]));
  const result = list.map(entry => ({ ...entry }));
  const resultById = new Map(result.map(entry => [entry.id, entry]));

  applyIdListField({ ids: overlay.enable, byId, resultById, field: 'enabled', value: true, overlayKey: 'enable', noun: 'reviewer', warnings });
  applyIdListField({ ids: overlay.disable, byId, resultById, field: 'enabled', value: false, overlayKey: 'disable', noun: 'reviewer', warnings });
  applyIdValueMap({ map: overlay.severity_caps, byId, resultById, field: 'severity_cap', overlayKey: 'severity_caps', noun: 'reviewer', warnings });

  return { reviewers: result, warnings };
}
