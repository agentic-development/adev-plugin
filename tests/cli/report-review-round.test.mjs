// tests/cli/report-review-round.test.mjs
//
// Tests for `adev report --type review-round` (lib/cli/report.mjs) — Task 6 of
// the Review-Round Provenance plan.
//
// Spec: .context-index/specs/features/implementation/review-provenance.spec.md
// Plan-task: 6
//
// Surface:
//   adev report --type review-round --spec <spec> --plan <p> --task-id <id>
//               --stage <s> --cycles <n> [--findings <m>]
//
// The CLI does NOT duplicate `reportReviewRound`'s validation (closed key
// allow-list, closed stage enum, `cycles >= 1`, `findings >= 0`, `findings`
// scoped to stages with stable finding ids). It parses, converts the two
// numeric flags explicitly, and delegates; a thrown `EVENT_SCHEMA_INVALID`
// surfaces as exit 1 whose stderr names the offending argument. Duplicating the
// rules here would create a second authority that can drift.
//
// The one thing the CLI owns is refusing non-integer *text* for `--cycles` /
// `--findings`, so `"two"` and `"1.5"` are named against the flag the operator
// typed rather than reaching the lib as `NaN` / a float.
//
// Harness convention follows tests/cli/report-gate-outcomes.test.mjs
// (`makeTempProject` / `cleanup` / `runReport` / `readLog`), deliberately NOT
// the differently-shaped `runCLI` in tests/helpers.mjs.

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

const SPEC_REL = ".context-index/specs/features/m/review-round.spec.md";
const SLUG = "review-round";

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-review-round-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  writeFileSync(join(dir, SPEC_REL), "# Spec\n");
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function runReport(dir, args) {
  const r = spawnSync("node", [CLI, "report", ...args], {
    encoding: "utf8",
    cwd: dir,
  });
  return { code: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function readLog(dir) {
  const logPath = join(dir, ".context-index", "lifecycle-state", `${SLUG}.jsonl`);
  const body = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  return body
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

// Every required flag of a well-formed `--type review-round` invocation.
const FULL_FLAGS = {
  "--spec": SPEC_REL,
  "--plan": "demo.plan.md",
  "--task-id": "t1",
  "--stage": "code-quality",
  "--cycles": "2",
};

function baseArgs(overrides = []) {
  const argv = ["--type", "review-round"];
  for (const [k, val] of Object.entries(FULL_FLAGS)) argv.push(k, val);
  for (const [flag, value] of overrides) {
    const i = argv.indexOf(flag);
    if (i === -1) argv.push(flag, value);
    else argv[i + 1] = value;
  }
  return argv;
}

// ── Happy path ───────────────────────────────────────────────────────────

test("--type review-round appends a review_round event", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs([["--findings", "1"]]));
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stderr, "");
    const events = readLog(dir);
    assert.strictEqual(events.length, 1);
    const ev = events[0];
    assert.strictEqual(ev.event, "review_round");
    assert.strictEqual(ev.plan, "demo.plan.md");
    assert.strictEqual(ev.task_id, "t1");
    assert.strictEqual(ev.stage, "code-quality");
    assert.strictEqual(ev.cycles, 2, 'numeric, not the string "2"');
    assert.strictEqual(ev.findings, 1, 'numeric, not the string "1"');
  } finally {
    cleanup(dir);
  }
});

test("a well-formed invocation writes exactly ONE event", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs());
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(
      readLog(dir).length,
      1,
      "one stage report must append one line, never two",
    );
  } finally {
    cleanup(dir);
  }
});

test("--findings is omitted from the payload when the flag is absent", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs([["--stage", "spec-compliance"]]));
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    const [ev] = readLog(dir);
    assert.strictEqual(
      "findings" in ev,
      false,
      "absence means not recorded, never null and never 0",
    );
    assert.strictEqual(ev.cycles, 2, "cycles is still recorded for that stage");
  } finally {
    cleanup(dir);
  }
});

// ── Missing required flags ───────────────────────────────────────────────

test("--type review-round refuses loudly on each missing required flag", () => {
  const dir = makeTempProject();
  try {
    for (const omit of Object.keys(FULL_FLAGS)) {
      const argv = ["--type", "review-round"];
      for (const [k, val] of Object.entries(FULL_FLAGS)) {
        if (k !== omit) argv.push(k, val);
      }
      const r = runReport(dir, argv);
      assert.notStrictEqual(r.code, 0, `expected non-zero when ${omit} is missing`);
      assert.match(r.stderr, new RegExp(omit.replace(/^--/, "")));
    }
    assert.deepStrictEqual(readLog(dir), [], "no event written on any refusal");
  } finally {
    cleanup(dir);
  }
});

// ── Malformed values ─────────────────────────────────────────────────────

test("--type review-round refuses malformed values without writing", () => {
  const dir = makeTempProject();
  try {
    const bad = [
      ["--cycles", "0"],
      ["--cycles", "two"],
      ["--cycles", "1.5"],
      ["--stage", "sanity-check"],
      ["--findings", "-1"],
    ];
    for (const [flag, value] of bad) {
      const r = runReport(dir, baseArgs([[flag, value]]));
      assert.notStrictEqual(r.code, 0, `expected refusal for ${flag} ${value}`);
      assert.match(r.stderr, new RegExp(flag.replace(/^--/, "")));
      assert.doesNotMatch(
        r.stderr,
        /\n\s+at /,
        `${flag} ${value} must be refused with a message, not a stack dump`,
      );
    }
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("--findings on --type review-round --stage spec-compliance is refused", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(
      dir,
      baseArgs([
        ["--stage", "spec-compliance"],
        ["--cycles", "1"],
        ["--findings", "1"],
      ]),
    );
    assert.notStrictEqual(r.code, 0);
    assert.match(r.stderr, /findings/);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

// ── Flag scoping ─────────────────────────────────────────────────────────

test("review-round-only flags are rejected on other --type values", () => {
  const dir = makeTempProject();
  try {
    for (const [flag, value] of [
      ["--cycles", "2"],
      ["--stage", "code-quality"],
      ["--findings", "1"],
    ]) {
      const r = runReport(dir, [
        "--type",
        "step",
        "--spec",
        SPEC_REL,
        "--step",
        "plan",
        "--status",
        "started",
        flag,
        value,
      ]);
      assert.notStrictEqual(r.code, 0, `expected refusal for ${flag} on --type step`);
      assert.match(r.stderr, /only valid with --type review-round/);
      assert.match(r.stderr, new RegExp(flag.replace(/^--/, "")));
    }
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

// ── --type vocabulary ────────────────────────────────────────────────────

test("all four --type vocabulary strings list review-round and agree with each other", () => {
  const dir = makeTempProject();
  try {
    const unknown = runReport(dir, ["--type", "bogus", "--spec", SPEC_REL]);
    assert.notStrictEqual(unknown.code, 0);
    assert.match(unknown.stderr, /review-round/, "unknown --type message");

    const missing = runReport(dir, ["--spec", SPEC_REL]);
    assert.notStrictEqual(missing.code, 0);
    assert.match(missing.stderr, /review-round/, "missing --type message");

    const help = runReport(dir, ["--help"]);
    assert.strictEqual(help.code, 0, `stderr: ${help.stderr}`);
    assert.match(help.stdout, /review-round/, "help() usage line");
  } finally {
    cleanup(dir);
  }
});

test("the top-of-file USAGE line lists review-round", () => {
  const dir = makeTempProject();
  try {
    // Both the missing-`--type` and unknown-`--type` paths print USAGE first.
    for (const argv of [
      ["--spec", SPEC_REL],
      ["--type", "bogus", "--spec", SPEC_REL],
    ]) {
      const r = runReport(dir, argv);
      assert.match(
        r.stderr,
        /usage: adev report --type <[^>]*review-round[^>]*>/,
        `USAGE line must list review-round (argv: ${argv.join(" ")})`,
      );
    }
  } finally {
    cleanup(dir);
  }
});

test("the --type vocabulary is derived from one exported constant, not four strings", () => {
  const src = readFileSync(join(PROJECT_ROOT, "lib/cli/report.mjs"), "utf8");
  const m = src.match(/export const REPORT_TYPES = Object\.freeze\(\[([^\]]+)\]\)/);
  assert.ok(m, "REPORT_TYPES must be the single source of truth for the --type vocabulary");
  const types = m[1]
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  assert.deepStrictEqual(
    types.slice().sort(),
    ["intervention", "plan-task", "review-round", "reviewer", "step", "validator"],
    "exactly the six types the dispatcher accepts",
  );
  assert.ok(
    !/plan-task\|intervention(?!\s*['"]?\s*\])/.test(
      src.replace(/REPORT_TYPES[^\n]*/g, ""),
    ),
    "the four usage/error strings must be derived from REPORT_TYPES, not literal",
  );
});
