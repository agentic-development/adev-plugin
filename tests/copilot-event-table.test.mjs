// Tests for lib/providers/copilot/event-table.mjs
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EVENT_TABLE, validate } from "../lib/providers/copilot/event-table.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("EVENT_TABLE exports an array, not a plain object", () => {
  assert.ok(Array.isArray(EVENT_TABLE));
  for (const entry of EVENT_TABLE) {
    assert.equal(typeof entry.claudeEvent, "string");
    assert.equal(typeof entry.copilotEvent, "string");
    assert.equal(typeof entry.cloudAgentSafe, "boolean");
  }
});

test("every Claude Code event in hooks/hooks.json has an event-table entry", () => {
  const canonical = JSON.parse(
    readFileSync(path.join(repoRoot, "hooks/hooks.json"), "utf8"),
  );
  const declared = new Set(EVENT_TABLE.map((e) => e.claudeEvent));
  for (const claudeEvent of Object.keys(canonical.hooks)) {
    assert.ok(
      declared.has(claudeEvent),
      `missing translation for Claude event "${claudeEvent}"`,
    );
  }
});

test("validate() throws DUPLICATE_EVENT_MAPPING on a duplicate", () => {
  const bad = [...EVENT_TABLE, EVENT_TABLE[0]];
  assert.throws(() => validate(bad), /DUPLICATE_EVENT_MAPPING/);
});

test("validate() returns silently on a non-duplicate table", () => {
  assert.doesNotThrow(() => validate(EVENT_TABLE));
});

test("Notification maps to notification with cloudAgentSafe: false", () => {
  const entry = EVENT_TABLE.find((e) => e.claudeEvent === "Notification");
  assert.ok(entry, "Notification entry must exist");
  assert.equal(entry.copilotEvent, "notification");
  assert.equal(entry.cloudAgentSafe, false);
});

test("table covers the documented 11-event vocabulary", () => {
  const declared = new Set(EVENT_TABLE.map((e) => e.claudeEvent));
  for (const claudeEvent of [
    "PreToolUse",
    "PostToolUse",
    "SessionStart",
    "SessionEnd",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "UserPromptSubmit",
    "PostToolUseFailure",
    "PreCompact",
    "Notification",
  ]) {
    assert.ok(declared.has(claudeEvent), `missing entry for ${claudeEvent}`);
  }
});

test("Cloud-Agent-safe entries map to documented Copilot camelCase names", () => {
  const expectedMapping = {
    PreToolUse: "preToolUse",
    PostToolUse: "postToolUse",
    SessionStart: "sessionStart",
    SessionEnd: "sessionEnd",
    Stop: "agentStop",
    SubagentStart: "subagentStart",
    SubagentStop: "subagentStop",
    UserPromptSubmit: "userPromptSubmitted",
    PostToolUseFailure: "postToolUseFailure",
    PreCompact: "preCompact",
  };
  for (const [claude, copilot] of Object.entries(expectedMapping)) {
    const row = EVENT_TABLE.find((e) => e.claudeEvent === claude);
    assert.equal(row.copilotEvent, copilot, `wrong copilot name for ${claude}`);
    assert.equal(row.cloudAgentSafe, true, `${claude} must be cloudAgentSafe`);
  }
});
