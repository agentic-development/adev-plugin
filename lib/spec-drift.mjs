/**
 * Spec drift detection library.
 *
 * Provides functions to detect, stamp, clear, and query drift flags
 * on spec YAML frontmatter when implementation source files are modified.
 *
 * Uses only Node.js built-ins: fs, path.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { buildReverseIndex } from "./source-manifest.mjs";

/**
 * Scan for specs whose source manifest tracks the given file path.
 *
 * Delegates to buildReverseIndex() from source-manifest.mjs for the
 * file-to-spec mapping.
 *
 * @param {string} filePath - Project-root-relative file path to check.
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<Array<{specPath: string, specName: string}>>}
 */
export async function scanForDrift(filePath, projectRoot) {
  const resolvedRoot = resolve(projectRoot);
  const specsDir = join(resolvedRoot, ".context-index", "specs");

  if (!existsSync(specsDir)) {
    return [];
  }

  // buildReverseIndex returns Map<filePath, specPath>
  // But a file can be tracked by multiple specs, so we need to scan all specs
  // buildReverseIndex only maps each file to the last-seen spec (Map overwrites)
  // We need to do a full scan ourselves using the same pattern
  const results = [];
  await scanSpecsForFile(specsDir, resolvedRoot, filePath, results);
  return results;
}

/**
 * Recursively scan specs directory for specs tracking a given file.
 * @private
 */
async function scanSpecsForFile(dir, projectRoot, targetFile, results) {
  const { readdirSync } = await import("node:fs");
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanSpecsForFile(full, projectRoot, targetFile, results);
    } else if (entry.name.endsWith(".md")) {
      try {
        const content = readFileSync(full, "utf-8");
        const manifest = extractManifestFiles(content);
        if (manifest && manifest.includes(targetFile)) {
          const specRel = relative(projectRoot, full);
          const specName = extractTitle(content) || entry.name.replace(/\.md$/, "");
          results.push({ specPath: specRel, specName });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }
}

/**
 * Extract source-manifest files array from markdown content.
 * @private
 * @param {string} content - File content
 * @returns {string[]|null}
 */
function extractManifestFiles(content) {
  const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const smMatch = fm.match(/source-manifest:\s*\n((?:\s{2,}.+\n?)*)/);
  if (!smMatch) return null;

  const block = smMatch[1];
  const files = [];
  const fileMatches = block.matchAll(/^\s+-\s+(.+)$/gm);
  for (const m of fileMatches) {
    const val = m[1].trim();
    // Skip YAML keys like "sha:", "computed-at:"
    if (!val.includes(":")) {
      files.push(val);
    }
  }

  return files.length > 0 ? files : null;
}

/**
 * Extract title from YAML frontmatter.
 * @private
 * @param {string} content - File content
 * @returns {string|null}
 */
function extractTitle(content) {
  const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const titleMatch = fmMatch[1].match(/title:\s*(.+)/);
  return titleMatch ? titleMatch[1].trim() : null;
}

/**
 * Stamp drift flag on a spec's YAML frontmatter.
 *
 * Writes drift_detected: true, drift_source, and drift_at fields.
 * If drift fields already exist, they are overwritten (idempotent re-stamp).
 *
 * @param {string} specPath - Absolute path to the spec file.
 * @param {string} driftSource - Project-root-relative path of the edited file.
 */
export async function stampDrift(specPath, driftSource) {
  const content = readFileSync(specPath, "utf-8");
  const driftAt = new Date().toISOString();

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  let fm = fmMatch[1];

  // Remove existing drift fields
  fm = fm.replace(/^drift_detected:.*\n?/gm, "");
  fm = fm.replace(/^drift_source:.*\n?/gm, "");
  fm = fm.replace(/^drift_at:.*\n?/gm, "");

  // Remove trailing empty lines in frontmatter
  fm = fm.replace(/\n+$/, "");

  // Append drift fields
  fm += `\ndrift_detected: true`;
  fm += `\ndrift_source: ${driftSource}`;
  fm += `\ndrift_at: ${driftAt}`;

  const updated = content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  writeFileSync(specPath, updated);
}

/**
 * Clear drift flag from a spec's YAML frontmatter.
 *
 * Removes drift_detected, drift_source, and drift_at fields.
 * No-op if the spec has no drift fields.
 *
 * @param {string} specPath - Absolute path to the spec file.
 */
export async function clearDrift(specPath) {
  const content = readFileSync(specPath, "utf-8");

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  let fm = fmMatch[1];
  const originalFm = fm;

  // Remove drift fields
  fm = fm.replace(/^drift_detected:.*\n?/gm, "");
  fm = fm.replace(/^drift_source:.*\n?/gm, "");
  fm = fm.replace(/^drift_at:.*\n?/gm, "");

  // Remove trailing empty lines in frontmatter
  fm = fm.replace(/\n+$/, "");

  // Only write if something changed
  if (fm === originalFm.replace(/\n+$/, "")) return;

  const updated = content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  writeFileSync(specPath, updated);
}

/**
 * Check if a spec has a drift flag set.
 *
 * @param {string} specPath - Absolute path to the spec file.
 * @returns {Promise<boolean>} true if drift_detected is true in frontmatter.
 */
export async function hasDrift(specPath) {
  let content;
  try {
    content = readFileSync(specPath, "utf-8");
  } catch {
    return false;
  }

  const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
  if (!fmMatch) return false;

  const match = fmMatch[1].match(/^drift_detected:\s*(.+)/m);
  if (!match) return false;

  return match[1].trim() === "true";
}
