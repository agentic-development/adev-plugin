/**
 * Issue backend registry.
 *
 * Reads tasks.backend from manifest config and returns the active adapter.
 *
 * Supported backends:
 *   "json"  — JSON-backed board at `.context-index/tasks/tasks.json`.
 *             Default for new scaffolds.
 *   "file"  — markdown-backed board at `.context-index/tasks/tasks.md`.
 *             Read-only-deprecated (CON-5). Writes throw
 *             BACKEND_READ_ONLY_DEPRECATED. Emits one-time DEPRECATED_BACKEND
 *             warning on selection.
 *   "beads" — beads_rust CLI (br) when installed; falls back to JSON.
 *
 * Follows the lib/provider/registry.mjs pattern.
 */

import { FileAdapter } from "./file-adapter.mjs";
import { JsonAdapter } from "./json-adapter.mjs";
import { BeadsAdapter } from "./beads-adapter.mjs";
import { resolveStorageRoot, warnOnShadowBoard } from "./resolve-root.mjs";

export const SUPPORTED_BACKENDS = ["json", "file", "beads"];
export const DEFAULT_BACKEND = "json";

// One-time deprecation warning state, per process.
let _deprecationWarned = false;
// One-time advisory state for "default-resolved" message, per process.
let _defaultAdvisoryEmitted = false;

function emitDeprecatedFileBackendWarningOnce() {
  if (_deprecationWarned) return;
  _deprecationWarned = true;
  // Skip the warning when tests / consumers explicitly silence it.
  if (process.env.ADEV_SILENCE_DEPRECATION_BACKEND === "1") return;
  console.warn(
    "[adev] DEPRECATED_BACKEND: tasks.backend=\"file\" is read-only-deprecated. " +
    "Writes will throw BACKEND_READ_ONLY_DEPRECATED. " +
    "Run `adev migrate` or set tasks.backend: json in manifest.yaml. " +
    "This warning appears once per process."
  );
}

function emitDefaultResolvedAdvisoryOnce() {
  if (_defaultAdvisoryEmitted) return;
  _defaultAdvisoryEmitted = true;
  if (process.env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY === "1") return;
  // Intentionally a low-volume informational line on stderr (not console.warn).
  process.stderr.write(
    `[adev] tasks.backend unconfigured — defaulting to "${DEFAULT_BACKEND}".\n`
  );
}

/**
 * Get the issue manager adapter based on manifest config.
 *
 * @param {object} manifest - Parsed manifest.yaml content
 * @param {string} [projectRoot] - Project root directory
 * @returns {FileAdapter|JsonAdapter|BeadsAdapter}
 */
export function getIssueManager(manifest, projectRoot = process.cwd()) {
  const storageRoot = resolveStorageRoot(manifest, projectRoot);

  // issue-615: a linked worktree carries its own git-tracked copy of
  // tasks.json that `storageRoot` deliberately bypasses. Surface the
  // divergence once per process so a stale path-based read is loud instead
  // of silent. Never fatal — advisory only.
  warnOnShadowBoard(manifest, projectRoot);

  const rawBackend = manifest?.tasks?.backend;
  const backend = rawBackend || DEFAULT_BACKEND;

  if (rawBackend && !SUPPORTED_BACKENDS.includes(rawBackend)) {
    const err = new Error(
      `Unknown task backend: "${rawBackend}". Supported: ${SUPPORTED_BACKENDS.join(", ")}`
    );
    err.code = "UNKNOWN_BACKEND";
    throw err;
  }

  // When tasks.backend is not configured, surface the resolved default once.
  if (!rawBackend) {
    emitDefaultResolvedAdvisoryOnce();
  }

  if (backend === "json") {
    return new JsonAdapter(storageRoot);
  }

  if (backend === "file") {
    emitDeprecatedFileBackendWarningOnce();
    return new FileAdapter(storageRoot);
  }

  if (backend === "beads") {
    try {
      return new BeadsAdapter(storageRoot);
    } catch (err) {
      if (err.code === "BEADS_NOT_AVAILABLE") {
        console.warn(
          `beads_rust (br) not available. Using JSON issue tracking. ` +
          `Install br for enhanced issue management: https://github.com/Dicklesworthstone/beads_rust`
        );
        return new JsonAdapter(storageRoot);
      }
      throw err;
    }
  }

  // Unreachable given the SUPPORTED_BACKENDS guard above.
  return new JsonAdapter(storageRoot);
}

export default { getIssueManager, SUPPORTED_BACKENDS, DEFAULT_BACKEND };
