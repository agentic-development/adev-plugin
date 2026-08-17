/**
 * SEC-2: temp-then-rename atomic text write.
 *
 * Writes to `${finalPath}.${pid}.tmp` in the same directory, `fsync`s the
 * descriptor, closes the file, then `rename`s into place — atomic on POSIX
 * when both paths share a filesystem (guaranteed here since the temp file
 * sits adjacent to the destination). On any error in the write path,
 * attempts to `unlink` the temp file before rethrowing, so a refused or
 * failed write leaves no residue beside the destination.
 *
 * `lib/governance/materialize.mjs` and `lib/gitignore-installer.mjs` each
 * carried an identical copy (flagged by /adev:codehealth's duplicate-logic
 * pass).
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/atomic-write
 */

import { closeSync, existsSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";

/**
 * @param {string} finalPath - Absolute destination path.
 * @param {string} content
 */
export function atomicWriteFile(finalPath, content) {
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  let fd = null;
  try {
    fd = openSync(tmpPath, "w", 0o644);
    writeSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tmpPath, finalPath);
  } catch (err) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* best effort */
      }
    }
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* best effort */
    }
    throw err;
  }
}
