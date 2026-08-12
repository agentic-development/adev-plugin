import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { resolveGateConfig, matchesFileExclusion, matchesBashPassthrough } from "../../lib/lifecycle-gate-config.mjs";

// Domain config simulating the software profile defaults (previously hardcoded)
const softwareDomainConfig = {
  file_exclusions: [
    ".context-index/**", "*.test.*", "*.spec.*", "__tests__/**",
    "README.md", "README.*.md", "CHANGELOG.md", "CONTRIBUTING.md",
    "LICENSE*", "docs/**", "package.json", "package-lock.json",
    "*.config.*", "tsconfig*", ".eslintrc*", ".prettierrc*",
    ".gitignore", ".gitmodules", "node_modules/**", ".git/**",
    ".claude-plugin/**", ".adev/**", "CLAUDE.md", "AGENTS.md",
    ".cursorrules", "providers/**", "templates/**",
  ],
  bash_passthrough: [
    "git status", "git log", "git diff", "git branch", "git show", "git blame",
    "ls", "cat", "head", "tail", "find", "grep", "rg", "wc", "file", "which",
    "echo", "printf", "node --test", "npm test", "npm run test", "npm run lint",
    "npm run typecheck", "npx jest", "npx vitest", "npx tsc --noEmit",
    "pwd", "env", "whoami", "date", "uname",
  ],
};

describe("lifecycle-gate-config", () => {
  it("resolveGateConfig returns off when no config", () => {
    const config = resolveGateConfig({});
    assert.equal(config.level, "off");
  });

  it("resolveGateConfig reads lifecycle.gate key", () => {
    const config = resolveGateConfig({ "lifecycle.gate": "confirm" });
    assert.equal(config.level, "confirm");
  });

  it("invalid level falls back to warn", () => {
    const config = resolveGateConfig({ "lifecycle.gate": "invalid" });
    assert.equal(config.level, "warn");
  });

  it("returns empty exclusions and only structural passthrough when no domain config provided", () => {
    const config = resolveGateConfig({});
    assert.deepEqual(config.fileExclusions, []);
    // Strictest mode still carries the structural passthrough set — the gate
    // must never gate its own escape hatch.
    assert.deepEqual(config.bashPassthrough, [
      "adev execution-state write",
      "adev skill-ext load",
    ]);
  });

  it("matchesFileExclusion matches domain-provided patterns", () => {
    const config = resolveGateConfig({}, softwareDomainConfig);
    assert.equal(matchesFileExclusion(".context-index/manifest.yaml", config), true);
    assert.equal(matchesFileExclusion("src/main.mjs", config), false);
    assert.equal(matchesFileExclusion("tests/foo.test.mjs", config), true);
  });

  it("matchesBashPassthrough matches domain-provided commands", () => {
    const config = resolveGateConfig({}, softwareDomainConfig);
    assert.equal(matchesBashPassthrough("git status --short", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist", config), false);
    assert.equal(matchesBashPassthrough("npm test", config), true);
  });

  it("project exclusions extend domain defaults", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.file_exclusions": "*.generated.*,dist/**"
    }, softwareDomainConfig);
    assert.equal(matchesFileExclusion("foo.generated.js", config), true);
    assert.equal(matchesFileExclusion(".context-index/foo.md", config), true); // still has domain defaults
  });

  it("replace_defaults=true removes domain patterns", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.file_exclusions": "custom/**",
      "lifecycle.gate.file_exclusions.replace_defaults": "true"
    }, softwareDomainConfig);
    assert.equal(matchesFileExclusion(".context-index/manifest.yaml", config), false);
    assert.equal(matchesFileExclusion("custom/file.js", config), true);
  });

  it("bash passthrough handles pipe chains", () => {
    const config = resolveGateConfig({}, softwareDomainConfig);
    assert.equal(matchesBashPassthrough("git log | head", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist | head", config), false);
  });

  it("bash passthrough handles && chains (first command determines)", () => {
    const config = resolveGateConfig({}, softwareDomainConfig);
    assert.equal(matchesBashPassthrough("npm test && npm run build", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist && echo done", config), false);
  });

  it("bash passthrough project additions extend domain defaults", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.bash_passthrough": "docker ps,kubectl get"
    }, softwareDomainConfig);
    assert.equal(matchesBashPassthrough("docker ps", config), true);
    assert.equal(matchesBashPassthrough("git status", config), true); // still has domain defaults
  });

  it("bash passthrough replace_defaults=true removes domain commands", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.bash_passthrough": "custom-cmd",
      "lifecycle.gate.bash_passthrough.replace_defaults": "true"
    }, softwareDomainConfig);
    assert.equal(matchesBashPassthrough("git status", config), false);
    assert.equal(matchesBashPassthrough("custom-cmd --flag", config), true);
  });

  it("standalone escape hatch passes with no domain config (strictest mode)", () => {
    const config = resolveGateConfig({ "lifecycle.gate": "block" });
    assert.equal(
      matchesBashPassthrough("adev execution-state write --status standalone", config),
      true
    );
  });

  it("escape hatch passes under a domain profile that does not list it", () => {
    const config = resolveGateConfig({}, softwareDomainConfig);
    assert.equal(
      matchesBashPassthrough("adev execution-state write --status standalone", config),
      true
    );
  });

  it("escape hatch survives bash_passthrough.replace_defaults=true", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.bash_passthrough": "custom-cmd",
      "lifecycle.gate.bash_passthrough.replace_defaults": "true"
    }, softwareDomainConfig);
    assert.equal(
      matchesBashPassthrough("adev execution-state write --status standalone", config),
      true
    );
  });

  it("skill-ext load passes structurally; other adev verbs stay gated", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesBashPassthrough("adev skill-ext load --skill work", config), true);
    // Prefix is exact — bare `adev`, other verbs, and non-write execution-state
    // subcommands are not structurally allowed.
    assert.equal(matchesBashPassthrough("adev implement --plan p.md", config), false);
    assert.equal(matchesBashPassthrough("adev migrate", config), false);
    assert.equal(matchesBashPassthrough("adev", config), false);
  });
});
