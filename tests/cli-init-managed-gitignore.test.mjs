// tests/cli-init-managed-gitignore.test.mjs
//
// Tests for the `maybeEnsureManagedGitignore` wiring inside cmdInstall /
// cmdUpgrade. Covers the `setup.managed_gitignore` knob default-true and
// explicit-false branches.
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
// Plan-task: 5

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { maybeEnsureManagedGitignore } from "../cli/index.mjs";

describe("maybeEnsureManagedGitignore", () => {
  let tempDir;
  let origCwd;
  let logs;
  let origLog;
  let origErr;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cli-mgb-"));
    mkdirSync(join(tempDir, ".context-index"), { recursive: true });
    origCwd = process.cwd();
    process.chdir(tempDir);
    logs = { out: [], err: [] };
    origLog = console.log;
    origErr = console.error;
    console.log = (...args) => logs.out.push(args.join(" "));
    console.error = (...args) => logs.err.push(args.join(" "));
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    process.chdir(origCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("default (no setup block in manifest): writes the adev:gitignore block", async () => {
    // Empty manifest — knob undefined → default true.
    writeFileSync(join(tempDir, ".context-index", "manifest.yaml"), "project:\n  name: test\n");

    await maybeEnsureManagedGitignore(tempDir, { project: { name: "test" } });

    const content = readFileSync(join(tempDir, ".gitignore"), "utf8");
    assert.ok(content.includes("# >>> adev:gitignore >>>"), "block must be written by default");
    assert.ok(content.includes("# <<< adev:gitignore <<<"), "close marker present");
  });

  it("explicit `setup.managed_gitignore: false` skips the write and emits advisory", async () => {
    writeFileSync(
      join(tempDir, ".context-index", "manifest.yaml"),
      "setup:\n  managed_gitignore: false\n",
    );

    await maybeEnsureManagedGitignore(tempDir, { setup: { managed_gitignore: false } });

    assert.ok(
      !existsSync(join(tempDir, ".gitignore")),
      ".gitignore must NOT be created when knob is false",
    );
    assert.ok(
      logs.out.some((l) => l.includes("managed gitignore: disabled by manifest")),
      "advisory must be printed",
    );
  });

  it("explicit `setup.managed_gitignore: true` writes the block (same as default)", async () => {
    writeFileSync(
      join(tempDir, ".context-index", "manifest.yaml"),
      "setup:\n  managed_gitignore: true\n",
    );

    await maybeEnsureManagedGitignore(tempDir, { setup: { managed_gitignore: true } });

    const content = readFileSync(join(tempDir, ".gitignore"), "utf8");
    assert.ok(content.includes("# >>> adev:gitignore >>>"));
  });
});
