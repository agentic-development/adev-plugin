#!/usr/bin/env node
/**
 * Test discovery + runner.
 *
 * Why this exists: the previous `npm test` script globbed
 * `tests/*.test.mjs tests/**\/*.test.mjs`. npm runs scripts through `sh`,
 * which does not implement `**` — it degrades to a single `*`, so the second
 * pattern matched only ONE directory deep. Every test nested two or more
 * levels down (tests/lib/issues/…, tests/diagnostics/tier1/…) was silently
 * never handed to the runner: 77 of 416 files, with no error and no skip
 * notice. Discovery now happens here, in Node, where depth is explicit.
 *
 * Exclusion rule: a test file is ours unless it belongs to a NESTED PROJECT —
 * a directory under tests/ that carries its own package.json (the fixture
 * apps under tests/evals/test-strategies/fixtures/*). Those suites are test
 * DATA consumed by the test-strategies eval, not tests of this repo. The rule
 * is derived from the tree rather than hardcoded, so adding a fixture project
 * does not require editing this list.
 *
 * Infra-dependent suites (docker, live API) are NOT excluded: they declare
 * `{ skip: <reason> }` at the suite level, so they report an honest, visible
 * skip rather than disappearing from the run.
 *
 * Zero external dependencies (Constitution Principle 1).
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = join(REPO_ROOT, 'tests');

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', '.tmp']);
const TEST_SUFFIX = '.test.mjs';

/**
 * Recursively collect every `*.test.mjs` under `dir`.
 *
 * @param {string} dir Absolute directory to walk.
 * @param {string[]} [out] Accumulator.
 * @returns {string[]} Absolute paths, unsorted.
 */
export function collectTestFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectTestFiles(join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(TEST_SUFFIX)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * True when `file` belongs to a nested project's OWN suite.
 *
 * A nested project is a directory below `tests/` carrying its own
 * package.json (the fixture apps, and the integration sandbox). Such a
 * project keeps its suite in `<project>/tests/` — those files are test DATA
 * and are excluded. Files sitting at the project root next to its
 * package.json are OUR harness for driving that fixture (e.g.
 * tests/evals/integration-sandbox/build-with-db.test.mjs) and are kept.
 *
 * @param {string} file Absolute path to a test file.
 * @returns {boolean}
 */
export function isNestedProjectFile(file) {
  let dir = dirname(file);
  while (dir.startsWith(TESTS_DIR) && dir !== TESTS_DIR) {
    if (existsSync(join(dir, 'package.json'))) {
      // `dir` is the nested project root. Exclude only its own tests/ tree.
      return file.startsWith(join(dir, 'tests') + '/');
    }
    dir = dirname(dir);
  }
  return false;
}

const EVALS_DIR = join(TESTS_DIR, 'evals');

/**
 * True when `file` is part of the eval harness tree (`tests/evals/`).
 *
 * Evals are graded harnesses, not unit tests. They require deliberate setup
 * that a default `npm test` must not assume: a docker Postgres
 * (evals/integration-sandbox — its own driver says "run `npm run db:up`
 * first"), an ANTHROPIC_API_KEY (evals/comparison), local Claude session
 * JSONL (evals/skill-compression token-budget), or generated fixtures.
 * Running them by default makes the project's single quality gate depend on
 * machine state, which is the opposite of a gate.
 *
 * They are NOT hidden: `npm run test:evals` runs them, this split is
 * asserted by tests/test-discovery.test.mjs, and the runner prints the
 * partition on every invocation. That visibility is what separates this from
 * the shell-glob bug it replaced.
 *
 * @param {string} file Absolute path to a test file.
 * @returns {boolean}
 */
export function isEvalFile(file) {
  return file.startsWith(EVALS_DIR + '/');
}

/**
 * Partition every test file on disk into exactly three buckets.
 *
 * @returns {{ files: string[], evals: string[], excluded: string[] }}
 *   `files` — the default `npm test` set.
 *   `evals` — opt-in harnesses (`npm run test:evals`).
 *   `excluded` — nested fixture projects' own suites; never run by us.
 *   All repo-relative and sorted.
 */
export function discoverTests() {
  const all = collectTestFiles(TESTS_DIR);
  const files = [];
  const evals = [];
  const excluded = [];
  for (const abs of all) {
    const rel = relative(REPO_ROOT, abs);
    if (isNestedProjectFile(abs)) excluded.push(rel);
    else if (isEvalFile(abs)) evals.push(rel);
    else files.push(rel);
  }
  files.sort();
  evals.sort();
  excluded.sort();
  return { files, evals, excluded };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, evals, excluded } = discoverTests();
  const argv = process.argv.slice(2);

  const wantEvals = argv.includes('--evals');
  const wantAll = argv.includes('--all');
  const selected = wantEvals ? evals : wantAll ? [...files, ...evals].sort() : files;

  if (argv.includes('--list')) {
    for (const f of selected) console.log(f);
    process.exit(0);
  }

  if (selected.length === 0) {
    console.error(
      `run-tests: no test files selected${wantEvals ? ' (--evals)' : ''} — refusing to report success.`,
    );
    process.exit(1);
  }

  console.error(
    `run-tests: running ${selected.length} of ${files.length + evals.length + excluded.length} files ` +
      `[default ${files.length} | evals ${evals.length} (npm run test:evals) | ` +
      `nested fixture projects ${excluded.length} (never run)]`,
  );

  const passthrough = argv.filter((a) => !['--list', '--evals', '--all'].includes(a));
  // `selected`, not `files` — `--evals` and `--all` announce their bucket in
  // the banner above and then have to actually run it. Spawning `files` here
  // made both flags silently re-run the default set: `npm run test:evals`
  // printed "running 20 of 454" and then executed all 428 default files,
  // reporting green without ever touching an eval harness.
  const child = spawn(process.execPath, ['--test', ...passthrough, ...selected], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
