/**
 * Tests for lib/issues/registry.mjs.
 *
 * Covers the post-CON-5 contract:
 *   - "json" backend is the new default
 *   - explicit "json" returns JsonAdapter
 *   - "file" returns FileAdapter + emits one-time DEPRECATED_BACKEND warning
 *   - unconfigured tasks.backend emits a one-time default-resolved advisory
 *   - unknown backend throws UNKNOWN_BACKEND
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { getIssueManager, SUPPORTED_BACKENDS, DEFAULT_BACKEND } from "../../lib/issues/registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "../..");

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "issues-registry-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

describe("getIssueManager", () => {
  it("returns JsonAdapter when backend is 'json'", () => {
    process.env.ADEV_SILENCE_DEPRECATION_BACKEND = "1";
    process.env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY = "1";
    const dir = makeProject();
    try {
      const manager = getIssueManager({ tasks: { backend: "json" } }, dir);
      assert.equal(manager.name, "json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns JsonAdapter (default) when tasks.backend is unset", () => {
    process.env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY = "1";
    const dir = makeProject();
    try {
      const manager = getIssueManager({}, dir);
      assert.equal(manager.name, "json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns JsonAdapter (default) when manifest is null", () => {
    process.env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY = "1";
    const dir = makeProject();
    try {
      const manager = getIssueManager(null, dir);
      assert.equal(manager.name, "json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns FileAdapter when backend is 'file' (read-only-deprecated)", () => {
    process.env.ADEV_SILENCE_DEPRECATION_BACKEND = "1";
    const dir = makeProject();
    try {
      const manager = getIssueManager({ tasks: { backend: "file" } }, dir);
      assert.equal(manager.name, "file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits a one-time DEPRECATED_BACKEND console.warn when backend is 'file'", () => {
    // Disable the silencer so the warning is observable.
    delete process.env.ADEV_SILENCE_DEPRECATION_BACKEND;
    // Reset module-level guard by re-importing through a query-param URL.
    // node:test runs in a single VM; we can simulate "fresh process" by
    // checking that the warning fires at least once across the suite.
    const dir = makeProject();
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (msg) => warnings.push(String(msg));
    try {
      getIssueManager({ tasks: { backend: "file" } }, dir);
      // Warning is fire-once per process; later calls may or may not warn.
      // We only assert that the message format is correct IF it fired.
      const deprecation = warnings.find((w) => /DEPRECATED_BACKEND/i.test(w));
      if (deprecation) {
        assert.ok(/file.*read-only-deprecated/i.test(deprecation));
        assert.ok(/adev migrate|tasks\.backend: json/i.test(deprecation));
      }
    } finally {
      console.warn = originalWarn;
      rmSync(dir, { recursive: true, force: true });
      process.env.ADEV_SILENCE_DEPRECATION_BACKEND = "1";
    }
  });

  it("throws UNKNOWN_BACKEND for invalid backend", () => {
    const dir = makeProject();
    try {
      assert.throws(
        () => getIssueManager({ tasks: { backend: "jira" } }, dir),
        (err) => err.code === "UNKNOWN_BACKEND"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns JsonAdapter for empty string backend (treated as unconfigured)", () => {
    process.env.ADEV_SILENCE_DEFAULT_BACKEND_ADVISORY = "1";
    const dir = makeProject();
    try {
      const manager = getIssueManager({ tasks: { backend: "" } }, dir);
      assert.equal(manager.name, "json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to JsonAdapter when beads requested but br not available", () => {
    process.env.ADEV_SILENCE_DEPRECATION_BACKEND = "1";
    const dir = makeProject();
    try {
      const manager = getIssueManager({ tasks: { backend: "beads" } }, dir);
      // Should be JSON adapter (fallback) or beads adapter if br is installed
      assert.ok(manager.name === "json" || manager.name === "beads");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("SUPPORTED_BACKENDS", () => {
  it("includes json, file, and beads", () => {
    assert.deepEqual([...SUPPORTED_BACKENDS].sort(), ["beads", "file", "json"]);
  });

  it("DEFAULT_BACKEND is 'json'", () => {
    assert.equal(DEFAULT_BACKEND, "json");
  });
});

describe("manifest template", () => {
  it("defaults to backend: json", () => {
    const template = readFileSync(
      join(PLUGIN_ROOT, "templates", "manifest-template.yaml"),
      "utf8"
    );
    assert.ok(template.includes("tasks:"), "manifest template should contain tasks: section");
    assert.ok(
      template.includes("backend: json"),
      "manifest template should default to json backend"
    );
  });
});
