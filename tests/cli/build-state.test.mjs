// tests/cli/build-state.test.mjs
//
// Tests for `adev build-state` (lib/cli/build-state.mjs) — PR 7 of the
// inline-Node extraction sweep. Replaces three heredocs in
// skills/build/SKILL.md (lines 236, 254, 272).
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
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-buildstate-test-")));
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
    /* ignore */
  }
}

const SPEC = ".context-index/specs/features/m/sample.spec.md";

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/build-state.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/build-state.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/build-state.mjs does NOT export LIFECYCLE_STEP", async () => {
  const mod = await import("../../lib/cli/build-state.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev build-state with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "build-state"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|read|create|record|next/i);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "build-state", "bogus"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /bogus|read|create|record|next/i);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state --help exits 0", () => {
  const r = spawnSync("node", [CLI, "build-state", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /read/);
  assert.match(r.stdout, /create/);
  assert.match(r.stdout, /record/);
  assert.match(r.stdout, /next/);
});

test("adev build-state read without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "build-state", "read"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec/i);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state with out-of-bounds --spec exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "build-state", "read", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escapes/i);
  } finally {
    cleanup(dir);
  }
});

// ── read ─────────────────────────────────────────────────────────────────

test("adev build-state read with no state file emits null", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "build-state", "read", "--spec", SPEC],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout.trim(), "null");
  } finally {
    cleanup(dir);
  }
});

// ── create ───────────────────────────────────────────────────────────────

test("adev build-state create writes an implement-pipeline state", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "build-state", "create", "--spec", SPEC],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.status, "in_progress");
    assert.ok(Array.isArray(parsed.steps));
    // IMPLEMENT_STEPS = ['review', 'plan', 'route', 'implement', 'validate']
    assert.strictEqual(parsed.steps.length, 5);
    assert.strictEqual(parsed.steps[0].name, "review");
    assert.strictEqual(parsed.milestone, null);
    assert.ok(existsSync(join(dir, ".context-index/lifecycle-state/sample.json")));
  } finally {
    cleanup(dir);
  }
});

test("adev build-state create --full includes the specify step", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "build-state", "create", "--spec", SPEC, "--full"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.steps.length, 6);
    assert.strictEqual(parsed.steps[0].name, "specify");
  } finally {
    cleanup(dir);
  }
});

test("adev build-state create --milestone records the milestone name", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "create",
        "--spec",
        SPEC,
        "--milestone",
        "0.25.0",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.milestone, "0.25.0");
  } finally {
    cleanup(dir);
  }
});

// ── record ───────────────────────────────────────────────────────────────

test("adev build-state record without --step exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--status",
        "completed",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--step/i);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record without --status exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "build-state", "record", "--spec", SPEC, "--step", "review"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--status/i);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record with no existing state errors NO_BUILD_STATE", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "review",
        "--status",
        "completed",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /NO_BUILD_STATE/);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record marks a step completed", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "review",
        "--status",
        "completed",
        "--verdict",
        "PASS",
        "--notes",
        "All reviewers passed",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    const review = parsed.steps.find((s) => s.name === "review");
    assert.strictEqual(review.status, "completed");
    assert.strictEqual(review.verdict, "PASS");
    assert.strictEqual(review.notes, "All reviewers passed");
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record --retry-history-json stores retry-cycles", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    const retryHist = JSON.stringify([
      { cycle: 1, verdict: "FAIL" },
      { cycle: 2, verdict: "PASS" },
    ]);
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "validate",
        "--status",
        "completed",
        "--retry-history-json",
        retryHist,
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    const validate = parsed.steps.find((s) => s.name === "validate");
    assert.strictEqual(validate.retry_cycles, 2);
    assert.strictEqual(validate.retry_history.length, 2);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record with invalid status exits 1 (INVALID_STEP_STATUS)", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "review",
        "--status",
        "bogus",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /INVALID_STEP_STATUS|invalid/i);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record with unknown step exits 1 (UNKNOWN_STEP)", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "nonsense",
        "--status",
        "completed",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /UNKNOWN_STEP|Unknown step/);
  } finally {
    cleanup(dir);
  }
});

// ── next ─────────────────────────────────────────────────────────────────

test("adev build-state next with no state emits { state: null, next: null }", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "build-state", "next", "--spec", SPEC],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.state, null);
    assert.strictEqual(parsed.next, null);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state next returns the first pending step", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    const r = spawnSync(
      "node",
      [CLI, "build-state", "next", "--spec", SPEC],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.next.name, "review");
    assert.strictEqual(parsed.next.index, 0);
  } finally {
    cleanup(dir);
  }
});

test("adev build-state next advances after a step is recorded completed", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "review",
        "--status",
        "completed",
      ],
      { encoding: "utf8", cwd: dir },
    );
    const r = spawnSync(
      "node",
      [CLI, "build-state", "next", "--spec", SPEC],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.next.name, "plan");
  } finally {
    cleanup(dir);
  }
});

test("adev build-state next returns null next when all steps complete", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    for (const step of ["review", "plan", "route", "implement", "validate"]) {
      spawnSync(
        "node",
        [
          CLI,
          "build-state",
          "record",
          "--spec",
          SPEC,
          "--step",
          step,
          "--status",
          "completed",
        ],
        { encoding: "utf8", cwd: dir },
      );
    }
    const r = spawnSync(
      "node",
      [CLI, "build-state", "next", "--spec", SPEC],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.next, null);
    assert.strictEqual(parsed.state.status, "completed");
  } finally {
    cleanup(dir);
  }
});

test("adev build-state record --retry-history-json with non-array exits 1", () => {
  const dir = makeTempProject();
  try {
    spawnSync("node", [CLI, "build-state", "create", "--spec", SPEC], {
      encoding: "utf8",
      cwd: dir,
    });
    const r = spawnSync(
      "node",
      [
        CLI,
        "build-state",
        "record",
        "--spec",
        SPEC,
        "--step",
        "review",
        "--status",
        "completed",
        "--retry-history-json",
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
