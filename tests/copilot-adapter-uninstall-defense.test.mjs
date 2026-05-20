/**
 * Uninstall-defense security tests for CopilotAdapter.
 *
 * Validates the SEC-3 (state-record forgery) and SEC-9 (rmSync symlink
 * following) mitigations:
 *   - State-record entries with `../` or absolute paths are rejected before
 *     any rmSync.
 *   - State-record entries that resolve to symlinks are rejected.
 *   - schemaVersion mismatch is fail-closed without --force; warning-only
 *     with --force.
 *   - pluginVersion mismatch is warning-only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CopilotAdapter } from '../providers/copilot/adapter.mjs';

function makeInstalledRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-uninstall-defense-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  CopilotAdapter.install({ projectRoot: dir, dryRun: false, user: false });
  return dir;
}

test('tampered state record listing ../etc/passwd rejected (SUSPICIOUS_STATE_ENTRY)', () => {
  const projectRoot = makeInstalledRepo();
  const state = {
    schemaVersion: 1,
    pluginVersion: '0.27.0',
    user: false,
    skills: ['../etc/passwd', '/Users/victim/.ssh'],
    hookConfig: 'hooks/hooks.json',
    hookScripts: [],
    installedAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    JSON.stringify(state),
  );
  const result = CopilotAdapter.uninstall({ projectRoot });
  assert.ok(result.residual.some(r => r.includes('SUSPICIOUS_STATE_ENTRY')));
  // Critical: no path outside .github/ was touched
  assert.ok(existsSync('/etc/passwd'));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('tampered state record listing absolute hookScripts rejected', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(
    readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'),
  );
  state.hookScripts = ['/Users/victim/.ssh/authorized_keys', 'hooks/../../etc/passwd'];
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    JSON.stringify(state),
  );
  const result = CopilotAdapter.uninstall({ projectRoot });
  // Both entries should appear in residual as SUSPICIOUS_STATE_ENTRY
  const suspicious = result.residual.filter(r => r.includes('SUSPICIOUS_STATE_ENTRY'));
  assert.equal(suspicious.length, 2);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('symlinked state-record skill entry rejected (SEC-9)', () => {
  const projectRoot = makeInstalledRepo();
  // Replace one skill dir with a symlink to a sibling target
  rmSync(path.join(projectRoot, '.github/skills/init'), { recursive: true, force: true });
  const tmpTarget = mkdtempSync(path.join(tmpdir(), 'copilot-uninstall-defense-target-'));
  symlinkSync(tmpTarget, path.join(projectRoot, '.github/skills/init'));
  const result = CopilotAdapter.uninstall({ projectRoot });
  // The symlink must be in residual; /tmp target must still exist.
  assert.ok(
    result.residual.some(r => r.includes('symlink') || r.includes('SUSPICIOUS_STATE_ENTRY')),
    `residual: ${JSON.stringify(result.residual)}`,
  );
  assert.ok(existsSync(tmpTarget), 'symlink target preserved');
  rmSync(tmpTarget, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });
});

test('schemaVersion: 2 without --force rejected (STATE_RECORD_VERSION_INCOMPATIBLE)', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(
    readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'),
  );
  state.schemaVersion = 2;
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    JSON.stringify(state),
  );
  assert.throws(
    () => CopilotAdapter.uninstall({ projectRoot, force: false }),
    /STATE_RECORD_VERSION_INCOMPATIBLE/,
  );
  rmSync(projectRoot, { recursive: true, force: true });
});

test('schemaVersion: 2 with --force proceeds with warning', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(
    readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'),
  );
  state.schemaVersion = 2;
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    JSON.stringify(state),
  );
  const result = CopilotAdapter.uninstall({ projectRoot, force: true });
  assert.equal(result.removed, true);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('pluginVersion mismatch proceeds with warning, not failure', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(
    readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'),
  );
  state.pluginVersion = '0.0.1-ancient';
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    JSON.stringify(state),
  );
  const result = CopilotAdapter.uninstall({ projectRoot, force: false });
  assert.equal(result.removed, true);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('malformed state record JSON throws STATE_RECORD_TAMPERED', () => {
  const projectRoot = makeInstalledRepo();
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    '{not valid json',
  );
  assert.throws(
    () => CopilotAdapter.uninstall({ projectRoot }),
    /STATE_RECORD_TAMPERED/,
  );
  rmSync(projectRoot, { recursive: true, force: true });
});

test('uninstall with no state record returns removed: false', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-no-state-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  // .github does not exist
  const result = CopilotAdapter.uninstall({ projectRoot: dir });
  assert.equal(result.removed, false);
  rmSync(dir, { recursive: true, force: true });
});

test('skill entry with uppercase letters rejected (regex re-validation)', () => {
  const projectRoot = makeInstalledRepo();
  const state = JSON.parse(
    readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'),
  );
  state.skills = ['Foo_Bar', 'init'];
  writeFileSync(
    path.join(projectRoot, '.github/.adev-copilot-install.json'),
    JSON.stringify(state),
  );
  const result = CopilotAdapter.uninstall({ projectRoot });
  assert.ok(
    result.residual.some(r => r.includes('Foo_Bar')),
    `expected Foo_Bar to be flagged: ${JSON.stringify(result.residual)}`,
  );
  rmSync(projectRoot, { recursive: true, force: true });
});
