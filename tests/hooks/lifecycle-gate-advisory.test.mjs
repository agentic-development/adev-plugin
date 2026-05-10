import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("lifecycle-gate-advisory hook", () => {
  it("exits 0 silently when lifecycle.gate=off", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=off");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("exits 0 silently when lifecycle.gate=warn", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=warn");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("exits 0 silently when no user-config (defaults to off)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("injects advisory when level=confirm and no active state (at interval)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm\nlifecycle.gate.advisory_interval=1");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: idle\n---\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("additionalContext"), "Should include additionalContext");
    assert.ok(result.stdout.includes("/adev:work"), "Should mention /adev:work");
    cleanupTempDir(tmp);
  });

  it("exits 0 silently when execution state is active", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm\nlifecycle.gate.advisory_interval=1");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: active\nplanRef: p.md\ncurrentTask: 1\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("exits 0 silently when execution state is standalone", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=block\nlifecycle.gate.advisory_interval=1");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: standalone\n---\n");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const result = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(result.exitCode, 0);
    assert.ok(!result.stdout.includes("additionalContext"));
    cleanupTempDir(tmp);
  });

  it("throttles advisory based on advisory_interval", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate=confirm\nlifecycle.gate.advisory_interval=3");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    writeFixture(tmp, ".context-index/.execution-state.md", "---\nstatus: idle\n---\n");

    // Calls 1 and 2 should be silent (counter not at interval)
    const r1 = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(r1.exitCode, 0);
    assert.ok(!r1.stdout.includes("additionalContext"), "Call 1 should be silent");

    const r2 = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(r2.exitCode, 0);
    assert.ok(!r2.stdout.includes("additionalContext"), "Call 2 should be silent");

    // Call 3 should emit advisory (3 % 3 == 0)
    const r3 = runHook("lifecycle-gate-advisory.sh", { cwd: tmp });
    assert.equal(r3.exitCode, 0);
    assert.ok(r3.stdout.includes("additionalContext"), "Call 3 should emit advisory");

    cleanupTempDir(tmp);
  });
});
