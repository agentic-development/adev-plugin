# Golden Sample: Dependency Graph Builder

> **Pattern:** general
> **Source:** lib/repomap/graph.mjs
> **Quality Score:** 100/100
> **Extracted:** 2026-03-28
> **Constitution Principles:** pure-esm, minimize-external-dependencies, naming-conventions

## Why This Is a Golden Sample

This is the best example of a library module in the project. It demonstrates how to write a non-trivial JavaScript module that follows every constitution principle:

1. **Pure ESM** (Non-Negotiable Principle #3): Uses `import`/`export` exclusively with `.mjs` extension. Named exports for the public API, no default export mixing.
2. **Minimize external dependencies** (Non-Negotiable Principle #1): Uses only Node.js built-ins (`child_process`, `path`). The graph building logic, import resolution, and module classification are all implemented from scratch.
3. **Naming conventions** (Coding Standards): kebab-case filename (`graph.mjs`), camelCase for all functions and variables (`buildGraph`, `resolveImport`, `resolveModule`, `classifyEdge`), UPPER_SNAKE_CASE for constants (`EXTENSION_SUFFIXES`).
4. **Import ordering** (Coding Standards): Node.js built-ins listed first and exclusively.
5. **Single responsibility**: The module does one thing -- build a dependency graph from parsed file data. It does not parse files or rank symbols.
6. **Clear interfaces**: One public export (`buildGraph`) with a comprehensive JSDoc type signature. Internal helpers are non-exported functions.

## The Code

```javascript
/**
 * Dependency graph builder for tree-sitter repomap.
 *
 * Consumes parsed file data (symbols + imports) and produces a file-level
 * dependency graph with nodes and edges.
 */

// PRINCIPLE: Import ordering — Node.js built-ins first and exclusively.
// No external packages imported.
import { execSync } from 'node:child_process';
import { resolve, relative, dirname, normalize } from 'node:path';

/**
 * Extensions to try when resolving bare import specifiers, in order.
 *
 * PRINCIPLE: Naming conventions — UPPER_SNAKE_CASE for module-level constants.
 */
const EXTENSION_SUFFIXES = [
  '', '.ts', '.tsx', '.js', '.jsx',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

/**
 * Build a file-level dependency graph from parsed file data.
 *
 * PATTERN: Public API uses comprehensive JSDoc with @param and @returns.
 * The type signatures serve as documentation since the project does not
 * use TypeScript.
 *
 * @param {Array<{filePath: string, symbols: Array<{name: string, kind: string, line: number}>, imports: Array<{source: string, symbols: string[], isTypeOnly: boolean, isDynamic: boolean}>}>} parsedFiles
 * @param {string} projectRoot
 * @param {Array<{slug: string, paths: string[]}>} modules
 * @returns {{generated: string, commit: string, nodes: Array, edges: Array}}
 */
export function buildGraph(parsedFiles, projectRoot, modules) {
  const commit = getCommitHash();
  const generated = new Date().toISOString();

  // Build a lookup from relative path to parsed file data
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
      // PATTERN: Skip external packages — only resolve relative imports.
      if (!imp.source.startsWith('.') && !imp.source.startsWith('/')) {
        continue;
      }
      const resolvedRelPath = resolveImport(imp.source, importingDir, projectRoot, filesByRelPath);
      if (resolvedRelPath === null) continue;

      const type = classifyEdge(imp, pf.symbols);
      edges.push({ from: relPath, to: resolvedRelPath, type, symbols: imp.symbols });
    }
  }

  return { generated, commit, nodes, edges };
}

/**
 * Resolve an import source to a relative path within the project.
 *
 * PATTERN: Internal helpers are non-exported functions. They use the same
 * JSDoc convention but are not part of the module's public API.
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
    if (relCandidate.startsWith('..') || relCandidate.startsWith('/')) continue;
    if (filesByRelPath.has(relCandidate)) return relCandidate;
  }
  return null;
}

/**
 * Determine the module slug for a file path based on modules config.
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
 * Classify an import edge based on its properties.
 *
 * PATTERN: Small, focused helper. Each function does one thing.
 */
function classifyEdge(imp, importingFileSymbols) {
  const exportedNames = new Set(importingFileSymbols.map(s => s.name));
  const isReExport = imp.symbols.length > 0 && imp.symbols.some(s => exportedNames.has(s));
  if (isReExport) return 're-export';
  if (imp.isTypeOnly) return 'type-import';
  if (imp.isDynamic) return 'dynamic-import';
  return 'import';
}

/**
 * Get the current git HEAD short hash, or "unknown" on failure.
 *
 * PRINCIPLE: Minimize external dependencies — uses execSync directly
 * rather than a git library.
 */
function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}
```

## Test Coverage

The test file `tests/repomap/graph.test.mjs` verifies the graph building behavior:

- Nodes are created from parsed file data with correct relative paths
- Edges are created for relative imports and skip external packages
- Module slugs are resolved correctly from manifest configuration
- Import classification (import, type-import, dynamic-import, re-export) works correctly
- Path containment prevents resolution outside the project root

## Usage Guide

Reference this sample when:
- **Writing a new library module** in `lib/` -- follow the same structure (module docstring, imports, constants, public export, private helpers)
- **Designing a module's public API** -- expose one or few named exports with comprehensive JSDoc; keep helpers private
- **Implementing algorithms** without external dependencies -- this shows how to build non-trivial data structures using only built-in tools
- **Writing JSDoc** for complex parameter types -- the `@param` annotations show how to document nested object shapes

What to adapt:
- The specific data structures and algorithms
- The number of public exports (one is ideal, but more are acceptable)

What to keep exactly:
- The `.mjs` extension
- The import ordering (Node built-ins first)
- The naming conventions (camelCase functions, UPPER_SNAKE_CASE constants)
- The JSDoc annotations on all exported and internal functions
- The single-responsibility scope (one module = one concern)
