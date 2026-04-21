/**
 * Strategy Detection Heuristics
 *
 * Detects applicable test strategies for a project root or a set of file paths.
 */

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';

const SCAN_TIMEOUT_MS = 2000;

/**
 * Checks if a path segment matches any of the given directory names.
 * @param {string[]} parts - Path segments split by separator
 * @param {string[]} names - Directory names to look for
 * @returns {boolean}
 */
function hasDir(parts, names) {
  return names.some((name) => parts.includes(name));
}

/**
 * Reads package.json from projectRoot and checks if it contains any of the given keywords.
 * @param {string} projectRoot
 * @param {string[]} keywords
 * @returns {boolean}
 */
function packageJsonContains(projectRoot, keywords) {
  const pkgPath = join(projectRoot, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const content = readFileSync(pkgPath, 'utf8');
    const lower = content.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  } catch {
    return false;
  }
}

/**
 * Scans project files and returns detected strategy IDs with confidence levels.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<Array<{ strategyId: string, confidence: string, partial?: boolean }>>}
 */
export async function detectStrategies(projectRoot) {
  // Always include unit
  const results = [{ strategyId: 'unit', confidence: 'high' }];

  if (!projectRoot || !existsSync(projectRoot)) {
    console.warn(`[detection] projectRoot does not exist or is not readable: ${projectRoot}`);
    return results;
  }

  let dirents;
  try {
    dirents = readdirSync(projectRoot, { withFileTypes: true, recursive: true });
  } catch (err) {
    console.warn(`[detection] Failed to read project root: ${err.message}`);
    return results;
  }

  // Collect file/dir names and paths, skipping symlinks
  const fileNames = new Set();
  const dirNames = new Set();
  const extensions = new Set();
  let timedOut = false;

  // Use a synchronous scan with a deadline check
  const deadline = Date.now() + SCAN_TIMEOUT_MS;

  for (const dirent of dirents) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    // Skip symlinks
    if (dirent.isSymbolicLink()) continue;

    if (dirent.isDirectory()) {
      dirNames.add(dirent.name);
    } else if (dirent.isFile()) {
      fileNames.add(dirent.name);
      const ext = extname(dirent.name);
      if (ext) extensions.add(ext);
    }
  }

  // --- Detection rules ---

  // fixture: dbt_project.yml OR profiles.yml
  if (fileNames.has('dbt_project.yml') || fileNames.has('profiles.yml')) {
    addStrategy(results, 'fixture', 'high');
  }

  // policy: any *.tf file OR terraform/ directory
  if (hasExtension(extensions, '.tf') || dirNames.has('terraform')) {
    addStrategy(results, 'policy', 'high');
  }

  // policy (medium): Dockerfile OR k8s/ OR kubernetes/ OR helm/
  if (
    fileNames.has('Dockerfile') ||
    dirNames.has('k8s') ||
    dirNames.has('kubernetes') ||
    dirNames.has('helm')
  ) {
    addStrategy(results, 'policy', 'medium');
  }

  // schema: migrations/ directory OR prisma/schema.prisma OR alembic/ OR flyway/
  if (
    dirNames.has('migrations') ||
    fileNames.has('schema.prisma') ||
    dirNames.has('alembic') ||
    dirNames.has('flyway')
  ) {
    addStrategy(results, 'schema', 'high');
  }

  // contract: any *.proto file OR openapi.yaml OR openapi.json OR contracts/
  if (
    hasExtension(extensions, '.proto') ||
    fileNames.has('openapi.yaml') ||
    fileNames.has('openapi.json') ||
    dirNames.has('contracts')
  ) {
    addStrategy(results, 'contract', 'high');
  }

  // visual (medium): src/components/ OR app/components/ with react/vue/svelte/angular in package.json
  if (
    (dirNames.has('components')) &&
    packageJsonContains(projectRoot, ['react', 'vue', 'svelte', 'angular'])
  ) {
    addStrategy(results, 'visual', 'medium');
  }

  // threshold (medium): k6/ OR locust/ OR artillery/ OR any *.bench.* file
  if (
    dirNames.has('k6') ||
    dirNames.has('locust') ||
    dirNames.has('artillery') ||
    hasBenchFile(fileNames)
  ) {
    addStrategy(results, 'threshold', 'medium');
  }

  if (timedOut) {
    return results.map((r) => ({ ...r, partial: true }));
  }

  return results;
}

/**
 * Checks whether the extensions set contains a given extension.
 * @param {Set<string>} extensions
 * @param {string} ext - e.g. '.tf'
 * @returns {boolean}
 */
function hasExtension(extensions, ext) {
  return extensions.has(ext);
}

/**
 * Checks whether any file name matches *.bench.* pattern.
 * @param {Set<string>} fileNames
 * @returns {boolean}
 */
function hasBenchFile(fileNames) {
  for (const name of fileNames) {
    // matches foo.bench.js, foo.bench.ts, etc.
    if (/\.bench\./.test(name)) return true;
  }
  return false;
}

/**
 * Adds a strategy to results, deduplicating by strategyId.
 * Higher confidence wins (high > medium > low).
 * @param {Array<{strategyId: string, confidence: string}>} results
 * @param {string} strategyId
 * @param {string} confidence
 */
function addStrategy(results, strategyId, confidence) {
  const RANK = { high: 2, medium: 1, low: 0 };
  const existing = results.find((r) => r.strategyId === strategyId);
  if (!existing) {
    results.push({ strategyId, confidence });
  } else if (RANK[confidence] > RANK[existing.confidence]) {
    existing.confidence = confidence;
  }
}

/**
 * Detects the best matching test strategy for a set of changed file paths.
 * First matching rule wins.
 *
 * @param {string[]} filePaths - Array of relative or absolute file path strings.
 * @returns {{ strategyId: string, confidence: string }}
 */
export function detectTaskStrategy(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { strategyId: 'unit', confidence: 'high' };
  }

  for (const filePath of filePaths) {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const name = parts[parts.length - 1];
    const ext = extname(name);

    // schema: migrations/, prisma/migrations/, alembic/versions/
    if (
      parts.includes('migrations') ||
      (parts.includes('prisma') && parts.includes('migrations')) ||
      (parts.includes('alembic') && parts.includes('versions'))
    ) {
      return { strategyId: 'schema', confidence: 'high' };
    }

    // policy: *.tf, *.tfvars, k8s/, kubernetes/, helm/
    if (
      ext === '.tf' ||
      ext === '.tfvars' ||
      parts.includes('k8s') ||
      parts.includes('kubernetes') ||
      parts.includes('helm')
    ) {
      return { strategyId: 'policy', confidence: 'high' };
    }

    // fixture: models/**/*.sql (dbt convention)
    if (parts.includes('models') && ext === '.sql') {
      return { strategyId: 'fixture', confidence: 'high' };
    }

    // contract: *.proto, *.pact.json, openapi.yaml, openapi.json
    if (
      ext === '.proto' ||
      name === 'openapi.yaml' ||
      name === 'openapi.json' ||
      name.endsWith('.pact.json')
    ) {
      return { strategyId: 'contract', confidence: 'high' };
    }

    // visual (medium): src/components/ or app/components/ with UI extensions
    const UI_EXTS = new Set(['.jsx', '.tsx', '.vue', '.svelte']);
    if (
      (isUnderDir(parts, 'src', 'components') || isUnderDir(parts, 'app', 'components')) &&
      UI_EXTS.has(ext)
    ) {
      return { strategyId: 'visual', confidence: 'medium' };
    }

    // threshold (medium): *.bench.*, k6/, locust/, artillery/
    if (
      /\.bench\./.test(name) ||
      parts.includes('k6') ||
      parts.includes('locust') ||
      parts.includes('artillery')
    ) {
      return { strategyId: 'threshold', confidence: 'medium' };
    }
  }

  // default
  return { strategyId: 'unit', confidence: 'high' };
}

/**
 * Checks if path parts contain parentDir immediately followed by childDir.
 * @param {string[]} parts
 * @param {string} parentDir
 * @param {string} childDir
 * @returns {boolean}
 */
function isUnderDir(parts, parentDir, childDir) {
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === parentDir && parts[i + 1] === childDir) return true;
  }
  return false;
}
