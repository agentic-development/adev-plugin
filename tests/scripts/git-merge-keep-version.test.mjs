// tests/scripts/git-merge-keep-version.test.mjs
//
// Tests for scripts/git-merge-keep-version.sh — the custom git merge driver
// that neutralizes two known, by-design divergences between main and
// release/next before delegating to a normal 3-way merge:
//   - the "version" field in package.json-style manifests (PR #292)
//   - the packages["."] "prerelease"/"prerelease-type"/"versioning" block in
//     release-please-config.json (2026-08-24 incident: this file had no
//     driver assigned at all, so a merge silently dropped release/next's
//     prerelease block via git's single-side-changed fast path)
//
// Invoked directly (not through `git merge`) since the driver is a plain
// positional-arg script (%O %A %B) with no git-specific behavior beyond
// that contract — spawning it directly is equivalent and needs no repo
// fixture.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = join(dirname(__filename), "..", "..");
const SCRIPT = join(PROJECT_ROOT, "scripts", "git-merge-keep-version.sh");

function run(ancestor, ours, theirs) {
  const dir = mkdtempSync(join(tmpdir(), "merge-keep-version-"));
  const ancestorPath = join(dir, "ancestor.json");
  const oursPath = join(dir, "ours.json");
  const theirsPath = join(dir, "theirs.json");
  writeFileSync(ancestorPath, ancestor);
  writeFileSync(oursPath, ours);
  writeFileSync(theirsPath, theirs);

  const result = spawnSync(SCRIPT, [ancestorPath, oursPath, theirsPath], {
    encoding: "utf8",
  });
  const merged = readFileSync(oursPath, "utf8");
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, merged };
}

test("version field: ours' bumped version wins over theirs' unbumped one, rest of the file untouched", () => {
  const ancestor = '{\n  "name": "adev",\n  "version": "0.27.8",\n  "description": "same"\n}\n';
  const ours = '{\n  "name": "adev",\n  "version": "0.28.0-next.6",\n  "description": "same"\n}\n';
  const theirs = '{\n  "name": "adev",\n  "version": "0.27.8",\n  "description": "same"\n}\n';

  const { status, merged } = run(ancestor, ours, theirs);
  assert.equal(status, 0);
  assert.match(merged, /"version": "0\.28\.0-next\.6"/);
  assert.doesNotMatch(merged, /<<<<<<</);
});

test("version field: a genuine adjacent conflict on another field still surfaces (PR #292 regression)", () => {
  const ancestor = '{\n  "name": "adev",\n  "version": "0.27.8",\n  "description": "old"\n}\n';
  const ours = '{\n  "name": "adev",\n  "version": "0.28.0-next.6",\n  "description": "ours edit"\n}\n';
  const theirs = '{\n  "name": "adev",\n  "version": "0.27.8",\n  "description": "theirs edit"\n}\n';

  const { status, merged } = run(ancestor, ours, theirs);
  assert.equal(status, 1);
  const versionLine = merged.split("\n").find((l) => l.includes("version"));
  assert.match(versionLine, /"version": "0\.28\.0-next\.6"/);
  assert.doesNotMatch(versionLine, /<<<<<<</);
  assert.match(merged, /<<<<<<</);
  assert.match(merged, /ours edit/);
  assert.match(merged, /theirs edit/);
});

test("prerelease block: ours' 3-line block replaces theirs' bare prerelease:false, no conflict", () => {
  const ancestor =
    '{\n  "packages": {\n    ".": {\n      "draft": false,\n      "prerelease": false,\n      "extra-files": []\n    }\n  }\n}\n';
  const ours =
    '{\n  "packages": {\n    ".": {\n      "draft": false,\n      "prerelease": true,\n      "prerelease-type": "next",\n      "versioning": "prerelease",\n      "extra-files": []\n    }\n  }\n}\n';
  const theirs = ancestor;

  const { status, merged } = run(ancestor, ours, theirs);
  assert.equal(status, 0);
  assert.match(merged, /"prerelease": true/);
  assert.match(merged, /"prerelease-type": "next"/);
  assert.match(merged, /"versioning": "prerelease"/);
  assert.doesNotMatch(merged, /<<<<<<</);
});

test("prerelease block: survives alongside genuine unrelated changes on both sides", () => {
  const ancestor =
    '{\n  "packages": {\n    ".": {\n      "draft": false,\n      "prerelease": false,\n      "extra-files": [\n        ".claude-plugin/plugin.json"\n      ]\n    }\n  }\n}\n';
  const ours =
    '{\n  "packages": {\n    ".": {\n      "draft": false,\n      "prerelease": true,\n      "prerelease-type": "next",\n      "versioning": "prerelease",\n      "extra-files": [\n        ".claude-plugin/plugin.json",\n        ".cursor-plugin/plugin.json"\n      ]\n    }\n  }\n}\n';
  const theirs =
    '{\n  "packages": {\n    ".": {\n      "release-type": "node",\n      "draft": false,\n      "prerelease": false,\n      "extra-files": [\n        ".claude-plugin/plugin.json"\n      ]\n    }\n  }\n}\n';

  const { status, merged } = run(ancestor, ours, theirs);
  assert.equal(status, 0);
  assert.match(merged, /"release-type": "node"/);
  assert.match(merged, /"prerelease": true/);
  assert.match(merged, /"prerelease-type": "next"/);
  assert.match(merged, /\.cursor-plugin\/plugin\.json/);
  assert.doesNotMatch(merged, /<<<<<<</);
});

test("prerelease block: a genuine conflict on a different field still surfaces", () => {
  const ancestor =
    '{\n  "packages": {\n    ".": {\n      "release-type": "node",\n      "draft": false,\n      "prerelease": false,\n      "extra-files": []\n    }\n  }\n}\n';
  const ours =
    '{\n  "packages": {\n    ".": {\n      "release-type": "simple",\n      "draft": false,\n      "prerelease": true,\n      "prerelease-type": "next",\n      "versioning": "prerelease",\n      "extra-files": []\n    }\n  }\n}\n';
  const theirs =
    '{\n  "packages": {\n    ".": {\n      "release-type": "go",\n      "draft": false,\n      "prerelease": false,\n      "extra-files": []\n    }\n  }\n}\n';

  const { status, merged } = run(ancestor, ours, theirs);
  assert.equal(status, 1);
  assert.match(merged, /<<<<<<</);
  assert.match(merged, /"prerelease": true/);
  assert.match(merged, /"prerelease-type": "next"/);
});
