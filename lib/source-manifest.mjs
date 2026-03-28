/**
 * Source manifest computation and verification.
 *
 * Computes deterministic SHA-256 manifests over sets of files
 * and verifies whether files have changed since a manifest was created.
 *
 * Uses only Node.js built-ins: crypto, fs/promises, path.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

/**
 * @typedef {Object} Manifest
 * @property {string|null} sha - First 7 chars of the composite SHA-256, or null for empty file list.
 * @property {string[]} files - Sorted relative file paths.
 * @property {string} computedAt - ISO 8601 timestamp.
 */

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} matches - Whether the current SHA matches the manifest SHA.
 * @property {string|null} currentSha - The recomputed SHA, or null if files are missing.
 * @property {string[]} [missingFiles] - Paths that no longer exist (only present when files are missing).
 */

/**
 * Compute a deterministic manifest for a set of files.
 *
 * Algorithm:
 * 1. Validate all paths resolve inside projectRoot.
 * 2. Read each file and compute its individual SHA-256 hash.
 * 3. Sort the per-file hashes alphabetically.
 * 4. Hash the sorted hash list to produce the final composite SHA.
 * 5. Return first 7 characters of the composite SHA.
 *
 * @param {string[]} filePaths - Paths to include (absolute or relative to projectRoot).
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<Manifest>}
 */
export async function computeManifest(filePaths, projectRoot) {
  const computedAt = new Date().toISOString();

  if (!filePaths || filePaths.length === 0) {
    return { sha: null, files: [], computedAt };
  }

  const resolvedRoot = resolve(projectRoot);

  // Resolve all paths and validate they are inside projectRoot.
  const resolved = filePaths.map((fp) => {
    const abs = resolve(resolvedRoot, fp);
    const rel = relative(resolvedRoot, abs);
    if (rel.startsWith("..") || resolve(resolvedRoot, rel) !== abs) {
      const err = new Error(
        `Path resolves outside project root: ${fp}`
      );
      err.code = "PATH_OUTSIDE_ROOT";
      throw err;
    }
    return { abs, rel };
  });

  // Read files and compute per-file hashes.
  const missingFiles = [];
  const fileHashes = [];

  for (const { abs, rel } of resolved) {
    let content;
    try {
      content = await readFile(abs);
    } catch (readErr) {
      if (readErr.code === "ENOENT") {
        missingFiles.push(rel);
        continue;
      }
      const err = new Error(`Failed to read file: ${rel} — ${readErr.message}`);
      err.code = "READ_ERROR";
      throw err;
    }
    const hash = createHash("sha256").update(content).digest("hex");
    fileHashes.push({ rel, hash });
  }

  if (missingFiles.length > 0) {
    const err = new Error(
      `Files not found: ${missingFiles.join(", ")}`
    );
    err.code = "FILES_NOT_FOUND";
    err.missingFiles = missingFiles;
    throw err;
  }

  // Sort hashes alphabetically and compute composite SHA.
  const sortedHashes = fileHashes.map((fh) => fh.hash).sort();
  const compositeSha = createHash("sha256")
    .update(sortedHashes.join("\n"))
    .digest("hex");

  const sortedFiles = fileHashes.map((fh) => fh.rel).sort();

  return {
    sha: compositeSha.slice(0, 7),
    files: sortedFiles,
    computedAt,
  };
}

/**
 * Verify a previously computed manifest against current file contents.
 *
 * @param {Manifest} manifest - A manifest object previously returned by computeManifest.
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<VerifyResult>}
 */
export async function verifyManifest(manifest, projectRoot) {
  if (!manifest || !manifest.files || manifest.files.length === 0) {
    return { matches: manifest?.sha === null, currentSha: null };
  }

  const resolvedRoot = resolve(projectRoot);
  const missingFiles = [];
  const fileHashes = [];

  for (const rel of manifest.files) {
    const abs = resolve(resolvedRoot, rel);
    let content;
    try {
      content = await readFile(abs);
    } catch (readErr) {
      if (readErr.code === "ENOENT") {
        missingFiles.push(rel);
        continue;
      }
      throw readErr;
    }
    const hash = createHash("sha256").update(content).digest("hex");
    fileHashes.push(hash);
  }

  if (missingFiles.length > 0) {
    return { matches: false, currentSha: null, missingFiles };
  }

  const sortedHashes = fileHashes.slice().sort();
  const compositeSha = createHash("sha256")
    .update(sortedHashes.join("\n"))
    .digest("hex");
  const currentSha = compositeSha.slice(0, 7);

  return {
    matches: currentSha === manifest.sha,
    currentSha,
  };
}
