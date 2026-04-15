import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("init SKILL.md — workspace support", () => {
  const content = readFileSync(join(__dirname, "..", "..", "skills", "init", "SKILL.md"), "utf8");

  it("documents --workspace flag", () => {
    assert.ok(content.includes("--workspace"), "Should document --workspace flag");
  });

  it("scaffolds adev-workspace.yaml from template", () => {
    assert.ok(content.includes("adev-workspace.yaml") && content.includes("workspace-template"),
      "Should scaffold from workspace template");
  });

  it("auto-discovers repos with manifest.yaml", () => {
    assert.ok(content.includes("auto-discover") || content.includes("Auto-discover"),
      "Should auto-discover child repos");
  });

  it("does not create workspace CLAUDE.md", () => {
    assert.ok(content.includes("No workspace-level CLAUDE.md") || content.includes("no workspace-level CLAUDE.md"),
      "Should not create workspace CLAUDE.md");
  });
});
