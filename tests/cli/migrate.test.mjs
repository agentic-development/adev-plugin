/**
 * CLI integration tests for `adev migrate`.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

function runCli(args, cwd) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "t"\n',
  );
  writeFileSync(
    join(dir, ".context-index", "milestones.yaml"),
    'milestones:\n  - name: "0.25.0"\n    status: planned\n',
  );
  return dir;
}

describe("adev migrate — CLI", () => {
  it("exit 0 on successful run", () => {
    const root = makeProject();
    try {
      const r = runCli(["migrate"], root);
      assert.equal(r.exitCode, 0, `stderr=${r.stderr}`);
      assert.ok(existsSync(join(root, ".context-index", "milestones.json")));
    } finally {
      cleanupTempDir(root);
    }
  });

  it("--dry-run exits 0 and writes nothing", () => {
    const root = makeProject();
    try {
      const r = runCli(["migrate", "--dry-run"], root);
      assert.equal(r.exitCode, 0, `stderr=${r.stderr}`);
      assert.ok(!existsSync(join(root, ".context-index", "milestones.json")));
      assert.match(r.stdout, /Dry-run plan/);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("--artifact=milestones scopes the migration", () => {
    const root = makeProject();
    try {
      writeFileSync(
        join(root, ".context-index", "constitution.md"),
        "# c\n\n## Context Routing\n\n| K | V |\n|---|---|\n| Build state | `.context-index/build-state/` |\n",
      );
      const r = runCli(["migrate", "--artifact=milestones"], root);
      assert.equal(r.exitCode, 0);
      assert.ok(existsSync(join(root, ".context-index", "milestones.json")));
      // Constitution must NOT be migrated
      const constitution = readFileSync(
        join(root, ".context-index", "constitution.md"),
        "utf8",
      );
      assert.ok(constitution.includes("Build state |"));
    } finally {
      cleanupTempDir(root);
    }
  });

  it("--artifact=lifecycle-state-skip-rename only does step 3", () => {
    const root = makeProject();
    try {
      const bsDir = join(root, ".context-index", "build-state");
      mkdirSync(bsDir, { recursive: true });
      writeFileSync(
        join(bsDir, "foo.json"),
        JSON.stringify({
          status: "in_progress",
          steps: [{ name: "review", status: "completed", verdict: "PASS" }],
        }),
      );
      const r = runCli(["migrate", "--artifact=lifecycle-state-skip-rename"], root);
      assert.equal(r.exitCode, 0, `stderr=${r.stderr}`);
      assert.ok(existsSync(join(root, ".context-index", "lifecycle-state", "foo.jsonl")));
      // Source still exists (skip-rename means no dir rename)
      assert.ok(existsSync(join(bsDir, "foo.json")));
    } finally {
      cleanupTempDir(root);
    }
  });

  it("unknown --artifact exits 1 with UNKNOWN_ARTIFACT", () => {
    const root = makeProject();
    try {
      const r = runCli(["migrate", "--artifact=nonexistent"], root);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr + r.stdout, /UNKNOWN_ARTIFACT/);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("emits /adev:sync advisory only when constitution migrated", () => {
    const root = makeProject();
    try {
      writeFileSync(
        join(root, ".context-index", "constitution.md"),
        "# c\n\n## Context Routing\n\n| K | V |\n|---|---|\n| Build state | `.context-index/build-state/` |\n",
      );
      const r = runCli(["migrate"], root);
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /\/adev:sync/);

      // Second run — constitution already migrated → no advisory
      const r2 = runCli(["migrate"], root);
      assert.equal(r2.exitCode, 0);
      assert.ok(!r2.stdout.includes("/adev:sync"), `unexpected /adev:sync in: ${r2.stdout}`);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("--help prints flag reference", () => {
    const root = makeProject();
    try {
      const r = runCli(["migrate", "--help"], root);
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /Valid artifact names/);
    } finally {
      cleanupTempDir(root);
    }
  });
});
