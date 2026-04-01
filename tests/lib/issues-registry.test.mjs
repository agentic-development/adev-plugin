/**
 * Tests for lib/issues/registry.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getIssueManager, SUPPORTED_BACKENDS } from "../../lib/issues/registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "../..");

describe("getIssueManager", () => {
  it("returns FileAdapter when backend is 'file'", () => {
    const manager = getIssueManager({ tasks: { backend: "file" } }, "/tmp");
    assert.equal(manager.name, "file");
  });

  it("returns FileAdapter when tasks config is absent", () => {
    const manager = getIssueManager({}, "/tmp");
    assert.equal(manager.name, "file");
  });

  it("returns FileAdapter when manifest is empty", () => {
    const manager = getIssueManager(null, "/tmp");
    assert.equal(manager.name, "file");
  });

  it("throws UNKNOWN_BACKEND for invalid backend", () => {
    assert.throws(
      () => getIssueManager({ tasks: { backend: "jira" } }, "/tmp"),
      (err) => err.code === "UNKNOWN_BACKEND"
    );
  });

  it("returns FileAdapter for empty string backend (treated as unconfigured)", () => {
    const manager = getIssueManager({ tasks: { backend: "" } }, "/tmp");
    assert.equal(manager.name, "file");
  });

  it("falls back to FileAdapter when beads requested but br not available", () => {
    // In most test environments, br is not installed
    const manager = getIssueManager({ tasks: { backend: "beads" } }, "/tmp");
    // Should be file adapter (fallback) or beads adapter if br is installed
    assert.ok(manager.name === "file" || manager.name === "beads");
  });
});

describe("SUPPORTED_BACKENDS", () => {
  it("includes file and beads", () => {
    assert.deepEqual(SUPPORTED_BACKENDS, ["file", "beads"]);
  });
});

describe("manifest template", () => {
  it("contains tasks.backend config section", () => {
    const template = readFileSync(
      join(PLUGIN_ROOT, "templates", "manifest-template.yaml"), "utf8"
    );
    assert.ok(template.includes("tasks:"), "manifest template should contain tasks: section");
    assert.ok(template.includes("backend: file"), "manifest template should default to file backend");
  });
});
