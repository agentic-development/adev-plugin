import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * Supported frameworks in priority order.
 * Each entry: { package?, file?, framework, command, filePattern }
 */
const PACKAGE_FRAMEWORKS = [
  { package: 'vitest',  framework: 'vitest',    command: 'npx vitest run', filePattern: '*.test.ts, *.spec.ts' },
  { package: 'jest',    framework: 'jest',      command: 'npx jest',       filePattern: '*.test.js, *.spec.js' },
  { package: 'mocha',   framework: 'mocha',     command: 'npx mocha',      filePattern: '*.test.js, test/*.js' },
  { package: 'jasmine', framework: 'jasmine',   command: 'npx jasmine',    filePattern: '*spec.js, *Spec.js' },
];

const FILE_SCAN_SIGNATURES = [
  { pattern: /['"]vitest['"]/,            framework: 'vitest',  command: 'npx vitest run', filePattern: '*.test.ts, *.spec.ts' },
  { pattern: /['"]@jest\/globals['"]/,    framework: 'jest',    command: 'npx jest',        filePattern: '*.test.js, *.spec.js' },
  { pattern: /from\s+['"]jest['"]/,       framework: 'jest',    command: 'npx jest',        filePattern: '*.test.js, *.spec.js' },
  { pattern: /require\(['"]jest['"]\)/,   framework: 'jest',    command: 'npx jest',        filePattern: '*.test.js, *.spec.js' },
  { pattern: /['"]mocha['"]/,             framework: 'mocha',   command: 'npx mocha',       filePattern: '*.test.js, test/*.js' },
  { pattern: /['"]jasmine['"]/,           framework: 'jasmine', command: 'npx jasmine',     filePattern: '*spec.js, *Spec.js' },
];

/**
 * Check if a file-system item at `path` is a plain Go/Rust/Python marker file.
 */
function detectFromMarkers(projectRoot) {
  try {
    const entries = readdirSync(projectRoot, { withFileTypes: false });
    if (entries.includes('go.mod')) {
      return { framework: 'go test', command: 'go test ./...', filePattern: '*_test.go' };
    }
    if (entries.includes('Cargo.toml')) {
      return { framework: 'cargo test', command: 'cargo test', filePattern: '*_test.rs, tests/*.rs' };
    }
    if (entries.includes('pyproject.toml') || entries.includes('setup.py')) {
      return { framework: 'pytest', command: 'pytest', filePattern: 'test_*.py, *_test.py' };
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

/**
 * Recursively collect test file paths under `dir` (max depth 6).
 * Matches *.test.*, *.spec.*, *_test.*, test_*.py
 */
function collectTestFiles(dir, depth = 0) {
  if (depth > 6) return [];
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results.push(...collectTestFiles(fullPath, depth + 1));
    } else if (entry.isFile()) {
      const name = entry.name;
      if (
        /\.test\.[a-z]+$/.test(name) ||
        /\.spec\.[a-z]+$/.test(name) ||
        /_test\.[a-z]+$/.test(name) ||
        /^test_.*\.py$/.test(name)
      ) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Scan test files for framework import signatures.
 * Reads at most 4096 bytes per file.
 */
function scanFilesForFramework(testFiles) {
  for (const filePath of testFiles) {
    let content;
    try {
      const buf = readFileSync(filePath);
      content = buf.slice(0, 4096).toString('utf-8');
    } catch {
      continue;
    }
    for (const sig of FILE_SCAN_SIGNATURES) {
      if (sig.pattern.test(content)) {
        return { framework: sig.framework, command: sig.command, filePattern: sig.filePattern };
      }
    }
  }
  return null;
}

/**
 * Detect the test framework for the given project root.
 * Returns { framework, command, filePattern } or null.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<{framework: string, command: string, filePattern: string} | null>}
 */
export async function detectFramework(projectRoot) {
  // 1. Check package.json dependencies / devDependencies
  const pkgPath = join(projectRoot, 'package.json');
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    // Malformed or missing — fall through to file scan
  }

  if (pkg) {
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    for (const entry of PACKAGE_FRAMEWORKS) {
      if (allDeps[entry.package] !== undefined) {
        return { framework: entry.framework, command: entry.command, filePattern: entry.filePattern };
      }
    }

    // node:test is available in Node.js >= 18. Use it as the default only when
    // the package.json explicitly declares dependencies or devDependencies (even if empty),
    // confirming this is a Node.js project. A bare {} package.json is ambiguous.
    const hasNodeDepKeys = 'dependencies' in pkg || 'devDependencies' in pkg;
    const nodeVersion = parseInt(process.version.slice(1), 10);
    if (hasNodeDepKeys && nodeVersion >= 18) {
      return { framework: 'node:test', command: 'node --test', filePattern: '*.test.mjs, *.test.js' };
    }
  }

  // 2. Check for language-specific marker files (go.mod, Cargo.toml, pyproject.toml)
  const markerResult = detectFromMarkers(projectRoot);
  if (markerResult) return markerResult;

  // 3. Scan test files for import signatures
  const testFiles = collectTestFiles(projectRoot);
  const scanResult = scanFilesForFramework(testFiles);
  if (scanResult) return scanResult;

  return null;
}
