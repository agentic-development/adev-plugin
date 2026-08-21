/**
 * Tests for `lib/manifest.mjs::loadManifest` — the public manifest loader
 * lifted from the previously triplicated private `loadManifestForStorage`
 * helpers.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-skill-instruction-updates.spec.md
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";
import { loadManifest, loadManifestForStorage, assertProjectRoot, findDuplicateTopLevelKeys } from "../../lib/manifest.mjs";

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

// ── build.max_review_retries default flip + validation (Task 12) ─────────

test("loadManifest: defaults build.max_review_retries to 2 when omitted", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\n",
    );
    const m = loadManifest(root);
    // build is materialized (defaults applied) — invariant test
    assert.ok(m.build, "build section must be materialized with defaults");
    assert.equal(m.build.max_review_retries, 2,
      "default build.max_review_retries must be 2 per review-block-auto-retry");
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: respects explicit build.max_review_retries: 0 (disables loop)", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nbuild:\n  max_review_retries: 0\n",
    );
    const m = loadManifest(root);
    assert.equal(m.build.max_review_retries, 0);
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: respects explicit build.max_review_retries: 5", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nbuild:\n  max_review_retries: 5\n",
    );
    const m = loadManifest(root);
    assert.equal(m.build.max_review_retries, 5);
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects negative build.max_review_retries — INVALID_MAX_REVIEW_RETRIES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nbuild:\n  max_review_retries: -1\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_RETRIES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects non-integer build.max_review_retries — INVALID_MAX_REVIEW_RETRIES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      'project:\n  name: t\nbuild:\n  max_review_retries: "two"\n',
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_RETRIES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects fractional build.max_review_retries — INVALID_MAX_REVIEW_RETRIES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nbuild:\n  max_review_retries: 2.5\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_RETRIES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

// loadManifestForStorage — tolerant wrapper lifted from the (formerly)
// triplicated private helper in lib/execution-state.mjs, lib/milestones.mjs,
// lib/migrate-state-artifacts.mjs, and lib/issues/render-markdown.mjs.

test("loadManifestForStorage: returns the parsed manifest when present and valid", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\ntasks:\n  backend: file\n",
    );
    const m = loadManifestForStorage(root);
    assert.equal(m.project.name, "t");
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifestForStorage: returns null (not throw) when the manifest is missing", () => {
  const root = createTempDir();
  try {
    assert.equal(loadManifestForStorage(root), null);
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifestForStorage: returns null (not throw) when the manifest is unparseable", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      'project:\n  name: t\nbuild:\n  max_review_retries: "two"\n',
    );
    assert.equal(loadManifestForStorage(root), null);
  } finally {
    cleanupTempDir(root);
  }
});

// assertProjectRoot — containment-only check lifted from the (formerly)
// duplicated private helper in lib/issues/json-adapter.mjs and
// lib/milestones.mjs.

test("assertProjectRoot: returns the resolved absolute path when the manifest exists", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(join(root, ".context-index/manifest.yaml"), "project:\n  name: t\n");
    assert.equal(assertProjectRoot(root), root);
  } finally {
    cleanupTempDir(root);
  }
});

test("assertProjectRoot: throws INVALID_PROJECT_ROOT when the manifest is missing", () => {
  const root = createTempDir();
  try {
    assert.throws(
      () => assertProjectRoot(root),
      (err) => err.code === "INVALID_PROJECT_ROOT",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("assertProjectRoot: throws INVALID_PROJECT_ROOT for a non-string input", () => {
  assert.throws(
    () => assertProjectRoot(undefined),
    (err) => err.code === "INVALID_PROJECT_ROOT",
  );
});

// ─── findDuplicateTopLevelKeys (adev-plugin-gkfv.2) ────────────────────────
//
// manifest.yaml declared `build:` twice (line 152 and line 423); duplicate
// top-level YAML keys are silently last-wins, so the first block was dead
// config with no signal. Nothing caught it — not the loader, not hygiene.

test("findDuplicateTopLevelKeys: detects a top-level key declared twice", () => {
  const text = [
    "project:",
    "  name: t",
    "build:",
    "  max_review_retries: 9",
    "tasks:",
    "  backend: file",
    "build:",
    "  max_review_retries: 2",
  ].join("\n");
  const dups = findDuplicateTopLevelKeys(text);
  assert.deepEqual(dups, [{ key: "build", lines: [3, 7] }]);
});

test("findDuplicateTopLevelKeys: reports every extra occurrence, not just the second", () => {
  const text = ["a:", "  x: 1", "a:", "  x: 2", "a:", "  x: 3"].join("\n");
  const dups = findDuplicateTopLevelKeys(text);
  assert.deepEqual(dups, [{ key: "a", lines: [1, 3, 5] }]);
});

test("findDuplicateTopLevelKeys: clean manifest yields no findings", () => {
  const text = ["project:", "  name: t", "build:", "  max_review_retries: 2", "tasks:", "  backend: file"].join("\n");
  assert.deepEqual(findDuplicateTopLevelKeys(text), []);
});

test("findDuplicateTopLevelKeys: ignores keys nested under a top-level block (only column-0 keys count)", () => {
  const text = ["build:", "  build: 1", "tasks:", "  build: 2"].join("\n");
  assert.deepEqual(findDuplicateTopLevelKeys(text), []);
});

test("findDuplicateTopLevelKeys: ignores commented-out lines that look like keys", () => {
  const text = ["build:", "  max_review_retries: 2", "# build:", "#build:"].join("\n");
  assert.deepEqual(findDuplicateTopLevelKeys(text), []);
});

test("findDuplicateTopLevelKeys: this project's own manifest.yaml has no duplicate top-level keys", () => {
  const text = readFileSync(join(PLUGIN_ROOT, ".context-index", "manifest.yaml"), "utf8");
  assert.deepEqual(findDuplicateTopLevelKeys(text), []);
});
