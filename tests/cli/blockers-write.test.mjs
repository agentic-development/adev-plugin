// tests/cli/blockers-write.test.mjs
//
// Tests for `adev blockers write` (lib/cli/blockers.mjs) — the CLI entry
// point for lib/blockers-writer.mjs::writeBlockers (adev-plugin-heba).
// Previously this lib function had NO CLI wrapper; skills/review-specs/
// SKILL.md named it in prose with no explicit invocation mechanism.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");
const SPEC_REL = ".context-index/specs/cross-cutting/sample.spec.md";
const SIDECAR_REL = ".context-index/specs/cross-cutting/sample.blockers.md";

function makeProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-blockers-cli-")));
  mkdirSync(join(dir, ".context-index", "specs", "cross-cutting"), { recursive: true });
  writeFileSync(join(dir, SPEC_REL), "# Sample\n");
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runCli(dir, args) {
  return spawnSync(process.execPath, [CLI, "blockers", ...args], { cwd: dir, encoding: "utf8" });
}

test("blockers write with real prose writes the sidecar and exits 0", () => {
  const dir = makeProject();
  try {
    const findings = JSON.stringify([
      { blocker_id: "r:t:aaaaaaaa", section_anchor: "x", reviewer: "r", prose: "Real finding text." },
    ]);
    const r = runCli(dir, ["write", "--spec", SPEC_REL, "--findings", findings, "--revision", "1", "--json"]);
    assert.strictEqual(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    assert.strictEqual(result.entries, 1);
    assert.ok(existsSync(join(dir, SIDECAR_REL)));
    assert.match(readFileSync(join(dir, SIDECAR_REL), "utf8"), /Real finding text\./);
  } finally {
    cleanup(dir);
  }
});

test("blockers write refuses empty prose (wrong key) and exits 2, writes nothing", () => {
  const dir = makeProject();
  try {
    const findings = JSON.stringify([
      { blocker_id: "r:t:bbbbbbbb", section_anchor: "x", reviewer: "r", message: "wrong key" },
    ]);
    const r = runCli(dir, ["write", "--spec", SPEC_REL, "--findings", findings, "--revision", "1"]);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /BLOCKER_BODY_EMPTY/);
    assert.match(r.stderr, /r:t:bbbbbbbb/);
    assert.strictEqual(existsSync(join(dir, SIDECAR_REL)), false);
  } finally {
    cleanup(dir);
  }
});

test("blockers write --findings @<path> reads findings from a file", () => {
  const dir = makeProject();
  try {
    const findingsPath = join(dir, "findings.json");
    writeFileSync(findingsPath, JSON.stringify([
      { blocker_id: "r:t:cccccccc", section_anchor: "x", reviewer: "r", prose: "From a file." },
    ]));
    const r = runCli(dir, ["write", "--spec", SPEC_REL, "--findings", "@findings.json", "--revision", "1", "--json"]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).entries, 1);
  } finally {
    cleanup(dir);
  }
});

test("blockers write rejects a --findings @<path> that escapes the project root", () => {
  const dir = makeProject();
  try {
    const r = runCli(dir, ["write", "--spec", SPEC_REL, "--findings", "@../../../etc/passwd", "--revision", "1"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /escapes project root/);
  } finally {
    cleanup(dir);
  }
});

test("blockers write requires --spec and --findings", () => {
  const dir = makeProject();
  try {
    const noSpec = runCli(dir, ["write", "--findings", "[]"]);
    assert.strictEqual(noSpec.status, 1);
    assert.match(noSpec.stderr, /--spec is required/);

    const noFindings = runCli(dir, ["write", "--spec", SPEC_REL]);
    assert.strictEqual(noFindings.status, 1);
    assert.match(noFindings.stderr, /--findings is required/);
  } finally {
    cleanup(dir);
  }
});

test("blockers --help documents the write subcommand", () => {
  const dir = makeProject();
  try {
    const r = runCli(dir, ["--help"]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /blockers write/);
    assert.match(r.stdout, /BLOCKER_BODY_EMPTY/);
  } finally {
    cleanup(dir);
  }
});
