import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import { resolveEffective } from "../../lib/profiles/extends.mjs";

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("profiles/extends", () => {
  test("root profile resolves to itself", () => {
    const profiles = {
      "read-only": {
        permissions: {
          tools: { allow: [{ category: "filesystem-read" }, { category: "search" }] },
          filesystem: { write: "deny", execute: "deny" },
          network: "deny",
        },
      },
    };
    const r = resolveEffective("read-only", profiles);
    assert.equal(r.errors.length, 0);
    assert.deepEqual(r.effective.permissions.tools.allow, [
      { category: "filesystem-read" },
      { category: "search" },
    ]);
    assert.equal(r.effective.permissions.network, "deny");
  });

  test("allow_add unions parent allow", () => {
    const profiles = {
      base: {
        permissions: {
          tools: { allow: [{ category: "filesystem-read" }] },
          filesystem: { write: "deny", execute: "deny" },
          network: "deny",
        },
      },
      child: {
        extends: "base",
        permissions: {
          tools: { allow_add: [{ category: "search" }] },
        },
      },
    };
    const r = resolveEffective("child", profiles);
    assert.equal(r.errors.length, 0);
    assert.deepEqual(
      r.effective.permissions.tools.allow.map((e) => e.category),
      ["filesystem-read", "search"]
    );
  });

  test("child allow replaces parent allow", () => {
    const profiles = {
      base: {
        permissions: { tools: { allow: [{ category: "filesystem-read" }] } },
      },
      child: {
        extends: "base",
        permissions: { tools: { allow: [{ category: "shell" }] } },
      },
    };
    const r = resolveEffective("child", profiles);
    assert.deepEqual(
      r.effective.permissions.tools.allow.map((e) => e.category),
      ["shell"]
    );
  });

  test("detects cycles", () => {
    const profiles = {
      a: { extends: "b" },
      b: { extends: "a" },
    };
    const r = resolveEffective("a", profiles);
    assert.ok(hasCode(r.errors, "CYCLE"));
  });

  test("rejects unknown parent", () => {
    const profiles = { a: { extends: "missing" } };
    const r = resolveEffective("a", profiles);
    assert.ok(hasCode(r.errors, "UNKNOWN_PARENT"));
  });

  test("emits broadening WARN on new category via allow_add", () => {
    const profiles = {
      base: {
        permissions: {
          tools: { allow: [{ category: "filesystem-read" }] },
          filesystem: { write: "deny", execute: "deny" },
          network: "deny",
        },
      },
      child: {
        extends: "base",
        permissions: { tools: { allow_add: [{ category: "shell" }] } },
      },
    };
    const r = resolveEffective("child", profiles);
    assert.ok(hasCode(r.warnings, "BROADEN_TOOL"));
  });

  test("emits BROADEN_NETWORK when child loosens", () => {
    const profiles = {
      base: {
        permissions: {
          tools: { allow: [{ category: "filesystem-read" }] },
          filesystem: { write: "deny", execute: "deny" },
          network: "deny",
        },
      },
      child: {
        extends: "base",
        permissions: { network: "allow" },
      },
    };
    const r = resolveEffective("child", profiles);
    assert.ok(hasCode(r.warnings, "BROADEN_NETWORK"));
  });

  test("env.files from child replaces parent's list", () => {
    const profiles = {
      base: {
        permissions: { tools: { allow: [{ category: "filesystem-read" }] } },
        env: { files: [".env.base"] },
      },
      child: {
        extends: "base",
        env: { files: [".env.child"] },
      },
    };
    const r = resolveEffective("child", profiles);
    assert.deepEqual(r.effective.env.files, [".env.child"]);
  });

  test("env.allow unions with required-wins on collision", () => {
    const profiles = {
      base: {
        permissions: { tools: { allow: [{ category: "filesystem-read" }] } },
        env: { allow: { required: [], optional: ["KEY_A"] } },
      },
      child: {
        extends: "base",
        env: { allow: { required: ["KEY_A", "KEY_B"], optional: [] } },
      },
    };
    const r = resolveEffective("child", profiles);
    assert.deepEqual(r.effective.env.allow.required.sort(), ["KEY_A", "KEY_B"]);
    assert.deepEqual(r.effective.env.allow.optional, []);
  });
});
