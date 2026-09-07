// Install scope consent (adev-plugin-5j6n).
//
// `adev install` asks "all projects (user) or this project only (project)?".
// The answer was cosmetic: provider.install() ran FIRST with no opts, defaulted
// to scope "user", and wrote enabledPlugins into ~/.claude/settings.json before
// the question was asked. Answering "project" then wrote the project settings
// but never removed the user-scope entry, so the plugin stayed enabled for every
// project on the machine and the user was never told.
//
// Every assertion below reads the FILESYSTEM rather than a return value: the
// contract is about which settings file gained (or must not gain) an entry.
//
// HOME is redirected to a temp dir for the whole file — getClaudeHome() resolves
// ~/.claude from process.env.HOME, and a test that asserts "the user's settings
// file was not written" must not be able to touch the real one.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "./helpers.mjs";

const KEY = "adev@agentic-development";

let tmpHome;
let realHome;
let realCwd;
let realClaudeConfigDir;
let projectDir;

before(() => {
  realHome = process.env.HOME;
  realCwd = process.cwd();
  realClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
});

after(() => {
  process.env.HOME = realHome;
  if (realClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = realClaudeConfigDir;
  }
  process.chdir(realCwd);
  if (tmpHome) cleanupTempDir(tmpHome);
  if (projectDir) cleanupTempDir(projectDir);
});

beforeEach(() => {
  if (tmpHome) cleanupTempDir(tmpHome);
  if (projectDir) cleanupTempDir(projectDir);
  tmpHome = createTempDir();
  projectDir = createTempDir();
  process.env.HOME = tmpHome;
  // getClaudeHome() prefers CLAUDE_CONFIG_DIR over HOME — an ambient value in
  // the developer's own shell (a personal profile, say) must not leak into
  // these tests, which assert on files under `tmpHome`.
  delete process.env.CLAUDE_CONFIG_DIR;
  process.chdir(projectDir);
});

function userSettingsPath() {
  return join(tmpHome, ".claude", "settings.json");
}
function projectSettingsPath() {
  return join(projectDir, ".claude", "settings.json");
}
function readJsonOrNull(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}
function enabledIn(p) {
  const j = readJsonOrNull(p);
  return Boolean(j?.enabledPlugins?.[KEY]);
}

async function adapter() {
  const { getProvider } = await import("../lib/provider/registry.mjs");
  return getProvider("claude-code");
}

// ── AC-3 / AC-4: the chosen scope decides which file is written ────────────

test('enable("project") writes the project settings file', async () => {
  const a = await adapter();
  a.enable("project");
  assert.equal(enabledIn(projectSettingsPath()), true, "project settings must carry the entry");
});

test('enable("user") writes the user settings file', async () => {
  const a = await adapter();
  a.enable("user");
  assert.equal(enabledIn(userSettingsPath()), true, "user settings must carry the entry");
});

// ── AC-2: a project-scoped enable must not enable the plugin machine-wide ──

test('enable("project") does not add the plugin to ~/.claude/settings.json', async () => {
  const a = await adapter();
  a.enable("project");

  assert.equal(
    enabledIn(userSettingsPath()),
    false,
    "answering 'project' must not leave the plugin enabled for every project on the machine",
  );
});

// ── AC-6 (operator decision): an existing user entry is REMOVED, not left ──

test('enable("project") removes a pre-existing user-scope entry', async () => {
  // Someone who installed at user scope and re-runs answering "project" is
  // asking for a project-scoped install. Leaving the old entry silently makes
  // the prompt a lie — the operator chose removal over merely warning.
  mkdirSync(join(tmpHome, ".claude"), { recursive: true });
  writeFileSync(
    userSettingsPath(),
    JSON.stringify({ enabledPlugins: { [KEY]: true, "other@vendor": true } }, null, 2),
  );

  const a = await adapter();
  a.enable("project");

  assert.equal(enabledIn(userSettingsPath()), false, "the stale user-scope entry must be removed");

  const user = readJsonOrNull(userSettingsPath());
  assert.equal(
    user.enabledPlugins["other@vendor"],
    true,
    "removal must be surgical — other plugins' entries are not ours to touch",
  );
});

test('enable("user") leaves an existing user entry in place', async () => {
  mkdirSync(join(tmpHome, ".claude"), { recursive: true });
  writeFileSync(userSettingsPath(), JSON.stringify({ enabledPlugins: { [KEY]: true } }, null, 2));

  const a = await adapter();
  a.enable("user");

  assert.equal(enabledIn(userSettingsPath()), true, "re-enabling at user scope is idempotent");
});

// ── AC-5: the registry records the scope actually chosen ──────────────────

test("updateRegistry records the chosen scope, not a hardcoded 'user'", async () => {
  const a = await adapter();
  const cacheDir = join(tmpHome, "cache", "adev");
  mkdirSync(cacheDir, { recursive: true });
  // install() creates ~/.claude/plugins before calling updateRegistry; the
  // fixture reproduces that precondition rather than asking the writer to.
  mkdirSync(join(tmpHome, ".claude", "plugins"), { recursive: true });

  a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "project");

  const reg = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));
  assert.equal(
    reg.plugins[KEY][0].scope,
    "project",
    "installed_plugins.json must reflect the answer the user actually gave",
  );
});

test("updateRegistry defaults to user scope when none is passed", async () => {
  const a = await adapter();
  const cacheDir = join(tmpHome, "cache", "adev");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(join(tmpHome, ".claude", "plugins"), { recursive: true });

  a.updateRegistry(join(tmpHome, ".claude"), cacheDir);

  const reg = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));
  assert.equal(reg.plugins[KEY][0].scope, "user", "back-compat: absent scope still means user");
});

// ── GH #378: a project-scope row needs a projectPath, and the array must be
//    upserted rather than replaced (else a second repo's project-scope
//    install silently uninstalls the first repo's row) ─────────────────────

test("updateRegistry records projectPath for a project-scope install", async () => {
  const a = await adapter();
  const cacheDir = join(tmpHome, "cache", "adev");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(join(tmpHome, ".claude", "plugins"), { recursive: true });

  a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "project");

  const reg = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));
  assert.equal(
    reg.plugins[KEY][0].projectPath,
    realpathSync(projectDir),
    "a project-scope row must bind to the project it was installed into, or nothing resolves it",
  );
});

test("updateRegistry does not record projectPath for a user-scope install", async () => {
  const a = await adapter();
  const cacheDir = join(tmpHome, "cache", "adev");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(join(tmpHome, ".claude", "plugins"), { recursive: true });

  a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "user");

  const reg = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));
  assert.equal(
    "projectPath" in reg.plugins[KEY][0],
    false,
    "a user-scope row is machine-wide and must not carry a projectPath",
  );
});

test("a second repo's project-scope install does not clobber the first repo's row", async () => {
  const a = await adapter();
  const cacheDir = join(tmpHome, "cache", "adev");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(join(tmpHome, ".claude", "plugins"), { recursive: true });

  const repoA = realpathSync(projectDir);
  a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "project");

  const repoB = createTempDir();
  try {
    process.chdir(repoB);
    a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "project");

    const reg = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));
    const paths = reg.plugins[KEY].map((r) => r.projectPath);
    assert.deepEqual(
      [...paths].sort(),
      [repoA, realpathSync(repoB)].sort(),
      "both repos' project-scope rows must survive — the array holds one row per (scope, projectPath)",
    );
  } finally {
    cleanupTempDir(repoB);
  }
});

test("re-running updateRegistry for the same (scope, projectPath) updates in place, not a duplicate row", async () => {
  const a = await adapter();
  const cacheDir = join(tmpHome, "cache", "adev");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(join(tmpHome, ".claude", "plugins"), { recursive: true });

  a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "project");
  const first = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));
  const installedAt = first.plugins[KEY][0].installedAt;

  a.updateRegistry(join(tmpHome, ".claude"), cacheDir, "project");
  const second = readJsonOrNull(join(tmpHome, ".claude", "plugins", "installed_plugins.json"));

  assert.equal(second.plugins[KEY].length, 1, "re-installing must not append a duplicate row");
  assert.equal(
    second.plugins[KEY][0].installedAt,
    installedAt,
    "installedAt is preserved across a re-install, same as before this fix",
  );
});

// ── AC-1: ordering — nothing scope-bearing is written before the answer ───

test("install() honours the scope it is given rather than defaulting to user", async () => {
  const a = await adapter();
  // install() copies the plugin into ~/.claude/plugins/cache and enables it.
  // Passing project scope must not enable it user-wide along the way.
  await a.install({ scope: "project" });

  assert.equal(
    enabledIn(userSettingsPath()),
    false,
    "install({scope:'project'}) must not write a user-scope enablement",
  );
  assert.equal(enabledIn(projectSettingsPath()), true, "the project must be enabled instead");
});

// The revoke writes ~/.claude/settings.json, and the marketplace registration
// immediately below it re-reads and rewrites the same file. Ordering between
// those two must not resurrect the key we just deleted, nor drop the
// marketplace entry Claude Code needs to resolve the plugin.
test("revoking the user entry does not fight the marketplace registration", async () => {
  mkdirSync(join(tmpHome, ".claude"), { recursive: true });
  writeFileSync(userSettingsPath(), JSON.stringify({ enabledPlugins: { [KEY]: true } }, null, 2));

  const a = await adapter();
  a.enable("project");

  const user = readJsonOrNull(userSettingsPath());
  assert.equal(user.enabledPlugins[KEY], undefined, "the revoked key must stay revoked");
  assert.ok(
    user.extraKnownMarketplaces?.["agentic-development"],
    "the marketplace registration must survive the revoke — it is user-level by design",
  );
});

// Regression: HOME and cwd can be the SAME directory (both temp dirs in the
// existing cli.test.mjs suite), in which case the user- and project-scope
// settings paths denote one file. Revoking then deletes the entry that was
// just written. String comparison is not sufficient to detect this — on macOS
// $TMPDIR is /var/... while process.cwd() reports /private/var/..., so the two
// paths differ as strings while naming the same file.
test("enable('project') when HOME equals cwd still leaves the plugin enabled", async () => {
  process.env.HOME = projectDir;
  process.chdir(projectDir);

  const a = await adapter();
  const settingsPath = a.enable("project");

  const j = readJsonOrNull(settingsPath);
  assert.equal(
    j?.enabledPlugins?.[KEY],
    true,
    "the revoke must not delete the entry it just wrote when both scopes are one file",
  );
});

// ── SEC-3: settings must never be written through a symlink ────────────────
//
// `.claude/settings.json` is routinely tracked in git, and git tracks symlinks.
// The canonical flow is "clone a repo, then run `npx @adev-org/adev-cli
// install`" — the attacker controls the clone, and the write happens before any
// trust decision. writeFileSync follows a symlink and overwrites its target.
//
// sameFile()'s realpathSync catches only the self-collision case (both scopes
// naming one file). It is an identity check, not a safety check: it does
// nothing about a link pointing at a third location.

test("enable() refuses to write project settings through a symlink", async () => {
  const outside = join(projectDir, "outside-target.json");
  writeFileSync(outside, JSON.stringify({ untouched: true }, null, 2));

  const claudeDir = join(projectDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  symlinkSync(outside, join(claudeDir, "settings.json"));

  const a = await adapter();
  let threw = null;
  try {
    a.enable("project");
  } catch (err) {
    threw = err;
  }

  const target = readJsonOrNull(outside);
  assert.deepEqual(
    target,
    { untouched: true },
    "the symlink target was overwritten — writeFileSync followed the link",
  );
  assert.ok(threw, "writing through a symlink must be refused, not silently skipped");
  assert.match(String(threw.message), /symlink/i, "the error must name the reason");
});

test("enable() refuses to write user settings through a symlink", async () => {
  const outside = join(tmpHome, "outside-user-target.json");
  writeFileSync(outside, JSON.stringify({ untouched: true }, null, 2));

  const claudeDir = join(tmpHome, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  symlinkSync(outside, join(claudeDir, "settings.json"));

  const a = await adapter();
  try {
    a.enable("user");
  } catch {
    /* expected */
  }

  assert.deepEqual(
    readJsonOrNull(outside),
    { untouched: true },
    "the symlink target was overwritten",
  );
});
