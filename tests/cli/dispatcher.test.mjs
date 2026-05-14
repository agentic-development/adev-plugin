// tests/cli/dispatcher.test.mjs
//
// Tests for the verb registry + dispatch loop in cli/index.mjs.
// Covers behaviors 1, 5, 6, 7, 8, 9 from driver-substrate.spec.md.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

test("adev with no verb prints registry and exits 1", () => {
  const r = spawnSync("node", [CLI], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout + r.stderr, /install|upgrade|uninstall|status|migrate/);
});

test('adev <unknown-verb> exits 1 with "unknown verb" message', () => {
  const r = spawnSync("node", [CLI, "nonexistent-verb-xyz"], { encoding: "utf8" });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr + r.stdout, /unknown verb/i);
});

test("adev install --help dispatches without crashing (smoke check)", () => {
  const r = spawnSync("node", [CLI, "install", "--help"], { encoding: "utf8" });
  // install must continue to work post-refactor; --help should not throw
  assert.notStrictEqual(r.status, 127); // not "command not found"
  // Should print something
  assert.ok((r.stdout + r.stderr).length > 0);
});

test("adev help prints registry and exits 0", () => {
  const r = spawnSync("node", [CLI, "help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /install|upgrade/);
});

test("registry-listed verbs all dispatch (no unknown verb for known commands)", () => {
  // Each of these is a registered verb; --help should reach the dispatch loop and not error as "unknown verb"
  for (const verb of ["install", "upgrade", "uninstall", "status", "migrate", "extension"]) {
    const r = spawnSync("node", [CLI, verb, "--help"], { encoding: "utf8", timeout: 10000 });
    assert.doesNotMatch(r.stderr + r.stdout, /unknown verb/, `verb '${verb}' should be registered`);
  }
});

// Placeholders documented in plan — full coverage of GateError/exception flows requires gate.mjs (Task 2)
test("GateError from a registered helper produces exit 2", { todo: "requires gate.mjs from Task 2" }, () => {});
test("non-GateError exception from helper produces exit 1", { todo: "covered indirectly via unknown-verb path; full helper-throw fixture deferred" }, () => {});
