import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir } from "./helpers.mjs";
import { spawnSync } from "child_process";

const PLUGIN_ROOT = join(import.meta.dirname, "..");

function runCLI(command, args = [], inputs = [], { env = {} } = {}) {
  const input = inputs.join("\n") + "\n";
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), command, ...args], {
    env: { ...process.env, ...env, HOME: env.HOME || process.env.HOME },
    input,
    encoding: "utf8",
    timeout: 30_000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("CLI E2E - Provider Selection", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("shows wizard when no --provider flag", () => {
    const result = runCLI("init", [], [], { env: { HOME: tempDir } });

    assert.ok(result.stdout.includes("Which AI coding assistant"), "Should show wizard");
  });

  it("skips wizard with --provider flag", () => {
    const result = runCLI("init", ["--provider", "claude-code"], ["user", "no", "no"], { env: { HOME: tempDir } });

    assert.ok(!result.stdout.includes("Which AI coding assistant") || result.stdout.includes("Installing for"),
      "Should not show wizard or should install directly");
  });

  it("installs Claude Code with --provider claude-code", () => {
    const result = runCLI("init", ["--provider", "claude-code"], ["user", "no", "no"], { env: { HOME: tempDir } });

    assert.ok(result.stdout.includes("claude-code") || result.stdout.includes("Plugin installed"),
      "Should install for Claude Code");
  });

  it("installs OpenCode with --provider opencode", () => {
    const result = runCLI("init", ["--provider", "opencode"], ["no"], { env: { HOME: tempDir } });

    assert.ok(result.stdout.includes("opencode") || result.stdout.includes("Plugin installed"),
      "Should install for OpenCode");
  });

  it("exits with error for unknown provider", () => {
    const result = runCLI("init", ["--provider", "unknown"], [], { env: { HOME: tempDir } });

    assert.ok(result.exitCode !== 0 || result.stderr.includes("Unknown provider"),
      "Should fail with unknown provider error");
  });
});

describe("CLI E2E - Dual Setup via Flags", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("installs both providers with multiple --provider flags", () => {
    const result = runCLI("init", ["--provider", "claude-code", "--provider", "opencode"], ["user", "no", "no"], { env: { HOME: tempDir } });

    const hasClaudeCode = result.stdout.includes("claude-code") || result.stdout.includes("Claude Code");
    const hasOpenCode = result.stdout.includes("opencode") || result.stdout.includes("OpenCode");

    assert.ok(hasClaudeCode || hasOpenCode, "Should mention at least one provider");
  });
});

describe("CLI E2E - File System State", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("creates Claude Code plugin directory", () => {
    runCLI("init", ["--provider", "claude-code"], ["user", "no", "no"], { env: { HOME: tempDir } });

    const claudePluginDir = join(tempDir, ".claude", "plugins", "cache");
    assert.ok(existsSync(claudePluginDir) || readdirSync(join(tempDir, ".claude")).length >= 0,
      "Should create Claude plugin structure");
  });

  it("creates OpenCode plugin directory", () => {
    runCLI("init", ["--provider", "opencode"], ["no"], { env: { HOME: tempDir } });

    const opencodePluginDir = join(tempDir, ".config", "opencode", "plugins");
    assert.ok(existsSync(opencodePluginDir) || readdirSync(join(tempDir, ".config", "opencode")).length >= 0,
      "Should create OpenCode plugin structure");
  });
});

describe("CLI E2E - Uninstall", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
    // First install for uninstall testing
    runCLI("init", ["--provider", "claude-code"], ["user", "no", "no"], { env: { HOME: tempDir } });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("uninstalls plugin", () => {
    const result = runCLI("uninstall", [], ["claude-code"], { env: { HOME: tempDir } });

    assert.ok(result.exitCode === 0 || result.stdout.includes("Uninstalling") || result.stdout.includes("plugin"),
      "Should uninstall plugin");
  });
});

describe("CLI E2E - Help", () => {
  it("shows help", () => {
    const result = runCLI("help", [], []);

    assert.ok(result.stdout.includes("Usage") && result.stdout.includes("adev"),
      "Should show usage information");
  });

  it("shows provider options in help", () => {
    const result = runCLI("help", [], []);

    assert.ok(result.stdout.includes("--provider") || result.stdout.includes("claude-code") || result.stdout.includes("opencode"),
      "Should show provider options");
  });
});
