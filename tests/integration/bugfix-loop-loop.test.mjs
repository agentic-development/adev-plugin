// tests/integration/bugfix-loop-loop.test.mjs
//
// Mechanism-level integration coverage for /adev:bugfix-loop: drives the
// exact CLI-verb sequence skills/bugfix-loop/SKILL.md documents, directly,
// proving the underlying composition works — not by parsing or simulating
// the markdown itself (node:test cannot drive an actual Skill-tool
// re-invocation, which requires an LLM turn).
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 9
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject(issues = []) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-bfl-e2e-')));
  mkdirSync(join(dir, '.context-index', 'tasks'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'tasks:\n  backend: json\n');
  writeFileSync(
    join(dir, '.context-index', 'tasks', 'tasks.json'),
    JSON.stringify({ version: 2, seq: issues.length, epics: [], issues }, null, 2),
  );
  return dir;
}

function twoOpenBugsProject() {
  return makeTempProject([
    { id: 'bug-1', title: 'first', type: 'bug', priority: 3, status: 'open' },
    { id: 'bug-2', title: 'second', type: 'bug', priority: 3, status: 'open' },
  ]);
}

function json(args, opts) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
  return { ...r, json: r.stdout ? (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() : null };
}

test('2-turn drain: turns_completed and bugs_attempted grow across two sequential turns with no human input between them (AC bullet 2)', () => {
  const dir = twoOpenBugsProject();
  const { json: created } = json(['bugfix-loop', 'create', '--max-turns', '10', '--json'], { cwd: dir });
  const runId = created.run_id;

  // Turn 1
  json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'FIXED'], { cwd: dir });
  json(['issues', 'release', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-1'], { cwd: dir });
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });

  // Turn 2 (simulating the self-re-invoked, fresh-context turn)
  json(['issues', 'claim', 'bug-2', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['issues', 'record-attempt', '--issue', 'bug-2', '--outcome', 'PARKED'], { cwd: dir });
  json(['issues', 'release', 'bug-2', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-2'], { cwd: dir });
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });

  const { json: state } = json(['bugfix-loop', 'latest', '--json'], { cwd: dir });
  assert.equal(state.run.turns_completed, 2);
  assert.equal(state.run.bugs_attempted.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('claim-failure retries are bounded to 3 and the turn still counts toward --max-turns on exhaustion (AC bullet 13)', () => {
  const dir = twoOpenBugsProject();
  const { json: created } = json(['bugfix-loop', 'create', '--max-turns', '10', '--json'], { cwd: dir });
  const runId = created.run_id;
  json(['issues', 'claim', 'bug-1', '--owner', 'someone-else'], { cwd: dir });

  let refusals = 0;
  for (let i = 0; i < 3; i += 1) {
    const r = json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
    if (r.status === 2) refusals += 1;
  }
  assert.equal(refusals, 3);
  // Turn ends without an attempt; still counts toward --max-turns.
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });
  const { json: state } = json(['bugfix-loop', 'latest', '--json'], { cwd: dir });
  assert.equal(state.run.turns_completed, 1);
  assert.equal(state.run.bugs_attempted.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('ADEV_ISSUE_OWNER propagation: the loop claim and a re-claim under the same env var both succeed (WR-2)', () => {
  const dir = twoOpenBugsProject();
  const claim1 = json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  assert.equal(claim1.status, 0);
  // Simulates /adev:debug's Phase 1.6 re-claim, resolving the owner from
  // ADEV_ISSUE_OWNER exactly as skills/debug/SKILL.md documents.
  const reclaim = json(['issues', 'claim', 'bug-1'], { cwd: dir, env: { ...process.env, ADEV_ISSUE_OWNER: 'bugfix-loop' } });
  assert.equal(reclaim.status, 0, 'same-owner re-claim under ADEV_ISSUE_OWNER must not be refused with ISSUE_ALREADY_CLAIMED');
  rmSync(dir, { recursive: true, force: true });
});

test('AttemptRecord is written after every completed attempt (AC bullet 15)', () => {
  const dir = twoOpenBugsProject();
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'UNREPRODUCIBLE'], { cwd: dir });
  const log = readFileSync(join(dir, '.context-index', 'lifecycle-state', 'bugfix-loop-attempts.jsonl'), 'utf8');
  assert.match(log, /"issue_id":"bug-1"/);
  rmSync(dir, { recursive: true, force: true });
});

test('a crashed /adev:debug --auto (no clean token) is treated as PARKED and the claim is released, no orphan (AC bullet 12)', () => {
  const dir = twoOpenBugsProject();
  json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  // Simulate a crash: skip the debug invocation, go straight to the
  // PARKED-with-explanatory-note fallback the SKILL.md's Step 4 documents.
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'PARKED', '--raw-output', 'debug crashed mid-attempt'], { cwd: dir });
  const release = json(['issues', 'release', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  assert.equal(release.status, 0);
  const reclaim = json(['issues', 'claim', 'bug-1', '--owner', 'someone-else'], { cwd: dir });
  assert.equal(reclaim.status, 0); // claimable again -- no orphaned claim
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Plan-task 16 — Integration Verification: isolation, stacking, table,
// priority band. Verification-only: all underlying behavior was implemented
// in Tasks 1-14. These tests drive the exact CLI-verb sequence Step 3 (worktree
// add), Step 4.5 (commit-pr), and Step 4 (record-attempt) document, proving
// the composition works end-to-end.
// ---------------------------------------------------------------------------

function gitq(args, cwd) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

// Real (non-mocked) local git repo + bare "origin" — no network, no gh.
// commit-pr's `gh pr create` call is shimmed via a fake `gh` on PATH so the
// commit/push mechanics are exercised for real while never touching a real
// GitHub account.
function makeWorktreeProject(issues) {
  const dir = makeTempProject(issues);
  gitq('init -q -b main', dir);
  gitq('config user.email "t@t.co"', dir);
  gitq('config user.name "t"', dir);
  gitq('config commit.gpgsign false', dir);
  writeFileSync(join(dir, 'README.md'), 'init\n');
  gitq('add -A', dir);
  gitq('commit -qm init', dir);
  const bareDir = mkdtempSync(join(tmpdir(), 'adev-bfl-wt-bare-'));
  execSync('git init --bare -b main', { cwd: bareDir, stdio: 'ignore' });
  gitq(`remote add origin ${bareDir}`, dir);
  gitq('push origin main', dir);
  return { dir, bareDir };
}

function fakeGhEnv() {
  const binDir = mkdtempSync(join(tmpdir(), 'adev-bfl-wt-fakebin-'));
  writeFileSync(join(binDir, 'gh'), '#!/bin/sh\necho "https://github.com/org/repo/pull/1"\nexit 0\n', { mode: 0o755 });
  return { env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` }, binDir };
}

test('worktree isolation: two bugs whose fixes touch the same tracked file (and each add a new file) never cross-contaminate when --worktree-per-bug is active', () => {
  const { dir, bareDir } = makeWorktreeProject([
    { id: 'bug-1', title: 'first', type: 'bug', priority: 3, status: 'open' },
    { id: 'bug-2', title: 'second', type: 'bug', priority: 3, status: 'open' },
  ]);

  const add1 = json(['worktree', 'add', '--slug', 'bugfix-bug-1', '--base', 'main'], { cwd: dir });
  assert.equal(add1.status, 0, add1.stderr);
  const wt1 = add1.json.path;
  // Overlapping edit to the same pre-existing TRACKED file (README.md, from
  // makeWorktreeProject's init commit) — the realistic case, since most bug
  // fixes modify existing source rather than only adding new files.
  writeFileSync(join(wt1, 'README.md'), 'bug-1 fix\n');
  // Plus a brand-new (untracked) file — `git diff --stat` alone never shows
  // untracked files, so isolation must hold under `git status --porcelain` too.
  writeFileSync(join(wt1, 'new-1.txt'), 'bug-1 new file\n');

  const add2 = json(['worktree', 'add', '--slug', 'bugfix-bug-2', '--base', 'main'], { cwd: dir });
  assert.equal(add2.status, 0, add2.stderr);
  const wt2 = add2.json.path;
  writeFileSync(join(wt2, 'README.md'), 'bug-2 fix\n');
  writeFileSync(join(wt2, 'new-2.txt'), 'bug-2 new file\n');

  // Each worktree's own working directory contains only its own change.
  assert.equal(readFileSync(join(wt1, 'README.md'), 'utf8'), 'bug-1 fix\n');
  assert.equal(readFileSync(join(wt2, 'README.md'), 'utf8'), 'bug-2 fix\n');
  assert.ok(existsSync(join(wt1, 'new-1.txt')));
  assert.ok(!existsSync(join(wt1, 'new-2.txt')), 'bug-2\'s new file must not leak into worktree 1');
  assert.ok(existsSync(join(wt2, 'new-2.txt')));
  assert.ok(!existsSync(join(wt2, 'new-1.txt')), 'bug-1\'s new file must not leak into worktree 2');

  // Tracked-file diff (git diff --stat) is isolated per worktree too.
  const diff1 = gitq('diff --stat', wt1);
  const diff2 = gitq('diff --stat', wt2);
  assert.match(diff1, /README\.md/);
  assert.match(diff2, /README\.md/);

  // Untracked-file listing (git status --porcelain — the only way to see a
  // brand-new file, since `git diff` never shows untracked paths) is
  // isolated per worktree too: each sees only its own new file.
  const status1 = gitq('status --porcelain', wt1);
  const status2 = gitq('status --porcelain', wt2);
  assert.match(status1, /new-1\.txt/);
  assert.doesNotMatch(status1, /new-2\.txt/);
  assert.match(status2, /new-2\.txt/);
  assert.doesNotMatch(status2, /new-1\.txt/);

  json(['worktree', 'remove', '--slug', 'bugfix-bug-1', '--force'], { cwd: dir });
  json(['worktree', 'remove', '--slug', 'bugfix-bug-2', '--force'], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
});

test('worktree stacking: the second bug worktree branches from the first bug completed branch, not the loop starting branch, when stacking is active', () => {
  const { dir, bareDir } = makeWorktreeProject([
    { id: 'bug-1', title: 'first', type: 'bug', priority: 3, status: 'open' },
    { id: 'bug-2', title: 'second', type: 'bug', priority: 3, status: 'open' },
  ]);
  const { env, binDir } = fakeGhEnv();

  const { json: created } = json(['bugfix-loop', 'create', '--starting-branch', 'main', '--json'], { cwd: dir });
  const runId = created.run_id;

  // Bug 1: worktree from the run's starting branch (main).
  const guard1 = json(['bugfix-loop', 'guard', '--run-id', runId, '--json'], { cwd: dir });
  assert.equal(guard1.json.worktree_base_ref, 'main');
  const add1 = json(['worktree', 'add', '--slug', 'bugfix-bug-1', '--base', guard1.json.worktree_base_ref], { cwd: dir });
  const wt1 = add1.json.path;
  writeFileSync(join(wt1, 'fix1.txt'), 'fix\n');
  const commit1 = json(
    ['bugfix-loop', 'commit-pr', '--run-id', runId, '--issue', 'bug-1', '--title', 'Fix bug 1', '--pr-base', 'main', '--json'],
    { cwd: wt1, env },
  );
  assert.equal(commit1.status, 0, commit1.stderr);
  assert.equal(commit1.json.skipped, false, JSON.stringify(commit1.json));
  assert.equal(commit1.json.branch, 'adev/bugfix-bug-1');

  // Bug 2: the run-state's worktree_base_ref must now be bug 1's completed
  // branch, not "main" — this is what makes PR stacking coherent.
  const guard2 = json(['bugfix-loop', 'guard', '--run-id', runId, '--json'], { cwd: dir });
  assert.equal(guard2.json.worktree_base_ref, 'adev/bugfix-bug-1');
  const add2 = json(['worktree', 'add', '--slug', 'bugfix-bug-2', '--base', guard2.json.worktree_base_ref], { cwd: dir });
  assert.equal(add2.status, 0, add2.stderr);
  const wt2 = add2.json.path;

  // Bug 2's worktree branch must contain bug 1's commit (real ancestry, not
  // just a matching base-ref string).
  const merged = gitq(`branch --contains adev/bugfix-bug-1`, wt2);
  assert.match(merged, /adev\/bugfix-bug-2/, 'bug 2\'s branch must descend from bug 1\'s completed branch');

  json(['worktree', 'remove', '--slug', 'bugfix-bug-1', '--force'], { cwd: dir });
  json(['worktree', 'remove', '--slug', 'bugfix-bug-2', '--force'], { cwd: dir });
  rmSync(dir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
  rmSync(binDir, { recursive: true, force: true });
});

test('existing loop tests still pass with --worktree-per-bug unset: create/guard/record-attempt/finish behave identically to before this capability existed (default off, no behavior change)', () => {
  const dir = twoOpenBugsProject();
  const { json: created } = json(['bugfix-loop', 'create', '--max-turns', '10', '--json'], { cwd: dir });
  // No --worktree-per-bug, no --starting-branch: starting_branch is null,
  // worktree_base_ref resolves to null, and nothing about the shared-tree
  // flow below changes.
  assert.equal(created.starting_branch, null);
  const runId = created.run_id;

  json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'FIXED'], { cwd: dir });
  json(['issues', 'release', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  const record = json(['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-1', '--json'], { cwd: dir });
  assert.equal(record.status, 0);
  assert.deepEqual(record.json.summary_rows, []); // no --verdict passed: unchanged pre-Task-13 shape
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });

  const finish = json(['bugfix-loop', 'finish', '--run-id', runId, '--status', 'complete', '--json'], { cwd: dir });
  assert.equal(finish.status, 0);
  assert.equal(finish.json.token, 'COMPLETE');
  rmSync(dir, { recursive: true, force: true });
});

test('the running summary table accumulates one row per attempt with the correct priority-bound column', () => {
  const dir = twoOpenBugsProject();
  const { json: created } = json(['bugfix-loop', 'create', '--max-turns', '10', '--json'], { cwd: dir });
  const runId = created.run_id;

  const r1 = json(
    ['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-1', '--verdict', 'FIXED', '--files-touched', '2', '--tests-added', '1', '--priority-bound', 'P3', '--json'],
    { cwd: dir },
  );
  assert.equal(r1.json.summary_rows.length, 1);

  const r2 = json(
    ['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-2', '--verdict', 'PARKED', '--files-touched', '0', '--tests-added', '0', '--priority-bound', 'P1', '--json'],
    { cwd: dir },
  );
  assert.equal(r2.json.summary_rows.length, 2);
  assert.deepEqual(r2.json.summary_rows[0], { issueId: 'bug-1', verdict: 'FIXED', filesTouched: 2, testsAdded: 1, priorityBound: 'P3', turn: 1 });
  assert.deepEqual(r2.json.summary_rows[1], { issueId: 'bug-2', verdict: 'PARKED', filesTouched: 0, testsAdded: 0, priorityBound: 'P1', turn: 1 });

  const finish = json(['bugfix-loop', 'finish', '--run-id', runId, '--status', 'complete', '--json'], { cwd: dir });
  assert.match(finish.json.summary_table, /bug-1/);
  assert.match(finish.json.summary_table, /bug-2/);
  assert.match(finish.json.summary_table, /P3/);
  assert.match(finish.json.summary_table, /P1/);
  rmSync(dir, { recursive: true, force: true });
});
