/**
 * Shared id-driven overlay application, used by both
 * merge-review-overlay.mjs and merge-validate-overlay.mjs — the two overlay
 * shapes both take are an id list (`enable`/`disable`) or an id->value map
 * (`severity_caps`/`severity_overrides`); both set one field on each named
 * entry in `resultById`, warning (never throwing) on a name absent from
 * `byId`.
 *
 * Pure functions — push onto the caller's `warnings` array, otherwise no
 * side effects beyond mutating the already-cloned entries in `resultById`
 * (never the original `byId` entries).
 *
 * @module lib/risk-tiers/overlay-helpers
 */

/**
 * @param {object} args
 * @param {string[]|undefined} args.ids
 * @param {Map<string, object>} args.byId - original (pre-overlay) entries, existence-check only
 * @param {Map<string, object>} args.resultById - cloned entries to mutate
 * @param {string} args.field - field name to set on each matched entry
 * @param {*} args.value - value to set
 * @param {string} args.overlayKey - overlay field name, for the warning message (e.g. 'enable')
 * @param {string} args.noun - entry kind, for the warning message (e.g. 'reviewer')
 * @param {Array<{code: string, message: string}>} args.warnings
 */
export function applyIdListField({ ids, byId, resultById, field, value, overlayKey, noun, warnings }) {
  for (const id of ids ?? []) {
    if (!byId.has(id)) {
      warnings.push({ code: 'RISK_TIER_OVERLAY_UNKNOWN_ID', message: `Risk tier overlay '${overlayKey}' names unknown ${noun} id "${id}" — skipped.` });
      continue;
    }
    resultById.get(id)[field] = value;
  }
}

/**
 * @param {object} args
 * @param {Record<string, *>|undefined} args.map
 * @param {Map<string, object>} args.byId
 * @param {Map<string, object>} args.resultById
 * @param {string} args.field
 * @param {string} args.overlayKey
 * @param {string} args.noun
 * @param {Array<{code: string, message: string}>} args.warnings
 */
export function applyIdValueMap({ map, byId, resultById, field, overlayKey, noun, warnings }) {
  for (const [id, value] of Object.entries(map ?? {})) {
    if (!byId.has(id)) {
      warnings.push({ code: 'RISK_TIER_OVERLAY_UNKNOWN_ID', message: `Risk tier overlay '${overlayKey}' names unknown ${noun} id "${id}" — skipped.` });
      continue;
    }
    resultById.get(id)[field] = value;
  }
}
