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
