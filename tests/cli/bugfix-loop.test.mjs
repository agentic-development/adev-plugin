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

function initGitRepo(dir) {
  execSync('git init -b main', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'ignore' });
}

function commitFile(dir, filename, message) {
  writeFileSync(join(dir, filename), `${message}\n`);
  execSync(`git add ${filename} && git commit -m "${message}"`, { cwd: dir, stdio: 'ignore' });
}

// Builds a temp project (adev scaffold + real git repo) that is `behindCount`
// commits behind a bare "origin", so check-freshness has a real ahead/behind
// count to compute. Mirrors the bare-origin/seed/pusher fixture pattern from
// tests/lib/bugfix-loop-freshness.test.mjs (Task 1).
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

  const bareDir = mkdtempSync(join(tmpdir(), 'bfl-cli-fresh-bare-'));
  const pusherDir = mkdtempSync(join(tmpdir(), 'bfl-cli-fresh-pusher-'));

  execSync('git init --bare -b main', { cwd: bareDir, stdio: 'ignore' });

  initGitRepo(dir);
  commitFile(dir, 'README.md', 'init');
  execSync(`git remote add origin ${bareDir}`, { cwd: dir, stdio: 'ignore' });
  execSync('git push origin main', { cwd: dir, stdio: 'ignore' });
  // check-freshness's computeFreshness() auto-resolves the default branch
  // via refs/remotes/origin/HEAD (see resolveDefaultRemoteBranch); a plain
  // `remote add` + `push` never sets that symbolic ref the way `git clone`
  // does, so set it explicitly.
  execSync('git remote set-head origin main', { cwd: dir, stdio: 'ignore' });

  execSync(`git clone ${bareDir} ${pusherDir}`, { stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: pusherDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: pusherDir, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: pusherDir, stdio: 'ignore' });
  for (let i = 0; i < behindCount; i += 1) {
    commitFile(pusherDir, `f${i}.txt`, `commit-${i}`);
  }
  execSync('git push origin main', { cwd: pusherDir, stdio: 'ignore' });

  rmSync(pusherDir, { recursive: true, force: true });
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
