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
 * Infra-dependent suites fall into two buckets, both excluded from the
 * default `files` set by directory/filename convention (never a runtime
 * `{ skip: <reason> }` decided at test time — see `isEvalFile`/
 * `isLiveInfraFile` below for why): `evals` (local machine state — docker,
 * an API key, local session data; `npm run test:evals`) and `liveInfra`
 * (real side effects on a live external account, e.g. creating a GitHub
 * repo; `npm run test:integration`). Once explicitly selected via
 * `--evals`/`--live-infra`, a suite whose infra is actually missing must
 * fail hard naming the gap, not skip silently — see each file's own guard.
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

const LIVE_INFRA_SUFFIX = '-live.test.mjs';

/**
 * True when `file` requires REAL external infrastructure with genuine
 * side effects on a live third-party service (as opposed to `evals`, which
 * need local machine state like docker/API keys but stay within this
 * machine). `tests/integration/bugfix-loop-commit-pr-live.test.mjs`
 * (bugfix-loop-execution-hardening.spec.md BEH-4/BEH-7, Migration Path
 * Step 3 Verification) is the first instance: it creates/deletes a real
 * GitHub repo via an authenticated `gh` CLI. Same rationale as
 * {@link isEvalFile} — default `npm test` must not depend on, or act on,
 * machine/account state, and here that state is a live external account,
 * not just a local docker container. Selected by the `-live.test.mjs`
 * filename suffix, mirroring `evals`' directory-based convention with a
 * suffix instead (a directory-wide `tests/integration/` exclusion would be
 * wrong — most files there use only local temp git repos, no live infra).
 *
 * @param {string} file Absolute path to a test file.
 * @returns {boolean}
 */
export function isLiveInfraFile(file) {
  return file.endsWith(LIVE_INFRA_SUFFIX);
}

/**
 * Partition every test file on disk into exactly four buckets.
 *
 * @returns {{ files: string[], evals: string[], excluded: string[], liveInfra: string[] }}
 *   `files` — the default `npm test` set.
 *   `evals` — opt-in harnesses (`npm run test:evals`).
 *   `excluded` — nested fixture projects' own suites; never run by us.
 *   `liveInfra` — opt-in, real-external-side-effect suites (`npm run test:integration`).
 *   All repo-relative and sorted.
 */
export function discoverTests() {
  const all = collectTestFiles(TESTS_DIR);
  const files = [];
  const evals = [];
  const excluded = [];
  const liveInfra = [];
  for (const abs of all) {
    const rel = relative(REPO_ROOT, abs);
    if (isNestedProjectFile(abs)) excluded.push(rel);
    // isEvalFile checked first: tests/evals/**/*-live.test.mjs (e.g.
    // configurable-governance/tier3-live.test.mjs, "live-runner" as opposed
    // to a stub dispatcher — nothing to do with a live EXTERNAL account)
    // stays an eval, not a liveInfra suite. The `-live` suffix only means
    // "real external side effects" outside tests/evals/.
    else if (isEvalFile(abs)) evals.push(rel);
    else if (isLiveInfraFile(abs)) liveInfra.push(rel);
    else files.push(rel);
  }
  files.sort();
  evals.sort();
  excluded.sort();
  liveInfra.sort();
  return { files, evals, excluded, liveInfra };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, evals, excluded, liveInfra } = discoverTests();
  const argv = process.argv.slice(2);

  const wantEvals = argv.includes('--evals');
  const wantAll = argv.includes('--all');
  const wantLiveInfra = argv.includes('--live-infra');
  // `--all` deliberately does NOT include `liveInfra` — unlike evals (local
  // machine state only), live-infra suites create real side effects on a
  // live external account. Only the explicit `--live-infra` flag runs them,
  // never a broad-sweep flag someone might reach for casually.
  const selected = wantLiveInfra
    ? liveInfra
    : wantEvals
      ? evals
      : wantAll
        ? [...files, ...evals].sort()
        : files;

  if (argv.includes('--list')) {
    for (const f of selected) console.log(f);
    process.exit(0);
  }

  if (selected.length === 0) {
    console.error(
      `run-tests: no test files selected${wantEvals ? ' (--evals)' : wantLiveInfra ? ' (--live-infra)' : ''} — refusing to report success.`,
    );
    process.exit(1);
  }

  console.error(
    `run-tests: running ${selected.length} of ${files.length + evals.length + excluded.length + liveInfra.length} files ` +
      `[default ${files.length} | evals ${evals.length} (npm run test:evals) | ` +
      `live-infra ${liveInfra.length} (npm run test:integration) | ` +
      `nested fixture projects ${excluded.length} (never run)]`,
  );

  const passthrough = argv.filter((a) => !['--list', '--evals', '--all', '--live-infra'].includes(a));
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
