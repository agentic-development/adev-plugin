/**
 * Test Helper Inventory
 *
 * Builds a deterministic, language-agnostic inventory of a project's shared test
 * helpers, fixtures, setup modules, and curated golden TEST samples, so that
 * contextless write-test / implement subagents reuse what already exists instead
 * of re-deriving their own setup.
 *
 * Spec: .context-index/specs/features/test-strategies/test-helper-inventory.spec.md
 *
 * Design notes worth keeping in view:
 *   - The walk is bounded by COUNTS, never by elapsed time. `detection.mjs` uses a
 *     2000ms deadline, which is fine for a one-shot advisory scan but would make this
 *     output nondeterministic near the boundary — and this output is injected into
 *     subagent prompts and written into packets, where churn is a real cost.
 *   - Glob matching reuses `matchGlob()` from ./manifest.mjs. Note `matchGlob('a/**', p)`
 *     compiles to /^a\/.*$/ — it matches files UNDER `a`, never `a` itself. Directory
 *     probes are therefore written without a trailing `/**` and matched against
 *     directory paths during the walk.
 *   - Symbol extraction is regex-only (Non-Negotiable Principle 1 — no parser dep).
 *     It is a pointer ("this file exists and appears to export these things"), not an
 *     API contract.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

import { matchGlob } from './manifest.mjs';

/** Directories never descended into. */
export const SKIP_DIRS = Object.freeze([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'out',
  'vendor',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  '.tox',
  'coverage',
  '.pytest_cache',
]);

/** Max directory entries visited before the walk gives up (deterministic bound). */
const MAX_VISITED = 20_000;
/** Max inventory entries returned. */
const MAX_ENTRIES = 200;
/** Max symbols reported per file. */
const MAX_SYMBOLS = 25;
/** Files above this size are listed without symbol extraction. */
const MAX_SYMBOL_FILE_BYTES = 512 * 1024;
/** Default line budget for the injected text render. */
const DEFAULT_BUDGET = 60;

/** Fixed emission order for entry kinds. */
const KIND_ORDER = Object.freeze(['helper', 'fixture', 'setup']);

const JS_EXTS = Object.freeze(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts']);

/**
 * The language registry. A data table: add a row to support a language.
 *
 * Row shape:
 *   language   — language id, or null for the language-less directory row
 *   kind       — 'helper' | 'fixture' | 'setup'
 *   globs      — repo-relative POSIX globs
 *   exts       — optional file-extension allowlist (so a shared glob like
 *                `** /tests/support/**` classifies factory.py as python, not javascript)
 *   directory  — when true, globs match DIRECTORY paths; the walk stops there and the
 *                entry is reported once with a fileCount
 */
export const HELPER_REGISTRY = Object.freeze([
  {
    language: 'javascript',
    kind: 'helper',
    exts: JS_EXTS,
    globs: [
      '**/tests/helpers.*',
      '**/test/helpers.*',
      '**/tests/**/helpers.*',
      '**/test-utils.*',
      '**/testUtils.*',
      '**/tests/support/**',
      '**/test/support/**',
    ],
  },
  {
    language: 'javascript',
    kind: 'setup',
    exts: JS_EXTS,
    globs: ['**/*.setup.js', '**/*.setup.ts', '**/*.setup.mjs', '**/jest.setup.*', '**/vitest.setup.*'],
  },
  { language: 'python', kind: 'fixture', exts: ['.py'], globs: ['**/conftest.py'] },
  {
    language: 'python',
    kind: 'helper',
    exts: ['.py'],
    globs: ['**/tests/helpers.py', '**/tests/utils.py', '**/tests/support/**'],
  },
  {
    language: 'ruby',
    kind: 'setup',
    exts: ['.rb'],
    globs: ['spec/spec_helper.rb', 'spec/rails_helper.rb', 'test/test_helper.rb'],
  },
  { language: 'ruby', kind: 'helper', exts: ['.rb'], globs: ['spec/support/**', 'test/support/**'] },
  {
    language: 'go',
    kind: 'helper',
    exts: ['.go'],
    globs: ['**/testutil/**', '**/testutils/**', '**/testhelpers/**', '**/*_test_helper.go'],
  },
  { language: 'rust', kind: 'helper', exts: ['.rs'], globs: ['tests/common/**'] },
  {
    language: 'java',
    kind: 'helper',
    exts: ['.java', '.kt'],
    globs: [
      '**/*TestBase.java',
      '**/*TestUtils.java',
      '**/Abstract*Test.java',
      '**/*TestBase.kt',
      '**/*TestUtils.kt',
    ],
  },
  { language: 'elixir', kind: 'setup', exts: ['.exs'], globs: ['test/test_helper.exs'] },
  { language: 'elixir', kind: 'helper', exts: ['.ex', '.exs'], globs: ['test/support/**'] },
  { language: 'php', kind: 'setup', exts: ['.php'], globs: ['tests/bootstrap.php'] },
  { language: 'php', kind: 'helper', exts: ['.php'], globs: ['tests/TestCase.php', 'tests/Traits/**'] },
  {
    language: 'csharp',
    kind: 'helper',
    exts: ['.cs'],
    globs: ['**/*TestBase.cs', '**/*TestFixture.cs', '**/TestUtilities/**'],
  },
  {
    language: null,
    kind: 'fixture',
    directory: true,
    globs: ['**/tests/fixtures', '**/test/fixtures', '**/__mocks__', '**/testdata', 'src/test/resources'],
  },
]);

/** Extension → language, for classifying an arbitrary file handed to `check`. */
const EXT_LANGUAGE = Object.freeze(
  Object.fromEntries([
    ...JS_EXTS.map((e) => [e, 'javascript']),
    ['.py', 'python'],
    ['.rb', 'ruby'],
    ['.go', 'go'],
    ['.rs', 'rust'],
    ['.java', 'java'],
    ['.kt', 'java'],
    ['.ex', 'elixir'],
    ['.exs', 'elixir'],
    ['.php', 'php'],
    ['.cs', 'csharp'],
  ]),
);

/** Test-file path shapes used to classify a golden sample as a TEST sample. */
const TEST_PATH_SHAPES = Object.freeze([
  '**/tests/**',
  '**/test/**',
  '**/spec/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*_test.*',
  '**/test_*.py',
]);

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

/**
 * Per-language extraction rules. `exported` applies by default; `local` adds the
 * looser forms used by `check` (a helper redefined locally is rarely exported).
 */
const SYMBOL_RULES = Object.freeze({
  javascript: {
    exported: [
      { re: /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: 'function' },
      { re: /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
      { re: /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, kind: 'constant' },
    ],
    local: [
      { re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: 'function' },
      { re: /^\s*class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
      { re: /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, kind: 'constant' },
    ],
    // `export { a, b as c }` — handled separately because it yields many names per line.
    exportList: /^\s*export\s*\{([^}]*)\}/,
  },
  python: {
    exported: [
      { re: /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' },
      { re: /^class\s+([A-Za-z_]\w*)/, kind: 'class' },
    ],
    local: [
      { re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' },
      { re: /^\s*class\s+([A-Za-z_]\w*)/, kind: 'class' },
    ],
    fixtureDecorator: /^\s*@(?:pytest\.)?fixture\b/,
  },
  ruby: {
    exported: [
      { re: /^\s*def\s+([A-Za-z_][\w?!]*)/, kind: 'function' },
      { re: /^\s*(?:module|class)\s+([A-Z]\w*)/, kind: 'class' },
      { re: /^\s*let\(:([A-Za-z_]\w*)\)/, kind: 'fixture' },
    ],
    local: [],
  },
  go: {
    exported: [{ re: /^\s*func\s+([A-Z]\w*)\s*\(/, kind: 'function' }],
    local: [{ re: /^\s*func\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' }],
  },
  rust: {
    exported: [
      { re: /^\s*pub\s+fn\s+([A-Za-z_]\w*)/, kind: 'function' },
      { re: /^\s*pub\s+struct\s+([A-Za-z_]\w*)/, kind: 'class' },
    ],
    local: [
      { re: /^\s*fn\s+([A-Za-z_]\w*)/, kind: 'function' },
      { re: /^\s*struct\s+([A-Za-z_]\w*)/, kind: 'class' },
    ],
  },
  java: {
    exported: [
      { re: /^\s*public\s+(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, kind: 'class' },
      { re: /^\s*public\s+(?:static\s+)?(?:final\s+)?[\w<>[\],.]+\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' },
    ],
    local: [
      { re: /^\s*(?:private|protected)?\s*(?:static\s+)?[\w<>[\],.]+\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' },
    ],
  },
  elixir: {
    exported: [
      { re: /^\s*def\s+([a-z_]\w*[?!]?)/, kind: 'function' },
      { re: /^\s*defmodule\s+([A-Z][\w.]*)/, kind: 'class' },
    ],
    local: [{ re: /^\s*defp\s+([a-z_]\w*[?!]?)/, kind: 'function' }],
  },
  php: {
    exported: [
      { re: /^\s*public\s+(?:static\s+)?function\s+([A-Za-z_]\w*)/, kind: 'function' },
      { re: /^\s*(?:final\s+|abstract\s+)?class\s+([A-Za-z_]\w*)/, kind: 'class' },
      { re: /^\s*trait\s+([A-Za-z_]\w*)/, kind: 'class' },
    ],
    local: [{ re: /^\s*(?:private|protected)\s+function\s+([A-Za-z_]\w*)/, kind: 'function' }],
  },
  csharp: {
    exported: [
      { re: /^\s*public\s+(?:abstract\s+|sealed\s+|static\s+)?class\s+([A-Za-z_]\w*)/, kind: 'class' },
      { re: /^\s*public\s+(?:static\s+)?[\w<>[\],.]+\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' },
    ],
    local: [{ re: /^\s*(?:private|internal)\s+[\w<>[\],.]+\s+([A-Za-z_]\w*)\s*\(/, kind: 'function' }],
  },
});

/**
 * Extract helper symbols from source text.
 *
 * @param {string} content
 * @param {string|null} language - registry language id
 * @param {{ exportedOnly?: boolean, limit?: number }} [options]
 * @returns {Array<{ name: string, kind: string, line: number }>}
 */
export function extractSymbols(content, language, options = {}) {
  const { exportedOnly = true, limit = Infinity } = options;
  const rules = SYMBOL_RULES[language];
  if (!rules || typeof content !== 'string') return [];

  const active = exportedOnly ? rules.exported : [...rules.exported, ...rules.local];
  const lines = content.split('\n');
  const seen = new Set();
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // `export { a, b as c }` yields several names from one line.
    if (rules.exportList) {
      const listMatch = line.match(rules.exportList);
      if (listMatch) {
        for (const raw of listMatch[1].split(',')) {
          const parts = raw.trim().split(/\s+as\s+/);
          const name = (parts[parts.length - 1] || '').trim();
          if (name && /^[A-Za-z_$][\w$]*$/.test(name) && !seen.has(name)) {
            seen.add(name);
            out.push({ name, kind: 'constant', line: i + 1 });
          }
        }
        continue;
      }
    }

    for (const rule of active) {
      const m = line.match(rule.re);
      if (!m) continue;
      const name = m[1];
      if (seen.has(name)) break;
      let kind = rule.kind;
      // A python def preceded (within 3 lines) by a fixture decorator is a fixture.
      if (rules.fixtureDecorator && kind === 'function') {
        for (let back = 1; back <= 3 && i - back >= 0; back++) {
          if (rules.fixtureDecorator.test(lines[i - back])) {
            kind = 'fixture';
            break;
          }
          if (lines[i - back].trim() !== '' && !lines[i - back].trim().startsWith('@')) break;
        }
      }
      seen.add(name);
      out.push({ name, kind, line: i + 1 });
      break;
    }
    if (out.length >= limit) break;
  }

  out.sort((a, b) => a.line - b.line || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function toPosix(p) {
  return p.split(sep).join('/');
}

function extOf(relPath) {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

function matchesAny(globs, relPath) {
  for (const g of globs) {
    if (matchGlob(g, relPath)) return true;
  }
  return false;
}

/**
 * Basenames that identify a file as a test CASE rather than shared infrastructure.
 * A test case consumes helpers; it is never itself an inventory entry. Without this
 * guard `**\/tests/**\/helpers.*` matches `tests/cli/test-helpers.test.mjs`, because
 * `matchGlob` compiles `**` to `.*`, which crosses segment boundaries.
 */
const TEST_CASE_BASENAMES = Object.freeze([
  /\.test\.[^.]+$/,
  /\.spec\.[^.]+$/,
  /_test\.[^.]+$/,
  /_spec\.[^.]+$/,
  /^test_[^/]*\.py$/,
]);

function isTestCaseFile(relPath) {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  return TEST_CASE_BASENAMES.some((re) => re.test(base));
}

/** First registry row whose globs (and extension allowlist) accept this file. */
function rowForFile(relPath) {
  if (isTestCaseFile(relPath)) return null;
  const ext = extOf(relPath);
  for (const row of HELPER_REGISTRY) {
    if (row.directory) continue;
    if (row.exts && !row.exts.includes(ext)) continue;
    if (matchesAny(row.globs, relPath)) return row;
  }
  return null;
}

/** First directory-shaped registry row accepting this directory path. */
function rowForDir(relDir) {
  for (const row of HELPER_REGISTRY) {
    if (!row.directory) continue;
    if (matchesAny(row.globs, relDir)) return row;
  }
  return null;
}

/** Count files beneath a directory (bounded, used only for the fixture-dir roll-up). */
function countFiles(absDir, budget = 2000) {
  let count = 0;
  const stack = [absDir];
  while (stack.length > 0 && count < budget) {
    const dir = stack.pop();
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        if (!SKIP_DIRS.includes(d.name)) stack.push(join(dir, d.name));
      } else if (d.isFile()) {
        count++;
      }
    }
  }
  return count;
}

function parseHelperDeclaration(manifest, warnings) {
  const raw = manifest?.test_helpers;
  const result = { paths: [], exclude: [], detect: true };
  if (raw === undefined || raw === null) return result;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('test_helpers must be a mapping — ignoring the section and using built-in probes');
    return result;
  }
  if (raw.paths !== undefined) {
    if (Array.isArray(raw.paths)) result.paths = raw.paths.filter((p) => typeof p === 'string');
    else warnings.push('test_helpers.paths must be an array — ignoring it');
  }
  if (raw.exclude !== undefined) {
    if (Array.isArray(raw.exclude)) result.exclude = raw.exclude.filter((p) => typeof p === 'string');
    else warnings.push('test_helpers.exclude must be an array — ignoring it');
  }
  if (raw.detect === false) result.detect = false;
  return result;
}

function readSymbols(absPath, language, warnings, relPath) {
  let size = 0;
  try {
    size = statSync(absPath).size;
  } catch (err) {
    warnings.push(`could not stat ${relPath}: ${err.message}`);
    return { symbols: [], symbolsTruncated: 0, oversize: false };
  }
  if (size > MAX_SYMBOL_FILE_BYTES) {
    return { symbols: [], symbolsTruncated: 0, oversize: true };
  }
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch (err) {
    warnings.push(`could not read ${relPath}: ${err.message}`);
    return { symbols: [], symbolsTruncated: 0, oversize: false };
  }
  const all = extractSymbols(content, language);
  return {
    symbols: all.slice(0, MAX_SYMBOLS),
    symbolsTruncated: Math.max(0, all.length - MAX_SYMBOLS),
    oversize: false,
  };
}

/**
 * Walk the project and collect shared-helper entries.
 *
 * @param {string} projectRoot
 * @param {{ manifest?: object|null }} [options]
 * @returns {{ entries: object[], warnings: string[], truncated: boolean }}
 */
export function collectHelperSources(projectRoot, options = {}) {
  const warnings = [];
  const decl = parseHelperDeclaration(options.manifest, warnings);

  if (!projectRoot || !existsSync(projectRoot)) {
    warnings.push(`project root does not exist: ${projectRoot}`);
    return { entries: [], warnings, truncated: false };
  }

  const found = new Map(); // relPath → entry
  let visited = 0;
  let truncated = false;
  const stack = [''];

  while (stack.length > 0) {
    const relDir = stack.pop();
    const absDir = relDir === '' ? projectRoot : join(projectRoot, relDir);
    let dirents;
    try {
      dirents = readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      warnings.push(`could not read directory ${relDir || '.'}: ${err.message}`);
      continue;
    }
    // Name-sorted, reverse-pushed onto the stack so pops are ascending: the visit
    // order is deterministic, which keeps a truncated result stable.
    dirents.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

    for (const d of dirents) {
      if (visited >= MAX_VISITED) {
        truncated = true;
        break;
      }
      visited++;
      if (d.isSymbolicLink()) continue;
      const rel = relDir === '' ? d.name : `${relDir}/${d.name}`;

      if (d.isDirectory()) {
        if (SKIP_DIRS.includes(d.name)) continue;
        const dirRow = decl.detect ? rowForDir(rel) : null;
        if (dirRow) {
          found.set(rel, {
            path: rel,
            kind: dirRow.kind,
            language: dirRow.language,
            directory: true,
            fileCount: countFiles(join(projectRoot, rel)),
            symbols: [],
            symbolsTruncated: 0,
          });
          continue; // do not descend — the roll-up covers everything beneath
        }
        stack.push(rel);
        continue;
      }
      if (!d.isFile()) continue;

      const row = decl.detect ? rowForFile(rel) : null;
      const declared = !row && decl.paths.length > 0 && matchesAny(decl.paths, rel);
      if (!row && !declared) continue;

      const language = row ? row.language : (EXT_LANGUAGE[extOf(rel)] ?? null);
      const kind = row ? row.kind : 'helper';
      const sym = readSymbols(join(projectRoot, rel), language, warnings, rel);
      found.set(rel, {
        path: rel,
        kind,
        language,
        directory: false,
        source: row ? 'registry' : 'manifest',
        ...sym,
      });
    }
    if (truncated) break;
  }

  // `paths` may name a file the walk skipped (e.g. inside a rolled-up directory);
  // it is additive, so honour it explicitly.
  for (const g of decl.paths) {
    if (!g.includes('*') && !found.has(g)) {
      const abs = join(projectRoot, g);
      if (existsSync(abs)) {
        const language = EXT_LANGUAGE[extOf(g)] ?? null;
        found.set(g, {
          path: toPosix(g),
          kind: 'helper',
          language,
          directory: false,
          source: 'manifest',
          ...readSymbols(abs, language, warnings, g),
        });
      }
    }
  }

  let entries = [...found.values()];
  if (decl.exclude.length > 0) {
    entries = entries.filter((e) => !matchesAny(decl.exclude, e.path));
  }

  entries.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );

  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(0, MAX_ENTRIES);
    truncated = true;
  }

  return { entries, warnings, truncated };
}

// ---------------------------------------------------------------------------
// Golden TEST samples
// ---------------------------------------------------------------------------

/**
 * Collect curated golden samples that describe TEST code.
 *
 * A sample qualifies if it declares `> **Sample kind:** test`, or if its
 * `> **Source:**` path looks like test code. The second clause is what lets the
 * existing sample library be reused without re-curation.
 *
 * @param {string} projectRoot
 * @returns {Array<{ path: string, title: string, source: string|null, kind: string }>}
 */
export function collectTestSamples(projectRoot) {
  const dir = join(projectRoot, '.context-index', 'samples');
  if (!existsSync(dir)) return [];
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }

  const out = [];
  for (const name of names.sort()) {
    let content;
    try {
      content = readFileSync(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    const kindMatch = content.match(/^>\s*\*\*Sample kind:\*\*\s*(\S+)/m);
    const sourceMatch = content.match(/^>\s*\*\*Source:\*\*\s*(.+?)\s*$/m);
    const titleMatch = content.match(/^#\s+(.+?)\s*$/m);
    const source = sourceMatch ? sourceMatch[1].trim() : null;

    const declared = kindMatch ? kindMatch[1].toLowerCase() === 'test' : false;
    const inferred = source ? isTestShapedPath(source) : false;
    if (!declared && !inferred) continue;

    out.push({
      path: `.context-index/samples/${name}`,
      title: titleMatch ? titleMatch[1].trim() : name,
      source,
      kind: 'test',
    });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

/** True when a repo-relative path looks like test code (helper probes or path shapes). */
export function isTestShapedPath(relPath) {
  const p = toPosix(String(relPath).replace(/^\.\//, ''));
  if (matchesAny(TEST_PATH_SHAPES, p)) return true;
  for (const row of HELPER_REGISTRY) {
    if (matchesAny(row.globs, p)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Inventory assembly and rendering
// ---------------------------------------------------------------------------

/**
 * Build the full inventory for a project root.
 *
 * @param {string} projectRoot
 * @param {{ manifest?: object|null }} [options]
 * @returns {{ root: string, entries: object[], samples: object[], warnings: string[], truncated: boolean, empty: boolean }}
 */
export function buildInventory(projectRoot, options = {}) {
  const { entries, warnings, truncated } = collectHelperSources(projectRoot, options);
  const samples = collectTestSamples(projectRoot);
  return {
    root: toPosix(projectRoot),
    entries,
    samples,
    warnings,
    truncated,
    empty: entries.length === 0 && samples.length === 0,
  };
}

const EMPTY_RENDER = 'No shared test helpers, fixtures, or test samples detected.';

function renderEntryLine(entry) {
  if (entry.directory) {
    return `${entry.kind.padEnd(7)} ${entry.path}/ (${entry.fileCount} file${entry.fileCount === 1 ? '' : 's'})`;
  }
  const lang = entry.language ? ` [${entry.language}]` : '';
  const names = entry.symbols.map((s) => s.name);
  let symbolText = '';
  if (names.length > 0) {
    symbolText = ` — ${names.join(', ')}`;
    if (entry.symbolsTruncated > 0) symbolText += `, +${entry.symbolsTruncated} more`;
  }
  return `${entry.kind.padEnd(7)} ${entry.path}${lang}${symbolText}`;
}

/**
 * Render the inventory as a budget-capped text block suitable for a subagent prompt.
 *
 * @param {object} inventory - result of buildInventory()
 * @param {{ maxLines?: number }} [options]
 * @returns {string}
 */
export function renderInventoryText(inventory, options = {}) {
  const maxLines = Number.isInteger(options.maxLines) && options.maxLines > 0 ? options.maxLines : DEFAULT_BUDGET;
  if (!inventory || inventory.empty) return EMPTY_RENDER;

  const body = [];
  for (const entry of inventory.entries) body.push(renderEntryLine(entry));
  for (const sample of inventory.samples) {
    const src = sample.source ? ` (source: ${sample.source})` : '';
    body.push(`sample  ${sample.path} — ${sample.title}${src}`);
  }

  const header = 'Shared test helpers, fixtures, and golden test samples already in this project:';
  const lines = [header, ''];

  const roomForBody = maxLines - lines.length;
  if (roomForBody <= 0) return body.length > 0 ? `+${body.length} more not shown` : EMPTY_RENDER;

  if (body.length <= roomForBody) {
    lines.push(...body);
  } else {
    const keep = Math.max(0, roomForBody - 1);
    lines.push(...body.slice(0, keep));
    lines.push(
      `+${body.length - keep} more not shown — run \`adev test-helpers inventory --format json\` for the full list.`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Advisory duplicate detection
// ---------------------------------------------------------------------------

function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Report symbols defined in `relFilePath` whose names already exist in some other
 * shared helper. Advisory only — the caller never blocks on findings.
 *
 * @param {string} projectRoot
 * @param {string} relFilePath - repo-relative POSIX path
 * @param {{ manifest?: object|null, inventory?: object }} [options]
 * @returns {{ file: string, findings: object[], checked: number }}
 */
export function findDuplicateHelpers(projectRoot, relFilePath, options = {}) {
  const inventory = options.inventory ?? buildInventory(projectRoot, options);
  const rel = toPosix(relFilePath);

  const index = new Map(); // normalized name → { path, symbol }
  let checked = 0;
  for (const entry of inventory.entries) {
    if (entry.path === rel || entry.directory) continue;
    for (const symbol of entry.symbols) {
      checked++;
      const key = normalizeName(symbol.name);
      if (!index.has(key)) index.set(key, { path: entry.path, symbol: symbol.name });
    }
  }

  let content;
  try {
    content = readFileSync(join(projectRoot, rel), 'utf8');
  } catch (err) {
    const e = new Error(`FILE_NOT_FOUND: ${rel} (${err.message})`);
    e.code = 'FILE_NOT_FOUND';
    throw e;
  }

  const language = EXT_LANGUAGE[extOf(rel)] ?? null;
  const local = extractSymbols(content, language, { exportedOnly: false });

  const findings = [];
  const reported = new Set();
  for (const symbol of local) {
    const key = normalizeName(symbol.name);
    if (!index.has(key) || reported.has(key)) continue;
    reported.add(key);
    findings.push({ name: symbol.name, line: symbol.line, helper: index.get(key) });
  }
  findings.sort((a, b) => a.line - b.line || (a.name < b.name ? -1 : 1));

  return { file: rel, findings, checked };
}
