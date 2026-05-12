/**
 * Path containment, size cap, and slug allowlist tests.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  migrateAll,
  migrateLifecycleState,
  migrateTasks,
} from "../../lib/migrate-state-artifacts.mjs";

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "t"\n',
  );
  return dir;
}

describe("path safety — projectRoot validation", () => {
  it("rejects missing manifest.yaml", async () => {
    const dir = createTempDir();
    try {
      // Don't create manifest
      await assert.rejects(
        () => migrateAll(dir, {}),
        (e) => e.code === "INVALID_PROJECT_ROOT",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });

  it("rejects non-string projectRoot", async () => {
    await assert.rejects(
      () => migrateAll(null, {}),
      (e) => e.code === "INVALID_PROJECT_ROOT",
    );
  });
});

describe("size caps", () => {
  it("rejects oversized tasks.md via preflight", async () => {
    const root = makeProject();
    try {
      mkdirSync(join(root, ".context-index", "tasks"), { recursive: true });
      // 11 MB
      const bigContent = "x".repeat(11 * 1024 * 1024);
      writeFileSync(join(root, ".context-index", "tasks", "tasks.md"), bigContent);
      const result = await migrateAll(root, {});
      assert.equal(result.failed, true);
      const fail = result.preflight.failures.find((f) => f.code === "LEGACY_FILE_TOO_LARGE");
      assert.ok(fail, "expected LEGACY_FILE_TOO_LARGE failure");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("rejects oversized build-state slug", async () => {
    const root = makeProject();
    try {
      mkdirSync(join(root, ".context-index", "build-state"), { recursive: true });
      writeFileSync(
        join(root, ".context-index", "build-state", "big.json"),
        '{"steps":["' + "x".repeat(2 * 1024 * 1024) + '"]}',
      );
      const result = await migrateAll(root, {});
      assert.equal(result.failed, true);
      const fail = result.preflight.failures.find((f) => f.code === "LEGACY_FILE_TOO_LARGE");
      assert.ok(fail, "expected LEGACY_FILE_TOO_LARGE for build-state");
    } finally {
      cleanupTempDir(root);
    }
  });
});

describe("slug allowlist", () => {
  it("rejects build-state filename with traversal chars", async () => {
    const root = makeProject();
    try {
      const bsDir = join(root, ".context-index", "build-state");
      mkdirSync(bsDir, { recursive: true });
      // The OS-allowed but conceptually-bad slug: ../escape.json is rejected
      // by the filesystem itself if we tried to create it through that path,
      // but the slug allowlist guards against the FILENAME stem containing
      // any invalid characters.
      writeFileSync(join(bsDir, "BAD-Slug-WITHUPPER.json"), '{"steps":[]}');
      const result = await migrateAll(root, {});
      assert.equal(result.failed, true);
      const fail = result.preflight.failures.find((f) => f.code === "INVALID_LEGACY_SLUG");
      assert.ok(fail, "expected INVALID_LEGACY_SLUG");
    } finally {
      cleanupTempDir(root);
    }
  });
});

describe("tasks.db_path positive containment", () => {
  it("rejects when tasks.db_path is missing/non-existent dir", async () => {
    const root = makeProject();
    try {
      writeFileSync(
        join(root, ".context-index", "manifest.yaml"),
        'project:\n  name: "t"\ntasks:\n  db_path: "/nonexistent/path/that/does/not/exist"\n',
      );
      const result = await migrateAll(root, {});
      assert.equal(result.failed, true);
      const fail = result.preflight.failures.find((f) => f.code === "INVALID_STORAGE_PATH");
      assert.ok(fail, "expected INVALID_STORAGE_PATH");
    } finally {
      cleanupTempDir(root);
    }
  });
});
