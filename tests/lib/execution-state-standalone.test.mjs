import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeExecutionState, readExecutionState } from "../../lib/execution-state.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

describe("execution-state standalone status", () => {
  it("should accept standalone as a valid status", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    assert.doesNotThrow(() => {
      writeExecutionState(tmp, { status: "standalone" });
    });
    const state = readExecutionState(tmp);
    assert.equal(state.status, "standalone");
    cleanupTempDir(tmp);
  });

  it("should not require planRef or currentTask for standalone", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    assert.doesNotThrow(() => {
      writeExecutionState(tmp, { status: "standalone" });
    });
    cleanupTempDir(tmp);
  });

  it("should clear binding fields for standalone (like idle)", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    writeExecutionState(tmp, { status: "standalone" });
    const state = readExecutionState(tmp);
    assert.equal(state.planRef, "");
    assert.equal(state.currentTask, "");
    assert.equal(state.issueBinding, "");
    cleanupTempDir(tmp);
  });
});
