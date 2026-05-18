import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CursorAdapter } from "../../providers/cursor/adapter.mjs";

describe("CursorAdapter (shape)", () => {
  it("exports the expected adapter contract", () => {
    assert.equal(CursorAdapter.name, "cursor");
    assert.equal(typeof CursorAdapter.install, "function");
    assert.equal(typeof CursorAdapter.uninstall, "function");
    assert.equal(typeof CursorAdapter.detect, "function");
    assert.equal(typeof CursorAdapter.detectConflicts, "function");
    assert.equal(typeof CursorAdapter.disableConflictingPlugin, "function");
    assert.equal(typeof CursorAdapter.getAgentFile, "function");
    assert.ok(CursorAdapter.pluginRoot, "pluginRoot should be set");
    assert.ok(CursorAdapter.version, "version should be set");
  });
});
