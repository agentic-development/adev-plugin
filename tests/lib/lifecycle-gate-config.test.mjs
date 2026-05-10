import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { resolveGateConfig, matchesFileExclusion, matchesBashPassthrough } from "../../lib/lifecycle-gate-config.mjs";

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

  it("matchesFileExclusion matches default patterns", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesFileExclusion(".context-index/manifest.yaml", config), true);
    assert.equal(matchesFileExclusion("src/main.mjs", config), false);
    assert.equal(matchesFileExclusion("tests/foo.test.mjs", config), true);
  });

  it("matchesBashPassthrough matches default commands", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesBashPassthrough("git status --short", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist", config), false);
    assert.equal(matchesBashPassthrough("npm test", config), true);
  });

  it("project exclusions extend defaults", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.file_exclusions": "*.generated.*,dist/**"
    });
    assert.equal(matchesFileExclusion("foo.generated.js", config), true);
    assert.equal(matchesFileExclusion(".context-index/foo.md", config), true); // still has defaults
  });

  it("replace_defaults=true removes built-in patterns", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.file_exclusions": "custom/**",
      "lifecycle.gate.file_exclusions.replace_defaults": "true"
    });
    assert.equal(matchesFileExclusion(".context-index/manifest.yaml", config), false);
    assert.equal(matchesFileExclusion("custom/file.js", config), true);
  });

  it("bash passthrough handles pipe chains", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesBashPassthrough("git log | head", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist | head", config), false);
  });

  it("bash passthrough handles && chains (first command determines)", () => {
    const config = resolveGateConfig({});
    assert.equal(matchesBashPassthrough("npm test && npm run build", config), true);
    assert.equal(matchesBashPassthrough("rm -rf dist && echo done", config), false);
  });

  it("bash passthrough project additions extend defaults", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.bash_passthrough": "docker ps,kubectl get"
    });
    assert.equal(matchesBashPassthrough("docker ps", config), true);
    assert.equal(matchesBashPassthrough("git status", config), true); // still has defaults
  });

  it("bash passthrough replace_defaults=true removes built-ins", () => {
    const config = resolveGateConfig({
      "lifecycle.gate.bash_passthrough": "custom-cmd",
      "lifecycle.gate.bash_passthrough.replace_defaults": "true"
    });
    assert.equal(matchesBashPassthrough("git status", config), false);
    assert.equal(matchesBashPassthrough("custom-cmd --flag", config), true);
  });
});
