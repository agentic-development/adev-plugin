import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolveStorageRoot } from "../../lib/issues/resolve-root.mjs";
import { provisionBoardWorktree } from "../../lib/issues/board-worktree.mjs";

describe("resolveStorageRoot", () => {
  it("returns explicit db_path when configured", () => {
    const manifest = { tasks: { backend: "file", db_path: "/tmp/shared-db" } };
    assert.equal(resolveStorageRoot(manifest, "/some/worktree"), "/tmp/shared-db");
  });

  it("returns explicit db_path even with beads backend", () => {
    const manifest = { tasks: { backend: "beads", db_path: "/custom/path" } };
    assert.equal(resolveStorageRoot(manifest, "/any/dir"), "/custom/path");
  });

  it("resolves main repo root via git when no db_path", () => {
    const manifest = { tasks: { backend: "file" } };
    const result = resolveStorageRoot(manifest);
    // Should resolve to this repo's root (parent of .git)
    assert.ok(result.length > 0);
    assert.ok(!result.endsWith(".git"), "should not include .git suffix");
  });

  it("resolves same root from any subdirectory", () => {
    const manifest = { tasks: { backend: "file" } };
    const fromRoot = resolveStorageRoot(manifest, process.cwd());
    const fromLib = resolveStorageRoot(manifest, resolve(process.cwd(), "lib"));
    assert.equal(fromRoot, fromLib);
  });

  it("falls back to cwd when git is unavailable", () => {
    const tmpDir = resolve("/tmp", `resolve-root-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    try {
      const result = resolveStorageRoot({}, tmpDir);
      assert.equal(result, tmpDir);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("handles null manifest gracefully", () => {
    const result = resolveStorageRoot(null);
    assert.ok(result.length > 0);
  });

  it("handles undefined manifest gracefully", () => {
    const result = resolveStorageRoot(undefined);
    assert.ok(result.length > 0);
  });

  it("handles manifest without tasks section", () => {
    const result = resolveStorageRoot({ project: { name: "test" } });
    assert.ok(result.length > 0);
  });

  it("resolves the main repo root from inside a .beads/ linked worktree (BEH-4)", () => {
    const repo = mkdtempSync(join(tmpdir(), "resolve-root-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repo });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
      execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: repo });
      execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo });
      provisionBoardWorktree({ projectRoot: repo });

      const resolved = resolveStorageRoot(undefined, join(repo, ".beads"));
      assert.equal(realpathSync(resolved), realpathSync(repo));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
