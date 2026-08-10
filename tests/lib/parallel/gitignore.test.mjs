// tests/lib/parallel/gitignore.test.mjs
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureWorktreeIgnore } from "../../../lib/parallel/gitignore.mjs";

describe("lib/parallel/gitignore", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "adev-gi-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("adds the managed .adev/worktrees/ block when absent", () => {
    const r = ensureWorktreeIgnore(dir);
    assert.equal(r.added, true);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(gi, /\.adev\/worktrees\//);
    assert.match(gi, /adev:worktrees/); // managed marker
  });

  it("creates .gitignore if it does not exist", () => {
    assert.equal(existsSync(join(dir, ".gitignore")), false);
    ensureWorktreeIgnore(dir);
    assert.equal(existsSync(join(dir, ".gitignore")), true);
  });

  it("is idempotent — second call adds nothing", () => {
    ensureWorktreeIgnore(dir);
    const before = readFileSync(join(dir, ".gitignore"), "utf8");
    const r = ensureWorktreeIgnore(dir);
    assert.equal(r.added, false);
    assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), before);
  });

  it("preserves existing .gitignore content", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n*.log\n");
    ensureWorktreeIgnore(dir);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(gi, /node_modules\//);
    assert.match(gi, /\*\.log/);
    assert.match(gi, /\.adev\/worktrees\//);
  });
});
