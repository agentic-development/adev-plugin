// tests/cli/bugfix-loop.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 5
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initGitRepo, commitFile, createBehindOriginFixture } from '../helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-bfl-cli-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.28.0"\n');
  return dir;
}

test('adev bugfix-loop create writes a run and prints run_id JSON', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--max-bugs', '3', '--max-turns', '5', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.run_id, /^[0-9a-f-]{36}$/i);
  assert.equal(out.status, 'running');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard reports proceed:false with terminal status (status guard)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'complete'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.reason, 'terminal_status');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard reports proceed:false with budget_exhausted when max-turns hit', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--max-turns', '1', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'complete-turn', '--run-id', run_id], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.reason, 'budget_exhausted');
  assert.equal(out.budget_reason, 'max_turns');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop finish prints the pinned token and persists the matching status', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'blocked', '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.token, 'BLOCKED');
  assert.equal(out.status, 'blocked');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard reports proceed:false with budget_exhausted when --max-bugs is hit, seeded via a real run-state file (AC bullet 3, round-1 plan-review fix: the prior draft only CLI-tested the max_turns cap here)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--max-bugs', '1', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'bug-1'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.reason, 'budget_exhausted');
  assert.equal(out.budget_reason, 'max_bugs');
  // Confirms the guard-detected max_bugs case flows into the same
  // finish/token/persisted-status contract the max_turns case uses.
  const finish = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'budget_exhausted', '--json'], { encoding: 'utf8', cwd: dir });
  const finishOut = JSON.parse(finish.stdout);
  assert.equal(finishOut.token, 'BUDGET_EXHAUSTED');
  assert.equal(finishOut.status, 'budget_exhausted');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop finish carries degraded_sync_note through in its JSON result, for both null and non-null (AC bullet 10, round-1 plan-review fix)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id: runIdNull } = JSON.parse(create.stdout);
  const r1 = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', runIdNull, '--status', 'complete', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(JSON.parse(r1.stdout).degraded_sync_note, null);

  const create2 = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id: runIdNote } = JSON.parse(create2.stdout);
  // No CLI verb sets degraded_sync_note (it is written by the sibling
  // tracker-provider-bridge spec, Milestone 2, not yet implemented) — seed
  // it directly on the run-state file to prove finish's read-through
  // contract, which is all this skill's Step 5 depends on.
  const statePath = join(dir, '.context-index', 'lifecycle-state', `bugfix-loop-runs-${runIdNote}.json`);
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.degraded_sync_note = 'GitHub rate-limited for 5 consecutive turns';
  writeFileSync(statePath, JSON.stringify(state));
  const r2 = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', runIdNote, '--status', 'complete', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(JSON.parse(r2.stdout).degraded_sync_note, 'GitHub rate-limited for 5 consecutive turns');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop latest returns null (exit 0, empty result) when no runs exist', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'latest', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { run: null });
  rmSync(dir, { recursive: true, force: true });
});

// Builds a temp project (adev scaffold + real git repo) that is `behindCount`
// commits behind a bare "origin", so check-freshness has a real ahead/behind
// count to compute. Delegates the bare-origin/pusher-clone bootstrapping to
// the shared `createBehindOriginFixture()` helper (also used, in its lower-
// level form, by tests/lib/bugfix-loop-freshness.test.mjs, Task 1).
function makeFreshnessProject(behindCount, freshnessThresholds) {
  const dir = makeTempProject();
  if (freshnessThresholds) {
    const lines = Object.entries(freshnessThresholds)
      .map(([key, value]) => `      ${key}: ${value}`)
      .join('\n');
    writeFileSync(
      join(dir, '.context-index', 'manifest.yaml'),
      `project:\n  name: t\n  adev_version: "0.28.0"\ntasks:\n  bugfix_loop:\n    freshness:\n${lines}\n`,
    );
  }

  const { bareDir } = createBehindOriginFixture(dir, { behindCount });
  return { dir, bareDir };
}

test('adev bugfix-loop check-freshness reports "warn" above soft threshold and "ok" below it', () => {
  const { dir, bareDir } = makeFreshnessProject(1, { soft_threshold: 1 });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'check-freshness', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'warn');
  assert.equal(out.behind, 1);
  assert.equal(out.ahead, 0);
  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
});

test('adev bugfix-loop check-freshness reports "blocked" above hard threshold (exit 0 either way)', () => {
  const { dir, bareDir } = makeFreshnessProject(3, { soft_threshold: 1, hard_threshold: 2 });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'check-freshness', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'blocked');
  assert.equal(out.behind, 3);
  assert.equal(out.ahead, 0);
  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
});

test('adev bugfix-loop check-freshness reports "ok" when no threshold is crossed and hard_threshold defaults to unset', () => {
  const { dir, bareDir } = makeFreshnessProject(0, null);
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'check-freshness', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'ok');
  assert.equal(out.behind, 0);
  assert.equal(out.ahead, 0);
  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
});

test('adev bugfix-loop check-freshness degrades to a warning JSON when origin is unreachable, never exits non-zero', () => {
  const dir = makeTempProject();
  initGitRepo(dir);
  commitFile(dir, 'README.md', 'init');
  execSync('git remote add origin /nonexistent/path/that/does/not/exist', { cwd: dir, stdio: 'ignore' });

  const r = spawnSync('node', [CLI, 'bugfix-loop', 'check-freshness', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'degraded');
  assert.equal(typeof out.reason, 'string');
  assert.ok(out.reason.length > 0);
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop create --starting-branch main persists starting_branch (Plan-task 5)', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.starting_branch, 'main');
  assert.equal(out.last_worktree_branch, null);
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop create without --starting-branch persists starting_branch: null (Plan-task 5)', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.starting_branch, null);
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard --json always includes worktree_base_ref, even on proceed:true (Plan-task 5)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, true);
  assert.equal(out.worktree_base_ref, 'main');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard --json includes worktree_base_ref on a proceed:false (terminal) result too (Plan-task 5)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'complete'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.worktree_base_ref, 'main');
  rmSync(dir, { recursive: true, force: true });
});

// Writes a fake `gh` shim onto PATH so commit-pr's real `gh pr create` call
// (the CLI always uses the real execFileSync — it has no injection point)
// prints a canned PR URL and exits 0, without ever touching a real GitHub
// account. Returns the env to pass to spawnSync.
function envWithFakeGh(binDir, prUrl = 'https://github.com/org/repo/pull/1') {
  mkdirSync(binDir, { recursive: true });
  const ghPath = join(binDir, 'gh');
  writeFileSync(ghPath, `#!/bin/sh\necho "${prUrl}"\nexit 0\n`, { mode: 0o755 });
  return { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
}

function makeCommitPrProject() {
  const dir = makeTempProject();
  initGitRepo(dir);
  commitFile(dir, 'README.md', 'init');
  const bareDir = mkdtempSync(join(tmpdir(), 'bfl-cli-commitpr-bare-'));
  execSync('git init --bare -b main', { cwd: bareDir, stdio: 'ignore' });
  execSync(`git remote add origin ${bareDir}`, { cwd: dir, stdio: 'ignore' });
  execSync('git push origin main', { cwd: dir, stdio: 'ignore' });
  return { dir, bareDir };
}

test('adev bugfix-loop commit-pr --run-id <id> --issue <id> commits, opens a PR, and updates run-state last_worktree_branch on success (Plan-task 10)', () => {
  const { dir, bareDir } = makeCommitPrProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);

  writeFileSync(join(dir, 'fix.txt'), 'the fix\n');

  const binDir = mkdtempSync(join(tmpdir(), 'bfl-cli-fakebin-'));
  const r = spawnSync(
    'node',
    [CLI, 'bugfix-loop', 'commit-pr', '--run-id', run_id, '--issue', 'issue-1', '--title', 'Fix the bug', '--pr-base', 'main', '--json'],
    { encoding: 'utf8', cwd: dir, env: envWithFakeGh(binDir) },
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.skipped, false);
  assert.equal(out.branch, 'adev/bugfix-issue-1');
  assert.equal(out.prUrl, 'https://github.com/org/repo/pull/1');

  const runState = JSON.parse(readFileSync(
    // direct read to avoid another CLI round trip
    join(dir, '.context-index', 'lifecycle-state', `bugfix-loop-runs-${run_id}.json`), 'utf8',
  ));
  assert.equal(runState.last_worktree_branch, 'adev/bugfix-issue-1');

  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
  rmSync(binDir, { recursive: true, force: true });
});

test('adev bugfix-loop commit-pr exits 0 with { skipped: true } on a degrade path (push rejected — no remote configured), never non-zero (Plan-task 10)', () => {
  const dir = makeTempProject();
  initGitRepo(dir);
  commitFile(dir, 'README.md', 'init');
  // deliberately no `origin` remote configured — push will fail.

  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  writeFileSync(join(dir, 'fix.txt'), 'the fix\n');

  const r = spawnSync(
    'node',
    [CLI, 'bugfix-loop', 'commit-pr', '--run-id', run_id, '--issue', 'issue-1', '--title', 'Fix the bug', '--pr-base', 'main', '--json'],
    { encoding: 'utf8', cwd: dir },
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.skipped, true);
  assert.equal(typeof out.reason, 'string');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop record-attempt --verdict FIXED --files-touched 3 --tests-added 1 --priority-bound P3 appends a summary row and prints the running table (Plan-task 13)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);

  const r = spawnSync(
    'node',
    [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'issue-1', '--verdict', 'FIXED', '--files-touched', '3', '--tests-added', '1', '--priority-bound', 'P3', '--json'],
    { encoding: 'utf8', cwd: dir },
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.summary_rows.length, 1);
  assert.deepEqual(out.summary_rows[0], { issueId: 'issue-1', verdict: 'FIXED', filesTouched: 3, testsAdded: 1, priorityBound: 'P3', turn: 1 });

  const textRun = spawnSync(
    'node',
    [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'issue-2', '--verdict', 'PARKED', '--priority-bound', 'P3'],
    { encoding: 'utf8', cwd: dir },
  );
  assert.equal(textRun.status, 0, textRun.stderr);
  assert.match(textRun.stdout, /issue-1/);
  assert.match(textRun.stdout, /issue-2/);
  assert.match(textRun.stdout, /PARKED/);
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop record-attempt without --verdict still works exactly as before Task 13 (no summary row appended)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'issue-1', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.summary_rows, []);
  assert.equal(out.bugs_attempted.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop finish --json includes a summary_table field reprinting every attempt this run (Plan-task 13)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'issue-1', '--verdict', 'FIXED', '--files-touched', '2', '--tests-added', '1', '--priority-bound', 'P3'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'complete', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(typeof out.summary_table, 'string');
  assert.match(out.summary_table, /issue-1/);
  assert.match(out.summary_table, /FIXED/);
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop finish (non-JSON) prints the summary table before the ADEV-BUGFIXLOOP token', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'issue-1', '--verdict', 'FIXED', '--priority-bound', 'P3'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'complete'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines[lines.length - 1], 'ADEV-BUGFIXLOOP: COMPLETE', 'token must be the literal last line');
  assert.match(r.stdout, /issue-1/);
  rmSync(dir, { recursive: true, force: true });
});
