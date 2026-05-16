// tests/cli/preflight.test.mjs
//
// Tests for `adev preflight run` (lib/cli/preflight.mjs).
//
// PR 8-9 of the inline-Node extraction sweep: extract `runPreflight` +
// `formatPreflightReport` calls from skills/{write-test, eval, debug,
// recover, implement, validate}/SKILL.md.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — preflight is observational.
//   - Exit 0 on pass / skipped; 2 on failed preflight; 1 on argument error.

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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-preflight-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
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

function writeSpec(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/preflight.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/preflight.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/preflight.mjs does NOT export LIFECYCLE_STEP (observational)", async () => {
  const mod = await import("../../lib/cli/preflight.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev preflight with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "preflight"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|preflight run/i);
  } finally {
    cleanup(dir);
  }
});

test("adev preflight run without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "preflight", "run"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev preflight run with out-of-bounds --spec exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "preflight", "run", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});

test("adev preflight run with missing --spec file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/missing.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/i);
  } finally {
    cleanup(dir);
  }
});

test("adev preflight run with invalid --format exits 1", () => {
  const dir = makeTempProject();
  writeSpec(dir, ".context-index/specs/features/m/x.spec.md", "# Spec\n");
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--format",
        "bogus",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--format|json|text/i);
  } finally {
    cleanup(dir);
  }
});

test("adev preflight run with invalid --timeout exits 1", () => {
  const dir = makeTempProject();
  writeSpec(dir, ".context-index/specs/features/m/x.spec.md", "# Spec\n");
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--timeout",
        "not-a-number",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--timeout/i);
  } finally {
    cleanup(dir);
  }
});

test("adev preflight --help exits 0 and prints usage", () => {
  const r = spawnSync("node", [CLI, "preflight", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /preflight run/i);
});

// ── Happy paths ──────────────────────────────────────────────────────────

test("spec with no infra_requirements: passes silently (json)", () => {
  const dir = makeTempProject();
  writeSpec(
    dir,
    ".context-index/specs/features/m/x.spec.md",
    "---\ncharter: m\n---\n\n# X\n\n## Behavioral Contract\n\nNo infra.\n",
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const report = JSON.parse(r.stdout.trim());
    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.skipped, false);
    assert.deepStrictEqual(report.systems, []);
  } finally {
    cleanup(dir);
  }
});

test("--no-infra short-circuits to skipped", () => {
  const dir = makeTempProject();
  writeSpec(
    dir,
    ".context-index/specs/features/m/x.spec.md",
    "---\ncharter: m\ninfra_requirements:\n  systems:\n    - name: pg\n      env_vars: [PG_URL]\n---\n\n# X\n",
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--no-infra",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    const report = JSON.parse(r.stdout.trim());
    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.skipped, true);
  } finally {
    cleanup(dir);
  }
});

test("--format text returns formatted markdown", () => {
  const dir = makeTempProject();
  writeSpec(
    dir,
    ".context-index/specs/features/m/x.spec.md",
    "---\ncharter: m\n---\n\n# X\n",
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--format",
        "text",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    // Text output is markdown or 'No infrastructure requirements declared.'
    assert.match(r.stdout, /infrastructure|preflight/i);
  } finally {
    cleanup(dir);
  }
});

test("failing preflight exits 2", () => {
  const dir = makeTempProject();
  // Declare an env var that almost certainly does not exist.
  writeSpec(
    dir,
    ".context-index/specs/features/m/x.spec.md",
    "---\ncharter: m\ninfra_requirements:\n  systems:\n    - name: phantom\n      env_vars: [ADEV_PREFLIGHT_TEST_NEVER_SET_XYZ]\n---\n\n# X\n",
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
      ],
      { encoding: "utf8", cwd: dir, env: { ...process.env, ADEV_PREFLIGHT_TEST_NEVER_SET_XYZ: undefined } },
    );
    assert.strictEqual(r.status, 2);
    const report = JSON.parse(r.stdout.trim());
    assert.strictEqual(report.passed, false);
    assert.strictEqual(report.skipped, false);
  } finally {
    cleanup(dir);
  }
});

test("--plan path containment: out-of-bounds plan exits 1", () => {
  const dir = makeTempProject();
  writeSpec(dir, ".context-index/specs/features/m/x.spec.md", "# X\n");
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "preflight",
        "run",
        "--spec",
        ".context-index/specs/features/m/x.spec.md",
        "--plan",
        "../../../etc/passwd",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /plan not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});
