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
    assert.equal(existsSync(join(homeDir, ".claude", "plugins", "cache", "agentic-development")), false);
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
