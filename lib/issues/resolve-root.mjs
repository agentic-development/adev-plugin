/**
 * Resolve the storage root for issue data.
 *
 * Priority:
 *   1. Explicit `tasks.db_path` from manifest config
 *   2. Git main repo root via `git rev-parse --git-common-dir` (handles worktrees)
 *   3. Fallback to cwd
 *
 * Uses only Node.js built-ins: child_process, path.
 */

import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

/**
 * @param {object} [manifest] - Parsed manifest.yaml content
 * @param {string} [cwd] - Current working directory
 * @returns {string} Absolute path to the storage root
 */
export function resolveStorageRoot(manifest, cwd = process.cwd()) {
  const dbPath = manifest?.tasks?.db_path;
  if (dbPath) return dbPath;

  try {
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", cwd, stdio: "pipe" },
    ).trim();
    return dirname(commonDir);
  } catch {
    return cwd;
  }
}
