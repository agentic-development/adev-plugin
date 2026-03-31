import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { createTempGitRepo, cleanupTempDir, writeFixture, runGitHook } from "../helpers.mjs";

describe("pre-commit git hook", () => {
  let gitDir;

  afterEach(() => {
    if (gitDir) cleanupTempDir(gitDir);
  });

  it("blocks commit on main (default pr policy)", () => {
    gitDir = createTempGitRepo({ branch: "main" });

    const { exitCode, stderr } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes("Blocked"), "stderr should say Blocked");
    assert.ok(stderr.includes("main"), "stderr should mention main");
  });

  it("allows commit on feature branch", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });

    const { exitCode } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);
  });

  it("blocks commit on master", () => {
    gitDir = createTempGitRepo({ branch: "main" });
    // Rename branch to master
    execSync("git branch -m main master", { cwd: gitDir, stdio: "ignore" });

    const { exitCode, stderr } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes("master"), "stderr should mention master");
  });

  it("advisory on main with ask policy", () => {
    gitDir = createTempGitRepo({ branch: "main" });
    writeFixture(gitDir, ".context-index/manifest.yaml", "merge_policy: ask\n");

    const { exitCode, stderr } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes("Warning"), "stderr should contain warning");
  });

  it("blocks on custom protected branch", () => {
    gitDir = createTempGitRepo({ branch: "main" });
    writeFixture(
      gitDir,
      ".context-index/manifest.yaml",
      "merge_policy: pr\nprotected_branches:\n  - main\n  - release\n"
    );

    const { exitCode } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 1);
  });

  it("allows commit when branch not in custom protected list", () => {
    gitDir = createTempGitRepo({ branch: "main" });
    writeFixture(
      gitDir,
      ".context-index/manifest.yaml",
      "merge_policy: pr\nprotected_branches:\n  - production\n  - staging\n"
    );

    const { exitCode } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);
  });

  it("blocks with merge policy on protected branch", () => {
    gitDir = createTempGitRepo({ branch: "main" });
    writeFixture(gitDir, ".context-index/manifest.yaml", "merge_policy: merge\n");

    const { exitCode, stderr } = runGitHook("pre-commit", { cwd: gitDir });
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes("Blocked"), "stderr should say Blocked");
  });
});
