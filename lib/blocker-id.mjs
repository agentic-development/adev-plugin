/**
 * Canonical blocker_id emitter.
 *
 * Reviewer subagents emit findings with a stable, deterministic
 * `blocker_id` of the form `<reviewer-slug>:<finding-type>:<location-hash>`
 * so the build auto-retry loop can compare blocker sets across spec
 * revisions (partition into `addressed` / `persistent` / `new`).
 *
 * - `<reviewer-slug>` and `<finding-type>` are kebab-case strings restricted
 *   to `[a-z0-9-]+` (SEC-2 from review-block-auto-retry.spec.md review notes).
 * - `<location-hash>` is the first 8 hex chars of
 *   SHA-256(`<sectionAnchor>:<truncatedFindingText>`).
 *
 * Pure Node.js built-ins — no external dependencies (constitution principle 1).
 *
 * @module lib/blocker-id
 */

import { createHash } from 'node:crypto';

/**
 * Maximum number of characters of finding-text that participate in the
 * location hash. Truncation makes regenerated IDs stable against trailing
 * prose drift while preserving location specificity.
 */
export const BLOCKER_FINDING_TEXT_TRUNCATE = 200;

/** Kebab-case allowlist for blocker_id components (SEC-2). */
const BLOCKER_COMPONENT_ALLOWLIST = /^[a-z0-9-]+$/;

function mkErr(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * Validate a single blocker_id component (reviewer slug or finding type).
 *
 * @param {string} value - candidate component
 * @returns {string} the validated component (unchanged)
 * @throws {Error} with `code === 'INVALID_BLOCKER_ID'` when value is empty,
 *   non-string, or contains characters outside `[a-z0-9-]+`.
 */
export function validateBlockerIdComponent(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw mkErr('INVALID_BLOCKER_ID', 'blocker_id component must be a non-empty string');
  }
  if (!BLOCKER_COMPONENT_ALLOWLIST.test(value)) {
    throw mkErr(
      'INVALID_BLOCKER_ID',
      `blocker_id component "${value}" contains characters outside [a-z0-9-]+`,
    );
  }
  return value;
}

/**
 * Truncate finding text deterministically before hashing.
 *
 * Null/undefined collapse to empty string (the empty case still passes
 * through to the hash and yields a stable digest).
 *
 * @param {string|null|undefined} text
 * @param {number} limit
 * @returns {string}
 */
export function truncateForHash(text, limit = BLOCKER_FINDING_TEXT_TRUNCATE) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  if (str.length <= limit) return str;
  return str.slice(0, limit);
}

/**
 * Build a canonical blocker_id.
 *
 * @param {object} params
 * @param {string} params.reviewer       - reviewer slug (kebab-case)
 * @param {string} params.type           - finding type (kebab-case)
 * @param {string} params.sectionAnchor  - implicated spec section anchor (non-empty)
 * @param {string} params.findingText    - reviewer prose for the finding (non-empty)
 * @returns {string} canonical blocker_id `<reviewer>:<type>:<8-hex-sha-prefix>`
 * @throws {Error} `INVALID_BLOCKER_ID` on any malformed component.
 */
export function buildBlockerId({ reviewer, type, sectionAnchor, findingText } = {}) {
  validateBlockerIdComponent(reviewer);
  validateBlockerIdComponent(type);
  if (typeof sectionAnchor !== 'string' || sectionAnchor.length === 0) {
    throw mkErr('INVALID_BLOCKER_ID', 'sectionAnchor must be a non-empty string');
  }
  if (typeof findingText !== 'string' || findingText.length === 0) {
    throw mkErr('INVALID_BLOCKER_ID', 'findingText must be a non-empty string');
  }
  const truncated = truncateForHash(findingText, BLOCKER_FINDING_TEXT_TRUNCATE);
  const locationHash = createHash('sha256')
    .update(`${sectionAnchor}:${truncated}`)
    .digest('hex')
    .slice(0, 8);
  return `${reviewer}:${type}:${locationHash}`;
}

/**
 * Parse a blocker_id back into its components.
 *
 * @param {string} blockerId
 * @returns {{ reviewer: string, type: string, locationHash: string }}
 * @throws {Error} `INVALID_BLOCKER_ID` if the string does not parse cleanly.
 */
export function parseBlockerId(blockerId) {
  if (typeof blockerId !== 'string' || blockerId.length === 0) {
    throw mkErr('INVALID_BLOCKER_ID', 'blocker_id must be a non-empty string');
  }
  const parts = blockerId.split(':');
  if (parts.length !== 3) {
    throw mkErr('INVALID_BLOCKER_ID', `blocker_id must have exactly two colons: ${blockerId}`);
  }
  const [reviewer, type, locationHash] = parts;
  validateBlockerIdComponent(reviewer);
  validateBlockerIdComponent(type);
  if (!/^[0-9a-f]{8}$/.test(locationHash)) {
    throw mkErr('INVALID_BLOCKER_ID', `location-hash must be 8 lowercase hex chars: ${locationHash}`);
  }
  return { reviewer, type, locationHash };
}
