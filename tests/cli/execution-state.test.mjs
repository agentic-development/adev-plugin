// tests/cli/execution-state.test.mjs
//
// Tests for `adev execution-state` (lib/cli/execution-state.mjs) — PR 7 of
// the inline-Node extraction sweep. Replaces the prose-form inline-Node
// references at skills/implement/SKILL.md lines 364, 385, 537.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
//
// Contract:
//   - Module exports `run({...})` and `help()`.
//   - Does NOT export LIFECYCLE_STEP (observational helper).
//   - Exit codes: 0 success / 1 arg-error / 1 unexpected exception.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-execstate-test-")));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
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
    /* ignore */
  }
}

const STATE_PATH = ".context-index/.execution-state.json";

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/execution-state.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/execution-state.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/execution-state.mjs does NOT export LIFECYCLE_STEP", async () => {
  const mod = await import("../../lib/cli/execution-state.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev execution-state with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "execution-state"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|read|write|clear/i);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "execution-state", "bogus"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /bogus|read|write|clear/i);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state --help exits 0", () => {
  const r = spawnSync("node", [CLI, "execution-state", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /read/);
  assert.match(r.stdout, /write/);
  assert.match(r.stdout, /clear/);
});

// ── read ─────────────────────────────────────────────────────────────────

test("adev execution-state read with no file emits null", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "execution-state", "read"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout.trim(), "null");
  } finally {
    cleanup(dir);
  }
});

// ── write ────────────────────────────────────────────────────────────────

test("adev execution-state write without --status exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "execution-state", "write"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--status/i);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write with invalid status exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "execution-state", "write", "--status", "bogus"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /INVALID_STATUS|status/i);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write status=active without --plan-ref exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "execution-state", "write", "--status", "active"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /MISSING_PLAN_REF|plan-ref/i);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write status=idle writes idle state", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "execution-state", "write", "--status", "idle"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.status, "idle");
    assert.ok(existsSync(join(dir, STATE_PATH)));
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write status=active stores plan-ref + current-task + numeric-coercion", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "active",
        "--plan-ref",
        ".context-index/specs/features/m/foo.plan.md",
        "--current-task",
        "7",
        "--issue-binding",
        "issue-42",
        "--next-action",
        "Implement task 7",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.status, "active");
    assert.strictEqual(parsed.planRef, ".context-index/specs/features/m/foo.plan.md");
    assert.strictEqual(parsed.currentTask, 7); // numeric coercion
    assert.strictEqual(parsed.issueBinding, "issue-42");
    assert.strictEqual(parsed.nextAction, "Implement task 7");
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write status=blocked stores blockers field", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "blocked",
        "--blockers",
        "Subagent stuck on test failure",
        "--next-action",
        "Run /adev:recover",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.status, "blocked");
    assert.match(parsed.blockers, /Subagent stuck/);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write --progress-json stores progress array", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "active",
        "--plan-ref",
        "p.md",
        "--current-task",
        "1",
        "--progress-json",
        '[{"task":"foo","done":true},{"task":"bar","done":false}]',
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.progress.length, 2);
    assert.strictEqual(parsed.progress[0].task, "foo");
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write --progress-json with invalid JSON exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "idle",
        "--progress-json",
        "{not-json",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /invalid|JSON/i);
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state write --progress-json with non-array exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "idle",
        "--progress-json",
        '{"not":"array"}',
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /array/i);
  } finally {
    cleanup(dir);
  }
});

// ── clear ────────────────────────────────────────────────────────────────

test("adev execution-state clear resets state to idle", () => {
  const dir = makeTempProject();
  try {
    // First write an active state.
    spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "active",
        "--plan-ref",
        "p.md",
        "--current-task",
        "1",
      ],
      { encoding: "utf8", cwd: dir },
    );

    const r = spawnSync("node", [CLI, "execution-state", "clear"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    // Silent stdout on success.
    assert.strictEqual(r.stdout.trim(), "");

    // Verify state file is now idle.
    const onDisk = JSON.parse(readFileSync(join(dir, STATE_PATH), "utf8"));
    assert.strictEqual(onDisk.status, "idle");
    assert.strictEqual(onDisk.planRef, "");
    assert.strictEqual(onDisk.currentTask, "");
  } finally {
    cleanup(dir);
  }
});

test("adev execution-state read after write round-trips", () => {
  const dir = makeTempProject();
  try {
    spawnSync(
      "node",
      [
        CLI,
        "execution-state",
        "write",
        "--status",
        "active",
        "--plan-ref",
        "x.md",
        "--current-task",
        "3",
      ],
      { encoding: "utf8", cwd: dir },
    );
    const r = spawnSync("node", [CLI, "execution-state", "read"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.status, "active");
    assert.strictEqual(parsed.planRef, "x.md");
    assert.strictEqual(parsed.currentTask, 3);
  } finally {
    cleanup(dir);
  }
});
