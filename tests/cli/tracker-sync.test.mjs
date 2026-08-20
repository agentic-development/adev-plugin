// tests/cli/tracker-sync.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 9
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-tsync-cli-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\ntasks:\n  backend: json\n  bugfix_loop:\n    tracker_provider: github\n',
  );
  return dir;
}

test('adev tracker-sync inbound --run-id <id> --json exits 0 and prints well-formed JSON', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  const r = spawnSync('node', [CLI, 'tracker-sync', 'inbound', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok('degraded' in out && 'linked' in out);
  rmSync(dir, { recursive: true, force: true });
});

test('adev tracker-sync outbound --local-issue-id <id> --verdict FIXED --completed-at <ts> --json reports no_link for an unlinked issue', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [
    CLI, 'tracker-sync', 'outbound',
    '--local-issue-id', 'no-such-issue', '--verdict', 'FIXED', '--completed-at', new Date().toISOString(), '--json',
  ], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepStrictEqual(out, { posted: false, reason: 'no_link' });
  rmSync(dir, { recursive: true, force: true });
});

test('adev tracker-sync with no subcommand prints usage and exits non-zero', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'tracker-sync'], { encoding: 'utf8', cwd: dir });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: adev tracker-sync/);
  rmSync(dir, { recursive: true, force: true });
});

test('adev tracker-sync inbound with an unknown subcommand-shaped flag still fails cleanly (usage error)', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'tracker-sync', 'bogus'], { encoding: 'utf8', cwd: dir });
  assert.notEqual(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});
