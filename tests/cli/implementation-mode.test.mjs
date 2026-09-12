import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '..', '..', 'cli', 'index.mjs');

function makeProject(manifestBody) {
  const dir = mkdtempSync(join(tmpdir(), 'adev-impl-mode-cli-'));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), manifestBody);
  return dir;
}

test('adev implementation-mode resolve --mode tdd prints the tdd config', () => {
  const dir = makeProject('project:\n  name: t\n');
  try {
    const out = JSON.parse(execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve', '--mode', 'tdd'], { cwd: dir }).toString());
    assert.equal(out.mode, 'tdd');
    assert.deepStrictEqual(Object.keys(out.config).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adev implementation-mode resolve --mode bogus exits 1 with UNKNOWN_IMPLEMENTATION_MODE', () => {
  const dir = makeProject('project:\n  name: t\n');
  try {
    assert.throws(() => execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve', '--mode', 'bogus'], { cwd: dir, stdio: 'pipe' }),
      (err) => err.status === 1 && /UNKNOWN_IMPLEMENTATION_MODE/.test(err.stderr.toString()));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adev implementation-mode resolve --mode test-required prints the test-required config', () => {
  const dir = makeProject('project:\n  name: t\n');
  try {
    const out = JSON.parse(execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve', '--mode', 'test-required'], { cwd: dir }).toString());
    assert.equal(out.mode, 'test-required');
    assert.deepStrictEqual(Object.keys(out.config).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adev implementation-mode resolve --mode agent-default prints the agent-default config', () => {
  const dir = makeProject('project:\n  name: t\n');
  try {
    const out = JSON.parse(execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve', '--mode', 'agent-default'], { cwd: dir }).toString());
    assert.equal(out.mode, 'agent-default');
    assert.deepStrictEqual(Object.keys(out.config).sort(), ['coverage_check', 'dispatch_red', 'ordering_enforced']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adev implementation-mode resolve with no --mode and no stored value returns tdd default', () => {
  const dir = makeProject('project:\n  name: t\n');
  try {
    const out = JSON.parse(execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve'], { cwd: dir }).toString());
    assert.equal(out.mode, 'tdd');
    assert.equal(out.source, 'default');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adev implementation-mode resolve with no --mode and a stored value resolves it', () => {
  const dir = makeProject('project:\n  name: t\nimplementation_mode: test-required\n');
  try {
    const out = JSON.parse(execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve'], { cwd: dir }).toString());
    assert.equal(out.mode, 'test-required');
    assert.equal(out.source, 'manifest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a malformed manifest.yaml exits 2 with MANIFEST_PARSE_ERROR', () => {
  const dir = makeProject('foo: [unclosed\n  bar: baz\n');
  try {
    assert.throws(() => execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve'], { cwd: dir, stdio: 'pipe' }),
      (err) => err.status === 2 && /MANIFEST_PARSE_ERROR/.test(err.stderr.toString()));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a project root with no .context-index/manifest.yaml exits 1 with INVALID_PROJECT_ROOT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'adev-impl-mode-cli-'));
  try {
    assert.throws(() => execFileSync('node', [CLI_PATH, 'implementation-mode', 'resolve'], { cwd: dir, stdio: 'pipe' }),
      (err) => err.status === 1 && /INVALID_PROJECT_ROOT/.test(err.stderr.toString()));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
