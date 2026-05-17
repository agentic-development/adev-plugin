/**
 * Doc-reference scanner for tree-sitter repomap.
 *
 * Implements Behaviors 1 and 2 of `non-code-reference-detection.spec.md`:
 *   - Scans every `skills/<dir>/SKILL.md` for inline references to source files.
 *   - Detection roots derive from `manifest.yaml modules[].paths`; fallback list
 *     is `["lib","cli","hooks","providers","templates","tests"]` when the
 *     manifest is missing or declares no modules.
 *   - Matches files with extensions: mjs, js, ts, mts, cjs, sh, yaml.
 *   - Skips matches inside fenced code blocks (between triple backticks).
 *   - Drops references whose target does not exist on disk (records them in
 *     `missing[]` for the renderer).
 *   - Rejects references whose resolved path escapes the project root, emitting
 *     a single warning per offending reference with code
 *     `REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL`.
 *   - Collapses multiple text occurrences of the same source/target pair into a
 *     single edge whose `count` field records the number of occurrences.
 *
 * Pure function — no I/O outside the project root. Uses only `node:fs` and
 * `node:path`.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, normalize, sep } from "node:path";

const SUPPORTED_EXTENSIONS = ["mjs", "js", "ts", "mts", "cjs", "sh", "yaml"];

const DEFAULT_ROOTS = ["lib", "cli", "hooks", "providers", "templates", "tests"];

/**
 * @typedef {Object} DocRefEdge
 * @property {"doc-reference"} type
 * @property {string} from   - Project-root-relative SKILL.md path.
 * @property {string} to     - Project-root-relative referenced source file path.
 * @property {string[]} symbols - Always [] for doc-references.
 * @property {number} count  - Number of text occurrences of this reference
 *                             (collapsed per source/target pair).
 */

/**
 * @typedef {Object} DocRefMissing
 * @property {string} source - SKILL.md path that contains the reference.
 * @property {string} ref    - The path string written in the doc.
 * @property {number} line   - 1-based line number where the ref appears.
 */

/**
 * @typedef {Object} DocRefWarning
 * @property {string} code   - REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL or similar.
 * @property {string} source - SKILL.md path that contains the reference.
 * @property {string} ref    - The path string written in the doc.
 */

/**
 * @typedef {Object} ScanResult
 * @property {DocRefEdge[]} edges
 * @property {DocRefMissing[]} missing
 * @property {DocRefWarning[]} warnings
 */

/**
 * Scan `<projectRoot>/skills/<name>/SKILL.md` files for source-file references.
 *
 * @param {Object} opts
 * @param {string} opts.projectRoot - Absolute path to the project root.
 * @param {{modules?: Array<{slug:string, paths:string[]}>}} [opts.manifest]
 * @returns {ScanResult}
 */
export function scanDocReferences({ projectRoot, manifest } = {}) {
  if (!projectRoot || typeof projectRoot !== "string") {
    throw new Error("scanDocReferences: projectRoot is required");
  }

  const resolvedRoot = resolve(projectRoot);
  const skillsDir = join(resolvedRoot, "skills");

  // No skills directory → no references.
  if (!existsSync(skillsDir)) {
    return { edges: [], missing: [], warnings: [] };
  }

  const roots = resolveRoots(manifest);
  const extPattern = SUPPORTED_EXTENSIONS.join("|");
  // Regex matches a path that:
  //   - starts at a word boundary
  //   - begins with one of the detection roots followed by `/`
  //   - has one or more path segments containing word chars / `-` / `.` / `_`
  //     (paths may contain `..` for traversal — we resolve and reject after match)
  //   - ends with a supported extension
  // We deliberately allow `../` inside the segment so the traversal-rejection
  // path-containment check runs and emits a warning rather than silently
  // missing the attempt.
  const rootAlt = roots.map(escapeRegex).join("|");
  const pathPattern = new RegExp(
    `\\b((?:\\.\\.\\/)*(?:${rootAlt})\\/[\\w./_-]+\\.(?:${extPattern}))\\b`,
    "g",
  );

  const skillFiles = listSkillFiles(skillsDir, resolvedRoot);

  // Aggregate per (source, target) → { count, firstLine }.
  const pairCounts = new Map();
  const missing = [];
  const warnings = [];

  for (const skillRel of skillFiles) {
    const absSkill = join(resolvedRoot, skillRel);
    let content;
    try {
      content = readFileSync(absSkill, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    let inFence = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      // Toggle fenced-code-block state. Lines starting with ``` (any number of
      // trailing backticks/info string) flip the state. We deliberately match
      // the fence at the start of a trimmed line — embedded backticks in prose
      // do not flip state.
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      pathPattern.lastIndex = 0;
      let match;
      while ((match = pathPattern.exec(line)) !== null) {
        const refRaw = match[1];

        // Resolve relative to the project root (doc-reference paths are written
        // project-root-relative, per spec).
        const candidateAbs = normalize(resolve(resolvedRoot, refRaw));
        const candidateRel = relative(resolvedRoot, candidateAbs);

        // Path-containment: reject any form of escape — `..` segments, absolute
        // paths, or paths that resolve outside the project root.
        if (
          candidateRel === "" ||
          candidateRel.startsWith("..") ||
          candidateRel.startsWith(sep)
        ) {
          warnings.push({
            code: "REPOMAP_DOC_REFERENCE_PATH_TRAVERSAL",
            source: skillRel,
            ref: refRaw,
          });
          continue;
        }

        // Normalize separators for cross-platform determinism (we store
        // POSIX-style paths in the JSON artifacts).
        const refNormalized = candidateRel.split(sep).join("/");

        // Existence check: dropped → missing[].
        if (!existsSync(candidateAbs)) {
          missing.push({
            source: skillRel,
            ref: refNormalized,
            line: lineIdx + 1,
          });
          continue;
        }

        const key = `${skillRel}::${refNormalized}`;
        const entry = pairCounts.get(key);
        if (entry) {
          entry.count++;
        } else {
          pairCounts.set(key, {
            from: skillRel,
            to: refNormalized,
            count: 1,
            firstLine: lineIdx + 1,
          });
        }
      }
    }
  }

  // Sort edges deterministically by (from, to).
  const edges = Array.from(pairCounts.values())
    .map((p) => ({
      type: "doc-reference",
      from: p.from,
      to: p.to,
      symbols: [],
      count: p.count,
    }))
    .sort((a, b) => {
      if (a.from !== b.from) return a.from < b.from ? -1 : 1;
      return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
    });

  // Sort missing[] deterministically by (source, line).
  missing.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.line - b.line;
  });

  // Sort warnings deterministically by (source, ref).
  warnings.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  });

  return { edges, missing, warnings };
}

/**
 * Resolve detection roots from a manifest object, falling back when the
 * manifest is missing, has no modules, or declares no paths.
 *
 * @param {{modules?: Array<{slug:string, paths:string[]}>}|undefined} manifest
 * @returns {string[]} sorted, deduplicated root names without trailing slash.
 */
function resolveRoots(manifest) {
  const roots = new Set();
  const modules = manifest && Array.isArray(manifest.modules) ? manifest.modules : [];
  for (const mod of modules) {
    if (!mod || !Array.isArray(mod.paths)) continue;
    for (const p of mod.paths) {
      if (typeof p !== "string" || p.length === 0) continue;
      // Normalize "lib/test-strategies/" → "lib/test-strategies".
      const trimmed = p.replace(/\/+$/, "");
      // We want the *first segment* as the detection root so the regex matches
      // both `lib/test-strategies/x.mjs` and any sibling under lib/.
      const firstSeg = trimmed.split("/")[0];
      if (firstSeg) roots.add(firstSeg);
    }
  }
  if (roots.size === 0) {
    for (const r of DEFAULT_ROOTS) roots.add(r);
  }
  return Array.from(roots).sort();
}

/**
 * Recursively list project-root-relative paths of all SKILL.md files under
 * `<projectRoot>/skills/`.
 *
 * @param {string} skillsDir
 * @param {string} projectRoot
 * @returns {string[]}
 */
function listSkillFiles(skillsDir, projectRoot) {
  const result = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name === "SKILL.md") {
        const rel = relative(projectRoot, full).split(sep).join("/");
        result.push(rel);
      }
    }
  }

  walk(skillsDir);
  return result.sort();
}

/**
 * Escape a string for safe insertion into a RegExp literal.
 * @param {string} s
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default { scanDocReferences };
