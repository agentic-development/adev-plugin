/**
 * Tests for `lib/manifest.mjs::loadManifest` — the public manifest loader
 * lifted from the previously triplicated private `loadManifestForStorage`
 * helpers.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { loadManifest } from "../../lib/manifest.mjs";

test("loadManifest: happy path returns parsed manifest object", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\ntasks:\n  backend: file\n",
    );
    const m = loadManifest(root);
    assert.equal(m.project.name, "t");
    assert.equal(m.tasks.backend, "file");
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: missing manifest throws INVALID_PROJECT_ROOT", () => {
  const root = createTempDir();
  try {
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_PROJECT_ROOT" ||
                /INVALID_PROJECT_ROOT/.test(err.message),
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: traversal-style payload rejected (no manifest at resolved path)", () => {
  // `/etc/..` resolves to `/` — no `.context-index/manifest.yaml` there.
  assert.throws(
    () => loadManifest("/etc/.."),
    (err) =>
      err.code === "INVALID_PROJECT_ROOT" ||
      /INVALID_PROJECT_ROOT|ENOENT/.test(err.message),
  );
});

test("loadManifest: empty string is rejected", () => {
  assert.throws(
    () => loadManifest(""),
    (err) =>
      err.code === "INVALID_PROJECT_ROOT" ||
      /INVALID_PROJECT_ROOT/.test(err.message),
  );
});

test("loadManifest: non-string projectRoot is rejected", () => {
  assert.throws(
    () => loadManifest(null),
    (err) =>
      err.code === "INVALID_PROJECT_ROOT" ||
      /INVALID_PROJECT_ROOT/.test(err.message),
  );
  assert.throws(
    () => loadManifest(undefined),
    (err) =>
      err.code === "INVALID_PROJECT_ROOT" ||
      /INVALID_PROJECT_ROOT/.test(err.message),
  );
});

test("loadManifest: returns nested fields beyond db_path (full YAML parse)", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      [
        "project:",
        "  name: full-project",
        "  adev_version: 0.24.0",
        "tasks:",
        "  backend: json",
        "  db_path: /tmp/custom-store",
        "lifecycle:",
        "  gate_mode: strict",
        "",
      ].join("\n"),
    );
    const m = loadManifest(root);
    assert.equal(m.project.name, "full-project");
    assert.equal(m.project.adev_version, "0.24.0");
    assert.equal(m.tasks.backend, "json");
    assert.equal(m.tasks.db_path, "/tmp/custom-store");
    assert.equal(m.lifecycle.gate_mode, "strict");
  } finally {
    cleanupTempDir(root);
  }
});
