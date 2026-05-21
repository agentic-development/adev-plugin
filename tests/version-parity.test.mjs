// tests/version-parity.test.mjs
//
// Three-way version-parity contract.
//
// First programmatic enforcement of constitution Principle 5 (version
// parity). Asserts that `package.json`, `.claude-plugin/plugin.json`, and
// `.cursor-plugin/plugin.json` carry strictly equal `version` strings, and
// that both manifests are listed under `release-please-config.json`'s
// `packages["."].extra-files` so the automated Release PR bumps all three
// in lockstep per ADR-0008.
//
// Built-ins only: node:test, node:assert/strict, node:fs, node:path
// (Constitution Principle 1: zero new dependencies).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pkgPath = path.join(repoRoot, "package.json");
const claudeManifestPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
const cursorManifestPath = path.join(repoRoot, ".cursor-plugin", "plugin.json");
const releaseConfigPath = path.join(repoRoot, "release-please-config.json");

function readJson(p, label) {
  assert.ok(fs.existsSync(p), `${label} must exist at ${p}`);
  const raw = fs.readFileSync(p, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    assert.fail(`${label} must be parseable JSON: ${err.message}`);
  }
  return parsed;
}

test("version-parity: all three manifests exist and parse as JSON", () => {
  readJson(pkgPath, "package.json");
  readJson(claudeManifestPath, ".claude-plugin/plugin.json");
  readJson(cursorManifestPath, ".cursor-plugin/plugin.json");
});

test("version-parity: every manifest has a non-empty version field", () => {
  const pkg = readJson(pkgPath, "package.json");
  const claude = readJson(claudeManifestPath, ".claude-plugin/plugin.json");
  const cursor = readJson(cursorManifestPath, ".cursor-plugin/plugin.json");
  assert.ok(
    typeof pkg.version === "string" && pkg.version.length > 0,
    "package.json must declare a non-empty version string",
  );
  assert.ok(
    typeof claude.version === "string" && claude.version.length > 0,
    ".claude-plugin/plugin.json must declare a non-empty version string",
  );
  assert.ok(
    typeof cursor.version === "string" && cursor.version.length > 0,
    ".cursor-plugin/plugin.json must declare a non-empty version string",
  );
});

test("version-parity: package.json, .claude-plugin/plugin.json, and .cursor-plugin/plugin.json have strictly equal version fields", () => {
  const pkg = readJson(pkgPath, "package.json");
  const claude = readJson(claudeManifestPath, ".claude-plugin/plugin.json");
  const cursor = readJson(cursorManifestPath, ".cursor-plugin/plugin.json");
  assert.strictEqual(
    claude.version,
    pkg.version,
    `.claude-plugin/plugin.json version (${claude.version}) must equal package.json version (${pkg.version})`,
  );
  assert.strictEqual(
    cursor.version,
    pkg.version,
    `.cursor-plugin/plugin.json version (${cursor.version}) must equal package.json version (${pkg.version})`,
  );
  assert.strictEqual(
    cursor.version,
    claude.version,
    `.cursor-plugin/plugin.json version (${cursor.version}) must equal .claude-plugin/plugin.json version (${claude.version})`,
  );
});

test('version-parity: .cursor-plugin/plugin.json:name === "adev"', () => {
  const cursor = readJson(cursorManifestPath, ".cursor-plugin/plugin.json");
  assert.strictEqual(
    cursor.name,
    "adev",
    '.cursor-plugin/plugin.json:name must be "adev"',
  );
});

test("version-parity: release-please-config.json extra-files lists both .claude-plugin and .cursor-plugin manifests", () => {
  const config = readJson(releaseConfigPath, "release-please-config.json");
  const extraFiles = config?.packages?.["."]?.["extra-files"];
  assert.ok(
    Array.isArray(extraFiles),
    'release-please-config.json:packages["."].extra-files must be an array',
  );
  assert.ok(
    extraFiles.includes(".claude-plugin/plugin.json"),
    "release-please-config.json:extra-files must include .claude-plugin/plugin.json",
  );
  assert.ok(
    extraFiles.includes(".cursor-plugin/plugin.json"),
    "release-please-config.json:extra-files must include .cursor-plugin/plugin.json",
  );
});
