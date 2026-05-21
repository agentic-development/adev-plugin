// lib/retro/issue-id-validation.mjs
//
// SEC-B2 defense-in-depth: validate `issue` / `epic` frontmatter values
// before any board lookup. Combines a strict charset check with the
// recognition rules from lib/issues/id-utils.mjs::parseId so that random
// strings passing the charset filter still cannot trigger board lookups
// for unknown id shapes.
//
// Returns `{ ok, normalized, reason }`:
//   - ok: boolean — true iff charset passes AND parseId recognizes the id
//   - normalized: string | null — the validated id (= input on success)
//   - reason: 'type' | 'charset' | 'unrecognized' | null

import { parseId } from '../issues/id-utils.mjs';

/** Restrictive charset: lowercase alphanumerics, dot, hyphen; 1..64 chars; must start alnum. */
const CHARSET_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/**
 * Validate an issue/epic id value taken from session frontmatter.
 *
 * @param {unknown} value
 * @returns {{ ok: boolean, normalized: string|null, reason: 'type'|'charset'|'unrecognized'|null }}
 */
export function validateIssueId(value) {
  if (typeof value !== 'string') {
    return { ok: false, normalized: null, reason: 'type' };
  }
  if (!CHARSET_RE.test(value)) {
    return { ok: false, normalized: null, reason: 'charset' };
  }
  if (!parseId(value)) {
    return { ok: false, normalized: null, reason: 'unrecognized' };
  }
  return { ok: true, normalized: value, reason: null };
}
