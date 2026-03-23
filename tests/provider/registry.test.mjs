import { describe, it } from "node:test";
import assert from "node:assert";
import { getProvider, getProviderNames } from "../../lib/provider/registry.mjs";

describe("getProvider", () => {
  it("returns Claude Code adapter by name", () => {
    const provider = getProvider("claude-code");
    assert.ok(provider);
    assert.strictEqual(provider.name, "claude-code");
  });

  it("returns OpenCode adapter by name", () => {
    const provider = getProvider("opencode");
    assert.ok(provider);
    assert.strictEqual(provider.name, "opencode");
  });

  it("returns Claude Code adapter for unknown name (fallback)", () => {
    const provider = getProvider("unknown-provider");
    assert.ok(provider);
    assert.strictEqual(provider.name, "claude-code");
  });

  it("has getAgentFile method", () => {
    const claudeProvider = getProvider("claude-code");
    const opencodeProvider = getProvider("opencode");

    assert.strictEqual(claudeProvider.getAgentFile(), "CLAUDE.md");
    assert.strictEqual(opencodeProvider.getAgentFile(), "AGENTS.md");
  });

  it("has detect method", () => {
    const provider = getProvider("claude-code");
    assert.strictEqual(typeof provider.detect, "function");
  });

  it("has install method", () => {
    const provider = getProvider("claude-code");
    assert.strictEqual(typeof provider.install, "function");
  });

  it("has uninstall method", () => {
    const provider = getProvider("claude-code");
    assert.strictEqual(typeof provider.uninstall, "function");
  });
});

describe("getProviderNames", () => {
  it("returns array of available provider names", () => {
    const names = getProviderNames();
    assert.ok(Array.isArray(names));
    assert.ok(names.includes("claude-code"));
    assert.ok(names.includes("opencode"));
  });
});
