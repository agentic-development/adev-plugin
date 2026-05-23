// tests/cli/prototype.test.mjs
//
// Tests for `adev prototype` (lib/cli/prototype.mjs).
//
// PR 8-9 of the inline-Node extraction sweep: extracts inline blocks from
// skills/prototype/SKILL.md that called validateModuleName / discoverCharters
// (from lib/prototype-args.mjs) and startServer / ensureGitignore (from
// lib/prototype-server.mjs).
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run` and `help`.
//   - Does NOT export LIFECYCLE_STEP — prototype is not a lifecycle step.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-prototype-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
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

test("lib/cli/prototype.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/prototype.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/prototype.mjs does NOT export LIFECYCLE_STEP", async () => {
  const mod = await import("../../lib/cli/prototype.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev prototype with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "prototype"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|validate-module-name|discover/i);
  } finally {
    cleanup(dir);
  }
});

test("adev prototype --help exits 0 and prints usage", () => {
  const r = spawnSync("node", [CLI, "prototype", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /validate-module-name/);
  assert.match(r.stdout, /discover-charters/);
  assert.match(r.stdout, /start-server/);
  assert.match(r.stdout, /ensure-gitignore/);
});

test("adev prototype with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "prototype", "bogus"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /unknown|usage/i);
  } finally {
    cleanup(dir);
  }
});

// ── validate-module-name ─────────────────────────────────────────────────

test("validate-module-name without --module exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "validate-module-name"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--module|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("validate-module-name with valid kebab-case prints 'true'", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "validate-module-name", "--module", "my-feature-1"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "true");
  } finally {
    cleanup(dir);
  }
});

test("validate-module-name with invalid name prints 'false'", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "validate-module-name", "--module", "Bad_Name"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "false");
  } finally {
    cleanup(dir);
  }
});

// ── discover-charters ────────────────────────────────────────────────────

test("discover-charters returns [] when no charters exist", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "discover-charters"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 0);
  } finally {
    cleanup(dir);
  }
});

test("discover-charters lists charters from .context-index/specs/features/", () => {
  const dir = makeTempProject();
  mkdirSync(join(dir, ".context-index", "specs", "features", "alpha"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "specs", "features", "alpha", "charter.md"),
    "# Feature Charter: Alpha\n",
  );
  mkdirSync(join(dir, ".context-index", "specs", "features", "beta"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "specs", "features", "beta", "charter.md"),
    "# Beta module charter\n",
  );
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "discover-charters"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    assert.strictEqual(parsed.length, 2);
    const modules = parsed.map((c) => c.module).sort();
    assert.deepStrictEqual(modules, ["alpha", "beta"]);
    for (const c of parsed) {
      assert.strictEqual(typeof c.title, "string");
      assert.ok(c.path.endsWith("charter.md"));
    }
  } finally {
    cleanup(dir);
  }
});

// ── start-server ─────────────────────────────────────────────────────────

test("start-server without --dir exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "start-server"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--dir|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("start-server with non-existent --dir exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "start-server", "--dir", "does-not-exist", "--port-only"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /not found|directory/i);
  } finally {
    cleanup(dir);
  }
});

test("start-server with --port-only binds, prints port, then exits", () => {
  const dir = makeTempProject();
  // Use the project dir itself as the serve root.
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "start-server", "--dir", dir, "--port-only"],
      { encoding: "utf8", cwd: dir, timeout: 10_000 },
    );
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout.trim());
    // Either a bound port or null (e.g., ports busy in CI).
    assert.ok(
      parsed.port === null || (Number.isInteger(parsed.port) && parsed.port >= 3210),
      `expected port null or >=3210, got ${parsed.port}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── ensure-gitignore ─────────────────────────────────────────────────────

test("ensure-gitignore creates .gitignore with .adev/ entry", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "prototype", "ensure-gitignore"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), "OK");
    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(gitignore, /\.adev\//);
  } finally {
    cleanup(dir);
  }
});

test("ensure-gitignore is idempotent (block is canonical; re-runs produce byte-identical output)", () => {
  // Post-Task-7 contract: ensureGitignore delegates to ensureManagedBlock.
  // The block's canonical body lists `.adev/` once. Pre-existing bare
  // `.adev/` user lines outside the block are preserved (one bare line +
  // one in-block line is the expected steady state).
  const dir = makeTempProject();
  writeFileSync(join(dir, ".gitignore"), ".adev/\n");
  try {
    const r1 = spawnSync("node", [CLI, "prototype", "ensure-gitignore"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r1.status, 0);
    const first = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.ok(first.includes("# >>> adev:gitignore >>>"), "block installed");
    assert.ok(first.includes(".adev/"), ".adev/ present");

    // Re-run: should be a noop.
    const r2 = spawnSync("node", [CLI, "prototype", "ensure-gitignore"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r2.status, 0);
    const second = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.strictEqual(second, first, "second run byte-identical");
  } finally {
    cleanup(dir);
  }
});
