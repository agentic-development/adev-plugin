// tests/cli/test-helpers.test.mjs
//
// Tests for `adev test-helpers` (lib/cli/test-helpers.mjs) — inventory and check.
//
// Spec: .context-index/specs/features/test-strategies/test-helper-inventory.spec.md
// Plan-task: 4
//
// Invocation is via a real subprocess through cli/index.mjs, mirroring
// tests/cli/test-policy.test.mjs: the dispatcher only uses the return value to pick an
// exit code, so asserting on process stdout is what actually pins the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createTempDir, cleanupTempDir } from "../helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = resolvePath(__dirname, "..", "..", "cli", "index.mjs");

function write(root, relPath, content) {
  const abs = join(root, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

function adev(cwd, args) {
  const r = spawnSync(process.execPath, [CLI, "test-helpers", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { exitCode: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function seedProject(dir) {
  write(dir, "tests/helpers.mjs", "export function makeTempProject() {}\nexport function cleanup() {}\n");
  write(dir, "tests/fixtures/a.json", "{}\n");
  write(
    dir,
    ".context-index/samples/general-test-helpers.md",
    "# Golden Sample: Test Helpers\n\n> **Source:** tests/helpers.mjs\n",
  );
}

// ---------------------------------------------------------------------------
// inventory
// ---------------------------------------------------------------------------

test("inventory emits JSON by default and exits 0", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    const { exitCode, stdout } = adev(dir, ["inventory"]);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.entries.some((e) => e.path === "tests/helpers.mjs"));
    assert.ok(parsed.samples.some((s) => s.path.endsWith("general-test-helpers.md")));
    assert.equal(parsed.empty, false);
  } finally {
    cleanupTempDir(dir);
  }
});

test("inventory --format text emits the injectable block", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    const { exitCode, stdout } = adev(dir, ["inventory", "--format", "text"]);
    assert.equal(exitCode, 0);
    assert.match(stdout, /tests\/helpers\.mjs/);
    assert.match(stdout, /makeTempProject/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("inventory --budget caps the text render", () => {
  const dir = createTempDir();
  try {
    for (let i = 0; i < 30; i++) write(dir, `tests/support/m${i}.mjs`, "export function a() {}\n");
    const { exitCode, stdout } = adev(dir, ["inventory", "--format", "text", "--budget", "8"]);
    assert.equal(exitCode, 0);
    assert.ok(stdout.trimEnd().split("\n").length <= 8);
  } finally {
    cleanupTempDir(dir);
  }
});

test("inventory exits 0 with an empty result in a project with no helpers and no .context-index", () => {
  const dir = createTempDir();
  try {
    write(dir, "src/main.mjs", "export const a = 1;\n");
    const { exitCode, stdout } = adev(dir, ["inventory"]);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.empty, true);
    assert.deepEqual(parsed.entries, []);
    assert.deepEqual(parsed.samples, []);
  } finally {
    cleanupTempDir(dir);
  }
});

test("inventory rejects a bad --budget and a bad --format", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    assert.equal(adev(dir, ["inventory", "--budget", "0"]).exitCode, 1);
    assert.equal(adev(dir, ["inventory", "--budget", "abc"]).exitCode, 1);
    assert.equal(adev(dir, ["inventory", "--format", "yaml"]).exitCode, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

test("check reports duplicates and still exits 0", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    write(dir, "tests/feature/a.test.mjs", "function makeTempProject() {}\n");
    const { exitCode, stdout } = adev(dir, ["check", "--file", "tests/feature/a.test.mjs"]);
    assert.equal(exitCode, 0, "findings are advisory — the verb must not fail");
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0].findings[0].name, "makeTempProject");
    assert.equal(parsed.results[0].findings[0].helper.path, "tests/helpers.mjs");
  } finally {
    cleanupTempDir(dir);
  }
});

test("check accepts a repeated --file and reports one result per file", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    write(dir, "tests/feature/a.test.mjs", "function makeTempProject() {}\n");
    write(dir, "tests/feature/b.test.mjs", "function unrelatedThing() {}\n");
    const { exitCode, stdout } = adev(dir, [
      "check",
      "--file",
      "tests/feature/a.test.mjs",
      "--file",
      "tests/feature/b.test.mjs",
    ]);
    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.results.length, 2);
    assert.equal(parsed.results[1].findings.length, 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test("check --format text is human readable and marked advisory", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    write(dir, "tests/feature/a.test.mjs", "function makeTempProject() {}\n");
    const { exitCode, stdout } = adev(dir, [
      "check",
      "--file",
      "tests/feature/a.test.mjs",
      "--format",
      "text",
    ]);
    assert.equal(exitCode, 0);
    assert.match(stdout, /makeTempProject/);
    assert.match(stdout, /Advisory only/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("check rejects a missing --file, an absent file, and a path outside the root", () => {
  const dir = createTempDir();
  try {
    seedProject(dir);
    assert.equal(adev(dir, ["check"]).exitCode, 1);
    assert.equal(adev(dir, ["check", "--file", "tests/nope.test.mjs"]).exitCode, 1);
    const escaped = adev(dir, ["check", "--file", "../outside.mjs"]);
    assert.equal(escaped.exitCode, 1);
    assert.match(escaped.stderr, /PATH_OUTSIDE_ROOT/);
  } finally {
    cleanupTempDir(dir);
  }
});

// ---------------------------------------------------------------------------
// dispatcher contract
// ---------------------------------------------------------------------------

test("unknown subcommand and bare invocation exit 1 with usage", () => {
  const dir = createTempDir();
  try {
    const bad = adev(dir, ["bogus"]);
    assert.equal(bad.exitCode, 1);
    assert.match(bad.stderr, /usage: adev test-helpers/);
    assert.equal(adev(dir, []).exitCode, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("--help prints the verb help and exits 0", () => {
  const dir = createTempDir();
  try {
    const r = adev(dir, ["inventory", "--help"]);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /adev test-helpers inventory/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("the verb module exports no LIFECYCLE_STEP (observational helper, not a step boundary)", async () => {
  const mod = await import("../../lib/cli/test-helpers.mjs");
  assert.equal(typeof mod.run, "function");
  assert.equal(typeof mod.help, "function");
  assert.equal(mod.LIFECYCLE_STEP, undefined);
});
