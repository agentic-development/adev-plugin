// tests/cli/report-gate-outcomes.test.mjs
//
// Tests for `adev report --type validator --gate-outcomes <json|@path>` and
// `--manifest-sha <sha>` (lib/cli/report.mjs) — Task 5 of the Explicit
// Governance Registries plan. Closes review blocker SA-1 (CLI half).
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Plan-task: 5
//
// Task 4 (commit 68bc76b0) added `gate_outcomes` / `manifest_sha` to
// `reportValidator` in lib/lifecycle-state.mjs behind a private
// `validateGateOutcomes`. The CLI verb MUST NOT duplicate those validation
// semantics — it parses `--gate-outcomes` (JSON literal or `@path`) and
// delegates. Payload construction stays in the lib (same discipline as "the
// lib stamps severity; we never compute it here").
//
// Contract:
//   --gate-outcomes <json>   JSON array literal, OR `@<path>` to a JSON file
//                            (long gate sets exceed argv length limits).
//   --manifest-sha <sha>     Accompanying source-manifest sha.
//
// Exit codes:
//   0  event appended
//   1  malformed JSON, unreadable/missing `@path`, `@path` escaping the
//      project root, non-validator `--type`, or a lib-side schema refusal
//      (surfaced as a plain message — never a stack dump)
//
// The validator id used throughout is `validate.check-2-spec-compliance`,
// which IS declared in templates/domains/software/validate.yaml.
// `validate.check-1-quality-gates` (the id the plan sketch used) is NOT
// declared until Task 6 and would emit a real UNKNOWN_VALIDATOR_DEFAULTED
// warning on stderr, polluting the stderr assertions below.

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

const VALIDATOR = "validate.check-2-spec-compliance";
const SPEC_REL = ".context-index/specs/features/m/gate-outcomes.spec.md";
const SLUG = "gate-outcomes";

/**
 * @param {object} [opts]
 * @param {boolean} [opts.strictEventDiagnostics] When true, write
 *   `lifecycle.event_diagnostics: strict` into the manifest AND register the
 *   Tier-1 `adev/frontmatter-present` diagnostic at `error` severity in
 *   `.context-index/governance/diagnostics.yaml`. The spec this suite writes
 *   has no `---` frontmatter, so the diagnostic fires and `appendEvent`
 *   throws a `GateError` before the log write. Mirrors `makeProject({mode:
 *   'strict'})` in tests/lib/lifecycle-state-event-diagnostics.test.mjs.
 */
function makeTempProject(opts = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-gate-outcomes-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  const manifest = ['project:\n  name: t\n  adev_version: "0.22.0"\n'];
  if (opts.strictEventDiagnostics) {
    manifest.push("lifecycle:\n  event_diagnostics: strict\n");
    mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
    writeFileSync(
      join(dir, ".context-index", "governance", "diagnostics.yaml"),
      [
        "diagnostics:",
        "  - id: adev/frontmatter-present",
        "    runner: plugin:tier1/frontmatter-present.mjs",
        "    severity: error",
        "    tier: 1",
        "    scope: event-impact",
        "",
      ].join("\n"),
    );
  }
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), manifest.join(""));
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

// Base flags for a well-formed `--type validator` invocation.
function baseArgs(extra = []) {
  return [
    "--type",
    "validator",
    "--spec",
    SPEC_REL,
    "--step",
    "validate",
    "--validator",
    VALIDATOR,
    "--verdict",
    "PASS",
    ...extra,
  ];
}

function readLog(dir) {
  const logPath = join(dir, ".context-index", "lifecycle-state", `${SLUG}.jsonl`);
  const body = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  return body
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function lastEvent(dir) {
  const events = readLog(dir);
  assert.strictEqual(events.length, 1, "expected exactly one event in the log");
  return events[0];
}

const ONE_OUTCOME =
  '[{"id":"test","verdict":"pass","tier":"fast","command_sha":"9f2b1c"}]';

// ── Happy path: JSON literal ─────────────────────────────────────────────

test("--gate-outcomes writes the array through to the event", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(
      dir,
      baseArgs(["--manifest-sha", "abc1234", "--gate-outcomes", ONE_OUTCOME]),
    );
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stderr, "");
    const ev = lastEvent(dir);
    assert.strictEqual(ev.event, "validator_report");
    assert.strictEqual(ev.gate_outcomes.length, 1);
    assert.strictEqual(ev.gate_outcomes[0].id, "test");
    assert.strictEqual(ev.gate_outcomes[0].verdict, "pass");
    assert.strictEqual(ev.gate_outcomes[0].tier, "fast");
    // command_sha is plumbed end to end and never stripped.
    assert.strictEqual(ev.gate_outcomes[0].command_sha, "9f2b1c");
    assert.strictEqual(ev.manifest_sha, "abc1234");
  } finally {
    cleanup(dir);
  }
});

// ── Happy path: @path form ───────────────────────────────────────────────

test("--gate-outcomes @<path> reads the array from a file and produces the identical event", () => {
  const dirA = makeTempProject();
  const dirB = makeTempProject();
  try {
    const a = runReport(
      dirA,
      baseArgs(["--manifest-sha", "abc1234", "--gate-outcomes", ONE_OUTCOME]),
    );
    assert.strictEqual(a.code, 0, `stderr: ${a.stderr}`);

    writeFileSync(join(dirB, "outcomes.json"), ONE_OUTCOME);
    const b = runReport(
      dirB,
      baseArgs([
        "--manifest-sha",
        "abc1234",
        "--gate-outcomes",
        "@outcomes.json",
      ]),
    );
    assert.strictEqual(b.code, 0, `stderr: ${b.stderr}`);
    assert.strictEqual(b.stderr, "");

    const evA = lastEvent(dirA);
    const evB = lastEvent(dirB);
    assert.deepStrictEqual(evB.gate_outcomes, evA.gate_outcomes);
    assert.strictEqual(evB.manifest_sha, evA.manifest_sha);
  } finally {
    cleanup(dirA);
    cleanup(dirB);
  }
});

// ── Malformed input ──────────────────────────────────────────────────────

test("malformed --gate-outcomes JSON exits 1 with a named error", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs(["--gate-outcomes", "{not json"]));
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /--gate-outcomes/);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("--gate-outcomes @<path> pointing at a missing file exits 1 with a named error", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs(["--gate-outcomes", "@nope.json"]));
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /--gate-outcomes/);
    assert.match(r.stderr, /nope\.json/);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("--gate-outcomes @<path> pointing at a file containing invalid JSON exits 1 with a named error", () => {
  const dir = makeTempProject();
  try {
    writeFileSync(join(dir, "bad.json"), "{not json");
    const r = runReport(dir, baseArgs(["--gate-outcomes", "@bad.json"]));
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /--gate-outcomes/);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("--gate-outcomes @<path> escaping the project root exits 1 with a named error", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs(["--gate-outcomes", "@../escape.json"]));
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /--gate-outcomes/);
    assert.match(r.stderr, /escapes project root/);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

// ── Lib-side schema refusal surfaces as exit 1, not a stack dump ─────────

test("gate outcome violating validateGateOutcomes exits 1 with the underlying error surfaced", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(
      dir,
      baseArgs([
        "--gate-outcomes",
        '[{"id":"test","verdict":"maybe","tier":"fast"}]',
      ]),
    );
    assert.strictEqual(r.code, 1);
    // Underlying lib message is surfaced verbatim …
    assert.match(r.stderr, /gate_outcomes\[0\]\.verdict/);
    assert.match(r.stderr, /maybe/);
    // … but not as a stack trace dump.
    assert.doesNotMatch(r.stderr, /\n\s+at /);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

// ── Exit-code contract of the try/catch around reportValidator ───────────
//
// The catch added by this task sits between `reportValidator` and
// `cli/index.mjs::dispatch`. Two classes of throw must NOT be flattened into
// the friendly exit-1 message:
//
//   * `GateError` (`code: "GATE_BLOCKED"`) — must reach dispatch, which exits
//     **2**. Before this task the catch did not exist and exit 2 was
//     structurally guaranteed; it now rests on a single rethrow, so it is
//     pinned here.
//   * anything without `code === "EVENT_SCHEMA_INVALID"` — genuine crashes
//     (FS_ERROR, TypeError, engine bugs) must keep their stack, which only
//     dispatch prints.

test("a strict-mode Tier-1 diagnostic block exits 2 and writes no log line", () => {
  const dir = makeTempProject({ strictEventDiagnostics: true });
  try {
    const r = runReport(
      dir,
      baseArgs([
        "--gate-outcomes",
        '[{"id":"test","verdict":"pass","tier":"fast"}]',
      ]),
    );
    // GATE_BLOCKED is rethrown past the verb's catch; dispatch exits 2.
    assert.strictEqual(r.code, 2, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /event blocked by Tier-1 diagnostics/);
    assert.match(r.stderr, /adev\/frontmatter-present/);
    // strict mode rejects BEFORE the file write — disk state unchanged.
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("an unexpected (non-EVENT_SCHEMA_INVALID) failure keeps its stack trace", () => {
  const dir = makeTempProject();
  try {
    // Make the log path a directory so `appendFileSync` fails with EISDIR,
    // which the lib rewraps as an `FS_ERROR` — a throw that is neither
    // GATE_BLOCKED nor EVENT_SCHEMA_INVALID, i.e. exactly the "real crash"
    // class the verb must not flatten.
    mkdirSync(join(dir, ".context-index", "lifecycle-state", `${SLUG}.jsonl`), {
      recursive: true,
    });
    const r = runReport(dir, baseArgs(["--gate-outcomes", "[]"]));
    assert.strictEqual(r.code, 1);
    // dispatch (not the verb) handled it, so the stack survived.
    assert.match(
      r.stderr,
      /\n\s+at /,
      "an uncoded/internal error must propagate to dispatch with its stack intact",
    );
  } finally {
    cleanup(dir);
  }
});

// ── Field independence and empty-array distinctness ──────────────────────

test("--manifest-sha alone (without --gate-outcomes) round-trips", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs(["--manifest-sha", "deadbee"]));
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stderr, "");
    const ev = lastEvent(dir);
    assert.strictEqual(ev.manifest_sha, "deadbee");
    assert.strictEqual(
      "gate_outcomes" in ev,
      false,
      "absent --gate-outcomes must leave the field off the payload entirely",
    );
  } finally {
    cleanup(dir);
  }
});

test("--gate-outcomes '[]' round-trips as [] and is NOT collapsed to absent", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, baseArgs(["--gate-outcomes", "[]"]));
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stderr, "");
    const ev = lastEvent(dir);
    assert.strictEqual(
      "gate_outcomes" in ev,
      true,
      "empty array is 'ran, produced no outcomes' — distinct from absent",
    );
    assert.deepStrictEqual(ev.gate_outcomes, []);
  } finally {
    cleanup(dir);
  }
});

// ── Validator-only flags ─────────────────────────────────────────────────

test("--gate-outcomes with a non-validator --type exits 1 with a named error", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, [
      "--type",
      "step",
      "--spec",
      SPEC_REL,
      "--step",
      "validate",
      "--status",
      "completed",
      "--gate-outcomes",
      ONE_OUTCOME,
    ]);
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /--gate-outcomes/);
    assert.match(r.stderr, /--type validator/);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("--manifest-sha with a non-validator --type exits 1 with a named error", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, [
      "--type",
      "step",
      "--spec",
      SPEC_REL,
      "--step",
      "validate",
      "--status",
      "completed",
      "--manifest-sha",
      "abc1234",
    ]);
    assert.strictEqual(r.code, 1);
    assert.match(r.stderr, /--manifest-sha/);
    assert.match(r.stderr, /--type validator/);
    assert.deepStrictEqual(readLog(dir), []);
  } finally {
    cleanup(dir);
  }
});

// ── help() ───────────────────────────────────────────────────────────────

test("help() names both --gate-outcomes and --manifest-sha", () => {
  const dir = makeTempProject();
  try {
    const r = runReport(dir, ["--help"]);
    assert.strictEqual(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /--gate-outcomes/);
    assert.match(r.stdout, /@<path>/);
    assert.match(r.stdout, /--manifest-sha/);
  } finally {
    cleanup(dir);
  }
});
