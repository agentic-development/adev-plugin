import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { detectWorkspace, resolveWorkspaceContext, resolveRef } from "../../lib/workspace.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLANK = join(__dirname, "..", "fixtures", "workspace-blank");

describe("workspace-blank fixture — day 0 state", () => {
  it("detects the blank workspace", () => {
    const result = detectWorkspace(BLANK);
    assert.ok(result);
    assert.equal(result.config.workspace.name, "workspace-blank");
    assert.equal(result.currentRepoSlug, null);
  });

  it("has no registered repos", () => {
    const result = detectWorkspace(BLANK);
    assert.equal(result.config.repos.length, 0);
  });

  it("has no dependencies", () => {
    const result = detectWorkspace(BLANK);
    assert.equal(result.config.dependencies.length, 0);
  });

  it("resolves empty workspace context with no siblings", () => {
    const { config } = detectWorkspace(BLANK);
    const ctx = resolveWorkspaceContext(BLANK, config, null);
    assert.equal(ctx.currentRepo, null);
    assert.equal(ctx.siblingRepos.length, 0);
    assert.equal(ctx.warnings.length, 0);
  });

  it("returns null for any cross-repo reference", () => {
    const { config } = detectWorkspace(BLANK);
    assert.equal(resolveRef(BLANK, config, "@any-repo/any-spec"), null);
  });

  it("is a valid workspace (no validation errors)", () => {
    assert.doesNotThrow(() => detectWorkspace(BLANK));
  });
});
