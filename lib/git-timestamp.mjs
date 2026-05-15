/**
 * Resolve the authoritative creation timestamp for a file.
 *
 * Primary source: `git log --follow --diff-filter=A --format=%aI -- <path>`
 * (author date of the file's first commit, in ISO 8601 with offset).
 * Fallback: filesystem `mtime` when the file is uncommitted, the path is
 * outside a git repo, or the git binary is unavailable. The fallback attaches
 * a WARNING so downstream consumers can surface the caveat.
 *
 * Non-existent paths surface the underlying `fs.stat` error (ENOENT). The
 * primary git path is treated as a soft signal — any failure short-circuits
 * to mtime rather than throwing.
 *
 * @module lib/git-timestamp
 * @see .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.spec.md
 */

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, basename } from "node:path";

const MTIME_WARNING = "Git creation timestamp unavailable; using mtime";

/**
 * @typedef {Object} CreationTimestamp
 * @property {string} timestamp - ISO 8601 string.
 * @property {'git' | 'mtime'} source - Provenance of the timestamp.
 * @property {string | null} warning - Non-null when source === 'mtime'.
 */

/**
 * @param {string} filePath - Absolute or cwd-relative path.
 * @returns {Promise<CreationTimestamp>}
 */
export async function getCreationTimestamp(filePath) {
  // Surface ENOENT/EACCES from stat before attempting git — keeps the
  // non-existent-file contract crisp.
  const stats = await stat(filePath);

  const gitTimestamp = await tryGitCreationTimestamp(filePath);
  if (gitTimestamp !== null) {
    return { timestamp: gitTimestamp, source: "git", warning: null };
  }

  return {
    timestamp: stats.mtime.toISOString(),
    source: "mtime",
    warning: MTIME_WARNING,
  };
}

/**
 * Run `git log --follow --diff-filter=A --format=%aI -- <path>` and return
 * the author date of the *first* (oldest) commit that added the file. Returns
 * null on any failure, including: non-zero exit, empty output (uncommitted
 * file), missing git binary, or the path not being inside a git work tree.
 *
 * `--follow` traces renames; `--diff-filter=A` restricts to the add commit.
 *
 * @param {string} filePath
 * @returns {Promise<string | null>}
 */
function tryGitCreationTimestamp(filePath) {
  // Run from the file's directory so git auto-detects the enclosing repo.
  // basename() trims any leading path so `git log -- <basename>` works
  // regardless of how the caller spelled the input.
  const cwd = dirname(filePath);
  const target = basename(filePath);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(
      "git",
      ["log", "--follow", "--diff-filter=A", "--format=%aI", "--", target],
      { cwd, stdio: ["ignore", "pipe", "pipe"] }
    );

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", () => {
      if (settled) return;
      settled = true;
      // git binary missing or unspawnable — fall back.
      resolve(null);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        resolve(null);
        return;
      }
      const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        // Uncommitted file: git exits 0 with empty output.
        resolve(null);
        return;
      }
      // `git log` lists newest first; the *last* line is the original add
      // commit's author date — the file's creation timestamp.
      const oldest = lines[lines.length - 1];
      if (!isValidIsoDate(oldest)) {
        resolve(null);
        return;
      }
      resolve(oldest);
    });
  });
}

/**
 * Validate that a string parses to a real Date. Guards against garbled git
 * output rather than enforcing a strict ISO regex.
 *
 * @param {string} s
 * @returns {boolean}
 */
function isValidIsoDate(s) {
  const t = Date.parse(s);
  return !Number.isNaN(t);
}
