// tests/cli/gate-doctor.test.mjs
//
// Subprocess tests for `adev gate doctor` (lib/cli/gate.mjs `doctor` sub-verb).
//
// Spec: .context-index/specs/features/unified-gates/gate-doctor.spec.md
// Plan-task: 9
//
// Real-subprocess invocation, mirroring tests/cli/verify.test.mjs and
// tests/cli/test-policy.test.mjs: the dispatcher only inspects a verb's
// return value to pick an exit code and never prints it, so asserting on
// actual stdout + exit status is the only honest check of the contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolvePath(__dirname, "..", "..", "cli", "index.mjs");

function runDoctor(cwd, args = []) {
  return spawnSync(process.execPath, [CLI, "gate", "doctor", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_GATE_DOCTOR: "" },
  });
}

function seedSingleGate(dir, command) {
  writeFixture(
    dir,
    ".context-index/governance/gates.yaml",
    `gates:\n  - id: test\n    kind: deterministic\n    tier: fast\n    command: "${command}"\n`,
  );
}

/** A healthy gate: argv form, the only form every consumer actually runs. */
function seedArgvGate(dir, argv) {
  writeFixture(
    dir,
    ".context-index/governance/gates.yaml",
    `gates:\n  - id: test\n    kind: deterministic\n    tier: fast\n    command: ` +
      `${JSON.stringify(argv)}\n`,
  );
}

test("exits 0 with no error-severity findings", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".github/workflows/ci.yml", "steps:\n  - run: npm test\n");
    // Argv form, not the string form the other fixtures use: a string-form
    // command is dropped by lib/domains/merge-gates.mjs, so since
    // `gate-doctor/shell-form-command` landed it is an error-severity finding
    // in its own right and this test's premise — a gate with nothing wrong
    // with it — requires the form the consumers accept.
    seedArgvGate(dir, ["npm", "test"]);
    const r = runDoctor(dir);
    assert.equal(r.status, 0, r.stderr);
  } finally {
    cleanupTempDir(dir);
  }
});

test("exits 2 when an error-severity finding fires", () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "{{ test_command }}");
    const r = runDoctor(dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
  } finally {
    cleanupTempDir(dir);
  }
});

test("exits 1 on an unknown flag", () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "npm test");
    const r = runDoctor(dir, ["--not-a-real-flag"]);
    assert.equal(r.status, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

test("--json emits a single parseable envelope on stdout", () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "definitely-not-a-real-binary-xyz");
    const r = runDoctor(dir, ["--json"]);
    const parsed = JSON.parse(r.stdout);
    assert.equal(typeof parsed.schema_version, "string");
    assert.ok(Array.isArray(parsed.findings));
    assert.ok(Array.isArray(parsed.runners));
    assert.ok(parsed.summary);
    assert.ok(parsed.findings.some((f) => f.id === "gate-doctor/binary-not-found"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("human-readable output names the failing gate", () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "{{ test_command }}");
    const r = runDoctor(dir);
    assert.match(r.stdout, /test/);
    assert.match(r.stdout, /placeholder/i);
  } finally {
    cleanupTempDir(dir);
  }
});

test("a project with no gates.yaml exits 0 and says so", () => {
  const dir = createTempDir();
  try {
    const r = runDoctor(dir, ["--json"]);
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.findings.some((f) => f.id === "gate-doctor/no-gates-configured"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("`adev gate` help mentions the doctor sub-verb", () => {
  const r = spawnSync(process.execPath, [CLI, "gate", "--help"], { encoding: "utf8" });
  assert.match(r.stdout, /doctor/);
});

test("`adev gate require` still works — the doctor did not break the sibling sub-verb", () => {
  const dir = createTempDir();
  try {
    const r = spawnSync(process.execPath, [CLI, "gate", "require", "--skill", "implement"], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(r.status, 1, "missing --spec is still an argument error, not a crash");
  } finally {
    cleanupTempDir(dir);
  }
});
