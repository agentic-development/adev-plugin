/**
 * Risk tier constants.
 *
 * Central registry of tier names, overlay config types/filenames, and the
 * legacy "standard" fallback path. Risk tier is a project-level axis
 * orthogonal to domain (lib/domains/) — it selects how much scrutiny a
 * project's governance bundle applies, not what kind of software it is.
 *
 * @module lib/risk-tiers/constants
 */

/** Valid risk tier names (closed set). */
export const RISK_TIER_NAMES = new Set(['prototype', 'standard', 'regulated']);

/** Default tier when a project has no `risk_tier` key in manifest.yaml. */
export const DEFAULT_RISK_TIER = 'standard';

/** Valid risk tier overlay config type identifiers (closed set). */
export const RISK_TIER_CONFIG_TYPES = new Set([
  'risk-policies',
  'review-overlay',
  'validate-overlay',
]);

/** Map risk tier config type -> filename on disk. */
export const RISK_TIER_CONFIG_FILENAMES = new Map([
  ['risk-policies', 'risk-policies.yaml'],
  ['review-overlay', 'review-overlay.yaml'],
  ['validate-overlay', 'validate-overlay.yaml'],
]);

/**
 * The "standard" tier is the framework's original, unconditional default —
 * it predates tier selection, so its risk-policies content lives at the
 * legacy fixed path rather than under templates/risk-tiers/standard/, and it
 * has no overlay files (an unmodified bundled default IS the standard tier).
 */
export const STANDARD_TIER_LEGACY_RISK_POLICIES_PATH = ['templates', 'risk-policies-template.yaml'];

/** Risk tier name validation pattern: lowercase alphanumeric + hyphens, no path chars. */
export const RISK_TIER_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Max risk tier config file size in bytes (parity with lib/domains/constants.mjs). */
export const MAX_RISK_TIER_CONFIG_SIZE = 512 * 1024;
