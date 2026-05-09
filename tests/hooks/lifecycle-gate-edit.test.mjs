import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate-edit hook", () => {
  it("exits 0 when lifecycle.gate=off", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when no user-config (defaults to off)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when execution state is active", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: active\nplanRef: test.plan.md\ncurrentTask: 1\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when execution state is standalone", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: standalone\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 for excluded files (test files)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/tests/foo.test.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 for excluded files (.context-index)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/.context-index/manifest.yaml` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 2 when level=block and module has specs but no plan", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: cli\n    paths:\n      - src/cli/\n");
    writeFixture(tmp, ".context-index/specs/features/cli/something.spec.md", "# spec");
    writeFixture(tmp, "src/cli/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/cli/main.mjs` }
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  it("exits 0 when module has a plan file", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: cli\n    paths:\n      - src/cli/\n");
    writeFixture(tmp, ".context-index/specs/features/cli/something.spec.md", "# spec");
    writeFixture(tmp, ".context-index/specs/features/cli/something.plan.md", "# plan");
    writeFixture(tmp, "src/cli/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/cli/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when no .context-index exists", () => {
    const tmp = createTempDir();
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("exits 0 when module has no specs (untracked code)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: cli\n    paths:\n      - src/cli/\n");
    writeFixture(tmp, "src/cli/main.mjs", "");
    const result = runHook("lifecycle-gate-edit.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/cli/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });
});
