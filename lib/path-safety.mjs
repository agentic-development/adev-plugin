/**
 * Shared filesystem path-safety primitives.
 *
 * Two small, pure helpers were independently reimplemented (identically)
 * across a dozen-plus modules (flagged by /adev:codehealth's duplicate-logic
 * pass) — consolidated here so the shape has one definition:
 *
 *  - `resolveContained` — resolve a relative path against a root and confirm
 *    the result stays inside that root (returns `null` on escape).
 *  - `safeRealpath` — resolve symlinks via `fs.realpathSync`, falling back to
 *    the literal input path when the target doesn't exist yet (or any other
 *    `realpathSync` failure) rather than throwing.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/path-safety
 */

import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

/**
 * Resolve `relPath` against `absRoot` and confirm the result is contained
 * within `absRoot` (i.e. equal to it, or nested beneath it).
 *
 * @param {string} absRoot - absolute containment boundary
 * @param {string} relPath - path to resolve (absolute or relative to absRoot)
 * @returns {string|null} the resolved absolute path, or `null` if it escapes `absRoot`
 */
export function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

/**
 * Resolve a path to its real (symlink-free) path, tolerating paths that
 * don't exist yet (or any other `realpathSync` failure) by returning the
 * literal input unchanged.
 *
 * @param {string} p
 * @returns {string}
 */
export function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * True iff `child` is `root` itself or a strict descendant of `root`.
 *
 * Trailing-slash safety: appends `sep` to `root` before comparison so
 * `/foo/templates-evil/x` does NOT match the prefix `/foo/templates`.
 *
 * Unlike `resolveContained`, this does not resolve `child` against `root` —
 * both arguments must already be absolute (and typically real-pathed, so
 * symlink escapes are also caught).
 *
 * @param {string} child
 * @param {string} root
 * @returns {boolean}
 */
export function isContained(child, root) {
  if (child === root) return true;
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return child.startsWith(rootWithSep);
}
