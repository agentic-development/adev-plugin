// tests/cli/repomap.test.mjs
//
// Tests for `adev repomap generate` / `adev repomap check-deps`
// (lib/cli/repomap.mjs) — the CLI surface wrapping lib/repomap/index.mjs's
// existing, independently tested tree-sitter + PageRank pipeline.
//
// Spec: .context-index/specs/features/tree-sitter-repomap/charter.md
//
// Contract (driver-substrate):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — repomap generation is a maintenance
//     utility, not a lifecycle step entry/exit.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-repomap-test-")));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "a.ts"),
    "export function foo() { return 1; }\nexport const bar = 2;\n",
  );
  writeFileSync(
    join(dir, "src", "b.ts"),
    "import { foo, bar } from './a';\nexport function baz() { return foo() + bar; }\n",
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/repomap.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/repomap.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/repomap.mjs does NOT export LIFECYCLE_STEP (not a lifecycle step)", async () => {
  const mod = await import("../../lib/cli/repomap.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ────────────────────────────────────────────────

test("adev repomap with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "repomap"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|repomap generate|check-deps/i);
  } finally {
    cleanup(dir);
  }
});

test("adev repomap unknown-subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "repomap", "bogus"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /unknown subcommand/i);
  } finally {
    cleanup(dir);
  }
});

test("adev repomap --help exits 0 and prints both subcommands", () => {
  const r = spawnSync("node", [CLI, "repomap", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /generate/);
  assert.match(r.stdout, /check-deps/);
});

test("adev repomap generate --mode bogus exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "repomap", "generate", "--mode", "bogus"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--mode must be one of/i);
  } finally {
    cleanup(dir);
  }
});

test("adev repomap generate --format bogus exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "repomap", "generate", "--format", "bogus"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--format must be one of/i);
  } finally {
    cleanup(dir);
  }
});

// ── generate (regex mode — hermetic, no tree-sitter dependency required) ──

test("adev repomap generate --mode regex writes only repo-map.md", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "repomap", "generate", "--mode", "regex", "--format", "json"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.strictEqual(summary.mode, "regex");
    assert.deepStrictEqual(summary.artifacts, ["repo-map.md"]);
    assert.strictEqual(summary.symbols, null);

    const repoMap = readFileSync(
      join(dir, ".context-index", "hygiene", "repo-map.md"),
      "utf-8",
    );
    assert.match(repoMap, /# Repository Map/);
    assert.match(repoMap, /> Parser: regex/);
  } finally {
    cleanup(dir);
  }
});

// ── generate (tree-sitter mode — skipped when the optional dep is absent) ─

test("adev repomap generate (auto mode) writes all three artifacts when tree-sitter is available", () => {
  const depsCheck = spawnSync("node", [CLI, "repomap", "check-deps"], { encoding: "utf8" });
  if (depsCheck.status !== 0) {
    return; // web-tree-sitter not installed in this environment — nothing to assert
  }

  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "repomap", "generate", "--format", "json"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.strictEqual(summary.mode, "tree-sitter");
    assert.deepStrictEqual(
      summary.artifacts.slice().sort(),
      ["dependency-graph.json", "repo-map.md", "symbol-ranks.json"].sort(),
    );
    assert.strictEqual(summary.files, 2);
    assert.strictEqual(summary.symbols, 3);
    assert.ok(summary.topSymbol && typeof summary.topSymbol.name === "string");

    const graph = JSON.parse(
      readFileSync(join(dir, ".context-index", "hygiene", "dependency-graph.json"), "utf-8"),
    );
    assert.strictEqual(graph.nodes.length, 2);
  } finally {
    cleanup(dir);
  }
});

// ── check-deps ──────────────────────────────────────────────────────────────

test("adev repomap check-deps --format json prints {available: boolean} and matching exit code", () => {
  const r = spawnSync("node", [CLI, "repomap", "check-deps", "--format", "json"], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(typeof parsed.available, "boolean");
  assert.strictEqual(r.status, parsed.available ? 0 : 1);
});
