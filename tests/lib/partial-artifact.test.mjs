/**
 * Unit tests for lib/partial-artifact.mjs — helper module skeleton.
 *
 * Covers Task 2 (partialPath, lockPath, commitPartial, assertWithin) from
 * incremental-artifact-writes.plan.md.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

import {
  partialPath,
  lockPath,
  commitPartial,
  assertWithin,
  findPartials,
  isPartialStale,
  loadPartialKnobs,
  DEFAULT_PARTIAL_KNOBS,
} from "../../lib/partial-artifact.mjs";

test("partialPath appends .partial to a path", () => {
  assert.equal(partialPath("/foo/bar.md"), "/foo/bar.md.partial");
  assert.equal(
    partialPath("/abs/path/to/file.spec.md"),
    "/abs/path/to/file.spec.md.partial"
  );
  assert.equal(partialPath("relative/path.md"), "relative/path.md.partial");
});

test("partialPath rejects non-string input", () => {
  assert.throws(() => partialPath(null), /finalPath must be a non-empty string/);
  assert.throws(() => partialPath(""), /finalPath must be a non-empty string/);
  assert.throws(() => partialPath(42), /finalPath must be a non-empty string/);
});

test("lockPath returns final + .partial.lock", () => {
  assert.equal(lockPath("/foo/bar.md"), "/foo/bar.md.partial.lock");
  assert.equal(
    lockPath("relative/file.plan.md"),
    "relative/file.plan.md.partial.lock"
  );
});

test("lockPath rejects non-string input", () => {
  assert.throws(() => lockPath(null), /finalPath must be a non-empty string/);
  assert.throws(() => lockPath(""), /finalPath must be a non-empty string/);
});

test("commitPartial atomically renames .partial to final path", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    const partial = partialPath(finalP);
    writeFileSync(partial, "hello\nworld\n");
    assert.ok(existsSync(partial), "precondition: .partial exists");
    assert.equal(existsSync(finalP), false, "precondition: final missing");

    const result = commitPartial(finalP);
    assert.equal(result, finalP, "returns the final path");
    assert.equal(existsSync(partial), false, ".partial removed after commit");
    assert.ok(existsSync(finalP), "final file exists after commit");
    assert.equal(readFileSync(finalP, "utf8"), "hello\nworld\n");
  } finally {
    cleanupTempDir(dir);
  }
});

test("commitPartial throws when .partial does not exist", () => {
  const dir = createTempDir();
  try {
    const finalP = join(dir, "missing.spec.md");
    assert.throws(
      () => commitPartial(finalP),
      (err) => err && err.code === "ENOENT"
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("commitPartial overwrites a pre-existing final file", () => {
  // Atomic rename semantics: if <final> already exists, rename replaces it.
  // This is correct for the .partial workflow — the partial's content is the
  // new authoritative state.
  const dir = createTempDir();
  try {
    const finalP = join(dir, "artifact.spec.md");
    const partial = partialPath(finalP);
    writeFileSync(finalP, "old content\n");
    writeFileSync(partial, "new content\n");

    commitPartial(finalP);
    assert.equal(readFileSync(finalP, "utf8"), "new content\n");
    assert.equal(existsSync(partial), false);
  } finally {
    cleanupTempDir(dir);
  }
});

test("assertWithin accepts paths inside the base directory", () => {
  const dir = createTempDir();
  try {
    const inside = join(dir, "a", "b", "c.md");
    mkdirSync(join(dir, "a", "b"), { recursive: true });
    writeFileSync(inside, "");
    const resolved = assertWithin(dir, inside);
    assert.ok(resolved.startsWith(dir + sep) || resolved === dir);
  } finally {
    cleanupTempDir(dir);
  }
});

test("assertWithin rejects traversal escape", () => {
  const dir = createTempDir();
  try {
    const outside = join(dir, "..", "escape.md");
    assert.throws(
      () => assertWithin(dir, outside),
      (err) => err && err.code === "INVALID_PARTIAL_PATH"
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("assertWithin rejects absolute paths that escape", () => {
  const dir = createTempDir();
  try {
    assert.throws(
      () => assertWithin(dir, "/etc/passwd"),
      (err) => err && err.code === "INVALID_PARTIAL_PATH"
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("assertWithin allows the base directory itself", () => {
  const dir = createTempDir();
  try {
    const resolved = assertWithin(dir, dir);
    assert.equal(resolved, dir);
  } finally {
    cleanupTempDir(dir);
  }
});

test("assertWithin uses a custom error code when provided", () => {
  const dir = createTempDir();
  try {
    assert.throws(
      () => assertWithin(dir, "/elsewhere", "CUSTOM_CODE"),
      (err) => err && err.code === "CUSTOM_CODE"
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Task 5: findPartials + isPartialStale
// ---------------------------------------------------------------------------

test("findPartials returns all .partial files under a root", () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, "a", "b"), { recursive: true });
    mkdirSync(join(dir, "c"), { recursive: true });
    writeFileSync(join(dir, "a", "one.spec.md.partial"), "1");
    writeFileSync(join(dir, "a", "b", "two.plan.md.partial"), "2");
    writeFileSync(join(dir, "c", "three.validate.md.partial"), "3");
    // Sibling files that should NOT match:
    writeFileSync(join(dir, "a", "one.spec.md"), "");
    writeFileSync(join(dir, "a", "one.spec.md.partial.lock"), "");
    writeFileSync(join(dir, "c", "regular.md"), "");

    const found = findPartials(dir);
    const rel = found
      .map((p) => p.slice(dir.length + 1).replaceAll(sep, "/"))
      .sort();
    assert.deepEqual(rel, [
      "a/b/two.plan.md.partial",
      "a/one.spec.md.partial",
      "c/three.validate.md.partial",
    ]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("findPartials returns [] for a missing directory", () => {
  const dir = createTempDir();
  try {
    const found = findPartials(join(dir, "does-not-exist"));
    assert.deepEqual(found, []);
  } finally {
    cleanupTempDir(dir);
  }
});

test("findPartials excludes .partial.lock sidecars", () => {
  const dir = createTempDir();
  try {
    writeFileSync(join(dir, "a.spec.md.partial"), "");
    writeFileSync(join(dir, "a.spec.md.partial.lock"), "");
    const found = findPartials(dir);
    assert.equal(found.length, 1);
    assert.ok(found[0].endsWith(".spec.md.partial"));
    assert.ok(!found[0].endsWith(".lock"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("isPartialStale returns false for a fresh file", () => {
  const dir = createTempDir();
  try {
    const p = join(dir, "fresh.spec.md.partial");
    writeFileSync(p, "");
    assert.equal(isPartialStale(p, 24), false);
  } finally {
    cleanupTempDir(dir);
  }
});

test("isPartialStale returns true when mtime is older than thresholdHours", () => {
  const dir = createTempDir();
  try {
    const p = join(dir, "old.spec.md.partial");
    writeFileSync(p, "");
    // Use the clock seam to fast-forward.
    const future = () => new Date(Date.now() + 25 * 60 * 60 * 1000);
    assert.equal(isPartialStale(p, 24, { now: future }), true);
    // Sanity: 26h threshold against 25h fast-forward = still fresh.
    assert.equal(isPartialStale(p, 26, { now: future }), false);
  } finally {
    cleanupTempDir(dir);
  }
});

test("isPartialStale returns false for a missing file", () => {
  const dir = createTempDir();
  try {
    assert.equal(
      isPartialStale(join(dir, "missing.partial"), 24),
      false
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// Task 7: Manifest knobs
// ---------------------------------------------------------------------------

test("DEFAULT_PARTIAL_KNOBS exposes the documented defaults", () => {
  assert.equal(DEFAULT_PARTIAL_KNOBS.partial_stale_seconds, 30);
  assert.equal(DEFAULT_PARTIAL_KNOBS.partial_stale_hours, 24);
  assert.equal(DEFAULT_PARTIAL_KNOBS.partial_oversize_multiplier, 3);
  assert.deepEqual(DEFAULT_PARTIAL_KNOBS.partial_roots, []);
});

test("loadPartialKnobs returns defaults for a silent manifest", () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      "project:\n  name: test\n"
    );
    const knobs = loadPartialKnobs(dir);
    assert.deepEqual(knobs, DEFAULT_PARTIAL_KNOBS);
  } finally {
    cleanupTempDir(dir);
  }
});

test("loadPartialKnobs honours overrides under lifecycle.*", () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      [
        "project:",
        "  name: test",
        "lifecycle:",
        "  partial_stale_seconds: 60",
        "  partial_stale_hours: 48",
        "  partial_oversize_multiplier: 5",
        "  partial_roots:",
        "    - docs",
        "    - src",
        "",
      ].join("\n")
    );
    const knobs = loadPartialKnobs(dir);
    assert.equal(knobs.partial_stale_seconds, 60);
    assert.equal(knobs.partial_stale_hours, 48);
    assert.equal(knobs.partial_oversize_multiplier, 5);
    assert.deepEqual(knobs.partial_roots, ["docs", "src"]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("loadPartialKnobs ignores invalid override types", () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "manifest.yaml"),
      [
        "project:",
        "  name: test",
        "lifecycle:",
        "  partial_stale_seconds: -1", // negative → ignored
        "  partial_stale_hours: 0", // zero → ignored
        '  partial_oversize_multiplier: "five"', // string → ignored
        "  partial_roots: not-a-list", // string → ignored
        "",
      ].join("\n")
    );
    const knobs = loadPartialKnobs(dir);
    // Each invalid value falls back to its documented default.
    assert.deepEqual(knobs, DEFAULT_PARTIAL_KNOBS);
  } finally {
    cleanupTempDir(dir);
  }
});
