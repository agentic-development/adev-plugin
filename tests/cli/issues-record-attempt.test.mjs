// tests/cli/issues-record-attempt.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 6
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-record-attempt-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.28.0"\n');
  return dir;
}

test('adev issues record-attempt FIXED writes an AttemptRecord readable back', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'record-attempt', '--issue', 'issue-1', '--outcome', 'FIXED', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.issue_id, 'issue-1');
  assert.equal(out.last_verdict, 'PASS');
  rmSync(dir, { recursive: true, force: true });
});

test('adev issues record-attempt rejects an unknown --outcome', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'record-attempt', '--issue', 'issue-1', '--outcome', 'BOGUS'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 1);
  rmSync(dir, { recursive: true, force: true });
});
