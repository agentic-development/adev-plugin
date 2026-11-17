import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "index.mjs");
const run = (cwd, ...args) =>
  spawnSync("node", [CLI, "implement", "snapshot-base", ...args], { encoding: "utf8", cwd });

test("adev implement snapshot-base prints a tree id that includes untracked files", () => {
  const dir = createTempDir();
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "untracked.txt"), "u\n");
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    const tree = r.stdout.trim();
    assert.match(tree, /^[0-9a-f]{40,64}$/);
    assert.equal(execFileSync("git", ["cat-file", "-t", tree], { cwd: dir, encoding: "utf8" }).trim(), "tree");
    assert.match(execFileSync("git", ["ls-tree", "--name-only", tree], { cwd: dir, encoding: "utf8" }), /untracked\.txt/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("adev implement snapshot-base outside a git repository exits 1", () => {
  const dir = createTempDir();
  try {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /SNAPSHOT_FAILED/);
  } finally {
    cleanupTempDir(dir);
  }
});
