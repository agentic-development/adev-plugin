import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate integration", () => {
  // Enforcement levels
  it("warn level: advisory message, no block", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=warn");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("additionalContext"), "Should include advisory");
    cleanupTempDir(tmp);
  });

  it("confirm level: strong stop-directive, no block", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("STOP"), "Should include STOP directive");
    cleanupTempDir(tmp);
  });

  it("block level: hard block (exit 2)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  // Bypass: standalone
  it("standalone status bypasses block-level enforcement (edit)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.json", JSON.stringify({ status: "standalone", planRef: "", currentTask: "", issueBinding: "", blockers: "", nextAction: "", progress: [], updated: "2026-01-01T00:00:00Z" }) + "\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"), "Should not include advisory when standalone");
    cleanupTempDir(tmp);
  });

  it("standalone status bypasses block-level enforcement (bash)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/.execution-state.json", JSON.stringify({ status: "standalone", planRef: "", currentTask: "", issueBinding: "", blockers: "", nextAction: "", progress: [], updated: "2026-01-01T00:00:00Z" }) + "\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-bash"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  // Source file blocked at block level even when module has plan (no execution state)
  it("blocks source file at block level even if module has plan (no execution state)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\nmodules:\n  - slug: app\n    paths:\n      - src/\n");
    writeFixture(tmp, ".context-index/specs/features/app/feature.spec.md", "# spec");
    writeFixture(tmp, ".context-index/specs/features/app/feature.plan.md", "# plan");
    writeFixture(tmp, "src/main.mjs", "");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  // Missing .context-index → pass
  it("no .context-index directory: exit 0 silently (edit)", () => {
    const tmp = createTempDir();
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("no .context-index directory: exit 0 silently (bash)", () => {
    const tmp = createTempDir();
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-bash"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "rm -rf everything" }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  // Malformed user-config → exit 0
  it("malformed user-config: exit 0 silently", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "not valid config {{{}}}");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  // Performance: fast-path should be quick
  it("fast-path (gate=off) completes in under 500ms", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const start = Date.now();
    runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `Fast path took ${elapsed}ms, expected < 500ms`);
    cleanupTempDir(tmp);
  });

  // Bash block-level enforcement for mutating commands
  it("bash gate blocks mutating commands at block level", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-bash"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 2);
    assert.ok(result.stdout.includes("Blocked"), "Should include Blocked message");
    cleanupTempDir(tmp);
  });

  // Bash warn-level enforcement for mutating commands
  it("bash gate warns on mutating commands at warn level", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=warn");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate.sh", {
      args: ["pre-bash"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("additionalContext"), "Should include advisory");
    cleanupTempDir(tmp);
  });

  // Advisory does not fire when active
  it("advisory: silent when active (all layers bypassed)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm\nlifecycle.gate.advisory_interval=1");
    writeFixture(tmp, ".context-index/.execution-state.json", JSON.stringify({ status: "active", planRef: "p.md", currentTask: 1, issueBinding: "", blockers: "", nextAction: "", progress: [], updated: "2026-05-11T00:00:00Z" }) + "\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");

    // All three layers should be silent
    const editResult = runHook("lifecycle-gate.sh", {
      args: ["pre-edit"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: `${tmp}/src/main.mjs` }
    });
    assert.equal(editResult.exitCode, 0);
    assert.ok(!editResult.stdout.includes("additionalContext"));

    const bashResult = runHook("lifecycle-gate.sh", {
      args: ["pre-bash"],
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_command: "npm run build" }
    });
    assert.equal(bashResult.exitCode, 0);
    assert.ok(!bashResult.stdout.includes("additionalContext"));

    const advisoryResult = runHook("lifecycle-gate.sh", { args: ["advisory"], cwd: tmp });
    assert.equal(advisoryResult.exitCode, 0);
    assert.ok(!advisoryResult.stdout.includes("additionalContext"));

    cleanupTempDir(tmp);
  });
});
