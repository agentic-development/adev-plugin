import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
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
  });

  it("enables the plugin at project scope without moving the cache", async () => {
    await ClaudeCodeAdapter.install({ scope: "project" });

    const projectSettingsPath = join(projectDir, ".claude", "settings.json");
    const projectSettings = JSON.parse(readFileSync(projectSettingsPath, "utf8"));

    assert.equal(projectSettings.enabledPlugins["adev@agentic-development"], true);
    assert.ok(existsSync(join(homeDir, ".claude", "plugins", "cache", "agentic-development", "adev", ClaudeCodeAdapter.version)));
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
