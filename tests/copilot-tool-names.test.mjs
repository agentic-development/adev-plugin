// Tests for lib/providers/copilot/tool-names.mjs
// Spec: .context-index/specs/features/copilot-provider/copilot-hook-generator.spec.md

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TOOL_NAMES } from "../lib/providers/copilot/tool-names.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TOOL_NAMES exports an array of tuples", () => {
  assert.ok(Array.isArray(TOOL_NAMES));
  for (const entry of TOOL_NAMES) {
    assert.equal(typeof entry.claudeToolName, "string");
    assert.equal(typeof entry.copilotToolName, "string");
  }
});

test("MultiEdit and Edit both map to edit", () => {
  const multi = TOOL_NAMES.find((e) => e.claudeToolName === "MultiEdit");
  const edit = TOOL_NAMES.find((e) => e.claudeToolName === "Edit");
  assert.ok(multi, "MultiEdit entry must exist");
  assert.ok(edit, "Edit entry must exist");
  assert.equal(multi.copilotToolName, "edit");
  assert.equal(edit.copilotToolName, "edit");
});

test("covers the v1 documented vocabulary", () => {
  const expected = {
    Bash: "bash",
    Write: "create",
    Edit: "edit",
    MultiEdit: "edit",
    Read: "view",
    Glob: "glob",
    Grep: "grep",
    WebFetch: "web_fetch",
    Task: "task",
    AskUser: "ask_user",
  };
  for (const [claude, copilot] of Object.entries(expected)) {
    const row = TOOL_NAMES.find((e) => e.claudeToolName === claude);
    assert.ok(row, `missing tool-name mapping for "${claude}"`);
    assert.equal(row.copilotToolName, copilot, `wrong copilot name for ${claude}`);
  }
});

test("every Claude tool token referenced in canonical matchers has a mapping", () => {
  const canonical = JSON.parse(
    readFileSync(path.join(repoRoot, "hooks/hooks.json"), "utf8"),
  );
  const declared = new Set(TOOL_NAMES.map((e) => e.claudeToolName));
  for (const eventEntries of Object.values(canonical.hooks)) {
    for (const entry of eventEntries) {
      if (!entry.matcher) continue;
      // Only identifier-shaped tokens are tool names; alternation pipes and
      // metacharacters are passthrough vocabulary.
      const tokens = entry.matcher.match(/\b[A-Z][a-zA-Z]*\b/g) ?? [];
      for (const token of tokens) {
        assert.ok(
          declared.has(token),
          `missing tool-name mapping for "${token}"`,
        );
      }
    }
  }
});
