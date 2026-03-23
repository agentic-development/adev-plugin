import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectProvider } from "../../lib/provider/detect.mjs";

describe("detectProvider", () => {
  let originalEnv;
  let tempDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = join(tmpdir(), `adev-detect-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects OpenCode when OPENCODE env var is true", async () => {
    const { mkdtempSync, rmSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const isolatedDir = mkdtempSync(join(tmpdir(), "adev-opencode-test-"));
    const originalCwd = process.cwd();
    process.chdir(isolatedDir);
    
    process.env.OPENCODE = "true";
    process.env.CLAUDE = undefined;
    delete process.env.CLAUDE;

    const result = detectProvider();
    assert.strictEqual(result, "opencode");

    process.chdir(originalCwd);
    rmSync(isolatedDir, { recursive: true, force: true });
  });

  it("detects OpenCode when .opencode directory exists", () => {
    delete process.env.OPENCODE;
    delete process.env.CLAUDE;
    const opencodeDir = join(tempDir, ".opencode");
    mkdirSync(opencodeDir);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const result = detectProvider();
      assert.strictEqual(result, "opencode");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("detects Claude Code when CLAUDE env var is true", () => {
    process.env.CLAUDE = "true";
    delete process.env.OPENCODE;
    rmSync(tempDir, { recursive: true, force: true });

    const result = detectProvider();
    assert.strictEqual(result, "claude-code");
  });

  it("detects Claude Code when .claude directory exists", () => {
    delete process.env.OPENCODE;
    delete process.env.CLAUDE;
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const result = detectProvider();
      assert.strictEqual(result, "claude-code");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("defaults to Claude Code when no indicators present", () => {
    delete process.env.OPENCODE;
    delete process.env.CLAUDE;

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const result = detectProvider();
      assert.strictEqual(result, "claude-code");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("Claude Code takes priority over OpenCode when both indicators present", () => {
    process.env.CLAUDE = "true";
    process.env.OPENCODE = "true";
    const opencodeDir = join(tempDir, ".opencode");
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(opencodeDir);
    mkdirSync(claudeDir);

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const result = detectProvider();
      assert.strictEqual(result, "claude-code");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
