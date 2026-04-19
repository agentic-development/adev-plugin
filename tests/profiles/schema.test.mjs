import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { validateProfile, validateAll } from "../../lib/profiles/schema.mjs";

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("profiles/schema", () => {
  test("accepts a minimal read-only profile", () => {
    const r = validateProfile("read-only", {
      permissions: {
        tools: { allow: [{ category: "filesystem-read" }] },
        filesystem: { write: "deny", execute: "deny" },
        network: "deny",
      },
    });
    assert.equal(r.errors.length, 0);
  });

  test("rejects wildcard category", () => {
    const r = validateProfile("bad", {
      permissions: { tools: { allow: [{ category: "*" }] } },
    });
    assert.ok(hasCode(r.errors, "TOOL_WILDCARD"));
  });

  test("rejects literal tool without allow_unportable", () => {
    const r = validateProfile("bad", {
      permissions: { tools: { allow: [{ tool: "Bash" }] } },
    });
    assert.ok(hasCode(r.errors, "TOOL_UNPORTABLE"));
  });

  test("accepts literal tool WITH allow_unportable: true", () => {
    const r = validateProfile("ok", {
      permissions: { tools: { allow: [{ tool: "Bash", allow_unportable: true }] } },
    });
    assert.equal(r.errors.length, 0);
  });

  test("rejects allow + allow_add on the same profile", () => {
    const r = validateProfile("bad", {
      extends: "read-only",
      permissions: {
        tools: {
          allow: [{ category: "filesystem-read" }],
          allow_add: [{ category: "shell" }],
        },
      },
    });
    assert.ok(hasCode(r.errors, "ALLOW_MIX"));
  });

  test("requires extends for allow_add when no allow", () => {
    const r = validateProfile("bad", {
      permissions: { tools: { allow_add: [{ category: "shell" }] } },
    });
    assert.ok(hasCode(r.errors, "ALLOW_ADD_NO_EXTENDS"));
  });

  test("requires tools.allow when there is no extends", () => {
    const r = validateProfile("bad", { description: "nothing" });
    assert.ok(hasCode(r.errors, "MISSING_ALLOW"));
  });

  test("rejects env key in both required and optional", () => {
    const r = validateProfile("bad", {
      extends: "read-only",
      env: {
        allow: { required: ["API_TOKEN"], optional: ["API_TOKEN"] },
      },
    });
    assert.ok(hasCode(r.errors, "ENV_ALLOW_DUP"));
  });

  test("rejects invalid model tier and thinking_budget", () => {
    const r = validateProfile("bad", {
      extends: "read-only",
      model: { tier: "superfast", thinking_budget: "extreme" },
    });
    assert.ok(hasCode(r.errors, "MODEL_TIER"));
    assert.ok(hasCode(r.errors, "MODEL_THINKING"));
  });

  test("warns on unknown top-level field (forward compat)", () => {
    const r = validateProfile("ok", {
      permissions: { tools: { allow: [{ category: "filesystem-read" }] } },
      future_harness_ext: {},
    });
    assert.ok(hasCode(r.warnings, "UNKNOWN_FIELD"));
    assert.equal(r.errors.length, 0);
  });

  test("validateAll aggregates across profiles", () => {
    const r = validateAll({
      ok: { permissions: { tools: { allow: [{ category: "search" }] } } },
      bad: { permissions: { tools: { allow: [{ category: "*" }] } } },
    });
    assert.ok(hasCode(r.errors, "TOOL_WILDCARD"));
  });
});
