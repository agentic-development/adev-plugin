/**
 * Dependency graph builder for tree-sitter repomap.
 *
 * Consumes parsed file data (symbols + imports) and produces a file-level
 * dependency graph with nodes and edges.
 */

import { execSync } from 'node:child_process';
import { resolve, relative, dirname, normalize } from 'node:path';

/**
 * Extensions to try when resolving bare import specifiers, in order.
 */
const EXTENSION_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

/**
 * Build a file-level dependency graph from parsed file data.
 *
 * @param {Array<{filePath: string, symbols: Array<{name: string, kind: string, line: number}>, imports: Array<{source: string, symbols: string[], isTypeOnly: boolean, isDynamic: boolean}>}>} parsedFiles
 * @param {string} projectRoot — absolute path to project root
 * @param {Array<{slug: string, paths: string[]}>} modules — module definitions from manifest
 * @returns {{generated: string, commit: string, nodes: Array<{path: string, exports: string[], module: string|null}>, edges: Array<{from: string, to: string, type: string, symbols: string[]}>}}
 */
export function buildGraph(parsedFiles, projectRoot, modules) {
  const commit = getCommitHash();
  const generated = new Date().toISOString();

  // Build a lookup from relative path → parsed file data
  const filesByRelPath = new Map();
  for (const pf of parsedFiles) {
    const relPath = relative(projectRoot, pf.filePath);
    filesByRelPath.set(relPath, pf);
  }

  // Build nodes
  const nodes = [];
  for (const [relPath, pf] of filesByRelPath) {
    const exports = pf.symbols.map(s => s.name);
    const mod = resolveModule(relPath, modules);
    nodes.push({ path: relPath, exports, module: mod });
  }

  // Build edges
  const edges = [];
  for (const [relPath, pf] of filesByRelPath) {
    const importingDir = dirname(pf.filePath);

    for (const imp of pf.imports) {
      // Skip external packages (not relative paths)
      if (!imp.source.startsWith('.') && !imp.source.startsWith('/')) {
        continue;
      }

      // Resolve the import source to an absolute path
      const resolvedRelPath = resolveImport(imp.source, importingDir, projectRoot, filesByRelPath);
      if (resolvedRelPath === null) {
        continue;
      }

      // Determine edge type
      const type = classifyEdge(imp, pf.symbols);

      edges.push({
        from: relPath,
        to: resolvedRelPath,
        type,
        symbols: imp.symbols,
      });
    }
  }

  return { generated, commit, nodes, edges };
}

/**
 * Resolve an import source to a relative path within the project.
 *
 * @returns {string|null} relative path if resolved, null otherwise
 */
function resolveImport(source, importingDir, projectRoot, filesByRelPath) {
  const basePath = resolve(importingDir, source);

  for (const suffix of EXTENSION_SUFFIXES) {
    const candidate = basePath + suffix;
    const normalizedCandidate = normalize(candidate);

    // Path containment check: must be within projectRoot
    const relCandidate = relative(projectRoot, normalizedCandidate);
    if (relCandidate.startsWith('..') || relCandidate.startsWith('/')) {
      continue;
    }

    if (filesByRelPath.has(relCandidate)) {
      return relCandidate;
    }
  }

  return null;
}

/**
 * Determine the module slug for a file path based on modules config.
 *
 * @returns {string|null}
 */
function resolveModule(relPath, modules) {
  for (const mod of modules) {
    for (const modPath of mod.paths) {
      if (relPath.startsWith(modPath + '/') || relPath === modPath) {
        return mod.slug;
      }
    }
  }
  return null;
}

/**
 * Classify an import edge based on its properties and the exporting file's symbols.
 */
function classifyEdge(imp, importingFileSymbols) {
  // Check re-export: importing file exports symbols that it imports from this source
  const exportedNames = new Set(importingFileSymbols.map(s => s.name));
  const isReExport = imp.symbols.length > 0 && imp.symbols.some(s => exportedNames.has(s));

  if (isReExport) return 're-export';
  if (imp.isTypeOnly) return 'type-import';
  if (imp.isDynamic) return 'dynamic-import';
  return 'import';
}

/**
 * Get the current git HEAD short hash, or "unknown" on failure.
 */
function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
