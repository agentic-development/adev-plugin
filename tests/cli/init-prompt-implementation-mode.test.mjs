/**
 * Tests for `adev init prompt implementation-mode` CLI verb.
 *
 * Covers:
 *  - BEH-5: `agent-default` is listed first in the printed menu.
 *  - BEH-5: empty input is rejected (no silent accept-on-enter) and re-prompts.
 *  - BEH-6: sensitive-path-floor-bypass warning prints before the write line
 *    and the value is written to the manifest.
 *  - Splice-write idempotency: rerun with the same value is byte-identical,
 *    and an unrelated pre-existing key is preserved verbatim.
 *  - Piped stdin that closes (EOF) before a valid choice is made exits
 *    cleanly (non-zero) instead of hanging.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import { run } from "../../lib/cli/init-prompt-implementation-mode.mjs";

function captureStdout(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(" "));
  return Promise.resolve(fn()).finally(() => {
    console.log = original;
  }).then(() => lines.join("\n"));
}

test("BEH-5: agent-default is listed first in the menu when no stored value exists", async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: test\n");

  const stdout = await captureStdout(() =>
    run({
      projectRoot: dir,
      argv: [],
      manifest: null,
      __scriptedInput: ["tdd"],
    }),
  );

  const menuLines = stdout
    .split("\n")
    .filter((l) => /^\s*\d+\.\s+\S+/.test(l));
  assert.ok(menuLines.length >= 3, `expected 3 menu lines, got: ${JSON.stringify(menuLines)}`);
  assert.match(menuLines[0], /agent-default/, `first menu entry must be agent-default: ${menuLines[0]}`);
});

test("BEH-5: empty input is rejected and re-prompted, then accepts valid scripted input", async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: test\n");

  const stdout = await captureStdout(() =>
    run({
      projectRoot: dir,
      argv: [],
      manifest: null,
      __scriptedInput: ["", "test-required"],
    }),
  );

  assert.match(stdout, /you must (choose|type)/i);

  const manifest = readFileSync(join(dir, ".context-index", "manifest.yaml"), "utf8");
  assert.match(manifest, /^implementation_mode:\s*test-required\s*$/m);
});

test("BEH-6: sensitive-path-floor-bypass warning prints before the write line, and the value is written", async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: test\n");

  const stdout = await captureStdout(() =>
    run({
      projectRoot: dir,
      argv: [],
      manifest: null,
      __scriptedInput: ["agent-default"],
    }),
  );

  const warningIdx = stdout.indexOf("sensitive-path-floor-bypass warning");
  const writeIdx = stdout.indexOf("Wrote: implementation_mode: agent-default");
  assert.ok(warningIdx > -1, `expected warning label in stdout: ${stdout}`);
  assert.ok(writeIdx > -1, `expected write confirmation line in stdout: ${stdout}`);
  assert.ok(warningIdx < writeIdx, "warning must print before the write confirmation");

  assert.match(stdout, /governance\/sensitive-paths\.yaml/);
  assert.match(stdout, /auth/i);
  assert.match(stdout, /crypto/i);
  assert.match(stdout, /secrets/i);
  assert.match(stdout, /CI/);

  const manifest = readFileSync(join(dir, ".context-index", "manifest.yaml"), "utf8");
  assert.match(manifest, /^implementation_mode:\s*agent-default\s*$/m);
});

test("splice-write idempotency: rerun with same value is byte-identical, unrelated key preserved", async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    ["project:", "  name: test", "risk_tier: standard", ""].join("\n"),
  );

  await captureStdout(() =>
    run({ projectRoot: dir, argv: [], manifest: null, __scriptedInput: ["tdd"] }),
  );
  const manifestPath = join(dir, ".context-index", "manifest.yaml");
  const firstWrite = readFileSync(manifestPath, "utf8");

  assert.match(firstWrite, /risk_tier:\s*standard/, "unrelated key must be preserved");
  assert.match(firstWrite, /implementation_mode:\s*tdd/);

  await captureStdout(() =>
    run({ projectRoot: dir, argv: [], manifest: null, __scriptedInput: ["tdd"] }),
  );
  const secondWrite = readFileSync(manifestPath, "utf8");

  assert.equal(secondWrite, firstWrite, "rerunning with the same value must be byte-identical");
});

test("--mode flag skips the prompt entirely", async (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: test\n");

  await run({ projectRoot: dir, argv: ["--mode", "test-required"], manifest: null });

  const manifest = readFileSync(join(dir, ".context-index", "manifest.yaml"), "utf8");
  assert.match(manifest, /^implementation_mode:\s*test-required\s*$/m);
});

test("piped stdin closing (EOF) before a valid choice exits cleanly instead of hanging", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: test\n");

  const result = spawnSync(
    "node",
    [join(PLUGIN_ROOT, "cli", "index.mjs"), "init", "prompt", "implementation-mode"],
    { cwd: dir, input: "", encoding: "utf8", timeout: 10_000 },
  );

  assert.notEqual(result.signal, "SIGTERM", "process must not hang until the timeout kills it");
  assert.notEqual(result.status, 0, "closed input must not be treated as a valid choice");
  assert.match(result.stderr, /input closed before a valid choice was made/);
});

// Regression: rl.question()'s one-shot 'line' listener only reliably
// delivers the FIRST line of piped multi-line stdin — a second
// rl.question() call (this module's re-prompt-on-blank loop, BEH-5) hung
// forever waiting for a 'line' event that already fired and was consumed.
// __scriptedInput-based tests never exercise real readline plumbing, so
// this gap survived until a real spawned-process, real-pipe test caught it.
test("piped stdin with a blank line then a real answer re-prompts instead of hanging (BEH-5, real pipe)", (t) => {
  const dir = createTempDir();
  t.after(() => cleanupTempDir(dir));
  writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: test\n");

  const result = spawnSync(
    "node",
    [join(PLUGIN_ROOT, "cli", "index.mjs"), "init", "prompt", "implementation-mode"],
    { cwd: dir, input: "\nagent-default\n", encoding: "utf8", timeout: 10_000 },
  );

  assert.notEqual(result.signal, "SIGTERM", "process must not hang on the second prompt after a blank line");
  assert.equal(result.status, 0, `expected clean exit, got status=${result.status} stderr=${result.stderr}`);
  assert.match(result.stdout, /You must type a choice/);
  assert.match(result.stdout, /sensitive-path-floor-bypass warning/);

  const manifest = readFileSync(join(dir, ".context-index", "manifest.yaml"), "utf8");
  assert.match(manifest, /^implementation_mode:\s*agent-default\s*$/m);
});
