import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("implement SKILL.md — unified integration gate", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "implement", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

  it("should read integration gates from governance/gates.yaml", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(step2post.includes("governance/gates.yaml"),
      "Step 2-post should reference governance/gates.yaml for integration gates");
  });

  it("should NOT reference manifest for integration gate source", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(!step2post.includes("Read `manifest.yaml` `gates:`"),
      "Step 2-post should not read from manifest gates");
  });

  it("should skip when --task is passed", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(step2post.includes("--task") && step2post.includes("skip"),
      "Should skip integration gate on single-task re-run");
  });

  it("should skip silently when no integration-tier gates defined", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(step2post.includes("skip") && step2post.includes("silently"),
      "Should skip silently when no integration gates");
  });

  it("should not have manifest-only restriction", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(!step2post.includes("reads from `manifest.yaml` only"),
      "Should not restrict to manifest-only");
  });

  it("should not have manifest fallback in Step 2h", () => {
    const step2h = content.substring(content.indexOf("2h."), content.indexOf("Step 2-post"));
    assert.ok(!step2h.includes("fall back to manifest quality gates"),
      "Step 2h should not fall back to manifest");
  });
});
