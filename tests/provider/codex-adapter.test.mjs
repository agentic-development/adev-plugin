import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CodexAdapter } from "../../providers/codex/adapter.mjs";

describe("CodexAdapter", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let projectDir;
  let adapter;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "codex-home-"));
    projectDir = mkdtempSync(join(tmpdir(), "codex-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    process.chdir(projectDir);
    adapter = new CodexAdapter();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("detects Codex from environment", () => {
    process.env.CODEX = "true";
    assert.strictEqual(adapter.detect(), true);
  });

  it("reports AGENTS.md as the primary agent file", () => {
    assert.strictEqual(adapter.getAgentFile(), "AGENTS.md");
  });

  it("installs user-scoped skills into ~/.agents/skills", async () => {
    const result = await adapter.install({ scope: "user" });

    assert.strictEqual(result.installed, true);
    assert.strictEqual(result.path, "~/.agents/skills/");
    assert.ok(existsSync(join(homeDir, ".agents", "skills", "init", "SKILL.md")));
    assert.ok(existsSync(join(homeDir, ".agents", "skills", "init", "agents", "openai.yaml")));
  });

  it("installs project-scoped skills into .agents/skills", async () => {
    const result = await adapter.install({ scope: "project" });

    assert.strictEqual(result.installed, true);
    assert.strictEqual(result.path, ".agents/skills/");
    assert.ok(existsSync(join(projectDir, ".agents", "skills", "init", "SKILL.md")));
    assert.ok(existsSync(join(projectDir, ".agents", "skills", "init", "agents", "openai.yaml")));
  });

  it("uninstalls only managed project-scoped skills", async () => {
    await adapter.install({ scope: "project" });
    await adapter.uninstall({ scope: "project" });

    assert.ok(!existsSync(join(projectDir, ".agents", "skills", "init")));
  });
});
