import { test, describe, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import {
  loadProfiles,
  resolveProfile,
  getEffectivePosture,
} from "../../lib/profiles/index.mjs";
import * as claudeCode from "../../lib/profiles/adapters/claude-code.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const tempDirs = [];
function tmp() {
  const d = createTempDir();
  tempDirs.push(d);
  return d;
}
afterEach(() => {
  while (tempDirs.length) cleanupTempDir(tempDirs.pop());
});

function hasCode(issues, code) {
  return issues.some((i) => i.code === code);
}

describe("profiles/index loadProfiles", () => {
  test("loads bundled defaults with no errors when no overlay exists", () => {
    const repo = tmp();
    writeFixture(repo, ".context-index/.keep", "");
    const r = loadProfiles(repo);
    assert.equal(r.errors.length, 0);
    assert.ok(r.profiles["read-only"]);
    assert.ok(r.profiles["browser-review"]);
    assert.ok(r.profiles["reviewer-fast"]);
    assert.ok(r.profiles["reviewer-capable"]);
    assert.ok(r.profiles["reviewer-reasoning"]);
    assert.ok(r.profiles["implementer"]);
  });

  test("project overlay replaces bundled default with an info note", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/profiles.yaml",
      `profiles:
  read-only:
    description: "Project override."
    permissions:
      tools:
        allow:
          - { category: filesystem-read }
      filesystem: { write: deny, execute: deny }
      network: deny
`
    );
    const r = loadProfiles(repo);
    assert.equal(r.errors.length, 0);
    assert.equal(r.profiles["read-only"].description, "Project override.");
    assert.ok(r.notes.some((n) => n.includes("overrides bundled default")));
  });

  test("empty overlay produces informational note and keeps bundled defaults", () => {
    const repo = tmp();
    writeFixture(repo, ".context-index/profiles.yaml", "# empty\n");
    const r = loadProfiles(repo);
    assert.equal(r.errors.length, 0);
    assert.ok(r.profiles["read-only"]);
    assert.ok(r.notes.some((n) => n.includes("no profiles declared")));
  });

  test("unknown tool category emits WARN", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/profiles.yaml",
      `profiles:
  custom:
    permissions:
      tools:
        allow:
          - { category: frobnicate }
      filesystem: { write: deny, execute: deny }
      network: deny
`
    );
    const r = loadProfiles(repo);
    assert.ok(hasCode(r.warnings, "UNKNOWN_CATEGORY"));
  });
});

describe("profiles/index resolveProfile", () => {
  test("unknown profile name surfaces an error with available list", () => {
    const repo = tmp();
    const { profiles } = loadProfiles(repo);
    const r = resolveProfile("nonexistent", {
      profiles,
      consumerRepoRoot: repo,
    });
    assert.ok(hasCode(r.errors, "UNKNOWN_PROFILE"));
  });

  test("MCP missing raises MCP_MISSING error", () => {
    const repo = tmp();
    const { profiles } = loadProfiles(repo);
    const r = resolveProfile("browser-review", {
      profiles,
      consumerRepoRoot: repo,
      mcpAvailable: new Set(), // playwright NOT available
      adapter: claudeCode,
    });
    assert.ok(hasCode(r.errors, "MCP_MISSING"));
  });

  test("required env var missing fails; optional silently absent", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/profiles.yaml",
      `profiles:
  needs-env:
    extends: read-only
    env:
      files: [".env"]
      allow:
        required: ["REQUIRED_KEY"]
        optional: ["MAYBE_KEY"]
`
    );
    writeFixture(repo, ".env", "REQUIRED_KEY=hello-world-value\n");
    const { profiles } = loadProfiles(repo);
    const r = resolveProfile("needs-env", { profiles, consumerRepoRoot: repo });
    assert.equal(r.errors.length, 0);
    assert.equal(r.env.REQUIRED_KEY, "hello-world-value");
    assert.equal(r.env.MAYBE_KEY, undefined);
  });

  test("redactionSet excludes short values", () => {
    const repo = tmp();
    writeFixture(
      repo,
      ".context-index/profiles.yaml",
      `profiles:
  with-short:
    extends: read-only
    env:
      files: [".env"]
      allow:
        required: ["LONG_VALUE"]
        optional: ["SHORT"]
`
    );
    writeFixture(repo, ".env", "LONG_VALUE=this-is-long-enough\nSHORT=abc\n");
    const { profiles } = loadProfiles(repo);
    const r = resolveProfile("with-short", { profiles, consumerRepoRoot: repo });
    assert.equal(r.errors.length, 0);
    assert.ok(r.redactionSet.has("this-is-long-enough"));
    assert.ok(!r.redactionSet.has("abc"));
  });
});

describe("profiles/index getEffectivePosture", () => {
  test("read-only posture has no write/shell and deny fs/network", () => {
    const repo = tmp();
    const { profiles } = loadProfiles(repo);
    const r = getEffectivePosture("read-only", profiles);
    assert.equal(r.errors.length, 0);
    assert.equal(r.posture.fsWrite, "deny");
    assert.equal(r.posture.fsExecute, "deny");
    assert.equal(r.posture.network, "deny");
    const cats = r.posture.allow.map((e) => e.category).filter(Boolean);
    assert.ok(!cats.includes("filesystem-write"));
    assert.ok(!cats.includes("shell"));
  });

  test("implementer posture includes shell and allows write/execute", () => {
    const repo = tmp();
    const { profiles } = loadProfiles(repo);
    const r = getEffectivePosture("implementer", profiles);
    assert.equal(r.errors.length, 0);
    const cats = r.posture.allow.map((e) => e.category).filter(Boolean);
    assert.ok(cats.includes("shell"));
    assert.equal(r.posture.fsWrite, "allow");
    assert.equal(r.posture.fsExecute, "allow");
    assert.equal(r.posture.network, "allow");
  });

  test("browser-review extends read-only and preserves deny fs but network read-only", () => {
    const repo = tmp();
    const { profiles } = loadProfiles(repo);
    const r = getEffectivePosture("browser-review", profiles);
    assert.equal(r.errors.length, 0);
    assert.equal(r.posture.fsWrite, "deny");
    assert.equal(r.posture.fsExecute, "deny");
    assert.equal(r.posture.network, "read-only");
  });
});
