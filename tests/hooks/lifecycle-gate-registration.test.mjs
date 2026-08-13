import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

/**
 * hooks.json registration for the consolidated lifecycle-gate.sh dispatcher.
 *
 * Post-consolidation, the same script (`lifecycle-gate.sh`) appears in all
 * three registrations, distinguished only by its argv surface argument
 * (`pre-edit` | `pre-bash` | `advisory`). Filename-based assertions can no
 * longer discriminate between them, so these tests key off matcher +
 * argv-surface instead (spec Migration Path step 3).
 */
describe("hooks.json lifecycle gate registration", () => {
  const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, "hooks/hooks.json"), "utf-8"));

  /** Find the hook entry command whose command string ends in the given argv surface. */
  function findGateCommand(commands, surface) {
    return commands.find((c) => c.includes("lifecycle-gate.sh") && c.trimEnd().endsWith(surface));
  }

  it("has lifecycle-gate.sh pre-edit registered on Edit|Write", () => {
    const editMatchers = hooks.hooks.PreToolUse.filter(
      (e) => e.matcher === "Edit" || e.matcher === "Edit|Write"
    );
    const hasGate = editMatchers.some((e) =>
      e.hooks.some((h) => findGateCommand([h.command], "pre-edit"))
    );
    assert.ok(hasGate, "lifecycle-gate.sh pre-edit should be registered for Edit|Write");
  });

  it("has lifecycle-gate.sh pre-bash registered on Bash", () => {
    const bashMatchers = hooks.hooks.PreToolUse.filter((e) => e.matcher === "Bash");
    const hasGate = bashMatchers.some((e) =>
      e.hooks.some((h) => findGateCommand([h.command], "pre-bash"))
    );
    assert.ok(hasGate, "lifecycle-gate.sh pre-bash should be registered for Bash");
  });

  it("has lifecycle-gate.sh advisory registered on PostToolUse .*", () => {
    const allMatchers = hooks.hooks.PostToolUse.filter((e) => e.matcher === ".*");
    const hasGate = allMatchers.some((e) =>
      e.hooks.some((h) => findGateCommand([h.command], "advisory"))
    );
    assert.ok(hasGate, "lifecycle-gate.sh advisory should be registered for .*");
  });

  it("no per-surface gate script filenames remain (single consolidated script)", () => {
    const raw = JSON.stringify(hooks);
    for (const stale of ["lifecycle-gate-edit.sh", "lifecycle-gate-bash.sh", "lifecycle-gate-advisory.sh"]) {
      assert.ok(!raw.includes(stale), `${stale} should no longer appear in hooks.json`);
    }
  });

  it("lifecycle-gate.sh pre-edit runs AFTER context-preflight", () => {
    const editEntry = hooks.hooks.PreToolUse.find(
      (e) => e.matcher === "Edit" || e.matcher === "Edit|Write"
    );
    const commands = editEntry.hooks.map((h) => h.command);
    const preflightIdx = commands.findIndex((c) => c.includes("context-preflight.sh"));
    const gateIdx = commands.findIndex((c) => findGateCommand([c], "pre-edit"));
    assert.ok(preflightIdx >= 0, "context-preflight.sh should be registered");
    assert.ok(gateIdx >= 0, "lifecycle-gate.sh pre-edit should be registered");
    assert.ok(
      gateIdx > preflightIdx,
      "lifecycle-gate.sh pre-edit should run after context-preflight"
    );
  });

  it("lifecycle-gate.sh pre-bash runs AFTER merge-guard", () => {
    const bashEntry = hooks.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    const commands = bashEntry.hooks.map((h) => h.command);
    const mergeIdx = commands.findIndex((c) => c.includes("merge-guard.sh"));
    const gateIdx = commands.findIndex((c) => findGateCommand([c], "pre-bash"));
    assert.ok(mergeIdx >= 0, "merge-guard.sh should be registered");
    assert.ok(gateIdx >= 0, "lifecycle-gate.sh pre-bash should be registered");
    assert.ok(
      gateIdx > mergeIdx,
      "lifecycle-gate.sh pre-bash should run after merge-guard"
    );
  });

  it("lifecycle-gate.sh advisory runs AFTER session-capture and issue-reminder", () => {
    const allEntry = hooks.hooks.PostToolUse.find((e) => e.matcher === ".*");
    const commands = allEntry.hooks.map((h) => h.command);
    const captureIdx = commands.findIndex((c) => c.includes("session-capture.sh"));
    const reminderIdx = commands.findIndex((c) => c.includes("issue-reminder.sh"));
    const gateIdx = commands.findIndex((c) => findGateCommand([c], "advisory"));
    assert.ok(captureIdx >= 0, "session-capture.sh should be registered");
    assert.ok(reminderIdx >= 0, "issue-reminder.sh should be registered");
    assert.ok(gateIdx >= 0, "lifecycle-gate.sh advisory should be registered");
    assert.ok(
      gateIdx > captureIdx,
      "lifecycle-gate.sh advisory should run after session-capture"
    );
    assert.ok(
      gateIdx > reminderIdx,
      "lifecycle-gate.sh advisory should run after issue-reminder"
    );
  });

  it("lifecycle-gate.sh appears exactly three times, once per surface", () => {
    const allCommands = [
      ...hooks.hooks.PreToolUse.flatMap((e) => e.hooks.map((h) => h.command)),
      ...hooks.hooks.PostToolUse.flatMap((e) => e.hooks.map((h) => h.command)),
    ];
    const gateCommands = allCommands.filter((c) => c.includes("lifecycle-gate.sh"));
    assert.equal(gateCommands.length, 3, "lifecycle-gate.sh should be registered exactly three times");
    const surfaces = gateCommands.map((c) => c.trim().split(/\s+/).pop()).sort();
    assert.deepEqual(surfaces, ["advisory", "pre-bash", "pre-edit"]);
  });
});
