// tests/cli/capability-map.test.mjs
//
// CLI surface for `adev capability-map set-status` (lib/cli/capability-map.mjs).
// Regression coverage for adev-plugin-step7-capability-regression-0r65:
// `/adev:review-specs` Step 7 wrote the charter Capability Map Status column
// unconditionally on a passing verdict, regressing an already-`implemented`
// row back to `review-passed` on re-review.
//
// Spec: .context-index/specs/features/spec-lifecycle/capability-status-column.spec.md

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-capmap-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "scoring-engine"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeCharter(dir, relPath, status) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    `---\ncharter: scoring-engine\nstatus: evolving\nrevision: 4\nupdated: 2026-08-01\n---\n\n# Feature Charter: Scoring Engine\n\n## Capability Map\n\n| Capability | Description | Priority | Milestone | Status |\n|-----------|-------------|----------|-------|--------|\n| Scoring engine | Verdict tallying | must-have | v1 | ${status} |\n`,
  );
  return abs;
}

function runCli(dir, args) {
  return spawnSync("node", [CLI, "capability-map", ...args], { encoding: "utf8", cwd: dir });
}

test("lib/cli/capability-map.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/capability-map.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/capability-map.mjs does NOT export LIFECYCLE_STEP", async () => {
  const mod = await import("../../lib/cli/capability-map.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

test("adev capability-map with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, []);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|set-status/i);
  } finally {
    cleanup(dir);
  }
});

test("set-status advances a not-yet-reviewed capability and writes the file", () => {
  const dir = makeTempProject();
  try {
    const charterPath = ".context-index/specs/features/scoring-engine/charter.md";
    writeCharter(dir, charterPath, "specified");

    const r = runCli(dir, [
      "set-status",
      "--charter", charterPath,
      "--capability", "Scoring engine",
      "--status", "review-passed",
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out, {
      updated: true,
      previousStatus: "specified",
      newStatus: "review-passed",
      reason: null,
    });

    const after = readFileSync(join(dir, charterPath), "utf8");
    assert.match(after, /\| Scoring engine \| Verdict tallying \| must-have \| v1 \| review-passed \|/);
    assert.match(after, /revision: 5/);
  } finally {
    cleanup(dir);
  }
});

test("set-status refuses to regress an already-implemented capability on re-review (the reported bug)", () => {
  const dir = makeTempProject();
  try {
    const charterPath = ".context-index/specs/features/scoring-engine/charter.md";
    writeCharter(dir, charterPath, "implemented");

    const r = runCli(dir, [
      "set-status",
      "--charter", charterPath,
      "--capability", "Scoring engine",
      "--status", "review-passed",
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out, {
      updated: false,
      previousStatus: "implemented",
      newStatus: "review-passed",
      reason: "NOT_MONOTONIC",
    });

    // File on disk is untouched — the row still reads "implemented".
    const after = readFileSync(join(dir, charterPath), "utf8");
    assert.match(after, /\| Scoring engine \| Verdict tallying \| must-have \| v1 \| implemented \|/);
    assert.match(after, /revision: 4/);
  } finally {
    cleanup(dir);
  }
});

test("set-status reports CAPABILITY_NOT_FOUND without touching the file", () => {
  const dir = makeTempProject();
  try {
    const charterPath = ".context-index/specs/features/scoring-engine/charter.md";
    const before = writeCharter(dir, charterPath, "specified") && readFileSync(join(dir, charterPath), "utf8");

    const r = runCli(dir, [
      "set-status",
      "--charter", charterPath,
      "--capability", "Nonexistent capability",
      "--status", "review-passed",
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.updated, false);
    assert.equal(out.reason, "CAPABILITY_NOT_FOUND");
    assert.equal(readFileSync(join(dir, charterPath), "utf8"), before);
  } finally {
    cleanup(dir);
  }
});

test("set-status rejects an illegal --status value with exit 1", () => {
  const dir = makeTempProject();
  try {
    const charterPath = ".context-index/specs/features/scoring-engine/charter.md";
    writeCharter(dir, charterPath, "specified");

    const r = runCli(dir, [
      "set-status",
      "--charter", charterPath,
      "--capability", "Scoring engine",
      "--status", "bogus",
    ]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--status must be one of/);
  } finally {
    cleanup(dir);
  }
});

test("set-status rejects a charter path escaping the project root", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      "set-status",
      "--charter", "../../../etc/passwd",
      "--capability", "Scoring engine",
      "--status", "review-passed",
    ]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /escapes project root/);
  } finally {
    cleanup(dir);
  }
});

test("set-status exits 1 for a missing charter file", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      "set-status",
      "--charter", ".context-index/specs/features/scoring-engine/charter.md",
      "--capability", "Scoring engine",
      "--status", "review-passed",
    ]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /not found/);
  } finally {
    cleanup(dir);
  }
});
