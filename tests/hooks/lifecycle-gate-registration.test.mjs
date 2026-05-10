import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

describe("hooks.json lifecycle gate registration", () => {
  const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));

  it("has lifecycle-gate-edit registered on Edit|Write", () => {
    const editMatchers = hooks.hooks.PreToolUse.filter(
      (e) => e.matcher === "Edit" || e.matcher === "Edit|Write"
    );
    const hasGate = editMatchers.some((e) =>
      e.hooks.some((h) => h.command.includes("lifecycle-gate-edit.sh"))
    );
    assert.ok(hasGate, "lifecycle-gate-edit.sh should be registered for Edit|Write");
  });

  it("has lifecycle-gate-bash registered on Bash", () => {
    const bashMatchers = hooks.hooks.PreToolUse.filter((e) => e.matcher === "Bash");
    const hasGate = bashMatchers.some((e) =>
      e.hooks.some((h) => h.command.includes("lifecycle-gate-bash.sh"))
    );
    assert.ok(hasGate, "lifecycle-gate-bash.sh should be registered for Bash");
  });

  it("has lifecycle-gate-advisory registered on PostToolUse .*", () => {
    const allMatchers = hooks.hooks.PostToolUse.filter((e) => e.matcher === ".*");
    const hasGate = allMatchers.some((e) =>
      e.hooks.some((h) => h.command.includes("lifecycle-gate-advisory.sh"))
    );
    assert.ok(hasGate, "lifecycle-gate-advisory.sh should be registered for .*");
  });

  it("lifecycle-gate-edit runs AFTER context-preflight", () => {
    const editEntry = hooks.hooks.PreToolUse.find(
      (e) => e.matcher === "Edit" || e.matcher === "Edit|Write"
    );
    const commands = editEntry.hooks.map((h) => h.command);
    const preflightIdx = commands.findIndex((c) => c.includes("context-preflight.sh"));
    const gateIdx = commands.findIndex((c) => c.includes("lifecycle-gate-edit.sh"));
    assert.ok(preflightIdx >= 0, "context-preflight.sh should be registered");
    assert.ok(gateIdx >= 0, "lifecycle-gate-edit.sh should be registered");
    assert.ok(
      gateIdx > preflightIdx,
      "lifecycle-gate-edit should run after context-preflight"
    );
  });

  it("lifecycle-gate-bash runs AFTER merge-guard", () => {
    const bashEntry = hooks.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    const commands = bashEntry.hooks.map((h) => h.command);
    const mergeIdx = commands.findIndex((c) => c.includes("merge-guard.sh"));
    const gateIdx = commands.findIndex((c) => c.includes("lifecycle-gate-bash.sh"));
    assert.ok(mergeIdx >= 0, "merge-guard.sh should be registered");
    assert.ok(gateIdx >= 0, "lifecycle-gate-bash.sh should be registered");
    assert.ok(
      gateIdx > mergeIdx,
      "lifecycle-gate-bash should run after merge-guard"
    );
  });

  it("lifecycle-gate-advisory runs AFTER session-capture and issue-reminder", () => {
    const allEntry = hooks.hooks.PostToolUse.find((e) => e.matcher === ".*");
    const commands = allEntry.hooks.map((h) => h.command);
    const captureIdx = commands.findIndex((c) => c.includes("session-capture.sh"));
    const reminderIdx = commands.findIndex((c) => c.includes("issue-reminder.sh"));
    const gateIdx = commands.findIndex((c) => c.includes("lifecycle-gate-advisory.sh"));
    assert.ok(captureIdx >= 0, "session-capture.sh should be registered");
    assert.ok(reminderIdx >= 0, "issue-reminder.sh should be registered");
    assert.ok(gateIdx >= 0, "lifecycle-gate-advisory.sh should be registered");
    assert.ok(
      gateIdx > captureIdx,
      "lifecycle-gate-advisory should run after session-capture"
    );
    assert.ok(
      gateIdx > reminderIdx,
      "lifecycle-gate-advisory should run after issue-reminder"
    );
  });
});
