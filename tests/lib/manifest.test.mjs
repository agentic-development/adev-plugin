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
import { loadManifest, loadManifestForStorage, assertProjectRoot } from "../../lib/manifest.mjs";

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

// ── implement.batch_mode / implement.max_batch_size (Task 1, batched-task-dispatch) ─

test("loadManifest: defaults implement.batch_mode to 'on' and implement.max_batch_size to 4 when omitted", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\n",
    );
    const m = loadManifest(root);
    assert.ok(m.implement, "implement section must be materialized with defaults");
    assert.equal(m.implement.batch_mode, "on",
      "default implement.batch_mode must be 'on' per spec Arguments table");
    assert.equal(m.implement.max_batch_size, 4,
      "default implement.max_batch_size must be 4 per spec Arguments table");
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects implement.batch_mode outside on/off — INVALID_BATCH_MODE", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  batch_mode: sometimes\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_BATCH_MODE",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects implement.max_batch_size < 1 — INVALID_MAX_BATCH_SIZE", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_batch_size: 0\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_BATCH_SIZE",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects non-integer implement.max_batch_size — INVALID_MAX_BATCH_SIZE", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      'project:\n  name: t\nimplement:\n  max_batch_size: "two"\n',
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_BATCH_SIZE",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects a non-number (array) implement.max_batch_size — INVALID_MAX_BATCH_SIZE", () => {
  // YAML has no native NaN/Infinity literal that this project's hand-rolled
  // parseYaml helper would parse as a JS number, so a true !Number.isFinite
  // fixture isn't expressible here. This test instead exercises the same
  // `typeof raw !== "number"` branch as the non-integer ("two") case above,
  // but via an array value rather than a string — a distinct, realistic
  // misconfiguration shape (e.g. a YAML list typo) that still lands on that
  // guard, routed there by the array fixture below.
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_batch_size: [1, 2]\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_BATCH_SIZE",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects fractional implement.max_batch_size — INVALID_MAX_BATCH_SIZE", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_batch_size: 2.5\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_BATCH_SIZE",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: explicit implement.max_batch_size and implement.batch_mode round-trip", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  batch_mode: off\n  max_batch_size: 2\n",
    );
    const m = loadManifest(root);
    assert.equal(m.implement.max_batch_size, 2);
    assert.equal(m.implement.batch_mode, "off");
  } finally {
    cleanupTempDir(root);
  }
});

// ── implement.max_review_cycles default + validation (Task 1, tdd-cycle-simplification) ─

test("loadManifest: defaults implement.max_review_cycles to 3 when omitted", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\n",
    );
    const m = loadManifest(root);
    assert.equal(m.implement.max_review_cycles, 3);
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects implement.max_review_cycles of 0 — INVALID_MAX_REVIEW_CYCLES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_review_cycles: 0\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_CYCLES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects negative implement.max_review_cycles — INVALID_MAX_REVIEW_CYCLES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_review_cycles: -1\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_CYCLES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects non-integer implement.max_review_cycles — INVALID_MAX_REVIEW_CYCLES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      'project:\n  name: t\nimplement:\n  max_review_cycles: "two"\n',
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_CYCLES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: rejects fractional implement.max_review_cycles — INVALID_MAX_REVIEW_CYCLES", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_review_cycles: 2.5\n",
    );
    assert.throws(
      () => loadManifest(root),
      (err) => err.code === "INVALID_MAX_REVIEW_CYCLES",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("loadManifest: round-trips an explicit implement.max_review_cycles", () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, ".context-index"), { recursive: true });
    writeFileSync(
      join(root, ".context-index/manifest.yaml"),
      "project:\n  name: t\nimplement:\n  max_review_cycles: 5\n",
    );
    const m = loadManifest(root);
    assert.equal(m.implement.max_review_cycles, 5);
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
