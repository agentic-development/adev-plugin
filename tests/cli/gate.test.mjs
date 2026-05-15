// tests/cli/gate.test.mjs
//
// Tests for `adev gate require` (lib/cli/gate.mjs).
// Covers Behavior 4 + Error Cases rows 3, 4, 5, 6 from driver-substrate.spec.md.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-gate-test-"));
  mkdirSync(join(dir, ".context-index/specs/features/m"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index/manifest.yaml"),
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

test("adev gate require missing --skill exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "gate", "require", "--spec", "x"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--skill|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev gate require missing --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "gate", "require", "--skill", "validate"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|usage/i);
  } finally {
    cleanup(dir);
  }
});

test('adev gate require --spec <missing-file> exits 1 with "spec not found"', () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "gate",
        "require",
        "--skill",
        "validate",
        "--spec",
        ".context-index/specs/features/m/does-not-exist.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/);
  } finally {
    cleanup(dir);
  }
});

test("adev gate require with out-of-bounds --spec path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "gate", "require", "--skill", "validate", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found|escapes project root/);
  } finally {
    cleanup(dir);
  }
});

test("adev gate require on spec where prior step is complete with verdict returns 0", () => {
  const dir = makeTempProject();
  try {
    // Write a spec + lifecycle log with specify + review completed with PASS
    const specRel = ".context-index/specs/features/m/x.spec.md";
    writeFileSync(
      join(dir, specRel),
      "---\ncharter: m\nstatus: review-passed\n---\n# x\n",
    );
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    const events =
      [
        JSON.stringify({
          event: "lifecycle_step",
          spec: specRel,
          step: "specify",
          status: "started",
          ts: "2026-05-14T00:00:00.000Z",
        }),
        JSON.stringify({
          event: "step_completed",
          spec: specRel,
          step: "specify",
          verdict: "PASS",
          ts: "2026-05-14T00:00:30.000Z",
        }),
        JSON.stringify({
          event: "lifecycle_step",
          spec: specRel,
          step: "review",
          status: "started",
          ts: "2026-05-14T00:01:00.000Z",
        }),
        JSON.stringify({
          event: "step_completed",
          spec: specRel,
          step: "review",
          verdict: "PASS",
          ts: "2026-05-14T00:01:30.000Z",
        }),
      ].join("\n") + "\n";
    // Slug is derived from spec basename without .spec.md extension
    writeFileSync(join(dir, ".context-index/lifecycle-state/x.jsonl"), events);

    const r = spawnSync(
      "node",
      [CLI, "gate", "require", "--skill", "plan", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `expected 0, got ${r.status}: stderr=${r.stderr} stdout=${r.stdout}`);
  } finally {
    cleanup(dir);
  }
});

test("adev gate require where prior step incomplete returns 2 (GateError)", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/y.spec.md";
    writeFileSync(
      join(dir, specRel),
      "---\ncharter: m\nstatus: draft\n---\n# y\n",
    );
    // No lifecycle-state file → no prior step events → gate blocks

    const r = spawnSync(
      "node",
      [CLI, "gate", "require", "--skill", "plan", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /gate|requires|prior step/i);
  } finally {
    cleanup(dir);
  }
});

test("lib/cli/gate.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/gate.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/gate.mjs does NOT export LIFECYCLE_STEP (query primitive, not lifecycle step)", async () => {
  const mod = await import("../../lib/cli/gate.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

test("adev gate require with unknown --skill exits 1", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/z.spec.md";
    writeFileSync(
      join(dir, specRel),
      "---\ncharter: m\nstatus: draft\n---\n# z\n",
    );
    const r = spawnSync(
      "node",
      [CLI, "gate", "require", "--skill", "no-such-skill", "--spec", specRel],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /unknown skill|no lifecycle/i);
  } finally {
    cleanup(dir);
  }
});

test("adev gate --help prints gate help (not general)", () => {
  const r = spawnSync("node", [CLI, "gate", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /gate require/i);
});
