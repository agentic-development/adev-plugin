/**
 * Idempotent unlink: removes a file, tolerating the case where it's already
 * gone (`ENOENT`) rather than throwing. Any other error still propagates.
 *
 * `lib/plan-routing-sidecar.mjs` (`unlinkSidecarTmp`) and `lib/cli/partial.mjs`
 * (`safeUnlink`) each carried an identical copy (flagged by /adev:codehealth's
 * duplicate-logic pass) — both use it to clean up a leftover temp file after
 * a failed write, where "already gone" is a success case, not an error.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/safe-unlink
 */

import { unlinkSync } from "node:fs";

/**
 * @param {string} path
 */
export function safeUnlink(path) {
  try {
    unlinkSync(path);
  } catch (err) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}
