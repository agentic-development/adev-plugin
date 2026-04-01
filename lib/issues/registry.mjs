/**
 * Issue backend registry.
 *
 * Reads tasks.backend from manifest config and returns the active adapter.
 * Falls back to FileAdapter when beads is configured but br is not available.
 *
 * Follows the lib/provider/registry.mjs pattern.
 */

import { FileAdapter } from "./file-adapter.mjs";
import { BeadsAdapter } from "./beads-adapter.mjs";
import { resolveStorageRoot } from "./resolve-root.mjs";

export const SUPPORTED_BACKENDS = ["file", "beads"];

/**
 * Get the issue manager adapter based on manifest config.
 *
 * @param {object} manifest - Parsed manifest.yaml content
 * @param {string} [projectRoot] - Project root directory
 * @returns {FileAdapter|BeadsAdapter}
 */
export function getIssueManager(manifest, projectRoot = process.cwd()) {
  const storageRoot = resolveStorageRoot(manifest, projectRoot);
  const backend = manifest?.tasks?.backend;
  if (!backend) return new FileAdapter(storageRoot);

  if (!SUPPORTED_BACKENDS.includes(backend)) {
    const err = new Error(
      `Unknown task backend: "${backend}". Supported: ${SUPPORTED_BACKENDS.join(", ")}`
    );
    err.code = "UNKNOWN_BACKEND";
    throw err;
  }

  if (backend === "beads") {
    try {
      return new BeadsAdapter(storageRoot);
    } catch (err) {
      if (err.code === "BEADS_NOT_AVAILABLE") {
        console.warn(
          `beads_rust (br) not available. Using file-based issue tracking. ` +
          `Install br for enhanced issue management: https://github.com/Dicklesworthstone/beads_rust`
        );
        return new FileAdapter(storageRoot);
      }
      throw err;
    }
  }

  return new FileAdapter(storageRoot);
}

export default { getIssueManager, SUPPORTED_BACKENDS };
