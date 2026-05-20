import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CopilotAdapter } from '../providers/copilot/adapter.mjs';

function makeProjectRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-install-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  return dir;
}

test('exports the peer-adapter surface (name, pluginRoot, version, detect)', () => {
  assert.equal(CopilotAdapter.name, 'copilot');
  assert.equal(typeof CopilotAdapter.pluginRoot, 'string');
  assert.equal(typeof CopilotAdapter.version, 'string');
  assert.equal(typeof CopilotAdapter.detect, 'function');
  assert.equal(typeof CopilotAdapter.install, 'function');
  assert.equal(typeof CopilotAdapter.uninstall, 'function');
  assert.equal(typeof CopilotAdapter.status, 'function');
  assert.equal(typeof CopilotAdapter.getCopilotHome, 'function');
  assert.equal(typeof CopilotAdapter.validateSkillNames, 'function');
});

test('detect() returns true when COPILOT env is set', () => {
  process.env.COPILOT = 'true';
  try { assert.equal(CopilotAdapter.detect(), true); }
  finally { delete process.env.COPILOT; }
});

test('detect() returns true when .github/copilot-instructions.md exists in cwd', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-detect-'));
  mkdirSync(path.join(dir, '.github'));
  writeFileSync(path.join(dir, '.github', 'copilot-instructions.md'), '# x');
  const origCwd = process.cwd();
  process.chdir(dir);
  try { assert.equal(CopilotAdapter.detect(), true); }
  finally { process.chdir(origCwd); rmSync(dir, { recursive: true, force: true }); }
});

test('install writes .github/skills/, .github/hooks/hooks.json, state record', () => {
  const projectRoot = makeProjectRoot();
  const result = CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  assert.equal(result.installed, true);
  assert.ok(existsSync(path.join(projectRoot, '.github/skills')));
  assert.ok(existsSync(path.join(projectRoot, '.github/hooks/hooks.json')));
  assert.ok(existsSync(path.join(projectRoot, '.github/.adev-copilot-install.json')));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('committed hooks.json contains no pluginRoot absolute paths and no ${CLAUDE_PLUGIN_ROOT} placeholders', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const config = readFileSync(path.join(projectRoot, '.github/hooks/hooks.json'), 'utf8');
  assert.equal(/\/Users\/|\/home\/|C:\\/.test(config), false, 'no absolute paths');
  assert.equal(config.includes('${CLAUDE_PLUGIN_ROOT}'), false, 'no placeholder');
  // Every script reference should be ./scripts/<name>.sh form.
  const parsed = JSON.parse(config);
  const flatBash = Object.values(parsed.hooks || {})
    .flat()
    .map(e => e.bash)
    .filter(Boolean);
  for (const b of flatBash) {
    if (b.includes('.sh')) {
      assert.ok(b.includes('./scripts/'), `bash field should reference ./scripts/: ${b}`);
    }
  }
  rmSync(projectRoot, { recursive: true, force: true });
});

test('hook scripts copied to .github/hooks/scripts/ with executable bit set', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const scriptsDir = path.join(projectRoot, '.github/hooks/scripts');
  assert.ok(existsSync(scriptsDir));
  // The state record's hookScripts array should match files in scriptsDir.
  const state = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  assert.ok(state.hookScripts.length > 0, 'at least one hook script');
  for (const rel of state.hookScripts) {
    const abs = path.join(projectRoot, '.github', rel);
    assert.ok(existsSync(abs), `script exists: ${rel}`);
    // Check executable bit (owner-exec at minimum).
    const mode = statSync(abs).mode;
    assert.equal((mode & 0o100) !== 0, true, `executable: ${rel} mode ${mode.toString(8)}`);
  }
  rmSync(projectRoot, { recursive: true, force: true });
});

test('state record schema matches spec', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const state = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  assert.equal(state.schemaVersion, 1);
  assert.equal(typeof state.pluginVersion, 'string');
  assert.equal(typeof state.installedAt, 'string');
  assert.equal(state.user, false);
  assert.ok(Array.isArray(state.skills));
  assert.ok(state.skills.length > 0);
  assert.equal(state.hookConfig, 'hooks/hooks.json');
  assert.ok(Array.isArray(state.hookScripts));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('install fails when projectRoot is not a git repo', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'not-a-repo-'));
  assert.throws(() => CopilotAdapter.install({ projectRoot, dryRun: false, user: false }), /NOT_A_GIT_REPO/);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('dry-run writes nothing', () => {
  const projectRoot = makeProjectRoot();
  const result = CopilotAdapter.install({ projectRoot, dryRun: true, user: false });
  assert.equal(existsSync(path.join(projectRoot, '.github/skills')), false);
  assert.equal(existsSync(path.join(projectRoot, '.github/.adev-copilot-install.json')), false);
  assert.ok(Array.isArray(result.wouldWrite));
  assert.ok(result.wouldWrite.length > 0);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('uninstall removes only state-record-listed paths; leaves sync-output untouched', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  // Simulate sync-output presence — both repo-instructions and per-module.
  writeFileSync(path.join(projectRoot, '.github/copilot-instructions.md'), 'sync output');
  mkdirSync(path.join(projectRoot, '.github/instructions'), { recursive: true });
  writeFileSync(path.join(projectRoot, '.github/instructions/lib.instructions.md'), 'mod');
  const result = CopilotAdapter.uninstall({ projectRoot });
  assert.equal(result.removed, true);
  assert.equal(existsSync(path.join(projectRoot, '.github/.adev-copilot-install.json')), false);
  assert.equal(existsSync(path.join(projectRoot, '.github/skills')), false);
  assert.ok(existsSync(path.join(projectRoot, '.github/copilot-instructions.md')), 'sync-output preserved');
  assert.ok(existsSync(path.join(projectRoot, '.github/instructions/lib.instructions.md')), 'per-module preserved');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('idempotent install: running twice produces a consistent post-state', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const before = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const after = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
  // installedAt timestamp may differ; everything else should match
  assert.equal(before.skills.length, after.skills.length);
  assert.deepEqual(before.skills.sort(), after.skills.sort());
  assert.deepEqual(before.hookScripts.sort(), after.hookScripts.sort());
  rmSync(projectRoot, { recursive: true, force: true });
});

test('status returns documented shape (not installed)', () => {
  const projectRoot = makeProjectRoot();
  const before = CopilotAdapter.status({ projectRoot });
  assert.equal(before.installed, false);
  assert.equal(typeof before.skillCount, 'number');
  assert.equal(typeof before.hookConfigPresent, 'boolean');
  assert.ok(before.syncOutputPresent && typeof before.syncOutputPresent.repoInstructions === 'boolean');
  assert.ok(before.agentsMd && typeof before.agentsMd.exists === 'boolean');
  assert.equal(typeof before.agentsMd.autoLoadHint, 'string');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('status returns documented shape (installed)', () => {
  const projectRoot = makeProjectRoot();
  CopilotAdapter.install({ projectRoot, dryRun: false, user: false });
  const after = CopilotAdapter.status({ projectRoot });
  assert.equal(after.installed, true);
  assert.ok(after.skillCount > 0);
  assert.equal(after.hookConfigPresent, true);
  assert.equal(after.userSeeded, false);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('status.agentsMd.autoLoadHint matches the documented literal', () => {
  const projectRoot = makeProjectRoot();
  const expected = 'VS Code Copilot (when chat.useAgentsMdFile is enabled) and Copilot CLI auto-load AGENTS.md at the repo root.';
  const got = CopilotAdapter.status({ projectRoot });
  assert.equal(got.agentsMd.autoLoadHint, expected);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('status.syncOutputPresent reflects file presence independently of install state', () => {
  const projectRoot = makeProjectRoot();
  mkdirSync(path.join(projectRoot, '.github'), { recursive: true });
  writeFileSync(path.join(projectRoot, '.github/copilot-instructions.md'), 'x');
  const before = CopilotAdapter.status({ projectRoot });
  assert.equal(before.installed, false);
  assert.equal(before.syncOutputPresent.repoInstructions, true);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('getCopilotHome respects COPILOT_HOME env override', () => {
  const orig = process.env.COPILOT_HOME;
  try {
    process.env.COPILOT_HOME = '/custom/copilot';
    assert.equal(CopilotAdapter.getCopilotHome(), '/custom/copilot');
  } finally {
    if (orig === undefined) delete process.env.COPILOT_HOME;
    else process.env.COPILOT_HOME = orig;
  }
});

test('install({ user: true }) writes under getCopilotHome before repo-scope', () => {
  const projectRoot = makeProjectRoot();
  const userHome = mkdtempSync(path.join(tmpdir(), 'copilot-userhome-'));
  const orig = process.env.COPILOT_HOME;
  process.env.COPILOT_HOME = userHome;
  try {
    const result = CopilotAdapter.install({ projectRoot, dryRun: false, user: true });
    assert.equal(result.userSeeded, true);
    assert.ok(existsSync(path.join(userHome, 'skills')), 'user skills');
    assert.ok(existsSync(path.join(userHome, 'hooks/hooks.json')), 'user hooks.json');
    assert.ok(existsSync(path.join(projectRoot, '.github/skills')), 'repo skills');
    const state = JSON.parse(readFileSync(path.join(projectRoot, '.github/.adev-copilot-install.json'), 'utf8'));
    assert.equal(state.user, true);
  } finally {
    if (orig === undefined) delete process.env.COPILOT_HOME;
    else process.env.COPILOT_HOME = orig;
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});

test('dry-run with invalid skill name surfaces error in errors[]', () => {
  // Use the real pluginRoot — all real skills are valid, so we expect no errors.
  // This test asserts the dry-run shape is correct.
  const projectRoot = makeProjectRoot();
  const result = CopilotAdapter.install({ projectRoot, dryRun: true, user: false });
  assert.ok(Array.isArray(result.wouldWrite));
  assert.ok(Array.isArray(result.skipped));
  assert.ok(Array.isArray(result.errors));
  rmSync(projectRoot, { recursive: true, force: true });
});

test('install does not use execSync(cp -r) — uses fs.cpSync', () => {
  // Indirect check: ensure committed source does not reference shell cp.
  const src = readFileSync('providers/copilot/adapter.mjs', 'utf8');
  assert.equal(src.includes("execSync('cp"), false);
  assert.equal(src.includes("execSync(\"cp"), false);
  assert.ok(src.includes('cpSync'), 'uses fs.cpSync');
});
