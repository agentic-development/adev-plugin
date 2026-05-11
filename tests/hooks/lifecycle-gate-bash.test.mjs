import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate-bash hook", () => {
  it("exits 0 when lifecycle.gate=off", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "rm -rf dist" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when no user-config (defaults to off)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "rm -rf dist" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 for passthrough commands (git status)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block\nlifecycle.gate.bash_passthrough=git status,git log,npm test,head,tail,ls,cat,grep");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "git status --short" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 for passthrough commands (npm test)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block\nlifecycle.gate.bash_passthrough=git status,git log,npm test,head,tail,ls,cat,grep");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm test" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 2 when level=block and no active plan for mutating command", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  it("exits 0 for piped commands where all segments are passthrough", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block\nlifecycle.gate.bash_passthrough=git status,git log,npm test,head,tail,ls,cat,grep");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "git log | head" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when execution state is active", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: active\nplanRef: test.plan.md\ncurrentTask: 1\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when execution state is standalone", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: standalone\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when no .context-index exists", () => {
    const tmp = createTempDir();
    const result = runHook("lifecycle-gate-bash.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "rm -rf /" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });
});
