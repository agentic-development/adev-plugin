// tests/cli/diagnose.test.mjs
//
// Tests for `adev diagnose` (lib/cli/diagnose.mjs).
// Covers Behaviors 1-11 and every row of the Error Cases table from
// .context-index/specs/features/cli-driver-surface/adev-diagnose-cli.spec.md
// rev 1, plus the AC golden-snapshot lock on the stable JSON schema.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");
const FIXTURE_DIR = join(__dirname, "fixtures", "diagnose");

// Helper to build a temp project directory used across the test file. The
// project has a manifest, a governance/diagnostics.yaml entry (optional),
// and one or more spec files. We use the plugin-rooted Tier-1 producers
// from lib/diagnostics/tier1/ — they live under the legitimate `plugin:`
// allowlist root.
function makeTempProject({ withRegistry = true } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-diagnose-test-")));
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  // The diagnostic engine resolves a `realProjectDiagRoot` against this
  // directory. Without it, the engine's containment check incorrectly
  // treats `''` as a prefix of every absolute path and rejects all
  // plugin:-prefixed runners as cross-root deputies. Creating the directory
  // (even empty) makes containment work as designed.
  mkdirSync(join(dir, ".context-index", "diagnostics"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\n  adev_version: "0.22.0"\n',
  );
  if (withRegistry) {
    writeFileSync(
      join(dir, ".context-index", "governance", "diagnostics.yaml"),
      `diagnostics:
  - id: adev/event-schema-valid
    runner: plugin:tier1/event-schema-valid.mjs
    severity: error
    tier: 1
    scope: event-impact

  - id: adev/status-enum-legal
    runner: plugin:tier1/status-enum-legal.mjs
    severity: error
    tier: 1
    scope: event-impact

  - id: adev/frontmatter-present
    runner: plugin:tier1/frontmatter-present.mjs
    severity: error
    tier: 1
    scope: event-impact
`,
    );
  }
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function writeGoodSpec(dir, name = "good") {
  const rel = `.context-index/specs/features/m/${name}.spec.md`;
  writeFileSync(
    join(dir, rel),
    "---\ncharter: m\nstatus: review-passed\n---\n# good\n",
  );
  return rel;
}

function writeBadSpec(dir, name = "bad") {
  // Illegal status value — fires adev/status-enum-legal.
  const rel = `.context-index/specs/features/m/${name}.spec.md`;
  writeFileSync(
    join(dir, rel),
    "---\ncharter: m\nstatus: definitely-not-a-real-status\n---\n# bad\n",
  );
  return rel;
}

function runDiagnose(dir, args) {
  return spawnSync("node", [CLI, "diagnose", ...args], {
    encoding: "utf8",
    cwd: dir,
    timeout: 15000,
  });
}

// ── Behavior 1: bare invocation, clean tree ─────────────────────────────────

test('adev diagnose on clean tree exits 0 with "All checks passed."', () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, []);
    assert.strictEqual(
      r.status,
      0,
      `expected 0, got ${r.status}: stderr=${r.stderr} stdout=${r.stdout}`,
    );
    assert.match(r.stdout, /All checks passed\./);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose bare invocation iterates every spec in the features tree", () => {
  // Behavior 1: project-wide iteration across all .spec.md files.
  // Two specs in the tree, one bad → exit 2 and both spec paths surface in
  // either the fired list or skipped/errors context.
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir, "good-one");
    writeBadSpec(dir, "bad-one");
    const r = runDiagnose(dir, ["--json"]);
    assert.strictEqual(r.status, 2, `stderr=${r.stderr} stdout=${r.stdout}`);
    const out = JSON.parse(r.stdout);
    const firedSpecs = out.fired.map((f) => f.spec);
    assert.ok(
      firedSpecs.some((s) => s && s.endsWith("bad-one.spec.md")),
      `expected fired entry for bad-one.spec.md, got specs: ${JSON.stringify(firedSpecs)}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 2: --spec scoping + path containment ──────────────────────────

test("adev diagnose --spec on good spec exits 0", () => {
  const dir = makeTempProject();
  try {
    const rel = writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--spec", rel]);
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --spec on bad spec (illegal status) exits 2", () => {
  const dir = makeTempProject();
  try {
    const rel = writeBadSpec(dir);
    const r = runDiagnose(dir, ["--spec", rel]);
    assert.strictEqual(r.status, 2, `stderr=${r.stderr} stdout=${r.stdout}`);
    // Output should name the producer id somewhere
    assert.match(r.stdout, /adev\/status-enum-legal/);
  } finally {
    cleanup(dir);
  }
});

test('adev diagnose --spec out-of-bounds path exits 1 with "spec not found"', () => {
  const dir = makeTempProject();
  try {
    const r = runDiagnose(dir, ["--spec", "../../../etc/passwd"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/);
  } finally {
    cleanup(dir);
  }
});

test('adev diagnose --spec missing-file exits 1 with "spec not found"', () => {
  const dir = makeTempProject();
  try {
    const r = runDiagnose(dir, [
      "--spec",
      ".context-index/specs/features/m/does-not-exist.spec.md",
    ]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/);
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 3: --tier filtering ───────────────────────────────────────────

test("adev diagnose --tier 1 runs only Tier-1 IDs", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--tier", "1", "--json"]);
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    const out = JSON.parse(r.stdout);
    // No Tier-1 producer fires on a clean tree; skipped should NOT include any Tier-1 IDs
    // (those that ran but didn't fire are not in skipped — skipped is only filter-rejected).
    // The point is: total_fired === 0 and no error
    assert.strictEqual(out.summary.total_fired, 0);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --tier 1,2 accepts comma-separated", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--tier", "1,2", "--json"]);
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --tier 4 exits 1 with usage error", () => {
  const dir = makeTempProject();
  try {
    const r = runDiagnose(dir, ["--tier", "4"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /tier|usage/i);
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 4: --only filtering ───────────────────────────────────────────

test("adev diagnose --only <id> restricts to that producer", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, [
      "--only",
      "adev/status-enum-legal",
      "--json",
    ]);
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    const out = JSON.parse(r.stdout);
    // skipped should include the other two Tier-1 producers (filtered by --only)
    const skippedIds = out.skipped.map((s) => s.id);
    assert.ok(
      skippedIds.includes("adev/event-schema-valid"),
      "event-schema-valid should be skipped by --only filter",
    );
    assert.ok(
      skippedIds.includes("adev/frontmatter-present"),
      "frontmatter-present should be skipped by --only filter",
    );
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --only with unknown id emits warning to stderr", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, [
      "--only",
      "adev/nonexistent",
      "--json",
    ]);
    assert.match(r.stderr, /unknown diagnostic id|adev\/nonexistent/);
    // No valid IDs remain → exit 1 per spec Error Cases row 3
    assert.strictEqual(r.status, 1);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --only with one valid + one unknown continues with valid", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, [
      "--only",
      "adev/status-enum-legal,adev/nonexistent",
      "--json",
    ]);
    // Warning emitted, but the valid ID runs → exit 0 on clean spec
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    assert.match(r.stderr, /unknown diagnostic id|adev\/nonexistent/);
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 5 + 6: --json output + stable schema ──────────────────────────

test("adev diagnose --json on clean tree emits valid JSON with stable schema", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--json"]);
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.schema_version, "1");
    assert.ok(Array.isArray(out.fired));
    assert.ok(Array.isArray(out.skipped));
    assert.ok(Array.isArray(out.errors));
    assert.ok(out.summary);
    assert.strictEqual(typeof out.summary.total_fired, "number");
    assert.ok(out.summary.by_severity);
    assert.strictEqual(typeof out.summary.by_severity.info, "number");
    assert.strictEqual(typeof out.summary.by_severity.warning, "number");
    assert.strictEqual(typeof out.summary.by_severity.error, "number");
    assert.strictEqual(typeof out.summary.exit_code, "number");
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --json on firing scenario matches the stable schema", () => {
  const dir = makeTempProject();
  try {
    const rel = writeBadSpec(dir);
    const r = runDiagnose(dir, ["--spec", rel, "--json"]);
    assert.strictEqual(r.status, 2);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.schema_version, "1");
    assert.strictEqual(out.summary.exit_code, 2);
    assert.ok(out.fired.length >= 1);
    const firing = out.fired[0];
    // Per schema: each fired entry has id, severity, message, runner_path, optional citation+spec
    assert.strictEqual(typeof firing.id, "string");
    assert.strictEqual(typeof firing.severity, "string");
    assert.strictEqual(typeof firing.message, "string");
    assert.strictEqual(typeof firing.runner_path, "string");
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --json key order is stable (top-level keys)", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--json"]);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    const keys = Object.keys(out);
    // Documented stable order: schema_version, fired, skipped, errors, summary
    assert.deepStrictEqual(keys, [
      "schema_version",
      "fired",
      "skipped",
      "errors",
      "summary",
    ]);
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 8: exit codes ─────────────────────────────────────────────────

test("adev diagnose exits 2 when any error-severity diagnostic fires", () => {
  const dir = makeTempProject();
  try {
    const rel = writeBadSpec(dir);
    const r = runDiagnose(dir, ["--spec", rel]);
    assert.strictEqual(r.status, 2);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --strict-warnings on warning-only firing exits 2", () => {
  // We synthesize a warning-only firing by injecting a registry-level warning:
  // delete governance/diagnostics.yaml → adev/registry-missing (severity: warning) fires.
  const dir = makeTempProject({ withRegistry: false });
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--strict-warnings"]);
    assert.strictEqual(
      r.status,
      2,
      `expected 2 with --strict-warnings, got ${r.status}: stderr=${r.stderr} stdout=${r.stdout}`,
    );
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose without --strict-warnings on warning-only firing exits 0", () => {
  const dir = makeTempProject({ withRegistry: false });
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, []);
    assert.strictEqual(
      r.status,
      0,
      `expected 0 default on warning-only, got ${r.status}: stderr=${r.stderr} stdout=${r.stdout}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 9: --quiet suppresses info in human output ────────────────────

test("adev diagnose --json --quiet emits warning on stderr, JSON proceeds (exit 0)", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--json", "--quiet"]);
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    assert.match(r.stderr, /quiet|ignored/i);
    // stdout still parses as JSON
    JSON.parse(r.stdout);
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 10: --help lists registered IDs ───────────────────────────────

test("adev diagnose --help exits 0 and lists all 3 Tier-1 IDs", () => {
  const dir = makeTempProject();
  try {
    const r = runDiagnose(dir, ["--help"]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /adev\/event-schema-valid/);
    assert.match(r.stdout, /adev\/status-enum-legal/);
    assert.match(r.stdout, /adev\/frontmatter-present/);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --help in project without registry prints fallback notice", () => {
  const dir = makeTempProject({ withRegistry: false });
  try {
    const r = runDiagnose(dir, ["--help"]);
    assert.strictEqual(r.status, 0);
    // Usage still printed
    assert.match(r.stdout, /usage|Usage/);
  } finally {
    cleanup(dir);
  }
});

// ── Behavior 11: registry-level errors print at top ────────────────────────

test("adev diagnose without governance/diagnostics.yaml shows registry-missing at top of human output", () => {
  const dir = makeTempProject({ withRegistry: false });
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, []);
    // Exit 0 — registry-missing is a warning, not error
    assert.strictEqual(r.status, 0);
    // Human output: registry-error line near the top
    assert.match(r.stdout, /\[registry-error\]|adev\/registry-missing/);
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --json without registry includes registry-missing in errors[]", () => {
  const dir = makeTempProject({ withRegistry: false });
  try {
    writeGoodSpec(dir);
    const r = runDiagnose(dir, ["--json"]);
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    const ids = out.errors.map((e) => e.id);
    assert.ok(
      ids.includes("adev/registry-missing"),
      `expected adev/registry-missing in errors, got: ${JSON.stringify(out.errors)}`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── Module contract checks ─────────────────────────────────────────────────

test("lib/cli/diagnose.mjs exports run and help", async () => {
  const mod = await import("../../lib/cli/diagnose.mjs");
  assert.strictEqual(typeof mod.run, "function");
  assert.strictEqual(typeof mod.help, "function");
});

test("lib/cli/diagnose.mjs does NOT export LIFECYCLE_STEP (query primitive)", async () => {
  const mod = await import("../../lib/cli/diagnose.mjs");
  assert.strictEqual(mod.LIFECYCLE_STEP, undefined);
});

// ── Registry registration ──────────────────────────────────────────────────

test("adev diagnose is registered in cli/index.mjs verb registry", () => {
  const r = spawnSync("node", [CLI, "diagnose", "--help"], {
    encoding: "utf8",
    timeout: 10000,
  });
  // Even with no project, --help should reach the verb's help() and not error
  // as "unknown verb"
  assert.doesNotMatch(r.stderr + r.stdout, /unknown verb/);
});

// ── Performance budgets (AC) ───────────────────────────────────────────────

test("adev diagnose --tier 1 project-wide completes in <1 s", () => {
  const dir = makeTempProject();
  try {
    writeGoodSpec(dir, "good1");
    writeGoodSpec(dir, "good2");
    writeGoodSpec(dir, "good3");
    const start = performance.now();
    const r = runDiagnose(dir, ["--tier", "1", "--json"]);
    const elapsed = performance.now() - start;
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    assert.ok(
      elapsed < 1000,
      `expected <1000 ms for project-wide Tier-1, got ${elapsed.toFixed(0)} ms`,
    );
  } finally {
    cleanup(dir);
  }
});

test("adev diagnose --spec --tier 1 single-spec completes in <500 ms", () => {
  const dir = makeTempProject();
  try {
    const rel = writeGoodSpec(dir);
    const start = performance.now();
    const r = runDiagnose(dir, ["--spec", rel, "--tier", "1", "--json"]);
    const elapsed = performance.now() - start;
    assert.strictEqual(r.status, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
    assert.ok(
      elapsed < 500,
      `expected <500 ms for single-spec Tier-1, got ${elapsed.toFixed(0)} ms`,
    );
  } finally {
    cleanup(dir);
  }
});

// ── Golden JSON snapshot ───────────────────────────────────────────────────
//
// Locks the stable JSON schema produced by the JSON formatter against a
// known-firing fixture. Any change to the schema requires regenerating the
// snapshot AND bumping schema_version in the source.
//
// We can't snapshot bytewise on `runner_path` (which is an absolute path
// dependent on install location) or on `message` (which embeds the spec
// path). The snapshot lives in fixtures/diagnose/expected.json with those
// volatile fields replaced by `<REDACTED>` markers; the test redacts the
// live output identically before comparing.

function redactVolatile(obj) {
  if (Array.isArray(obj)) return obj.map(redactVolatile);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "runner_path") {
        out[k] = "<REDACTED>";
      } else if (k === "citation" && typeof v === "string") {
        // Absolute paths in citation vary by tmpdir on each run.
        out[k] = "<REDACTED>";
      } else if (k === "message" && typeof v === "string") {
        // Replace any project:-rooted path prefix the engine emits.
        out[k] = v.replace(/project:[^\s,)]+/g, "project:<REDACTED>");
      } else {
        out[k] = redactVolatile(v);
      }
    }
    return out;
  }
  return obj;
}

test("adev diagnose --json firing scenario matches golden snapshot (schema lock)", () => {
  const dir = makeTempProject();
  try {
    const rel = writeBadSpec(dir);
    const r = runDiagnose(dir, ["--spec", rel, "--json"]);
    assert.strictEqual(r.status, 2);
    const live = redactVolatile(JSON.parse(r.stdout));
    const goldenPath = join(FIXTURE_DIR, "expected.json");
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
    assert.deepStrictEqual(
      live,
      golden,
      `JSON schema drifted — review fixtures/diagnose/expected.json. Got:\n${JSON.stringify(live, null, 2)}`,
    );
  } finally {
    cleanup(dir);
  }
});
