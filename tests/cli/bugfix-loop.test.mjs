// tests/cli/bugfix-loop.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 5
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
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
