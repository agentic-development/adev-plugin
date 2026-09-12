/**
 * CLI tests for `adev governance scaffold --registry <review|validate> --entries <json|@path>`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

function runGovernanceCli(cwd, args) {
  const result = spawnSync("node", [join(PLUGIN_ROOT, "cli", "index.mjs"), "governance", ...args], {
    cwd, env: { ...process.env }, encoding: "utf8",
  });
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

test("adev governance scaffold --registry validate --entries writes the selection", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "validate",
    "--entries", '[{"id":"validate.check-1-quality-gates","kind":"deterministic-check","severity":"error"}]']);
  assert.equal(r.code, 0, r.stderr);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.match(text, /validate\.check-1-quality-gates/);
  cleanupTempDir(dir);
});

test("--entries @path reads a JSON file for long selections", () => {
  const dir = createTempDir();
  const fixturePath = join(dir, "entries.json");
  writeFileSync(fixturePath, '[{"id":"validate.check-1-quality-gates","kind":"deterministic-check","severity":"error"}]');
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "validate", "--entries", `@${fixturePath}`]);
  assert.equal(r.code, 0, r.stderr);
  const text = readFileSync(join(dir, ".context-index/governance/validate.yaml"), "utf8");
  assert.match(text, /validate\.check-1-quality-gates/);
  cleanupTempDir(dir);
});

test("malformed --entries JSON exits 1 with a named error", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "review", "--entries", "{not json"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--entries/);
  cleanupTempDir(dir);
});

test("missing --registry exits 1 and prints usage", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--entries", "[]"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--registry/);
  cleanupTempDir(dir);
});

test("missing --entries exits 1 and prints usage", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "validate"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--entries/);
  cleanupTempDir(dir);
});

test("unknown --registry value exits 1 with GOVERNANCE_SCAFFOLD_REGISTRY_UNKNOWN", () => {
  const dir = createTempDir();
  const r = runGovernanceCli(dir, ["scaffold", "--registry", "gates", "--entries", "[]"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /GOVERNANCE_SCAFFOLD_REGISTRY_UNKNOWN/);
  cleanupTempDir(dir);
});

test("scaffolding an already-existing file exits 1 with GOVERNANCE_SCAFFOLD_EXISTS", () => {
  const dir = createTempDir();
  const first = runGovernanceCli(dir, ["scaffold", "--registry", "validate", "--entries", "[]"]);
  assert.equal(first.code, 0, first.stderr);
  const second = runGovernanceCli(dir, ["scaffold", "--registry", "validate", "--entries", "[]"]);
  assert.equal(second.code, 1);
  assert.match(second.stderr, /GOVERNANCE_SCAFFOLD_EXISTS/);
  cleanupTempDir(dir);
});
