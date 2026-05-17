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

// ---------------------------------------------------------------------------
// Schema-marker grammar + allowlist (Task 3 — closes SEC-6, CON-12)
// ---------------------------------------------------------------------------

/**
 * Schema-marker grammar per spec Preconditions and CON-12:
 *   `<skill>@<version>`
 *   - <skill>: lowercase letter, then up to 31 of [a-z0-9-]
 *   - <version>: 1–3 digits
 *
 * Total cap: skill ≤ 32 chars, version ≤ 999 — fits comfortably in the
 * first 64 bytes of a `.partial` chunk so the resume-path can read it
 * without parsing the full file.
 */
const SCHEMA_MARKER_RE = /^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/;

/**
 * Allowlist of `{skill, version}` markers permitted to dispatch a resume
 * parser. CON-12: the grammar is permissive (any future adopting skill
 * can mint a marker), but the dispatcher MUST consult the allowlist
 * before invoking a parser to prevent unknown schemas from being
 * silently treated as recoverable.
 *
 * Values are sentinel `true` placeholders for v1 — the actual parser
 * callables live in the adopting skill's helper code. Future revisions
 * may swap the value type for a callable signature without touching
 * callers that only do `.has()` / `isAllowedSchema()` checks.
 */
export const SCHEMA_ALLOWLIST = new Map([
  ["plan@1", true],
  ["spec@1", true],
  ["validate@1", true],
  ["implement@1", true],
]);

/**
 * Parse a `partial_schema` marker into its `{skill, version}` parts.
 * Throws `PARTIAL_ARTIFACT_SCHEMA_MISMATCH` on shape failure per the
 * spec's error-codes table.
 *
 * @param {string} raw - Candidate marker text.
 * @returns {{skill: string, version: number}}
 * @throws {Error} `err.code === "PARTIAL_ARTIFACT_SCHEMA_MISMATCH"`
 */
export function validateSchemaMarker(raw) {
  if (typeof raw !== "string" || raw.length === 0 || !SCHEMA_MARKER_RE.test(raw)) {
    const err = new Error(
      `Invalid partial_schema marker: ${JSON.stringify(raw)} ` +
        `(expected /^[a-z][a-z0-9-]{0,31}@[0-9]{1,3}$/)`
    );
    err.code = "PARTIAL_ARTIFACT_SCHEMA_MISMATCH";
    throw err;
  }
  const atIndex = raw.indexOf("@");
  const skill = raw.slice(0, atIndex);
  const version = Number(raw.slice(atIndex + 1));
  return { skill, version };
}

/**
 * Predicate form: returns true iff `raw` parses AND is present in
 * `SCHEMA_ALLOWLIST`. Never throws — invalid shape returns false.
 *
 * The resume path uses this to decide between "dispatch parser" and
 * "discard partial". The mutating verb that actually deletes a partial
 * should call `validateSchemaMarker` first to record a structured
 * error (rather than silently falling back to discard).
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function isAllowedSchema(raw) {
  if (typeof raw !== "string" || raw.length === 0) return false;
  if (!SCHEMA_MARKER_RE.test(raw)) return false;
  return SCHEMA_ALLOWLIST.has(raw);
}

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
