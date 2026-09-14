// Targeting a specific Claude Code config directory.
//
// A machine can run more than one config dir (Claude Code's own
// CLAUDE_CONFIG_DIR), and adev resolved only $HOME/.claude — so an install
// landed in a directory the running Claude Code never reads. These tests pin
// which directory each input selects, and pin the refusals: getClaudeHome() is
// also the user-scope consent boundary passed as `root` to readJson/writeJson,
// so a relative or empty value would silently widen it to process.cwd().

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeCodeAdapter } from "../../providers/claude-code/adapter.mjs";
import { applyConfigDirFlag } from "../../cli/index.mjs";

const KEY = "adev@agentic-development";

describe("Claude Code config directory resolution", () => {
  let originalEnv;
  let originalCwd;
  let homeDir;
  let altConfigDir;
  let projectDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd();
    homeDir = mkdtempSync(join(tmpdir(), "claude-home-"));
    altConfigDir = mkdtempSync(join(tmpdir(), "claude-alt-"));
    projectDir = mkdtempSync(join(tmpdir(), "claude-project-"));
    process.env.HOME = homeDir;
    delete process.env.USERPROFILE;
    delete process.env.CLAUDE_CONFIG_DIR;
    process.chdir(projectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    for (const d of [homeDir, altConfigDir, projectDir]) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("installs into CLAUDE_CONFIG_DIR verbatim, not $HOME/.claude", async () => {
    process.env.CLAUDE_CONFIG_DIR = altConfigDir;

    const result = await ClaudeCodeAdapter.install({ scope: "user" });

    const expected = join(
      altConfigDir, "plugins", "cache", "agentic-development", "adev", ClaudeCodeAdapter.version,
    );
    assert.equal(result.path, expected);
    // No `.claude` segment appended — the env var names the config dir itself.
    assert.ok(!existsSync(join(altConfigDir, ".claude")));
    assert.ok(existsSync(join(altConfigDir, "plugins", "installed_plugins.json")));

    const settings = JSON.parse(readFileSync(join(altConfigDir, "settings.json"), "utf8"));
    assert.equal(settings.enabledPlugins[KEY], true);

    // The default location is untouched.
    assert.ok(!existsSync(join(homeDir, ".claude")));
  });

  it("uninstalls from CLAUDE_CONFIG_DIR", async () => {
    process.env.CLAUDE_CONFIG_DIR = altConfigDir;
    await ClaudeCodeAdapter.install({ scope: "user" });

    await ClaudeCodeAdapter.uninstall({ scope: "user" });

    const settings = JSON.parse(readFileSync(join(altConfigDir, "settings.json"), "utf8"));
    assert.equal(settings.enabledPlugins[KEY], undefined);
  });

  it("falls back to $HOME/.claude when CLAUDE_CONFIG_DIR is unset or blank", async () => {
    process.env.CLAUDE_CONFIG_DIR = "   ";

    const result = await ClaudeCodeAdapter.install({ scope: "user" });

    assert.ok(result.path.startsWith(join(homeDir, ".claude")));
  });

  it("refuses a relative CLAUDE_CONFIG_DIR instead of resolving it against cwd", async () => {
    process.env.CLAUDE_CONFIG_DIR = "relative/claude";

    await assert.rejects(
      () => ClaudeCodeAdapter.install({ scope: "user" }),
      (err) => {
        assert.equal(err.code, "CLAUDE_HOME_UNRESOLVED");
        assert.match(err.message, /CLAUDE_CONFIG_DIR/);
        return true;
      },
    );
    assert.ok(!existsSync(join(projectDir, "relative")));
  });

  it("refuses an unset HOME with a named error rather than an ERR_INVALID_ARG_TYPE", async () => {
    delete process.env.HOME;

    await assert.rejects(
      () => ClaudeCodeAdapter.install({ scope: "user" }),
      (err) => {
        assert.equal(err.code, "CLAUDE_HOME_UNRESOLVED");
        assert.match(err.message, /CLAUDE_CONFIG_DIR/);
        return true;
      },
    );
  });

  it("refuses a relative HOME rather than installing into the current repo", async () => {
    process.env.HOME = "./somewhere";

    await assert.rejects(
      () => ClaudeCodeAdapter.install({ scope: "user" }),
      (err) => err.code === "CLAUDE_HOME_UNRESOLVED",
    );
    assert.ok(!existsSync(join(projectDir, "somewhere")));
  });

  describe("--config-dir flag", () => {
    it("exports CLAUDE_CONFIG_DIR from the space-separated form", () => {
      const applied = applyConfigDirFlag(["node", "adev", "install", "--config-dir", altConfigDir]);
      assert.equal(applied, altConfigDir);
      assert.equal(process.env.CLAUDE_CONFIG_DIR, altConfigDir);
    });

    it("accepts the --config-dir=<path> form", () => {
      applyConfigDirFlag(["node", "adev", "install", `--config-dir=${altConfigDir}`]);
      assert.equal(process.env.CLAUDE_CONFIG_DIR, altConfigDir);
    });

    it("resolves a relative flag value to an absolute path", () => {
      const applied = applyConfigDirFlag(["node", "adev", "install", "--config-dir", "alt-claude"]);
      assert.equal(applied, join(process.cwd(), "alt-claude"));
    });

    it("leaves CLAUDE_CONFIG_DIR alone when the flag is absent", () => {
      assert.equal(applyConfigDirFlag(["node", "adev", "install"]), null);
      assert.equal(process.env.CLAUDE_CONFIG_DIR, undefined);
    });
  });
});
