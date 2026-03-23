/**
 * Pipeline orchestrator for tree-sitter repomap.
 *
 * CLI entry point that orchestrates the full pipeline:
 *   glob files → parse → build graph → compute ranks → write outputs.
 *
 * Usage:
 *   node lib/repomap/index.mjs --root <project-root>
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isTreeSitterAvailable } from './check-deps.mjs';
import typescript from './languages/typescript.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');

const DEFAULT_EXCLUDE = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '*.min.js',
  '*.generated.*',
];

const KNOWN_EXTENSIONS = new Set(typescript.extensions);

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const root = parseArgs(process.argv.slice(2));
  await run(root);
}

/**
 * Parse CLI arguments. Returns the --root path or exits with usage.
 * @param {string[]} args
 * @returns {string}
 */
export function parseArgs(args) {
  const idx = args.indexOf('--root');
  if (idx === -1 || idx + 1 >= args.length) {
    console.error('Usage: node lib/repomap/index.mjs --root <project-root>');
    process.exit(1);
  }
  return resolve(args[idx + 1]);
}

/**
 * Read manifest.yaml from the project root, extracting repomap config.
 *
 * @param {string} root
 * @returns {{ exclude: string[], modules: Array<{slug: string, paths: string[]}> }}
 */
export function readManifest(root) {
  const manifestPath = join(root, '.context-index', 'manifest.yaml');
  const defaults = { exclude: DEFAULT_EXCLUDE, modules: [] };

  if (!existsSync(manifestPath)) {
    console.error(`[repomap] Warning: manifest not found at ${manifestPath}, using defaults`);
    return defaults;
  }

  try {
    const content = readFileSync(manifestPath, 'utf-8');
    return parseManifestYaml(content);
  } catch (err) {
    console.error(`[repomap] Warning: failed to parse manifest: ${err.message}, using defaults`);
    return defaults;
  }
}

/**
 * Simple line-by-line YAML parser for manifest.yaml.
 * Extracts `repomap.exclude` (string[]) and `modules` (object[]).
 *
 * @param {string} content
 * @returns {{ exclude: string[], modules: Array<{slug: string, paths: string[]}> }}
 */
export function parseManifestYaml(content) {
  const lines = content.split('\n');
  const exclude = [];
  const modules = [];

  let inRepomap = false;
  let inExclude = false;
  let inModules = false;
  let currentModule = null;
  let inModulePaths = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Detect top-level keys (no leading whitespace)
    if (/^\S/.test(trimmed)) {
      inRepomap = trimmed.startsWith('repomap:');
      inModules = trimmed.startsWith('modules:');
      inExclude = false;
      inModulePaths = false;
      if (inModules && currentModule) {
        modules.push(currentModule);
        currentModule = null;
      }
      continue;
    }

    // Under repomap:
    if (inRepomap) {
      if (/^\s+exclude:/.test(trimmed)) {
        inExclude = true;
        continue;
      }
      // Another repomap sub-key ends exclude
      if (/^\s+\S+:/.test(trimmed) && !trimmed.match(/^\s+-/)) {
        inExclude = false;
      }
      if (inExclude) {
        const match = trimmed.match(/^\s+-\s+["']?([^"']+?)["']?\s*$/);
        if (match) {
          exclude.push(match[1]);
        }
      }
    }

    // Under modules:
    if (inModules) {
      // New module entry: - slug: foo
      const slugMatch = trimmed.match(/^\s+-\s+slug:\s*["']?([^"'\s]+)["']?/);
      if (slugMatch) {
        if (currentModule) modules.push(currentModule);
        currentModule = { slug: slugMatch[1], paths: [] };
        inModulePaths = false;
        continue;
      }
      if (currentModule) {
        if (/^\s+paths:/.test(trimmed)) {
          inModulePaths = true;
          continue;
        }
        if (inModulePaths) {
          const pathMatch = trimmed.match(/^\s+-\s+["']?([^"']+?)["']?\s*$/);
          if (pathMatch) {
            currentModule.paths.push(pathMatch[1]);
          } else if (/^\s+\S+:/.test(trimmed) && !trimmed.match(/^\s+-/)) {
            inModulePaths = false;
          }
        }
      }
    }
  }

  // Push last module
  if (currentModule) modules.push(currentModule);

  return {
    exclude: exclude.length > 0 ? exclude : DEFAULT_EXCLUDE,
    modules,
  };
}

/**
 * Walk a directory recursively and collect file paths matching known extensions,
 * excluding paths that match exclude patterns.
 *
 * @param {string} root
 * @param {string[]} excludePatterns
 * @returns {string[]} absolute file paths
 */
export function globSourceFiles(root, excludePatterns) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(root, fullPath);

      if (isExcluded(relPath, excludePatterns)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && KNOWN_EXTENSIONS.has(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }

  walk(root);
  return results.sort();
}

/**
 * Check if a relative path matches any exclude pattern.
 * Supports simple glob patterns:
 *   - `dir/**` matches anything under dir/
 *   - `*.ext` matches any file with that extension
 *   - `*.prefix.*` matches files containing the prefix pattern
 */
function isExcluded(relPath, patterns) {
  for (const pattern of patterns) {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (relPath === prefix || relPath.startsWith(prefix + '/')) {
        return true;
      }
    } else if (pattern.startsWith('*.') && pattern.indexOf('*', 1) === -1) {
      // Simple extension pattern: *.min.js
      const suffix = pattern.slice(1); // .min.js
      if (relPath.endsWith(suffix)) {
        return true;
      }
    } else if (pattern.includes('*.') && pattern.startsWith('*')) {
      // Pattern like *.generated.* — match files containing ".generated."
      const inner = pattern.slice(1); // .generated.*
      const dotParts = inner.split('*');
      // For *.generated.* → check if basename contains .generated.
      const base = relPath.split('/').pop();
      if (dotParts.every(part => base.includes(part))) {
        return true;
      }
    } else if (relPath === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Get git short hash, or "unknown".
 */
function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Run the full repomap pipeline.
 * @param {string} root — absolute path to the project root
 */
export async function run(root) {
  const { exclude, modules } = readManifest(root);
  const treeSitterOk = isTreeSitterAvailable();

  const sourceFiles = globSourceFiles(root, exclude);

  // Ensure output directory exists
  const hygieneDir = join(root, '.context-index', 'hygiene');
  mkdirSync(hygieneDir, { recursive: true });

  if (sourceFiles.length === 0) {
    const generated = new Date().toISOString();
    const commit = getCommitHash();
    const content = [
      '# Repository Map',
      '',
      `> Parser: ${treeSitterOk ? 'tree-sitter' : 'regex'}`,
      `> Generated: ${generated}`,
      `> Commit: ${commit}`,
      '',
      '> No source files found.',
      '',
    ].join('\n');

    writeFileSync(join(hygieneDir, 'repo-map.md'), content);
    console.error('[repomap] Warning: no source files found');
    return;
  }

  if (treeSitterOk) {
    await runTreeSitterMode(root, sourceFiles, modules, hygieneDir);
  } else {
    runRegexMode(root, sourceFiles, hygieneDir);
  }
}

/**
 * Tree-sitter pipeline: parse → graph → rank → write.
 */
async function runTreeSitterMode(root, sourceFiles, modules, hygieneDir) {
  // Dynamic imports for tree-sitter-dependent modules
  const { initParser, loadGrammar, parseFile } = await import('./parse.mjs');
  const { buildGraph } = await import('./graph.mjs');
  const { computeRanks } = await import('./rank.mjs');

  // Initialize parser and load grammar
  const parser = await initParser();

  const wasmPath = join(
    PLUGIN_ROOT,
    'node_modules',
    'tree-sitter-typescript',
    'tree-sitter-typescript.wasm',
  );
  const language = await loadGrammar(parser, wasmPath);

  // Parse each file
  const parsedFiles = [];

  for (const filePath of sourceFiles) {
    // Path containment check
    const relPath = relative(root, filePath);
    if (relPath.startsWith('..') || relPath.startsWith('/')) {
      console.error(`[repomap] Warning: skipping file outside project root: ${filePath}`);
      continue;
    }

    let content;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.error(`[repomap] Warning: failed to read ${filePath}: ${err.message}`);
      continue;
    }

    try {
      const result = parseFile(content, language, typescript.queries, typescript.kindMap);
      parsedFiles.push({
        filePath: resolve(filePath),
        symbols: result.symbols,
        imports: result.imports,
      });
    } catch (err) {
      console.error(`[repomap] Warning: failed to parse ${filePath}: ${err.message}`);
    }
  }

  // Build graph
  const graph = buildGraph(parsedFiles, root, modules);

  // Build symbolDetails map for rank computation
  const symbolDetails = new Map();
  for (const pf of parsedFiles) {
    const relPath = relative(root, pf.filePath);
    symbolDetails.set(relPath, pf.symbols);
  }

  // Compute ranks
  const ranks = computeRanks(graph, symbolDetails);

  // Write outputs
  writeRepoMap(hygieneDir, 'tree-sitter', graph, parsedFiles, root);
  writeFileSync(
    join(hygieneDir, 'dependency-graph.json'),
    JSON.stringify(graph, null, 2) + '\n',
  );
  writeFileSync(
    join(hygieneDir, 'symbol-ranks.json'),
    JSON.stringify(ranks, null, 2) + '\n',
  );

  console.error(
    `[repomap] Done: ${parsedFiles.length} files, ${graph.edges.length} edges, ${ranks.symbols.length} symbols`,
  );
}

/**
 * Regex fallback: basic export extraction without tree-sitter.
 */
function runRegexMode(root, sourceFiles, hygieneDir) {
  const generated = new Date().toISOString();
  const commit = getCommitHash();

  const fileSymbols = [];
  for (const filePath of sourceFiles) {
    const relPath = relative(root, filePath);
    let content;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const symbols = extractExportsRegex(content);
    if (symbols.length > 0) {
      fileSymbols.push({ relPath, symbols });
    }
  }

  const lines = [
    '# Repository Map',
    '',
    '> Parser: regex',
    `> Generated: ${generated}`,
    `> Commit: ${commit}`,
    '',
  ];

  if (fileSymbols.length > 0) {
    lines.push('## Symbols', '');
    for (const { relPath, symbols } of fileSymbols) {
      lines.push(`### ${relPath}`);
      for (const sym of symbols) {
        lines.push(`- ${sym.kind} ${sym.name} (line ${sym.line})`);
      }
      lines.push('');
    }
  }

  writeFileSync(join(hygieneDir, 'repo-map.md'), lines.join('\n'));
  console.error(`[repomap] Done (regex mode): ${fileSymbols.length} files`);
}

/**
 * Extract exported symbols using basic regex patterns.
 * @param {string} content
 * @returns {Array<{name: string, kind: string, line: number}>}
 */
function extractExportsRegex(content) {
  const symbols = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // export function name
    const fnMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) {
      symbols.push({ name: fnMatch[1], kind: 'function', line: i + 1 });
      continue;
    }

    // export class Name
    const classMatch = line.match(/^export\s+class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', line: i + 1 });
      continue;
    }

    // export interface Name
    const ifMatch = line.match(/^export\s+interface\s+(\w+)/);
    if (ifMatch) {
      symbols.push({ name: ifMatch[1], kind: 'interface', line: i + 1 });
      continue;
    }

    // export type Name
    const typeMatch = line.match(/^export\s+type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: 'type', line: i + 1 });
      continue;
    }

    // export enum Name
    const enumMatch = line.match(/^export\s+enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: 'enum', line: i + 1 });
      continue;
    }

    // export const/let/var name
    const varMatch = line.match(/^export\s+(?:const|let|var)\s+(\w+)/);
    if (varMatch) {
      symbols.push({ name: varMatch[1], kind: 'constant', line: i + 1 });
      continue;
    }

    // export default
    const defaultMatch = line.match(/^export\s+default\s+(?:function|class)\s+(\w+)/);
    if (defaultMatch) {
      symbols.push({ name: defaultMatch[1], kind: 'function', line: i + 1 });
    }
  }

  return symbols;
}

/**
 * Write the repo-map.md output for tree-sitter mode.
 */
function writeRepoMap(hygieneDir, parser, graph, parsedFiles, root) {
  const lines = [
    '# Repository Map',
    '',
    `> Parser: ${parser}`,
    `> Generated: ${graph.generated}`,
    `> Commit: ${graph.commit}`,
    '',
  ];

  // Symbols section
  lines.push('## Symbols', '');

  for (const pf of parsedFiles) {
    const relPath = relative(root, pf.filePath);
    if (pf.symbols.length === 0) continue;

    lines.push(`### ${relPath}`);
    for (const sym of pf.symbols) {
      lines.push(`- ${sym.kind} ${sym.name} (line ${sym.line})`);
    }
    lines.push('');
  }

  // Dependencies summary
  const typeImports = graph.edges.filter(e => e.type === 'type-import').length;
  const imports = graph.edges.filter(e => e.type === 'import').length;
  const reExports = graph.edges.filter(e => e.type === 're-export').length;

  lines.push('## Dependencies', '');
  lines.push(`${graph.nodes.length} files, ${graph.edges.length} edges`);
  lines.push(`${typeImports} type-imports, ${imports} imports, ${reExports} re-exports`);
  lines.push('');

  writeFileSync(join(hygieneDir, 'repo-map.md'), lines.join('\n'));
}
