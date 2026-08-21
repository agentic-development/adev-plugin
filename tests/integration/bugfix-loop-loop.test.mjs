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
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
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
