// tests/cli/skill-ext.test.mjs
//
// Tests for `adev skill-ext load` (lib/cli/skill-ext.mjs).
// Covers all Behaviors, Error Cases, and Acceptance Criteria from
// skill-ext-load.spec.md, plus reviewer notes SEC-1 (symlink escape) and
// CON-1 (no LIFECYCLE_STEP export).

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

// ── helpers ────────────────────────────────────────────────────────────────

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-skill-ext-test-"));
  mkdirSync(join(dir, ".context-index", "skill-extensions"), { recursive: true });
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

function run(dir, args) {
  return spawnSync("node", [CLI, "skill-ext", ...args], {
    encoding: "utf8",
    cwd: dir,
  });
}

// ── module contract ────────────────────────────────────────────────────────

test("lib/cli/skill-ext.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/skill-ext.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/skill-ext.mjs does NOT export LIFECYCLE_STEP (CON-1 — query primitive)", async () => {
  const mod = await import("../../lib/cli/skill-ext.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── help ───────────────────────────────────────────────────────────────────

test("adev skill-ext --help prints help text and exits 0", () => {
  const r = spawnSync("node", [CLI, "skill-ext", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /skill-ext|--skill/i);
});

test("adev skill-ext load --help prints help text and exits 0", () => {
  const dir = makeTempProject();
  try {
    const r = run(dir, ["load", "--help"]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /skill-ext|--skill/i);
  } finally {
    cleanup(dir);
  }
});

// ── error cases ────────────────────────────────────────────────────────────

test("adev skill-ext load (no --skill) → stderr usage, exit 1 (MISSING_SKILL_ARG)", () => {
  const dir = makeTempProject();
  try {
    const r = run(dir, ["load"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /MISSING_SKILL_ARG|--skill|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev skill-ext load --skill ../etc/passwd → stderr INVALID_SKILL_NAME, exit 1", () => {
  const dir = makeTempProject();
  try {
    const r = run(dir, ["load", "--skill", "../etc/passwd"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /INVALID_SKILL_NAME/);
  } finally {
    cleanup(dir);
  }
});

test("adev skill-ext load --skill foo/bar → INVALID_SKILL_NAME (slash in name)", () => {
  const dir = makeTempProject();
  try {
    const r = run(dir, ["load", "--skill", "foo/bar"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /INVALID_SKILL_NAME/);
  } finally {
    cleanup(dir);
  }
});

test("adev skill-ext load --skill foo\\\\bar → INVALID_SKILL_NAME (backslash in name)", () => {
  const dir = makeTempProject();
  try {
    const r = run(dir, ["load", "--skill", "foo\\bar"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /INVALID_SKILL_NAME/);
  } finally {
    cleanup(dir);
  }
});

test("adev skill-ext load --skill foo when .context-index/ does not exist → NO_CONTEXT_INDEX, exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-no-context-"));
  try {
    const r = run(dir, ["load", "--skill", "foo"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /NO_CONTEXT_INDEX/);
  } finally {
    cleanup(dir);
  }
});

// ── behavior: no content ──────────────────────────────────────────────────

test("no files in any layer → exactly __NONE__ on stdout, exit 0", () => {
  const dir = makeTempProject();
  try {
    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "__NONE__");
  } finally {
    cleanup(dir);
  }
});

test("all present files are empty → exactly __NONE__ on stdout, exit 0", () => {
  const dir = makeTempProject();
  try {
    // Empty project-level file
    writeFileSync(join(dir, ".context-index", "skill-extensions", "implement.md"), "");
    // Empty extension-layer file
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_web-dev"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "skill-extensions", "_web-dev", "implement.md"), "");

    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "__NONE__");
  } finally {
    cleanup(dir);
  }
});

// ── behavior: project layer only ──────────────────────────────────────────

test("project-layer file only → content on stdout, exit 0", () => {
  const dir = makeTempProject();
  try {
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "implement.md"),
      "# Project extensions\nAlways use TDD.",
    );
    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "# Project extensions\nAlways use TDD.");
  } finally {
    cleanup(dir);
  }
});

// ── behavior: extension layer only ────────────────────────────────────────

test("extension-layer only (_web-dev/implement.md) → content on stdout, exit 0", () => {
  const dir = makeTempProject();
  try {
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_web-dev"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "_web-dev", "implement.md"),
      "# Web-dev extension\nUse React hooks.",
    );
    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "# Web-dev extension\nUse React hooks.");
  } finally {
    cleanup(dir);
  }
});

// ── behavior: both layers ─────────────────────────────────────────────────

test("both extension layer and project layer → extension first, blank line, project content, exit 0", () => {
  const dir = makeTempProject();
  try {
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_web-dev"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "_web-dev", "implement.md"),
      "extension content",
    );
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "implement.md"),
      "project content",
    );
    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "extension content\n\nproject content");
  } finally {
    cleanup(dir);
  }
});

// ── behavior: multiple extension layers (lexicographic order) ─────────────

test("multiple extension layers (_aaa/, _zzz/) → lexicographic order (aaa first), exit 0", () => {
  const dir = makeTempProject();
  try {
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_zzz"), { recursive: true });
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_aaa"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "_aaa", "implement.md"),
      "aaa content",
    );
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "_zzz", "implement.md"),
      "zzz content",
    );
    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "aaa content\n\nzzz content");
  } finally {
    cleanup(dir);
  }
});

test("multiple extension layers: extension layer file missing for one → only present layers output", () => {
  const dir = makeTempProject();
  try {
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_aaa"), { recursive: true });
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_bbb"), { recursive: true });
    // Only _aaa has implement.md; _bbb does not
    writeFileSync(
      join(dir, ".context-index", "skill-extensions", "_aaa", "implement.md"),
      "aaa content",
    );
    const r = run(dir, ["load", "--skill", "implement"]);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "aaa content");
  } finally {
    cleanup(dir);
  }
});

// ── SEC-1: symlink escape ─────────────────────────────────────────────────

test("SEC-1: symlink that escapes extension directory → READ_ERROR or INVALID_SKILL_NAME, exit 1", () => {
  const dir = makeTempProject();
  try {
    // Create a secret file outside the extension directory
    const secretFile = join(dir, "secret.txt");
    writeFileSync(secretFile, "secret content");

    // Create an extension directory and symlink the skill file outside
    mkdirSync(join(dir, ".context-index", "skill-extensions", "_evil"), { recursive: true });
    const symlinkPath = join(dir, ".context-index", "skill-extensions", "_evil", "implement.md");
    try {
      symlinkSync(secretFile, symlinkPath);
    } catch {
      // If symlink creation fails (some platforms/permissions), skip this test
      return;
    }

    const r = run(dir, ["load", "--skill", "implement"]);
    // Should either reject with READ_ERROR or exit 1
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /READ_ERROR|INVALID_SKILL_NAME|symlink|escape/i);
  } finally {
    cleanup(dir);
  }
});
