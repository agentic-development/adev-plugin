// tests/cli/issues-pr-resolved.test.mjs
//
// Covers `adev issues pr-resolved` (lib/cli/issues-pr-resolved.mjs) and the
// end-to-end BEH-12 exclusion/re-inclusion cycle through the real `adev
// bugfix-loop commit-pr` -> `adev issues next` -> `adev issues pr-resolved`
// -> `adev issues next` sequence (issue-ypa68o / adev-plugin-hg4n).
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initGitRepo, commitFile } from '../helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-pr-resolved-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\ntasks:\n  backend: json\nmodules:\n  - slug: cli\n',
  );
  return dir;
}

function envWithFakeGh(binDir, prUrl = 'https://github.com/org/repo/pull/1') {
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'gh'), `#!/bin/sh\necho "${prUrl}"\nexit 0\n`, { mode: 0o755 });
  return { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
}

test('adev issues pr-resolved rejects missing --issue/--status', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'pr-resolved', '--issue', 'issue-1'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('adev issues pr-resolved rejects an invalid --status', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'pr-resolved', '--issue', 'issue-1', '--status', 'bogus'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('adev issues pr-resolved exits 1 (NO_TRACKED_PR) when the issue has no tracked PR', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'pr-resolved', '--issue', 'issue-1', '--status', 'merged'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /NO_TRACKED_PR/);
  rmSync(dir, { recursive: true, force: true });
});

test('end-to-end: a FIXED issue with commit-pr\'s open PR is excluded from `adev issues next`, then reselectable once `pr-resolved` reports it merged (issue-ypa68o / adev-plugin-hg4n)', () => {
  const dir = makeTempProject();
  initGitRepo(dir);
  commitFile(dir, 'README.md', 'init');
  const bareDir = mkdtempSync(join(tmpdir(), 'pr-resolved-bare-'));
  execSync('git init --bare -b main', { cwd: bareDir, stdio: 'ignore' });
  execSync(`git remote add origin ${bareDir}`, { cwd: dir, stdio: 'ignore' });
  execSync('git push origin main', { cwd: dir, stdio: 'ignore' });

  // A real, eligible bug on the board: P3, single known module, untouched otherwise.
  const create = spawnSync(
    'node',
    [CLI, 'issues', 'create', 'Fix the bug', '--type', 'bug', '--priority', '3', '--affected-modules', 'cli', '--json'],
    { encoding: 'utf8', cwd: dir },
  );
  assert.equal(create.status, 0, create.stderr);
  const { id: issueId } = JSON.parse(create.stdout);

  // Sanity: before any attempt, the bug is selectable.
  const before = spawnSync('node', [CLI, 'issues', 'next', '--max-priority', 'P3', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(JSON.parse(before.stdout).bug.id, issueId);

  spawnSync('node', [CLI, 'issues', 'record-attempt', '--issue', issueId, '--outcome', 'FIXED'], { cwd: dir });

  const createRun = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(createRun.stdout);

  writeFileSync(join(dir, 'fix.txt'), 'the fix\n');
  const binDir = mkdtempSync(join(tmpdir(), 'pr-resolved-fakebin-'));
  const commitPr = spawnSync(
    'node',
    [CLI, 'bugfix-loop', 'commit-pr', '--run-id', run_id, '--issue', issueId, '--title', 'Fix the bug', '--pr-base', 'main', '--json'],
    { encoding: 'utf8', cwd: dir, env: envWithFakeGh(binDir) },
  );
  assert.equal(commitPr.status, 0, commitPr.stderr);
  assert.equal(JSON.parse(commitPr.stdout).skipped, false);

  // (a) FIXED-with-open-PR is excluded from `adev issues next`.
  const duringOpenPr = spawnSync('node', [CLI, 'issues', 'next', '--max-priority', 'P3', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(duringOpenPr.status, 0, duringOpenPr.stderr);
  assert.equal(JSON.parse(duringOpenPr.stdout).bug, null);

  // (b) once resolved (merged), it becomes selectable again.
  const resolve_ = spawnSync('node', [CLI, 'issues', 'pr-resolved', '--issue', issueId, '--status', 'merged', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(resolve_.status, 0, resolve_.stderr);
  assert.equal(JSON.parse(resolve_.stdout).pr_state, 'merged');

  const afterResolved = spawnSync('node', [CLI, 'issues', 'next', '--max-priority', 'P3', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(afterResolved.status, 0, afterResolved.stderr);
  assert.equal(JSON.parse(afterResolved.stdout).bug.id, issueId);

  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
  rmSync(binDir, { recursive: true, force: true });
});
