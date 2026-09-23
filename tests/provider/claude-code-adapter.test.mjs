import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ClaudeCodeAdapter } from "../../providers/claude-code/adapter.mjs";

describe("ClaudeCodeAdapter", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let projectDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "claude-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "claude-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("installs the Claude plugin cache with shared skills", async () => {
    const result = await ClaudeCodeAdapter.install({ scope: "user" });
    const cacheDir = join(homeDir, ".claude", "plugins", "cache", "agentic-development", "adev", ClaudeCodeAdapter.version);
    const settingsPath = join(homeDir, ".claude", "settings.json");

    assert.equal(result.installed, true);
    assert.equal(result.path, cacheDir);
    assert.ok(existsSync(join(cacheDir, ".claude-plugin", "plugin.json")));
    assert.ok(existsSync(join(cacheDir, "skills", "init", "SKILL.md")));

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.enabledPlugins["adev@agentic-development"], true);

    // Verify custom marketplace is registered so Claude Code can resolve the plugin
    assert.ok(settings.extraKnownMarketplaces, "extraKnownMarketplaces should exist");
    assert.ok(settings.extraKnownMarketplaces["agentic-development"], "agentic-development marketplace should be registered");
    assert.equal(
      settings.extraKnownMarketplaces["agentic-development"].source.plugins[0].name,
      "adev"
    );
  });

  it("enables the plugin at project scope without moving the cache", async () => {
    await ClaudeCodeAdapter.install({ scope: "project" });

    const projectSettingsPath = join(projectDir, ".claude", "settings.json");
    const projectSettings = JSON.parse(readFileSync(projectSettingsPath, "utf8"));

    assert.equal(projectSettings.enabledPlugins["adev@agentic-development"], true);
    assert.ok(existsSync(join(homeDir, ".claude", "plugins", "cache", "agentic-development", "adev", ClaudeCodeAdapter.version)));

    // Marketplace registration should be in user settings, not project settings
    const userSettingsPath = join(homeDir, ".claude", "settings.json");
    const userSettings = JSON.parse(readFileSync(userSettingsPath, "utf8"));
    assert.ok(userSettings.extraKnownMarketplaces?.["agentic-development"], "marketplace should be in user settings");
    assert.equal(projectSettings.extraKnownMarketplaces, undefined, "marketplace should NOT be in project settings");
  });

  it("uninstalls the cached plugin and removes the enabled flag", async () => {
    await ClaudeCodeAdapter.install({ scope: "user" });
    await ClaudeCodeAdapter.uninstall({ scope: "user" });

    const settingsPath = join(homeDir, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));

    assert.equal(settings.enabledPlugins?.["adev@agentic-development"], undefined);
    // Only adev's own cache folder is removed (and only because nothing else
    // referenced any version left in it) — the shared "agentic-development"
    // marketplace directory itself is not this plugin's to delete.
    assert.equal(
      existsSync(join(homeDir, ".claude", "plugins", "cache", "agentic-development", "adev")),
      false,
    );
  });
});

// adev-plugin-cli-tag-scope-collision: a machine with more than one Claude
// config dir (CLAUDE_CONFIG_DIR profiles) shares a single plugin cache when
// the adapter always resolves ~/.claude, so an install from one profile can
// delete the version another profile's session is actively running.
describe("ClaudeCodeAdapter CLAUDE_CONFIG_DIR support", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let projectDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "claude-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "claude-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("resolves the config dir from CLAUDE_CONFIG_DIR when set", () => {
    const personalDir = mkdtempSync(join(tmpdir(), "claude-personal-"));
    process.env.CLAUDE_CONFIG_DIR = personalDir;
    try {
      assert.equal(ClaudeCodeAdapter.getClaudeHome(), personalDir);
    } finally {
      rmSync(personalDir, { recursive: true, force: true });
    }
  });

  it("falls back to ~/.claude when CLAUDE_CONFIG_DIR is unset", () => {
    assert.equal(ClaudeCodeAdapter.getClaudeHome(), join(homeDir, ".claude"));
  });

  it("installs into an explicit claudeHome override instead of the ambient one", async () => {
    const personalDir = mkdtempSync(join(tmpdir(), "claude-personal-"));
    try {
      const result = await ClaudeCodeAdapter.install({ scope: "user", claudeHome: personalDir });
      const cacheDir = join(personalDir, "plugins", "cache", "agentic-development", "adev", ClaudeCodeAdapter.version);

      assert.equal(result.path, cacheDir);
      assert.ok(existsSync(cacheDir));
      // The ambient (unset -> ~/.claude) home must be untouched.
      assert.equal(existsSync(join(homeDir, ".claude", "plugins")), false);

      const settings = JSON.parse(readFileSync(join(personalDir, "settings.json"), "utf8"));
      assert.equal(settings.enabledPlugins["adev@agentic-development"], true);
    } finally {
      rmSync(personalDir, { recursive: true, force: true });
    }
  });

  it("discoverConfigDirs returns only the default when nothing else is present", () => {
    const discovered = ClaudeCodeAdapter.discoverConfigDirs();
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].path, join(homeDir, ".claude"));
    assert.equal(discovered[0].active, true);
  });

  it("discoverConfigDirs surfaces CLAUDE_CONFIG_DIR as a second, active candidate", () => {
    const personalDir = join(homeDir, ".claude-personal");
    mkdirSync(personalDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = personalDir;

    const discovered = ClaudeCodeAdapter.discoverConfigDirs();
    const paths = discovered.map((d) => d.path);

    assert.ok(paths.includes(join(homeDir, ".claude")));
    assert.ok(paths.includes(personalDir));
    // Active entry sorts first regardless of alphabetical order.
    assert.equal(discovered[0].path, personalDir);
    assert.equal(discovered[0].active, true);
  });

  it("discoverConfigDirs finds a CLAUDE_CONFIG_DIR assignment in a shell rc file", () => {
    const otherDir = join(homeDir, "other-profile");
    writeFileSync(join(homeDir, ".zshrc"), `export CLAUDE_CONFIG_DIR="${otherDir}"\n`);

    const discovered = ClaudeCodeAdapter.discoverConfigDirs();
    const match = discovered.find((d) => d.path === otherDir);

    assert.ok(match, "expected the .zshrc-declared dir to be discovered");
    assert.ok(match.sources.some((s) => s.includes(".zshrc")));
  });

  it("discoverConfigDirs dedupes a path found through multiple sources", () => {
    const personalDir = join(homeDir, ".claude-personal");
    mkdirSync(personalDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = personalDir;
    writeFileSync(join(homeDir, ".zshrc"), `export CLAUDE_CONFIG_DIR="${personalDir}"\n`);

    const discovered = ClaudeCodeAdapter.discoverConfigDirs();
    const matches = discovered.filter((d) => d.path === personalDir);

    assert.equal(matches.length, 1);
    assert.ok(matches[0].sources.length >= 2);
  });
});

// adev-plugin-cli-tag-scope-collision: cleanOldVersions used to delete every
// cached version except the one just installed, with no regard for whether
// another scope/project's registry row still pointed at it. Two projects
// sharing one claudeHome (the common case — most machines have exactly one
// `~/.claude`) but installed at different npm dist-tags (`@latest` vs `@next`)
// resolve to different versions; installing one used to delete the other's
// files out from under its running session.
describe("ClaudeCodeAdapter cleanOldVersions", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let projectDir;
  let claudeHome;
  let pluginCacheParent;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "claude-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "claude-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(projectDir);
    claudeHome = join(homeDir, ".claude");
    pluginCacheParent = join(claudeHome, "plugins", "cache", "agentic-development", "adev");
    mkdirSync(pluginCacheParent, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  function makeVersionDir(version) {
    mkdirSync(join(pluginCacheParent, version), { recursive: true });
  }

  function writeRegistry(rows) {
    mkdirSync(join(claudeHome, "plugins"), { recursive: true });
    writeFileSync(
      join(claudeHome, "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "adev@agentic-development": rows } }, null, 2),
    );
  }

  it("keeps every version a registry row still references, not just the current one", () => {
    makeVersionDir("0.27.0");
    makeVersionDir("0.28.0");
    makeVersionDir(ClaudeCodeAdapter.version);
    writeRegistry([
      { scope: "user", version: "0.27.0" },
      { scope: "project", projectPath: "/some/other/project", version: "0.28.0" },
    ]);

    ClaudeCodeAdapter.cleanOldVersions(pluginCacheParent, claudeHome);

    assert.ok(existsSync(join(pluginCacheParent, "0.27.0")), "still-referenced version must survive pruning");
    assert.ok(existsSync(join(pluginCacheParent, "0.28.0")), "a different scope's version must survive pruning");
    assert.ok(existsSync(join(pluginCacheParent, ClaudeCodeAdapter.version)));
  });

  it("deletes a version no registry row references and that isn't the current one", () => {
    makeVersionDir("0.20.0");
    makeVersionDir(ClaudeCodeAdapter.version);
    writeRegistry([{ scope: "user", version: ClaudeCodeAdapter.version }]);

    ClaudeCodeAdapter.cleanOldVersions(pluginCacheParent, claudeHome);

    assert.equal(existsSync(join(pluginCacheParent, "0.20.0")), false, "orphaned version must be pruned");
    assert.ok(existsSync(join(pluginCacheParent, ClaudeCodeAdapter.version)));
  });

  it("always keeps the current version even with no registry file yet", () => {
    makeVersionDir(ClaudeCodeAdapter.version);

    ClaudeCodeAdapter.cleanOldVersions(pluginCacheParent, claudeHome);

    assert.ok(existsSync(join(pluginCacheParent, ClaudeCodeAdapter.version)));
  });

  it("end-to-end: installing this build for one project does not delete another project's already-installed version", async () => {
    const otherVersion = "0.1.0-fake-latest";
    makeVersionDir(otherVersion);
    writeRegistry([
      {
        scope: "project",
        projectPath: "/repo/project-a",
        version: otherVersion,
        installPath: join(pluginCacheParent, otherVersion),
      },
    ]);

    await ClaudeCodeAdapter.install({ scope: "project", claudeHome });

    assert.ok(
      existsSync(join(pluginCacheParent, otherVersion)),
      "another project's already-installed version must survive this install",
    );
    assert.ok(existsSync(join(pluginCacheParent, ClaudeCodeAdapter.version)));
  });
});

// uninstall() used to `rm -rf` the entire shared marketplace cache
// unconditionally, regardless of scope — a project-scope uninstall in one
// repo deleted every OTHER scope/project's cached version under the same
// claudeHome too. Same blast-radius class as adev-plugin-cli-tag-scope-collision.
describe("ClaudeCodeAdapter uninstall cache and registry safety", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let projectDir;
  let claudeHome;
  let pluginCacheParent;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "claude-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "claude-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(projectDir);
    claudeHome = join(homeDir, ".claude");
    pluginCacheParent = join(claudeHome, "plugins", "cache", "agentic-development", "adev");
    mkdirSync(pluginCacheParent, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  function makeVersionDir(version) {
    mkdirSync(join(pluginCacheParent, version), { recursive: true });
  }

  function writeRegistry(rows) {
    mkdirSync(join(claudeHome, "plugins"), { recursive: true });
    writeFileSync(
      join(claudeHome, "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "adev@agentic-development": rows } }, null, 2),
    );
  }

  it("a project-scope uninstall does not delete another project's cached version", async () => {
    const thisProjectVersion = "0.27.0";
    const otherProjectVersion = "0.28.0";
    makeVersionDir(thisProjectVersion);
    makeVersionDir(otherProjectVersion);
    writeRegistry([
      { scope: "project", projectPath: process.cwd(), version: thisProjectVersion },
      { scope: "project", projectPath: "/some/other/project", version: otherProjectVersion },
    ]);

    await ClaudeCodeAdapter.uninstall({ scope: "project", claudeHome });

    assert.equal(
      existsSync(join(pluginCacheParent, thisProjectVersion)),
      false,
      "this project's own version is no longer referenced and must be pruned",
    );
    assert.ok(
      existsSync(join(pluginCacheParent, otherProjectVersion)),
      "another project's version must survive this uninstall",
    );

    const registry = JSON.parse(readFileSync(join(claudeHome, "plugins", "installed_plugins.json"), "utf8"));
    const rows = registry.plugins["adev@agentic-development"];
    assert.equal(rows.length, 1, "only this project's own row should be removed");
    assert.equal(rows[0].projectPath, "/some/other/project");
  });

  it("a user-scope uninstall does not delete a version a project-scope row still uses", async () => {
    const userVersion = "0.27.0";
    const projectVersion = "0.28.0";
    makeVersionDir(userVersion);
    makeVersionDir(projectVersion);
    writeRegistry([
      { scope: "user", version: userVersion },
      { scope: "project", projectPath: "/some/other/project", version: projectVersion },
    ]);

    await ClaudeCodeAdapter.uninstall({ scope: "user", claudeHome });

    assert.equal(existsSync(join(pluginCacheParent, userVersion)), false);
    assert.ok(
      existsSync(join(pluginCacheParent, projectVersion)),
      "a project-scope row's version must survive a user-scope uninstall",
    );

    const registry = JSON.parse(readFileSync(join(claudeHome, "plugins", "installed_plugins.json"), "utf8"));
    const rows = registry.plugins["adev@agentic-development"];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scope, "project");
  });

  it("removes the adev cache folder once nothing references it anymore", async () => {
    makeVersionDir(ClaudeCodeAdapter.version);
    writeRegistry([{ scope: "user", version: ClaudeCodeAdapter.version }]);

    await ClaudeCodeAdapter.uninstall({ scope: "user", claudeHome });

    assert.equal(existsSync(pluginCacheParent), false);
  });
});

// adev-plugin-settings-symlink-parent-jukh: writeJson/readJson lstat-checked
// only the settings file's own leaf, so a symlinked PARENT directory (e.g.
// a tracked `.claude -> ~/.claude` or `.claude -> ~/.ssh`) was still followed.
describe("ClaudeCodeAdapter settings-path symlink containment", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let projectDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "claude-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "claude-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("still refuses a directly symlinked settings leaf (regression)", () => {
    mkdirSync(join(projectDir, ".claude"), { recursive: true });
    const decoyPath = join(projectDir, "decoy-settings.json");
    writeFileSync(decoyPath, "{}\n");
    symlinkSync(decoyPath, join(projectDir, ".claude", "settings.json"));

    assert.throws(
      () => ClaudeCodeAdapter.enable("project"),
      (err) => err.code === "SETTINGS_PATH_IS_SYMLINK",
    );
  });

  it("refuses a symlinked parent directory instead of writing through it", () => {
    // .claude -> some directory outside the project root at all (arbitrary
    // parent escape, not specifically ~/.claude or ~/.ssh).
    const elsewhere = mkdtempSync(join(tmpdir(), "claude-elsewhere-"));
    symlinkSync(elsewhere, join(projectDir, ".claude"), "dir");

    assert.throws(
      () => ClaudeCodeAdapter.enable("project"),
      (err) => err.code === "SETTINGS_PATH_ESCAPES_ROOT",
    );
    assert.equal(existsSync(join(elsewhere, "settings.json")), false);

    rmSync(elsewhere, { recursive: true, force: true });
  });

  it("allows a symlinked parent that resolves inside the intended root (no over-blocking)", () => {
    const realDir = join(projectDir, "actual-claude-dir");
    mkdirSync(realDir, { recursive: true });
    symlinkSync(realDir, join(projectDir, ".claude"), "dir");

    assert.doesNotThrow(() => ClaudeCodeAdapter.enable("project"));

    const settings = JSON.parse(readFileSync(join(realDir, "settings.json"), "utf8"));
    assert.equal(settings.enabledPlugins["adev@agentic-development"], true);
  });

  it("refuses .claude -> ~/.claude so a project-scope enable cannot leak into the user file", () => {
    // Reproduces the exact attack from the issue: a project-scope enable
    // silently writing (and being read back as) the user-scope settings file.
    const homeClaudeDir = join(homeDir, ".claude");
    mkdirSync(homeClaudeDir, { recursive: true });
    symlinkSync(homeClaudeDir, join(projectDir, ".claude"), "dir");

    assert.throws(
      () => ClaudeCodeAdapter.enable("project"),
      (err) => err.code === "SETTINGS_PATH_ESCAPES_ROOT",
    );

    // The user settings file must not have been touched by the refused
    // project-scope call.
    assert.equal(existsSync(join(homeClaudeDir, "settings.json")), false);
  });

  it("refuses .claude -> ~/.ssh so an arbitrary directory is never clobbered", () => {
    // Reproduces the second attack from the issue: an unrelated directory
    // (standing in for ~/.ssh) getting a fixed-name settings.json written
    // into it.
    const sshLikeDir = mkdtempSync(join(tmpdir(), "claude-ssh-"));
    symlinkSync(sshLikeDir, join(projectDir, ".claude"), "dir");

    assert.throws(
      () => ClaudeCodeAdapter.enable("project"),
      (err) => err.code === "SETTINGS_PATH_ESCAPES_ROOT",
    );
    assert.equal(existsSync(join(sshLikeDir, "settings.json")), false);

    rmSync(sshLikeDir, { recursive: true, force: true });
  });

  it("enable('user') still writes normally through a plain, non-symlinked path (regression)", () => {
    ClaudeCodeAdapter.enable("user");
    const settingsPath = join(homeDir, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.enabledPlugins["adev@agentic-development"], true);
  });
});
