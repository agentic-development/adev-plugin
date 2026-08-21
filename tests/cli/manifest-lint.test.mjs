// tests/cli/manifest-lint.test.mjs
//
// Tests for `adev manifest lint` (lib/cli/manifest.mjs) — the CLI wrapper
// around findDuplicateTopLevelKeys() (adev-plugin-gkfv.2).

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeProject(manifestBody) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-manifest-lint-")));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifestBody);
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runCli(dir, args) {
  return spawnSync(process.execPath, [CLI, "manifest", ...args], { cwd: dir, encoding: "utf8" });
}

test("adev manifest lint exits 0 with no findings on a clean manifest", () => {
  const dir = makeProject("project:\n  name: t\nbuild:\n  max_review_retries: 2\n");
  try {
    const r = runCli(dir, ["lint", "--json"]);
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(JSON.parse(r.stdout), { duplicates: [] });
  } finally {
    cleanup(dir);
  }
});

test("adev manifest lint exits 2 and reports a duplicate top-level key", () => {
  const dir = makeProject("project:\n  name: t\nbuild:\n  max_review_retries: 9\ntasks:\n  backend: file\nbuild:\n  max_review_retries: 2\n");
  try {
    const r = runCli(dir, ["lint", "--json"]);
    assert.strictEqual(r.status, 2);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.duplicates.length, 1);
    assert.strictEqual(parsed.duplicates[0].key, "build");
    assert.deepStrictEqual(parsed.duplicates[0].lines, [3, 7]);
  } finally {
    cleanup(dir);
  }
});

test("adev manifest lint exits 1 when manifest.yaml is missing", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-manifest-lint-nomanifest-")));
  try {
    const r = runCli(dir, ["lint"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /manifest not found/);
  } finally {
    cleanup(dir);
  }
});

test("adev manifest --help documents the lint subcommand", () => {
  const dir = makeProject("project:\n  name: t\n");
  try {
    const r = runCli(dir, ["--help"]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /manifest lint/);
    assert.match(r.stdout, /duplicate top-level keys/);
  } finally {
    cleanup(dir);
  }
});
