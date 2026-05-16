// tests/cli/state.test.mjs
//
// Tests for `adev state` (lib/cli/state.mjs) — PR 7 of the inline-Node
// extraction sweep. Wraps findSpecsByStatus (from meta-tools) and
// currentState / filterEvents / listLifecycleStates (from lifecycle-state)
// into a single CLI verb. The original inline site is skills/status/SKILL.md
// line 152.
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
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-state-test-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  mkdirSync(join(dir, ".context-index", "lifecycle-state"), { recursive: true });
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

function writeFile(dir, relPath, body) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return relPath;
}

const SPEC_DRAFT = `---
charter: m
status: draft
revision: 1
---

# Live Spec: Draft

Body.
`;

const SPEC_IMPL = `---
charter: m
status: implemented
revision: 2
milestone: 0.22.0
---

# Live Spec: Implemented

Body.
`;

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/state.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/state.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/state.mjs does NOT export LIFECYCLE_STEP (observational helper)", async () => {
  const mod = await import("../../lib/cli/state.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev state with no subcommand exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "state"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|list|current|events/i);
  } finally {
    cleanup(dir);
  }
});

test("adev state with unknown subcommand exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "state", "bogus"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /bogus|list|current|events/i);
  } finally {
    cleanup(dir);
  }
});

test("adev state --help exits 0 and prints all subcommands", () => {
  const r = spawnSync("node", [CLI, "state", "--help"], { encoding: "utf8" });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /list/);
  assert.match(r.stdout, /current/);
  assert.match(r.stdout, /events/);
});

// ── state list (no filter) ───────────────────────────────────────────────

test("adev state list in an empty project returns count 0", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "state", "list"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.count, 0);
    assert.deepStrictEqual(parsed.records, []);
  } finally {
    cleanup(dir);
  }
});

test("adev state list aggregates lifecycle-state jsonl files", () => {
  const dir = makeTempProject();
  writeFile(
    dir,
    ".context-index/lifecycle-state/foo.jsonl",
    '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-01-01T00:00:00.000Z"}\n' +
      '{"event":"step_completed","step":"specify","ts":"2026-01-01T00:01:00.000Z"}\n',
  );
  try {
    const r = spawnSync("node", [CLI, "state", "list"], { encoding: "utf8", cwd: dir });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.records[0].slug, "foo");
  } finally {
    cleanup(dir);
  }
});

// ── state list --status (spec frontmatter scan) ──────────────────────────

test("adev state list --status filters specs by frontmatter status", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/draft.spec.md", SPEC_DRAFT);
  writeFile(dir, ".context-index/specs/features/m/impl.spec.md", SPEC_IMPL);
  try {
    const r = spawnSync(
      "node",
      [CLI, "state", "list", "--status", "implemented"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.status, "implemented");
    assert.strictEqual(parsed.module, "*");
    assert.strictEqual(parsed.count, 1);
    assert.match(parsed.specs[0].path, /impl\.spec\.md$/);
  } finally {
    cleanup(dir);
  }
});

test("adev state list --status with no matches returns empty array, count 0", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/draft.spec.md", SPEC_DRAFT);
  try {
    const r = spawnSync(
      "node",
      [CLI, "state", "list", "--status", "validated"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.count, 0);
    assert.deepStrictEqual(parsed.specs, []);
  } finally {
    cleanup(dir);
  }
});

test("adev state list --status --module scopes to one module", () => {
  const dir = makeTempProject();
  mkdirSync(join(dir, ".context-index", "specs", "features", "other"), { recursive: true });
  writeFile(dir, ".context-index/specs/features/m/draft.spec.md", SPEC_DRAFT);
  writeFile(dir, ".context-index/specs/features/other/draft.spec.md", SPEC_DRAFT);
  try {
    const r = spawnSync(
      "node",
      [CLI, "state", "list", "--status", "draft", "--module", "m"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.module, "m");
    assert.strictEqual(parsed.count, 1);
  } finally {
    cleanup(dir);
  }
});

// ── state current ────────────────────────────────────────────────────────

test("adev state current without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "state", "current"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec/i);
  } finally {
    cleanup(dir);
  }
});

test("adev state current with no events returns idle/initial projection", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.spec.md", SPEC_DRAFT);
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "state",
        "current",
        "--spec",
        ".context-index/specs/features/m/sample.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.spec);
    assert.ok("status" in parsed);
    assert.ok("currentStep" in parsed);
    assert.ok("steps" in parsed);
  } finally {
    cleanup(dir);
  }
});

test("adev state current with out-of-bounds --spec exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "state", "current", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escapes|INVALID_SPEC_PATH/i);
  } finally {
    cleanup(dir);
  }
});

test("adev state current reflects events from the lifecycle log", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/feat.spec.md", SPEC_DRAFT);
  writeFile(
    dir,
    ".context-index/lifecycle-state/feat.jsonl",
    '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-01-01T00:00:00.000Z"}\n' +
      '{"event":"step_completed","step":"specify","ts":"2026-01-01T00:01:00.000Z"}\n' +
      '{"event":"lifecycle_step","step":"plan","status":"started","ts":"2026-01-01T00:02:00.000Z"}\n',
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "state",
        "current",
        "--spec",
        ".context-index/specs/features/m/feat.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.currentStep, "plan");
  } finally {
    cleanup(dir);
  }
});

// ── state events ─────────────────────────────────────────────────────────

test("adev state events without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "state", "events"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec/i);
  } finally {
    cleanup(dir);
  }
});

test("adev state events with no event log returns count 0", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/sample.spec.md", SPEC_DRAFT);
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "state",
        "events",
        "--spec",
        ".context-index/specs/features/m/sample.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.count, 0);
    assert.deepStrictEqual(parsed.events, []);
  } finally {
    cleanup(dir);
  }
});

test("adev state events returns all events when --event is omitted", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/feat.spec.md", SPEC_DRAFT);
  writeFile(
    dir,
    ".context-index/lifecycle-state/feat.jsonl",
    '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-01-01T00:00:00.000Z"}\n' +
      '{"event":"step_completed","step":"specify","ts":"2026-01-01T00:01:00.000Z"}\n' +
      '{"event":"lifecycle_step","step":"plan","status":"started","ts":"2026-01-01T00:02:00.000Z"}\n',
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "state",
        "events",
        "--spec",
        ".context-index/specs/features/m/feat.spec.md",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.count, 3);
  } finally {
    cleanup(dir);
  }
});

test("adev state events filters by --event <type>", () => {
  const dir = makeTempProject();
  writeFile(dir, ".context-index/specs/features/m/feat.spec.md", SPEC_DRAFT);
  writeFile(
    dir,
    ".context-index/lifecycle-state/feat.jsonl",
    '{"event":"lifecycle_step","step":"specify","status":"started","ts":"2026-01-01T00:00:00.000Z"}\n' +
      '{"event":"step_completed","step":"specify","ts":"2026-01-01T00:01:00.000Z"}\n' +
      '{"event":"lifecycle_step","step":"plan","status":"started","ts":"2026-01-01T00:02:00.000Z"}\n',
  );
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "state",
        "events",
        "--spec",
        ".context-index/specs/features/m/feat.spec.md",
        "--event",
        "lifecycle_step",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.count, 2);
    for (const e of parsed.events) {
      assert.strictEqual(e.event, "lifecycle_step");
    }
  } finally {
    cleanup(dir);
  }
});

test("adev state events with out-of-bounds --spec exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [CLI, "state", "events", "--spec", "../../../etc/passwd"],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /escapes|INVALID_SPEC_PATH/i);
  } finally {
    cleanup(dir);
  }
});
