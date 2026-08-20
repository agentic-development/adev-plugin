// tests/cli/issues-show.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 11
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-issues-show-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.28.0"\ntasks:\n  backend: json\n');
  return dir;
}

// No `adev issues create` CLI verb exists in this codebase (the board is
// seeded by /adev:plan/specify via IssueManager.create() directly) — seed
// tasks.json in the JsonAdapter's own on-disk schema, mirroring the
// convention other CLI-surface tests use to seed board state.
function seedIssue(dir, issue) {
  const tasksDir = join(dir, '.context-index', 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(tasksDir, 'tasks.json'),
    JSON.stringify({
      version: 2,
      epics: [],
      issues: [{ status: 'open', priority: 2, dependencies: [], created: now, updated: now, ...issue }],
    }),
  );
}

test('adev issues show <id> --json prints the issue including notes', () => {
  const dir = makeTempProject();
  seedIssue(dir, { id: 'issue-1', title: 'Test bug', type: 'bug', notes: 'reproduction text' });
  const r = spawnSync('node', [CLI, 'issues', 'show', 'issue-1', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.id, 'issue-1');
  assert.equal(out.notes, 'reproduction text');
  rmSync(dir, { recursive: true, force: true });
});

test('adev issues show <missing-id> --json exits non-zero with a clear message', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'show', 'no-such-id', '--json'], { encoding: 'utf8', cwd: dir });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not found/i);
  rmSync(dir, { recursive: true, force: true });
});

test('adev issues show with no id prints usage and exits non-zero', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'show'], { encoding: 'utf8', cwd: dir });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: adev issues show/);
  rmSync(dir, { recursive: true, force: true });
});
