/**
 * lib/partial-artifact.mjs
 *
 * Pure helpers implementing the `.partial` + atomic-rename pattern
 * for agent-authored artifacts.
 *
 * Spec: .context-index/specs/cross-cutting/incremental-artifact-writes.spec.md (rev 2)
 *
 * Public surface (extended across Tasks 2-5, 7):
 *   - partialPath(finalPath)         → '<finalPath>.partial'
 *   - lockPath(finalPath)            → '<finalPath>.partial.lock'
 *   - commitPartial(finalPath)       → atomic rename `.partial` → final
 *   - assertWithin(baseDir, target, errCode?) → containment check
 *
 * Constitution alignment:
 *   - Principle 1 (no external deps): uses only `node:fs` + `node:path`.
 *   - Principle 3 (pure ESM): `.mjs`, named exports.
 *
 * Path-containment discipline mirrors `lib/issues/json-adapter.mjs::assertWithin`
 * (lines 97-109 in that file at the time of authoring). The default error
 * code on rejection is `INVALID_PARTIAL_PATH` per spec error-codes table.
 */

import { renameSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * Append `.partial` to a path. Pure function; does not touch the filesystem.
 *
 * @param {string} finalPath - The canonical (post-commit) artifact path.
 * @returns {string} `<finalPath>.partial`
 */
export function partialPath(finalPath) {
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  return `${finalPath}.partial`;
}

/**
 * Compute the sidecar lock path for a `.partial` artifact.
 * Pure function; does not touch the filesystem.
 *
 * @param {string} finalPath - The canonical (post-commit) artifact path.
 * @returns {string} `<finalPath>.partial.lock`
 */
export function lockPath(finalPath) {
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  return `${finalPath}.partial.lock`;
}

/**
 * Atomically rename `<finalPath>.partial` to `<finalPath>`. This is the
 * artifact's "commit" signal per Behavior 2 of the spec.
 *
 * Atomicity: POSIX guarantees same-filesystem `rename(2)` is atomic.
 * Windows: `fs.renameSync` uses `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`,
 * also atomic. Any reader sees either the prior `<finalPath>` content,
 * the new content, or both filenames briefly (during the rename window) —
 * never a half-written final file.
 *
 * The caller is responsible for unlinking `<finalPath>.partial.lock` after
 * a successful commit (Behavior 2). This function does not touch the lock.
 *
 * @param {string} finalPath - The canonical artifact path.
 * @returns {string} `finalPath` (for chaining).
 * @throws {Error} `ENOENT` if `<finalPath>.partial` does not exist.
 * @throws {Error} Other `fs` errors (`EACCES`, `EXDEV`, ...) surface unchanged.
 */
export function commitPartial(finalPath) {
  if (typeof finalPath !== "string" || finalPath.length === 0) {
    throw new TypeError("finalPath must be a non-empty string");
  }
  renameSync(partialPath(finalPath), finalPath);
  return finalPath;
}

/**
 * Enforce path containment: `target` must resolve under `baseDir`. Both
 * arguments may be relative; both are resolved via `path.resolve()` before
 * comparison. Mirrors `lib/issues/json-adapter.mjs::assertWithin` (the
 * canonical pattern in this codebase) and uses `INVALID_PARTIAL_PATH`
 * by default per the spec's error-codes table.
 *
 * Containment rule: `resolvedTarget === resolvedBase`, OR
 * `resolvedTarget` starts with `resolvedBase + path.sep`. This defeats
 * naive `startsWith` aliasing where `/foo/barbaz` would otherwise match
 * `/foo/bar` as a "containment".
 *
 * @param {string} baseDir   - The containment root.
 * @param {string} target    - The path to validate.
 * @param {string} [errCode] - Override the default error code.
 * @returns {string} The resolved (absolute) target path.
 * @throws {Error} `err.code = errCode` when `target` escapes `baseDir`.
 */
export function assertWithin(baseDir, target, errCode = "INVALID_PARTIAL_PATH") {
  if (typeof baseDir !== "string" || baseDir.length === 0) {
    const err = new Error("baseDir must be a non-empty string path");
    err.code = errCode;
    throw err;
  }
  if (typeof target !== "string" || target.length === 0) {
    const err = new Error("target must be a non-empty string path");
    err.code = errCode;
    throw err;
  }
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(target);
  const prefix = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  if (!(resolvedTarget === resolvedBase || resolvedTarget.startsWith(prefix))) {
    const err = new Error(
      `Resolved path "${resolvedTarget}" escapes containment root "${resolvedBase}"`
    );
    err.code = errCode;
    throw err;
  }
  return resolvedTarget;
}
