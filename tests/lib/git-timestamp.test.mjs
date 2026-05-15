/**
 * Tests for lib/git-timestamp.mjs — getCreationTimestamp.
 *
 * Spec: .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.spec.md
 * Plan: .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.plan.md (Task 1)
 *
 * Contract:
 *   - Committed file → `{ timestamp: <ISO string from git>, source: 'git', warning: null }`
 *   - Uncommitted file (but exists on disk) → mtime fallback with WARNING note
 *   - git unavailable (non-repo / git binary missing) → mtime fallback with WARNING note
 *   - Non-existent path → underlying fs error surfaces
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, createTempGitRepo } from "../helpers.mjs";
import { getCreationTimestamp } from "../../lib/git-timestamp.mjs";

describe("getCreationTimestamp", () => {
  describe("committed file in git repo", () => {
    let repo;
    let filePath;

    before(() => {
      repo = createTempGitRepo();
      filePath = join(repo, "spec.md");
      writeFileSync(filePath, "hello\n");
      // Commit at a known author date so we can assert the returned timestamp.
      execSync(
        'git add spec.md && GIT_AUTHOR_DATE="2025-01-15T10:00:00Z" GIT_COMMITTER_DATE="2025-01-15T10:00:00Z" git commit -m "add spec"',
        { cwd: repo, stdio: "ignore" }
      );
    });

    after(() => cleanupTempDir(repo));

    it("returns the git creation timestamp with source='git' and no warning", async () => {
      const result = await getCreationTimestamp(filePath);
      assert.equal(result.source, "git");
      assert.equal(result.warning, null);
      assert.equal(typeof result.timestamp, "string");
      // ISO 8601 — git formats with timezone offset; we compare via Date equality.
      assert.equal(
        new Date(result.timestamp).toISOString(),
        new Date("2025-01-15T10:00:00Z").toISOString()
      );
    });
  });

  describe("uncommitted file (git repo but file not committed)", () => {
    let repo;
    let filePath;

    before(() => {
      repo = createTempGitRepo();
      filePath = join(repo, "uncommitted.md");
      writeFileSync(filePath, "draft\n");
      // Set mtime deterministically.
      const knownTime = new Date("2024-06-01T12:00:00Z");
      utimesSync(filePath, knownTime, knownTime);
    });

    after(() => cleanupTempDir(repo));

    it("falls back to mtime with WARNING attached", async () => {
      const result = await getCreationTimestamp(filePath);
      assert.equal(result.source, "mtime");
      assert.ok(result.warning, "warning should be non-null");
      assert.match(result.warning, /Git creation timestamp unavailable/i);
      // Expect the mtime ISO string.
      assert.equal(
        new Date(result.timestamp).toISOString(),
        new Date("2024-06-01T12:00:00Z").toISOString()
      );
    });
  });

  describe("file in non-git directory (git unavailable)", () => {
    let dir;
    let filePath;

    before(() => {
      dir = createTempDir();
      filePath = join(dir, "loose.md");
      writeFileSync(filePath, "loose\n");
      const knownTime = new Date("2023-03-10T08:30:00Z");
      utimesSync(filePath, knownTime, knownTime);
    });

    after(() => cleanupTempDir(dir));

    it("falls back to mtime with WARNING when git command fails", async () => {
      const result = await getCreationTimestamp(filePath);
      assert.equal(result.source, "mtime");
      assert.ok(result.warning);
      assert.match(result.warning, /Git creation timestamp unavailable/i);
      assert.equal(
        new Date(result.timestamp).toISOString(),
        new Date("2023-03-10T08:30:00Z").toISOString()
      );
    });
  });

  describe("non-existent file", () => {
    it("throws an underlying fs error (ENOENT)", async () => {
      await assert.rejects(
        () => getCreationTimestamp("/definitely/does/not/exist/abc.md"),
        (err) => /ENOENT|no such file/i.test(err.message)
      );
    });
  });

  describe("renamed file (--follow)", () => {
    let repo;
    let renamedPath;

    before(() => {
      repo = createTempGitRepo();
      const original = join(repo, "old-name.md");
      writeFileSync(original, "renamed-content\n");
      execSync(
        'git add old-name.md && GIT_AUTHOR_DATE="2024-09-01T09:00:00Z" GIT_COMMITTER_DATE="2024-09-01T09:00:00Z" git commit -m "add old-name"',
        { cwd: repo, stdio: "ignore" }
      );
      // Rename in a later commit.
      execSync(
        'git mv old-name.md new-name.md && GIT_AUTHOR_DATE="2025-02-01T09:00:00Z" GIT_COMMITTER_DATE="2025-02-01T09:00:00Z" git commit -m "rename"',
        { cwd: repo, stdio: "ignore" }
      );
      renamedPath = join(repo, "new-name.md");
    });

    after(() => cleanupTempDir(repo));

    it("follows renames to return the original creation timestamp", async () => {
      const result = await getCreationTimestamp(renamedPath);
      assert.equal(result.source, "git");
      assert.equal(result.warning, null);
      assert.equal(
        new Date(result.timestamp).toISOString(),
        new Date("2024-09-01T09:00:00Z").toISOString()
      );
    });
  });
});
