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

import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";

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
 * Resolve every symlink in `targetPath`, tolerating components that don't
 * exist — unlike `realpathSync`, which throws `ENOENT` the instant ANY part
 * of the chain is missing, including a symlink whose link file exists but
 * whose target doesn't (a dangling symlink). That shape is routine here: a
 * tracked directory symlink can point at a sibling that was never cloned,
 * and a `.githooks/` a caller is about to create doesn't exist yet at all.
 * Both still need their would-be real path evaluated for containment, not
 * just skipped.
 *
 * Algorithm: walk the path one component at a time. A component that exists
 * and isn't a symlink is kept as-is. A symlink is read and its target
 * (resolved against the symlink's own directory, or the filesystem root if
 * absolute) is itself resolved recursively — which is where a chain of
 * symlinks, or a symlink whose target is itself missing, gets handled. A
 * component that doesn't exist at all means nothing under it can exist
 * either, so the remainder of the path is appended literally and resolution
 * stops. `maxDepth` bounds recursion so a symlink cycle fails loudly instead
 * of hanging.
 *
 * @param {string} targetPath
 * @param {number} [depth] - internal recursion guard, do not pass explicitly
 * @returns {string}
 */
export function lenientRealpath(targetPath, depth = 0) {
  if (depth > 40) {
    throw new Error(`too many levels of symbolic links resolving "${targetPath}"`);
  }
  const abs = resolve(targetPath);
  const root = parse(abs).root;
  const parts = abs.slice(root.length).split(sep).filter(Boolean);

  let current = root;
  for (let i = 0; i < parts.length; i++) {
    const candidate = join(current, parts[i]);
    let lst;
    try {
      lst = lstatSync(candidate);
    } catch {
      return parts.slice(i).reduce((acc, part) => join(acc, part), current);
    }
    if (lst.isSymbolicLink()) {
      const link = readlinkSync(candidate);
      const linkTarget = isAbsolute(link) ? link : join(dirname(candidate), link);
      current = lenientRealpath(linkTarget, depth + 1);
    } else {
      current = candidate;
    }
  }
  return current;
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
