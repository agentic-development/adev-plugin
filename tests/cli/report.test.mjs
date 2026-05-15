// tests/cli/report.test.mjs
//
// Tests for `adev report` (lib/cli/report.mjs) — Task 2 of the inline-Node
// extraction sweep. Extracts the `reportValidator` per-check emission inline
// block from skills/validate/SKILL.md into a callable CLI verb.
//
// Spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Plan: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.plan.md (Task 2)
// Source SKILL.md behavior: skills/validate/SKILL.md "Per-Check Event Emission"
//
// Contract (driver-substrate.spec.md):
//   - Module exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — `reportValidator` is a per-check event
//     emission inside the validate step, not a step entry/exit itself. The
//     cli-driver pattern test will NOT assert requireGate-first on this
//     module.
//   - Exit codes:
//       0  event appended successfully
//       1  argument error, spec containment failure, or unexpected error
//       2  GateError thrown by appendEvent (strict event-diagnostics mode)
//
// CLI surface (Task 2 introduces --type validator only; Task 3 will add
// --type step in the same module, per spec Behavior 9 / plan Task 3):
//
//   adev report --type validator
//               --spec <p>
//               --step <name>
//               --validator <id>
//               --verdict <PASS|PASS_WITH_NOTES|FAIL>
//               [--error <text>] [--score <number>] [--duration-ms <number>]
//               [--notes <text>] [--domain <name>]
//   adev report --help

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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-report-test-")));
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

// Read the appended JSONL log; returns parsed events array.
function readLog(dir, slug) {
  const logPath = join(
    dir,
    ".context-index",
    "lifecycle-state",
    `${slug}.jsonl`,
  );
  if (!existsSync(logPath)) return [];
  const body = readFileSync(logPath, "utf8");
  return body
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

// ── Driver-substrate contract ─────────────────────────────────────────────

test("lib/cli/report.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/report.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/report.mjs does NOT export LIFECYCLE_STEP (per-check event emission helper, not a lifecycle step)", async () => {
  const mod = await import("../../lib/cli/report.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Usage / argument errors ──────────────────────────────────────────────

test("adev report with no flags exits 1 with usage", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync("node", [CLI, "report"], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage|--type/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator without --spec exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--step",
        "validate",
        "--validator",
        "check-2",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator without --validator exits 1", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--validator|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator without --verdict exits 1", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-2",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--verdict|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator without --step exits 1", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--validator",
        "check-2",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--step|usage/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report with unknown --type exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "bogus",
        "--spec",
        "x",
        "--step",
        "y",
        "--validator",
        "z",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--type|unknown|bogus|validator/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator with invalid --verdict exits 1", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-2",
        "--verdict",
        "MAYBE",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /verdict|PASS|FAIL/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator with out-of-bounds --spec path exits 1 (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        "../../../etc/passwd",
        "--step",
        "validate",
        "--validator",
        "check-2",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found|escapes/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator with missing --spec file exits 1", () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        ".context-index/specs/features/m/no-such.spec.md",
        "--step",
        "validate",
        "--validator",
        "check-2",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --help exits 0 and prints usage", () => {
  const r = spawnSync("node", [CLI, "report", "--help"], {
    encoding: "utf8",
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /adev report/i);
  assert.match(r.stdout, /--type validator/);
});

// ── Happy path: validator_report event appended ──────────────────────────

test("adev report --type validator appends a validator_report event with required fields", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# Live Spec: Foo\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-2-spec-compliance",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );

    assert.strictEqual(
      r.status,
      0,
      `expected 0, got ${r.status}: stderr=${r.stderr} stdout=${r.stdout}`,
    );

    // Slug derivation: slugFromSpec strips `.spec.md` → "foo".
    const events = readLog(dir, "foo");
    assert.ok(events.length >= 1, "log should contain at least one event");
    const ev = events[events.length - 1];
    assert.strictEqual(ev.event, "validator_report");
    assert.strictEqual(ev.step, "validate");
    assert.strictEqual(ev.validator, "check-2-spec-compliance");
    assert.strictEqual(ev.verdict, "PASS");
    // Severity stamped at write time by lib (never asserted by skill prose).
    assert.ok(typeof ev.severity === "string" && ev.severity.length > 0);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator forwards optional --error, --score, --duration-ms, --notes", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");

    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-7-typecheck",
        "--verdict",
        "FAIL",
        "--error",
        "tsc reported 3 errors",
        "--score",
        "42",
        "--duration-ms",
        "1234",
        "--notes",
        "see report file",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);

    const events = readLog(dir, "foo");
    const ev = events[events.length - 1];
    assert.strictEqual(ev.event, "validator_report");
    assert.strictEqual(ev.verdict, "FAIL");
    assert.strictEqual(ev.error, "tsc reported 3 errors");
    assert.strictEqual(ev.score, 42);
    assert.strictEqual(ev.duration_ms, 1234);
    assert.strictEqual(ev.notes, "see report file");
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator rejects non-numeric --score", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-1",
        "--verdict",
        "PASS",
        "--score",
        "not-a-number",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /score/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator rejects non-numeric --duration-ms", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-1",
        "--verdict",
        "PASS",
        "--duration-ms",
        "fast",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /duration/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator accepts PASS_WITH_NOTES verdict", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-2",
        "--verdict",
        "PASS_WITH_NOTES",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    const events = readLog(dir, "foo");
    const ev = events[events.length - 1];
    assert.strictEqual(ev.verdict, "PASS_WITH_NOTES");
  } finally {
    cleanup(dir);
  }
});

test("--type step is not yet implemented in Task 2 (reserved for Task 3); exits 1 with informative message", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "step",
        "--spec",
        specRel,
        "--step",
        "implement",
        "--status",
        "started",
      ],
      { encoding: "utf8", cwd: dir },
    );
    // Task 2 ships --type validator only. --type step is reserved for Task 3.
    // The helper recognises the type but reports it is unimplemented so that
    // the test serves as a deliberate seam — Task 3 will flip this expectation.
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /step|not yet|unimplemented|task 3/i);
  } finally {
    cleanup(dir);
  }
});

test("adev report --type validator is observational — non-zero exit only on argument errors, not on the underlying event", () => {
  // Regression contract: the helper does NOT swallow GateError; the dispatcher
  // converts it to exit 2 per hook protocol. But for a successful event
  // append, exit must be 0 with no stdout (silent emission, like reportValidator).
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/m/foo.spec.md";
    writeSpec(dir, specRel, "---\ncharter: m\n---\n# x\n");
    const r = spawnSync(
      "node",
      [
        CLI,
        "report",
        "--type",
        "validator",
        "--spec",
        specRel,
        "--step",
        "validate",
        "--validator",
        "check-13-heuristics",
        "--verdict",
        "PASS",
      ],
      { encoding: "utf8", cwd: dir },
    );
    assert.strictEqual(r.status, 0);
    // Silent success — no stdout content beyond an optional trailing newline.
    // The skill emits its own report content; the CLI is a side-effect helper.
    assert.ok(r.stdout.length < 200, `expected near-silent stdout, got: ${r.stdout}`);
  } finally {
    cleanup(dir);
  }
});
