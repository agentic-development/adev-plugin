/**
 * Spec drift detection library.
 *
 * Provides functions to detect, stamp, clear, and query drift flags
 * on spec YAML frontmatter when implementation source files are modified.
 *
 * Per jsonl-drift-events.spec.md (rev 2), stamping is split between:
 *   - an inline `drift_detected: true` boolean on the spec frontmatter
 *     (the derived rolled-up view; what hasDrift reads)
 *   - one `code_drift_detected` / `code_drift_cleared` JSONL event per
 *     stamp/clear in .context-index/lifecycle-state/<slug>.jsonl
 *     (the multi-source history; conflict-free across branches)
 *
 * Uses only Node.js built-ins: fs, path.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, join, dirname, sep } from "node:path";
import { buildReverseIndex } from "./source-manifest.mjs";
import { appendEvent } from "./lifecycle-state.mjs";

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
    } else if (entry.name.endsWith(".spec.md")) {
      try {
        const content = readFileSync(full, "utf-8");
        const manifest = extractManifestFiles(content);
        if (manifest && manifest.includes(targetFile)) {
          const specRel = relative(projectRoot, full);
          const specName = extractTitle(content) || entry.name.replace(/\.spec\.md$/, "");
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
 * Find the project root by walking up from a spec path until a directory
 * containing `.context-index/manifest.yaml` is found.
 *
 * @private
 * @param {string} specPath - Absolute path to a spec file.
 * @returns {string|null} Absolute project root, or null if not found.
 */
function findProjectRootFromSpec(specPath) {
  let dir = dirname(resolve(specPath));
  // Bound the walk at filesystem root.
  while (true) {
    if (existsSync(join(dir, ".context-index", "manifest.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Canonicalize a driftSource path. Returns the project-root-relative,
 * normalized form. Throws `PATH_TRAVERSAL_REJECTED` if the resolved path
 * escapes projectRoot (SEC-1 from jsonl-drift-events.spec.md).
 *
 * @private
 * @param {string} projectRoot - Absolute project root.
 * @param {string} driftSource - Caller-supplied source path (any form).
 * @returns {string} Canonical project-root-relative POSIX-form path.
 */
function canonicalizeDriftSource(projectRoot, driftSource) {
  const absRoot = resolve(projectRoot);
  const absolute = resolve(absRoot, driftSource);
  // Containment: absolute must be inside absRoot (or equal to it — but a file
  // equal to the root is degenerate and we reject below by requiring a non-empty relative path).
  if (absolute !== absRoot && !absolute.startsWith(absRoot + sep)) {
    const err = new Error(
      `PATH_TRAVERSAL_REJECTED: ${driftSource} resolves outside projectRoot`,
    );
    err.code = "PATH_TRAVERSAL_REJECTED";
    throw err;
  }
  const canonical = relative(absRoot, absolute);
  if (canonical.startsWith("..") || canonical === "") {
    const err = new Error(
      `PATH_TRAVERSAL_REJECTED: ${driftSource} resolves outside projectRoot`,
    );
    err.code = "PATH_TRAVERSAL_REJECTED";
    throw err;
  }
  // Normalize to forward slashes for cross-platform stability of the JSONL payload.
  return canonical.split(sep).join("/");
}

/**
 * Stamp drift flag on a spec.
 *
 * Per jsonl-drift-events.spec.md Behavior 1:
 *   1. Canonicalize driftSource (rejecting traversal escape with PATH_TRAVERSAL_REJECTED).
 *   2. Append a `code_drift_detected` JSONL event to the spec's lifecycle log
 *      with payload {drift_source: <canonical>, drift_at: <ISO timestamp>}.
 *   3. Ensure `drift_detected: true` is present in the spec frontmatter
 *      (idempotent — the inline boolean is the derived rolled-up view).
 *
 * Frontmatter `drift_source` / `drift_at` writes are retained in this Task 2
 * step (additive migration); they are removed in Task 6 (Migration Step 3).
 *
 * @param {string} specPath - Absolute path to the spec file (must end with `.spec.md`
 *   to participate in JSONL emission; otherwise the function only writes frontmatter
 *   and emits no event — for backwards-compatibility with legacy callers).
 * @param {string} driftSource - Project-root-relative path of the edited file.
 * @throws {Error} PATH_TRAVERSAL_REJECTED if driftSource escapes projectRoot.
 */
export async function stampDrift(specPath, driftSource) {
  const content = readFileSync(specPath, "utf-8");
  const driftAt = new Date().toISOString();

  const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  // --- JSONL emission (Behavior 1; Migration Step 1) ---
  // Only emit when the spec lives under a discoverable project root AND has
  // the canonical .spec.md suffix (slugFromSpec requirement). This keeps
  // backwards compatibility with the older non-`.spec.md` test fixtures
  // and any out-of-tree callers, while still enforcing canonicalization
  // and traversal rejection unconditionally for the emit path.
  let canonicalSource = driftSource;
  const isJsonlEligible =
    specPath.endsWith(".spec.md") && findProjectRootFromSpec(specPath) != null;
  if (isJsonlEligible) {
    const projectRoot = findProjectRootFromSpec(specPath);
    // Canonicalize + traversal-reject. Throws PATH_TRAVERSAL_REJECTED on escape.
    canonicalSource = canonicalizeDriftSource(projectRoot, driftSource);
    appendEvent(projectRoot, specPath, {
      event: "code_drift_detected",
      drift_source: canonicalSource,
      drift_at: driftAt,
    });
  }

  // --- Frontmatter writes (post Migration Step 3) ---
  // Only the inline drift_detected boolean is stamped on frontmatter. The
  // canonical drift_source / drift_at payload lives exclusively in the
  // JSONL `code_drift_detected` event emitted above. We still strip any
  // legacy drift_source / drift_at lines that may exist on disk from a
  // pre-migration spec, so a re-stamp cleans them up opportunistically.
  let fm = fmMatch[1];

  // Remove existing drift fields (legacy cleanup + idempotent re-stamp).
  fm = fm.replace(/^drift_detected:.*\n?/gm, "");
  fm = fm.replace(/^drift_source:.*\n?/gm, "");
  fm = fm.replace(/^drift_at:.*\n?/gm, "");

  // Remove trailing empty lines in frontmatter
  fm = fm.replace(/\n+$/, "");

  // Only the inline boolean now — multi-source history lives in JSONL.
  fm += `\ndrift_detected: true`;

  const updated = content.replace(/---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  writeFileSync(specPath, updated);
}

/**
 * Clear drift flag from a spec.
 *
 * Per jsonl-drift-events.spec.md Behavior 3:
 *   1. Append a `code_drift_cleared` JSONL event to the spec's lifecycle log
 *      with payload {drift_at: <ISO timestamp>}.
 *   2. Remove the inline `drift_detected: true` boolean from frontmatter.
 *
 * The frontmatter `drift_source` / `drift_at` removals are retained here
 * during the additive migration; Migration Step 3 (Task 6) drops the
 * stamping of those fields entirely and they will no longer be present
 * on a fresh stamp.
 *
 * Only `/adev:implement` is permitted to call this (per ADR 0011 and
 * Behavior 3b of jsonl-drift-events.spec.md). `/adev:validate --restamp`
 * does NOT clear drift.
 *
 * No-op (no JSONL emit; no frontmatter mutation) if the spec has no inline
 * `drift_detected` boolean and no `drift_source` / `drift_at` fields.
 *
 * @param {string} specPath - Absolute path to the spec file.
 */
export async function clearDrift(specPath) {
  const content = readFileSync(specPath, "utf-8");

  const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  let fm = fmMatch[1];
  const originalFm = fm;

  // Remove drift fields
  fm = fm.replace(/^drift_detected:.*\n?/gm, "");
  fm = fm.replace(/^drift_source:.*\n?/gm, "");
  fm = fm.replace(/^drift_at:.*\n?/gm, "");

  // Remove trailing empty lines in frontmatter
  fm = fm.replace(/\n+$/, "");

  // Only write (and emit) if something changed.
  if (fm === originalFm.replace(/\n+$/, "")) return;

  // --- JSONL emission (Behavior 3; Migration Step 1) ---
  // Only emit when the spec lives under a discoverable project root AND has
  // the canonical .spec.md suffix (matches stampDrift's emit gating).
  if (specPath.endsWith(".spec.md")) {
    const projectRoot = findProjectRootFromSpec(specPath);
    if (projectRoot != null) {
      appendEvent(projectRoot, specPath, {
        event: "code_drift_cleared",
        drift_at: new Date().toISOString(),
      });
    }
  }

  const updated = content.replace(/---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
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
