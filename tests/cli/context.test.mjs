// tests/cli/context.test.mjs
//
// Tests for `adev context` (lib/cli/context.mjs) — PR 7 of the inline-Node
// extraction sweep. Extracts the loadSpecContext + getPlanProgress inline-Node
// blocks from skills/implement/SKILL.md (line 50), skills/plan/SKILL.md
// (line 186), and skills/validate/SKILL.md (line 487) into a single CLI verb.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — context loading is observational.
//   - Exit codes:
//       0  success — JSON on stdout
//       1  argument error / containment violation / missing file / load error
//
// CLI surface:
//   adev context load --spec <path> [--plan <path>]
//   adev context load --plan <path>
//   adev context --help

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-context-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  writeFileSync(join(dir, ".context-index", "constitution.md"), "# Constitution\n\n## Non-Negotiable Principles\n\n1. Test principle.\n");
  // Seed a charter so loadSpecContext can find it.
  writeFileSync(
    join(dir, ".context-index", "specs", "features", "m", "charter.md"),
    "# Charter: m\n\n## Capability Map\n\n| Capability | Status |\n|---|---|\n| Foo | implemented |\n",
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function writeSpec(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return relPath;
}

const MINIMAL_SPEC = `---
charter: m
status: review-passed
revision: 1
---

# Live Spec: Minimal

## Behavioral Contract

A spec.

## Acceptance Criteria

- [ ] Item one
`;

const MINIMAL_PLAN = `# Plan: Minimal

> Spec: .context-index/specs/features/m/minimal.spec.md

### Task 1: Foo

- [x] subtask one
- [ ] subtask two

### Task 2: Bar

- [ ] subtask three
`;

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/context.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/context.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/context.mjs does NOT export LIFECYCLE_STEP (observational helper)", async () => {
  const mod = await import("../../lib/cli/context.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev context with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "context"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|load/i);
  } finally {
    cleanup(dir);
  }
});

test("adev context with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "context", "bogus"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|load|bogus/i);
  } finally {
    cleanup(dir);
  }
});

test("adev context --help exits 0 and prints usage", () => {
  const r = spawnSync("node", [CLI, "context", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /context load/);
  assert.match(r.stdout, /--spec/);
  assert.match(r.stdout, /--plan/);
});

test("adev context load with neither --spec nor --plan exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "context", "load"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|--plan|at least/i);
  } finally {
    cleanup(dir);
  }
});

// ── Path containment ─────────────────────────────────────────────────────

test("adev context load with out-of-bounds --spec path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "context", "load", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /spec not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});

test("adev context load with out-of-bounds --plan path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "context", "load", "--plan", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /plan not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});

// ── Missing files ────────────────────────────────────────────────────────

test("adev context load with missing --spec file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "context",
        "load",
        "--spec",
        ".context-index/specs/features/m/no-such.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /spec not found/i);
  } finally {
    cleanup(dir);
  }
});

test("adev context load with missing --plan file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "context",
        "load",
        "--plan",
        ".context-index/specs/features/m/no-such.plan.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /plan not found/i);
  } finally {
    cleanup(dir);
  }
});

// ── Happy path: --spec only ──────────────────────────────────────────────

test("adev context load --spec emits { context } JSON on stdout", () => {
  const dir = makeTempProject();
  const specRel = writeSpec(dir, ".context-index/specs/features/m/minimal.spec.md", MINIMAL_SPEC);
  try {
    const r = spawnSync("node", [CLI, "context", "load", "--spec", specRel], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(typeof parsed.context === "string");
    assert.match(parsed.context, /Live Spec: Minimal/);
    assert.strictEqual(parsed.progress, undefined);
  } finally {
    cleanup(dir);
  }
});

// ── Happy path: --plan only ──────────────────────────────────────────────

test("adev context load --plan emits { progress } JSON on stdout", () => {
  const dir = makeTempProject();
  const planRel = writeSpec(dir, ".context-index/specs/features/m/minimal.plan.md", MINIMAL_PLAN);
  try {
    const r = spawnSync("node", [CLI, "context", "load", "--plan", planRel], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.progress);
    assert.strictEqual(typeof parsed.progress.total, "number");
    assert.strictEqual(parsed.progress.total, 3);
    assert.strictEqual(parsed.progress.completed, 1);
    assert.strictEqual(parsed.progress.remaining, 2);
    assert.strictEqual(parsed.context, undefined);
    assert.ok(Array.isArray(parsed.progress.tasks));
    assert.strictEqual(parsed.progress.tasks.length, 2);
  } finally {
    cleanup(dir);
  }
});

// ── Happy path: both ─────────────────────────────────────────────────────

test("adev context load --spec --plan emits { context, progress } JSON", () => {
  const dir = makeTempProject();
  const specRel = writeSpec(dir, ".context-index/specs/features/m/minimal.spec.md", MINIMAL_SPEC);
  const planRel = writeSpec(dir, ".context-index/specs/features/m/minimal.plan.md", MINIMAL_PLAN);
  try {
    const r = spawnSync(
      "node",
      [CLI, "context", "load", "--spec", specRel, "--plan", planRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(typeof parsed.context === "string");
    assert.ok(parsed.progress);
    assert.match(parsed.context, /Live Spec: Minimal/);
    assert.strictEqual(parsed.progress.total, 3);
    assert.strictEqual(parsed.progress.completed, 1);
  } finally {
    cleanup(dir);
  }
});

test("adev context load --help (after load) exits 0", () => {
  const r = spawnSync("node", [CLI, "context", "load", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /--spec/);
});
