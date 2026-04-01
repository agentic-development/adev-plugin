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

export const SUPPORTED_BACKENDS = ["file", "beads"];

/**
 * Get the issue manager adapter based on manifest config.
 *
 * @param {object} manifest - Parsed manifest.yaml content
 * @param {string} [projectRoot] - Project root directory
 * @returns {FileAdapter|BeadsAdapter}
 */
export function getIssueManager(manifest, projectRoot = process.cwd()) {
  const backend = manifest?.tasks?.backend;
  if (!backend) return new FileAdapter(projectRoot);

  if (!SUPPORTED_BACKENDS.includes(backend)) {
    const err = new Error(
      `Unknown task backend: "${backend}". Supported: ${SUPPORTED_BACKENDS.join(", ")}`
    );
    err.code = "UNKNOWN_BACKEND";
    throw err;
  }

  if (backend === "beads") {
    try {
      return new BeadsAdapter(projectRoot);
    } catch (err) {
      if (err.code === "BEADS_NOT_AVAILABLE") {
        console.warn(
          `beads_rust (br) not available. Using file-based issue tracking. ` +
          `Install br for enhanced issue management: https://github.com/Dicklesworthstone/beads_rust`
        );
        return new FileAdapter(projectRoot);
      }
      throw err;
    }
  }

  return new FileAdapter(projectRoot);
}

export default { getIssueManager, SUPPORTED_BACKENDS };
