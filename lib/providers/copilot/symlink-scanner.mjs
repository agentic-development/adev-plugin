/**
 * Pre-copy symlink scanner for skill source trees.
 *
 * Defense-in-depth alongside `fs.cpSync({ dereference: false, verbatimSymlinks: false })`:
 * the adapter scans every skill source directory for symlinks before copying.
 * If any symlink is encountered — at any depth — `scanForSymlinks` throws
 * `SKILL_CONTAINS_SYMLINK` and the install aborts before any write occurs.
 *
 * Uses `readdirSync({ withFileTypes: true })` so symlink detection happens
 * without ever resolving (`lstat`-equivalent semantics). Recurses only into
 * real directories; symlinked directories are rejected, not followed.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recursively scan `dir` for any symbolic links.
 *
 * @param {string} dir - Absolute path to the directory to scan.
 * @returns {true} on a clean tree.
 * @throws {Error} SKILL_CONTAINS_SYMLINK on the first symlink encountered.
 */
export function scanForSymlinks(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`SKILL_CONTAINS_SYMLINK: ${fullPath}`);
    }
    if (entry.isDirectory()) {
      scanForSymlinks(fullPath);
    }
  }
  return true;
}
