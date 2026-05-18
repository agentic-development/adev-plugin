import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CursorAdapter } from "../../providers/cursor/adapter.mjs";

describe("CursorAdapter (shape)", () => {
  it("exports the expected adapter contract", () => {
    assert.equal(CursorAdapter.name, "cursor");
    assert.equal(typeof CursorAdapter.install, "function");
    assert.equal(typeof CursorAdapter.uninstall, "function");
    assert.equal(typeof CursorAdapter.detect, "function");
    assert.equal(typeof CursorAdapter.detectConflicts, "function");
    assert.equal(typeof CursorAdapter.disableConflictingPlugin, "function");
    assert.equal(typeof CursorAdapter.getAgentFile, "function");
    assert.ok(CursorAdapter.pluginRoot, "pluginRoot should be set");
    assert.ok(CursorAdapter.version, "version should be set");
  });
});

describe("CursorAdapter.install", () => {
  let originalEnv;
  let homeDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    homeDir = mkdtempSync(join(tmpdir(), "cursor-home-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("copies the plugin tree into ~/.cursor/plugins/local/adev/ with Spec A and Spec C artifacts present", async () => {
    const result = await CursorAdapter.install({ scope: "user" });
    const cacheDir = join(homeDir, ".cursor", "plugins", "local", "adev");

    assert.equal(result.installed, true);
    assert.equal(result.path, cacheDir);
    assert.ok(
      existsSync(join(cacheDir, ".cursor-plugin", "plugin.json")),
      "Spec A manifest must be present"
    );
    assert.ok(
      existsSync(join(cacheDir, "providers", "cursor", "hooks.json")),
      "Spec C hooks must be present"
    );
    assert.ok(!existsSync(join(cacheDir, ".git")), ".git must be excluded");
    assert.ok(!existsSync(join(cacheDir, "node_modules")), "node_modules must be excluded");
  });

  it("is idempotent: second install returns {installed: false}", async () => {
    await CursorAdapter.install({ scope: "user" });
    const result = await CursorAdapter.install({ scope: "user" });
    assert.equal(result.installed, false);
  });
});
