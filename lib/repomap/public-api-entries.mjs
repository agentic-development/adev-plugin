/**
 * Public-API entry resolver for tree-sitter repomap.
 *
 * Implements Behavior 3 of `non-code-reference-detection.spec.md`:
 *   Reads `<projectRoot>/package.json`, walks the `exports` field, and
 *   resolves entries to project-root-relative file paths for shapes currently
 *   supported by this codebase:
 *     - Top-level entry string: `{ ".": "./cli/index.mjs" }`
 *     - Conditional object with `import` and/or `default` keys; `import` wins
 *       when both are present.
 *
 *   Other shapes (subpath entries, glob patterns, `null` blocking entries,
 *   conditional objects lacking both `import` and `default`) are skipped with
 *   `REPOMAP_EXPORTS_UNSUPPORTED_SHAPE`.
 *
 *   Out-of-root paths are rejected with `REPOMAP_EXPORTS_OUT_OF_ROOT`.
 *   Malformed JSON emits `REPOMAP_EXPORTS_PARSE_ERROR`.
 *   A missing `package.json` is a silent no-op.
 *
 * Pure function — only `node:fs` and `node:path`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

/**
 * @typedef {Object} PublicApiTag
 * @property {string} path - Project-root-relative path of the resolved file.
 * @property {string} key  - The `exports` key (e.g., ".", "./feature").
 */

/**
 * @typedef {Object} PublicApiWarning
 * @property {"REPOMAP_EXPORTS_UNSUPPORTED_SHAPE"
 *           |"REPOMAP_EXPORTS_OUT_OF_ROOT"
 *           |"REPOMAP_EXPORTS_PARSE_ERROR"} code
 * @property {string} [key]
 * @property {string} [path]
 */

/**
 * @typedef {Object} ResolveResult
 * @property {PublicApiTag[]} tagged
 * @property {PublicApiWarning[]} warnings
 */

/**
 * Resolve `package.json:exports` entries for the current codebase's supported
 * shapes; return the list of FileNode tags and warnings for unsupported or
 * out-of-root shapes.
 *
 * @param {Object} opts
 * @param {string} opts.projectRoot
 * @returns {ResolveResult}
 */
export function resolvePublicApiEntries({ projectRoot } = {}) {
  if (!projectRoot || typeof projectRoot !== "string") {
    throw new Error("resolvePublicApiEntries: projectRoot is required");
  }

  const resolvedRoot = resolve(projectRoot);
  const pkgPath = join(resolvedRoot, "package.json");

  if (!existsSync(pkgPath)) {
    return { tagged: [], warnings: [] };
  }

  let raw;
  try {
    raw = readFileSync(pkgPath, "utf8");
  } catch {
    return { tagged: [], warnings: [] };
  }

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return {
      tagged: [],
      warnings: [{ code: "REPOMAP_EXPORTS_PARSE_ERROR", path: "package.json" }],
    };
  }

  const exportsField = pkg && pkg.exports;
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return { tagged: [], warnings: [] };
  }

  const tagged = [];
  const warnings = [];

  // Iterate keys in sorted order so output is deterministic.
  const keys = Object.keys(exportsField).sort();

  for (const key of keys) {
    const value = exportsField[key];

    // Subpath entries (anything other than ".") are out of scope.
    if (key !== ".") {
      warnings.push({ code: "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE", key });
      continue;
    }

    // null blocking entry — out of scope.
    if (value === null) {
      warnings.push({ code: "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE", key });
      continue;
    }

    // Glob: any string containing `*` is out of scope.
    if (typeof value === "string" && value.includes("*")) {
      warnings.push({ code: "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE", key });
      continue;
    }

    let target = null;

    if (typeof value === "string") {
      target = value;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // Conditional object: import wins, then default. Any other shape (no
      // import, no default — only `require`, `node`, etc.) is unsupported.
      if (typeof value.import === "string") {
        target = value.import;
      } else if (typeof value.default === "string") {
        target = value.default;
      } else {
        warnings.push({ code: "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE", key });
        continue;
      }

      // Glob inside conditional value — also unsupported.
      if (target.includes("*")) {
        warnings.push({ code: "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE", key });
        continue;
      }
    } else {
      warnings.push({ code: "REPOMAP_EXPORTS_UNSUPPORTED_SHAPE", key });
      continue;
    }

    // Resolve to absolute, then to project-root-relative.
    const absTarget = resolve(resolvedRoot, target);
    const relTarget = relative(resolvedRoot, absTarget);
    if (
      relTarget === "" ||
      relTarget.startsWith("..") ||
      relTarget.startsWith(sep)
    ) {
      warnings.push({
        code: "REPOMAP_EXPORTS_OUT_OF_ROOT",
        key,
        path: target,
      });
      continue;
    }

    tagged.push({
      path: relTarget.split(sep).join("/"),
      key,
    });
  }

  // Sort tagged by (key, path) for determinism.
  tagged.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  return { tagged, warnings };
}

export default { resolvePublicApiEntries };
