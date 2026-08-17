/**
 * Shared JSON-file read helper for provider adapters.
 *
 * `providers/claude-code/adapter.mjs`, `providers/cursor/adapter.mjs`, and
 * `providers/opencode/adapter.mjs` each carried an identical copy (flagged
 * by /adev:codehealth's duplicate-logic pass). Adapters are always loaded
 * from within this monorepo via `lib/provider/registry.mjs` — the
 * `providers/opencode/` directory is published standalone as `@adev/opencode`,
 * but only `plugin.mjs` (its `package.json` `main`) is that package's
 * external runtime surface; `adapter.mjs` is monorepo-internal tooling only,
 * so depending on `lib/` here does not affect the published package.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/provider/json-io
 */

import { readFileSync } from "node:fs";

/**
 * Read and parse a JSON file. Returns `null` on any failure (missing file,
 * invalid JSON) rather than throwing.
 *
 * @param {string} path
 * @returns {object|null}
 */
export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
