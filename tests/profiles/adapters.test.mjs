import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import * as claudeCode from "../../lib/profiles/adapters/claude-code.mjs";
import * as openCode from "../../lib/profiles/adapters/opencode.mjs";

const seedCategories = [
  "filesystem-read",
  "search",
  "agent",
  "web-fetch",
  "filesystem-write",
  "shell",
];

describe("adapters/claude-code", () => {
  test("IMPLEMENTED covers all six seed categories; UNSUPPORTED is empty", () => {
    for (const c of seedCategories) assert.ok(claudeCode.IMPLEMENTED.includes(c));
    assert.equal(claudeCode.UNSUPPORTED.length, 0);
  });

  test("AUDITED_CHANNELS includes every required channel", () => {
    const required = [
      "tool-stdout",
      "tool-stderr",
      "harness-error",
      "adapter-diagnostic",
      "tool-argument-echo",
      "pre-adapter-transcript",
      "subprocess-spawn-error",
    ];
    for (const c of required) assert.ok(claudeCode.AUDITED_CHANNELS.includes(c));
  });

  test("prepareForDispatch maps categories to concrete Claude Code tools", () => {
    const effective = {
      permissions: {
        tools: {
          allow: [
            { category: "filesystem-read" },
            { category: "search" },
            { category: "agent" },
          ],
        },
        filesystem: { write: "deny", execute: "deny" },
        network: "deny",
      },
      model: { tier: "fast" },
    };
    const result = claudeCode.prepareForDispatch(effective, {
      modelIdFromTier: (t) => (t === "fast" ? "claude-haiku-4-5-20251001" : undefined),
    });
    assert.ok(result.allowedTools.includes("Read"));
    assert.ok(result.allowedTools.includes("Glob"));
    assert.ok(result.allowedTools.includes("Grep"));
    assert.ok(result.allowedTools.includes("Agent"));
    assert.equal(result.modelId, "claude-haiku-4-5-20251001");
  });

  test("mcp_server becomes mcp__<name>__* when available", () => {
    const effective = {
      permissions: { tools: { allow: [{ mcp_server: "playwright" }] } },
    };
    const result = claudeCode.prepareForDispatch(effective, {
      mcpAvailable: new Set(["playwright"]),
    });
    assert.ok(result.allowedTools.includes("mcp__playwright__*"));
  });

  test("missing MCP shows up in unresolvedMcp", () => {
    const effective = {
      permissions: { tools: { allow: [{ mcp_server: "missing" }] } },
    };
    const result = claudeCode.prepareForDispatch(effective, {
      mcpAvailable: new Set(),
    });
    assert.deepEqual(result.unresolvedMcp, ["missing"]);
  });

  test("literal tool is passed through unchanged", () => {
    const effective = {
      permissions: {
        tools: { allow: [{ tool: "CustomTool", allow_unportable: true }] },
      },
    };
    const result = claudeCode.prepareForDispatch(effective);
    assert.ok(result.allowedTools.includes("CustomTool"));
  });
});

describe("adapters/opencode", () => {
  test("IMPLEMENTED = 4 categories; UNSUPPORTED = filesystem-write + shell", () => {
    assert.deepEqual([...openCode.IMPLEMENTED].sort(), ["agent", "filesystem-read", "search", "web-fetch"]);
    assert.deepEqual([...openCode.UNSUPPORTED].sort(), ["filesystem-write", "shell"]);
  });

  test("prepareForDispatch flags filesystem-write as unresolved", () => {
    const effective = {
      permissions: { tools: { allow: [{ category: "filesystem-write" }] } },
    };
    const result = openCode.prepareForDispatch(effective);
    assert.deepEqual(result.unresolvedCategories, ["filesystem-write"]);
  });
});
