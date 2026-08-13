// tests/lib/gates/doctor.test.mjs
//
// Unit tests for lib/gates/doctor.mjs — the `adev gate doctor` engine.
//
// Spec: .context-index/specs/features/unified-gates/gate-doctor.spec.md
// Plan-task: 1-8, 10
//
// Every fixture here is a synthetic project written to a temp dir. None of
// them is this repo, and none of them assumes adev-plugin's layout — the
// doctor exists to diagnose downstream projects, so the tests refuse to let
// it grow a dependency on its own repo's shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  runGateDoctor,
  expandShGlob,
  walkMatching,
  detectRunner,
  findCiConfigs,
  extractPlaceholders,
  extractReferencedPaths,
  resolveBinary,
  isGitignored,
  tokenize,
} from "../../../lib/gates/doctor.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../../helpers.mjs";

/** Write a gates.yaml with the given gate blocks (raw YAML fragments). */
function seedGates(dir, gatesYaml) {
  writeFixture(dir, ".context-index/governance/gates.yaml", gatesYaml);
}

/** Shorthand: a single deterministic fast gate with the given command. */
function seedSingleGate(dir, command, extra = "") {
  seedGates(
    dir,
    `gates:\n  - id: test\n    name: Test Suite\n    kind: deterministic\n    tier: fast\n    command: "${command}"\n${extra}`,
  );
}

/** All finding ids emitted by a report. */
function ids(report) {
  return report.findings.map((f) => f.id);
}

// ── Task 1: gate loading + finding model ────────────────────────────────────

test("no gates.yaml at all yields no-gates-configured, not a crash", async () => {
  const dir = createTempDir();
  try {
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(ids(report).includes("gate-doctor/no-gates-configured"));
    assert.equal(report.summary.errors, 0, "an unconfigured project is not a broken project");
  } finally {
    cleanupTempDir(dir);
  }
});

test("empty gates list yields no-gates-configured", async () => {
  const dir = createTempDir();
  try {
    seedGates(dir, "gates: []\n");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(ids(report).includes("gate-doctor/no-gates-configured"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("report carries schema_version, findings, runners, and summary", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "echo ok");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.equal(typeof report.schema_version, "string");
    assert.ok(Array.isArray(report.findings));
    assert.ok(Array.isArray(report.runners));
    assert.equal(typeof report.summary.errors, "number");
    assert.equal(typeof report.summary.warnings, "number");
  } finally {
    cleanupTempDir(dir);
  }
});

test("every finding carries id, severity, and message", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "definitely-not-a-real-binary-xyz --run");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(report.findings.length > 0);
    for (const f of report.findings) {
      assert.equal(typeof f.id, "string");
      assert.ok(["error", "warning", "info"].includes(f.severity), `bad severity ${f.severity}`);
      assert.equal(typeof f.message, "string");
      assert.ok(f.message.length > 0);
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test("the doctor never writes to the project (read-only postcondition)", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "npm test");
    const before = execFileSync("find", [dir, "-type", "f"], { encoding: "utf8" });
    await runGateDoctor({ projectRoot: dir });
    const after = execFileSync("find", [dir, "-type", "f"], { encoding: "utf8" });
    assert.equal(after, before);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 2: family (d) placeholders ─────────────────────────────────────────

test("extractPlaceholders finds every mustache occurrence", () => {
  assert.deepEqual(extractPlaceholders("{{ test_command }}"), ["{{ test_command }}"]);
  assert.deepEqual(extractPlaceholders("npm test"), []);
  assert.equal(extractPlaceholders("{{a}} && {{ b }}").length, 2);
});

test("unsubstituted placeholder in a gate command is an error finding", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "{{ test_command }}");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/unsubstituted-placeholder");
    assert.ok(f, "expected unsubstituted-placeholder");
    assert.equal(f.severity, "error");
    assert.equal(f.gate, "test");
    assert.match(f.message, /\{\{ test_command \}\}/);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 3: family (b) binary resolution ────────────────────────────────────

test("resolveBinary resolves a real PATH binary", () => {
  const r = resolveBinary("node --test", process.cwd());
  assert.equal(r.resolved, true);
});

test("resolveBinary reports an unresolvable binary", () => {
  const r = resolveBinary("definitely-not-a-real-binary-xyz", process.cwd());
  assert.equal(r.resolved, false);
  assert.equal(r.token, "definitely-not-a-real-binary-xyz");
});

test("resolveBinary treats shell builtins as resolved", () => {
  assert.equal(resolveBinary("cd build && npm test", process.cwd()).resolved, true);
  assert.equal(resolveBinary("echo hi", process.cwd()).resolved, true);
});

test("resolveBinary skips leading VAR=value assignments", () => {
  const r = resolveBinary("CI=1 NODE_ENV=test node --test", process.cwd());
  assert.equal(r.resolved, true);
});

test("resolveBinary honours project-local node_modules/.bin", () => {
  const dir = createTempDir();
  try {
    const bin = join(dir, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const exe = join(bin, "made-up-local-runner");
    writeFileSync(exe, "#!/bin/sh\nexit 0\n");
    chmodSync(exe, 0o755);
    const r = resolveBinary("made-up-local-runner --ci", dir);
    assert.equal(r.resolved, true, "a devDependency binary is not on the operator's global PATH");
  } finally {
    cleanupTempDir(dir);
  }
});

test("gate whose binary does not exist is an error finding", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "definitely-not-a-real-binary-xyz --run");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/binary-not-found");
    assert.ok(f);
    assert.equal(f.severity, "error");
  } finally {
    cleanupTempDir(dir);
  }
});

test("deterministic gate with an empty command warns; probabilistic gate does not", async () => {
  const dir = createTempDir();
  try {
    seedGates(
      dir,
      `gates:
  - id: lint
    kind: deterministic
    tier: fast
    command: ""
  - id: judge
    kind: probabilistic
    tier: fast
`,
    );
    const report = await runGateDoctor({ projectRoot: dir });
    const empties = report.findings.filter((x) => x.id === "gate-doctor/empty-command");
    assert.equal(empties.length, 1, "probabilistic gates legitimately carry no command");
    assert.equal(empties[0].gate, "lint");
    assert.equal(empties[0].severity, "warning");
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 4: family (e) referenced paths ─────────────────────────────────────

test("extractReferencedPaths recognises cd arguments and separator-bearing tokens", () => {
  assert.ok(extractReferencedPaths("cd build && npm test").includes("build"));
  assert.ok(extractReferencedPaths("pytest tests/unit").includes("tests/unit"));
  assert.equal(extractReferencedPaths("npm test").length, 0);
});

test("extractReferencedPaths ignores option flags", () => {
  const paths = extractReferencedPaths("jest --config=a/b.json --ci");
  assert.ok(!paths.includes("--ci"));
});

test("gate referencing a nonexistent path is an error finding", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "cd no-such-dir && npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/path-missing");
    assert.ok(f);
    assert.equal(f.severity, "error");
    assert.match(f.message, /no-such-dir/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("gate cd-ing into a gitignored directory is an error finding (the repo-C case)", async () => {
  const dir = createTempDir();
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(join(dir, "vendored-repo"), { recursive: true });
    writeFileSync(join(dir, "vendored-repo", ".keep"), "");
    writeFixture(dir, ".gitignore", "vendored-repo/\n");
    seedSingleGate(dir, "cd vendored-repo && pytest");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/path-gitignored");
    assert.ok(f, "a gate that cd's into a gitignored dir cannot execute for anyone else");
    assert.equal(f.severity, "error");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a gitignored build output entered AFTER a build step is a warning, not an error", async () => {
  const dir = createTempDir();
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", ".keep"), "");
    writeFixture(dir, ".gitignore", "dist/\n");
    seedSingleGate(dir, "npm run build && cd dist && npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/path-gitignored");
    assert.ok(f);
    assert.equal(f.severity, "warning", "an earlier step in the same command may build dist/");
    assert.equal(report.summary.errors, 0, "an ordinary build-then-test gate must not exit 2");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a path created by an earlier step is not reported missing", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "npm run build && cd dist && npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(
      !ids(report).includes("gate-doctor/path-missing"),
      "dist/ does not exist at analysis time because the build has not run",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("isGitignored degrades to false outside a git repo rather than throwing", () => {
  const dir = createTempDir();
  try {
    mkdirSync(join(dir, "somedir"), { recursive: true });
    assert.equal(isGitignored(dir, "somedir"), false);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 5: family (a) sh-globstar under-expansion ──────────────────────────

/**
 * Build a tree with test files at depth 1 and depth 2 below `tests/`.
 * `sh` sees only the depth-1 files through `tests/**\/*_test.py`; a true
 * recursive walk sees both.
 */
function seedNestedTests(dir) {
  writeFixture(dir, "tests/unit/a_test.py", "");
  writeFixture(dir, "tests/unit/b_test.py", "");
  writeFixture(dir, "tests/integration/deep/c_test.py", "");
  writeFixture(dir, "tests/integration/deep/d_test.py", "");
  writeFixture(dir, "tests/integration/deep/e_test.py", "");
}

test("expandShGlob treats ** as a single segment; walkMatching recurses", () => {
  const dir = createTempDir();
  try {
    seedNestedTests(dir);
    const sh = expandShGlob("tests/**/*_test.py", dir);
    const deep = walkMatching("tests/**/*_test.py", dir);
    assert.equal(sh.length, 2, "sh degrades ** to * — only tests/unit/*_test.py matches");
    assert.equal(deep.length, 5);
  } finally {
    cleanupTempDir(dir);
  }
});

test("glob under-expansion is an error finding reporting both counts", async () => {
  const dir = createTempDir();
  try {
    seedNestedTests(dir);
    seedSingleGate(dir, "pytest tests/**/*_test.py");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/glob-under-expansion");
    assert.ok(f, "this is the check that would have caught the adev-plugin finding");
    assert.equal(f.severity, "error");
    assert.match(f.message, /2/);
    assert.match(f.message, /5/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("a ** glob that expands identically produces no under-expansion finding", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, "tests/unit/a_test.py", "");
    seedSingleGate(dir, "pytest tests/**/*_test.py");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(!ids(report).includes("gate-doctor/glob-under-expansion"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("walkMatching skips node_modules and .git (SEC-4 budget)", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, "tests/a_test.py", "");
    writeFixture(dir, "node_modules/pkg/tests/b_test.py", "");
    writeFixture(dir, ".git/tests/c_test.py", "");
    const found = walkMatching("**/*_test.py", dir);
    assert.equal(found.length, 1);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 6: runner detection ────────────────────────────────────────────────

test("detectRunner recognises the shipped runner set", () => {
  assert.equal(detectRunner("pytest tests/").runner, "pytest");
  assert.equal(detectRunner("python -m pytest").runner, "pytest");
  assert.equal(detectRunner("jest --ci").runner, "jest");
  assert.equal(detectRunner("vitest run").runner, "vitest");
  assert.equal(detectRunner("go test ./...").runner, "go test");
  assert.equal(detectRunner("node --test tests/").runner, "node:test");
});

test("detectRunner returns null runner for something it does not know", () => {
  assert.equal(detectRunner("make check").runner, null);
});

test("node:test is recognised but has no collect-only query", () => {
  const d = detectRunner("node --test tests/");
  assert.equal(d.collectQuery, null, "node's runner has no collect-only mode");
});

test("an unrecognised runner warns rather than passing silently", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "make check");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/runner-unknown");
    assert.ok(f, "a doctor that silently passes on an unknown runner reproduces the bug it hunts");
    assert.equal(f.severity, "warning");
  } finally {
    cleanupTempDir(dir);
  }
});

test("node:test also warns runner-unknown because collection cannot be verified", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "node --test tests/");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(ids(report).includes("gate-doctor/runner-unknown"));
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 7: family (c) CI wiring ────────────────────────────────────────────

test("findCiConfigs finds github workflows", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".github/workflows/ci.yml", "jobs: {}\n");
    const found = findCiConfigs(dir);
    assert.equal(found.length, 1);
    assert.match(found[0].path, /ci\.yml$/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("findCiConfigs finds non-github providers", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".gitlab-ci.yml", "stages: []\n");
    writeFixture(dir, "Jenkinsfile", "pipeline {}\n");
    assert.equal(findCiConfigs(dir).length, 2);
  } finally {
    cleanupTempDir(dir);
  }
});

test("a project with no CI at all warns ci-config-missing (the repo-C case)", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/ci-config-missing");
    assert.ok(f);
    assert.equal(f.severity, "warning");
  } finally {
    cleanupTempDir(dir);
  }
});

test("a gate absent from CI warns ci-gate-not-invoked", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".github/workflows/ci.yml", "jobs:\n  build:\n    steps:\n      - run: npm run lint\n");
    seedSingleGate(dir, "pytest");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/ci-gate-not-invoked");
    assert.ok(f);
    assert.equal(f.gate, "test");
  } finally {
    cleanupTempDir(dir);
  }
});

test("`npm ci` in a workflow does not count as invoking an `npm test` gate", async () => {
  const dir = createTempDir();
  try {
    // The naive fallback — "does the CI text contain the executable token?" —
    // matches `npm ci` here and makes this finding unfirable on every
    // JavaScript project, the ecosystem it most needs to work in.
    writeFixture(
      dir,
      ".github/workflows/ci.yml",
      "jobs:\n  build:\n    steps:\n      - run: npm ci\n      - run: npm run lint\n",
    );
    seedSingleGate(dir, "npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(ids(report).includes("gate-doctor/ci-gate-not-invoked"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("`npm run test` in a workflow counts as invoking an `npm test` gate", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".github/workflows/ci.yml", "steps:\n  - run: npm run test\n");
    seedSingleGate(dir, "npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(!ids(report).includes("gate-doctor/ci-gate-not-invoked"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("a gate present in CI produces no ci-gate-not-invoked finding", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".github/workflows/ci.yml", "jobs:\n  build:\n    steps:\n      - run: npm test\n");
    seedSingleGate(dir, "npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(!ids(report).includes("gate-doctor/ci-gate-not-invoked"));
    assert.ok(!ids(report).includes("gate-doctor/ci-config-missing"));
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 8: --execute ───────────────────────────────────────────────────────

test("static mode spawns nothing even for a gate that would fail", async () => {
  const dir = createTempDir();
  try {
    const marker = join(dir, "side-effect");
    seedSingleGate(dir, `touch ${marker}`);
    await runGateDoctor({ projectRoot: dir });
    const { existsSync } = await import("node:fs");
    assert.equal(existsSync(marker), false, "the doctor is static by default");
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute with ADEV_GATE_DOCTOR already set refuses to spawn", async () => {
  const dir = createTempDir();
  try {
    const marker = join(dir, "side-effect");
    seedSingleGate(dir, `touch ${marker}`);
    const report = await runGateDoctor({
      projectRoot: dir,
      execute: true,
      env: { ...process.env, ADEV_GATE_DOCTOR: "1" },
    });
    const { existsSync } = await import("node:fs");
    assert.equal(existsSync(marker), false);
    const f = report.findings.find((x) => x.id === "gate-doctor/reentrant-execution-skipped");
    assert.ok(f, "the npm test -> doctor -> npm test cycle must terminate at depth one");
    assert.equal(f.severity, "warning");
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute runs a passing gate and reports no execution finding", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "true");
    const report = await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    assert.ok(!ids(report).includes("gate-doctor/gate-not-executable"));
    assert.ok(!ids(report).includes("gate-doctor/gate-failed"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute distinguishes 'ran and failed' from 'cannot run'", async () => {
  const dir = createTempDir();
  try {
    seedGates(
      dir,
      `gates:
  - id: fails
    kind: deterministic
    tier: fast
    command: "sh -c 'exit 3'"
  - id: absent
    kind: deterministic
    tier: fast
    command: "sh -c 'exit 127'"
`,
    );
    const report = await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    const failed = report.findings.find((x) => x.id === "gate-doctor/gate-failed");
    assert.ok(failed, "a gate that ran and failed is a real signal but not the doctor's");
    assert.equal(failed.severity, "warning");
    const notExec = report.findings.find((x) => x.id === "gate-doctor/gate-not-executable");
    assert.ok(notExec, "exit 127 means the gate cannot run at all");
    assert.equal(notExec.severity, "error");
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute sets ADEV_GATE_DOCTOR in the spawned environment", async () => {
  const dir = createTempDir();
  try {
    const out = join(dir, "seen");
    seedSingleGate(dir, `sh -c 'printf %s $ADEV_GATE_DOCTOR > ${out}'`);
    await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    const { readFileSync, existsSync } = await import("node:fs");
    assert.ok(existsSync(out));
    assert.equal(readFileSync(out, "utf8"), "1");
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute times out a hanging gate as not-executable", async () => {
  const dir = createTempDir();
  try {
    seedSingleGate(dir, "sleep 30");
    const report = await runGateDoctor({
      projectRoot: dir,
      execute: true,
      timeoutMs: 400,
      env: {},
    });
    const f = report.findings.find((x) => x.id === "gate-doctor/gate-not-executable");
    assert.ok(f);
    assert.match(f.message, /timed out|timeout/i);
  } finally {
    cleanupTempDir(dir);
  }
});

test("gate output is never echoed into findings (SEC-3)", async () => {
  const dir = createTempDir();
  try {
    // The secret is produced at RUNTIME and never appears in the gate command
    // itself, so anything that surfaces it came from the runner's stdout.
    writeFixture(dir, "secret.txt", "SUPERSECRETTOKEN\n");
    seedSingleGate(dir, "sh -c 'cat secret.txt; exit 3'");
    const report = await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    const blob = JSON.stringify(report);
    assert.ok(!blob.includes("SUPERSECRETTOKEN"), "the doctor records status, not runner output");
    // ...and it did run the gate, so the assertion above is not vacuous.
    assert.ok(ids(report).includes("gate-doctor/gate-failed"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute diffs runner collection against disk and reports the gap", async () => {
  const dir = createTempDir();
  try {
    // A stand-in for jest that implements only --listTests, and deliberately
    // reports one of the two test files on disk. Zero-dep: it is a shell
    // script, not a package.
    const bin = join(dir, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const exe = join(bin, "jest");
    writeFileSync(exe, `#!/bin/sh\necho "$PWD/src/a.test.js"\n`);
    chmodSync(exe, 0o755);

    writeFixture(dir, "src/a.test.js", "");
    writeFixture(dir, "src/nested/b.test.js", "");
    seedSingleGate(dir, "jest --ci");

    const report = await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    const f = report.findings.find((x) => x.id === "gate-doctor/collection-gap");
    assert.ok(f, "b.test.js is on disk and the runner never sees it");
    assert.equal(f.severity, "error");
    assert.match(f.message, /nested\/b\.test\.js/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("--execute reports no-tests-collected when the runner sees nothing at all", async () => {
  const dir = createTempDir();
  try {
    const bin = join(dir, "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    const exe = join(bin, "jest");
    writeFileSync(exe, "#!/bin/sh\nexit 0\n");
    chmodSync(exe, 0o755);

    writeFixture(dir, "src/a.test.js", "");
    seedSingleGate(dir, "jest --ci");

    const report = await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    assert.ok(ids(report).includes("gate-doctor/no-tests-collected"));
  } finally {
    cleanupTempDir(dir);
  }
});

// ── package.json script indirection ─────────────────────────────────────────
//
// The adev-plugin finding did NOT live in the gate command — the gate command
// was `npm test`. It lived one hop away in package.json's scripts.test. A
// doctor that only reads the literal gate command misses the bug that
// motivated it.

test("a ** glob hidden in package.json scripts.test is still caught", async () => {
  const dir = createTempDir();
  try {
    seedNestedTests(dir);
    writeFixture(
      dir,
      "package.json",
      JSON.stringify({ name: "x", scripts: { test: "node --test tests/**/*_test.py" } }),
    );
    seedSingleGate(dir, "npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/glob-under-expansion");
    assert.ok(f, "the glob is one hop away, in the npm script body");
    assert.match(f.citation, /package\.json:scripts\.test/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("resolveCommandChain follows npm run <script> and stops on a cycle", async () => {
  const { resolveCommandChain } = await import("../../../lib/gates/doctor.mjs");
  const dir = createTempDir();
  try {
    writeFixture(
      dir,
      "package.json",
      JSON.stringify({ name: "x", scripts: { ci: "npm run ci" } }),
    );
    const chain = resolveCommandChain("npm run ci", dir);
    assert.ok(chain.length >= 2);
    assert.ok(chain.length < 6, "a self-referential script must not loop forever");
  } finally {
    cleanupTempDir(dir);
  }
});

test("runner detection also follows the npm script body", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, "package.json", JSON.stringify({ name: "x", scripts: { test: "pytest tests" } }));
    writeFixture(dir, "tests/.keep", "");
    seedSingleGate(dir, "npm test");
    const report = await runGateDoctor({ projectRoot: dir });
    const r = report.runners.find((x) => x.gate === "test");
    assert.equal(r.runner, "pytest");
    assert.match(r.source, /package\.json/);
  } finally {
    cleanupTempDir(dir);
  }
});

// ── argv-list gate commands ─────────────────────────────────────────────────
//
// lib/domains/merge-gates.mjs enforces argv-list `command` (SEC-2), so every
// correctly-authored gate arrives here as `["npm", "test"]` rather than as a
// string. Coercing that to "" made the doctor report `empty-command` and skip
// every command-level check for exactly the gates the framework ships.

test("an argv-list gate command is analysed rather than reported as empty", async () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, "package.json", JSON.stringify({ name: "x", scripts: { test: "pytest tests" } }));
    writeFixture(dir, "tests/.keep", "");
    seedGates(
      dir,
      `gates:
  - id: test
    kind: deterministic
    tier: fast
    command: [npm, test]
`,
    );
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(
      !ids(report).includes("gate-doctor/empty-command"),
      "an argv list is a command, not the absence of one",
    );
    const r = report.runners.find((x) => x.gate === "test");
    assert.equal(r.runner, "pytest", "the npm test -> scripts.test chain resolves as for a string");
    assert.match(r.source, /package\.json/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("command-level checks run on an argv gate (binary resolution)", async () => {
  const dir = createTempDir();
  try {
    seedGates(
      dir,
      `gates:
  - id: test
    kind: deterministic
    tier: fast
    command: [definitely-not-a-real-binary-xyz]
`,
    );
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/binary-not-found");
    assert.ok(f, "the checks now run against argv gates instead of being skipped");
    assert.equal(f.severity, "error");
    assert.equal(f.gate, "test");
  } finally {
    cleanupTempDir(dir);
  }
});

test("genuinely empty commands still warn: [], {}, a number, and a missing key", async () => {
  const dir = createTempDir();
  try {
    seedGates(
      dir,
      `gates:
  - id: empty-list
    kind: deterministic
    tier: fast
    command: []
  - id: flow-map
    kind: deterministic
    tier: fast
    command: {}
  - id: number
    kind: deterministic
    tier: fast
    command: 42
  - id: missing
    kind: deterministic
    tier: fast
`,
    );
    const report = await runGateDoctor({ projectRoot: dir });
    const empties = report.findings.filter((x) => x.id === "gate-doctor/empty-command");
    assert.deepEqual(
      empties.map((f) => f.gate).sort(),
      ["empty-list", "flow-map", "missing", "number"],
      "a gate with nothing to run is still diagnosed as such",
    );
    for (const f of empties) assert.equal(f.severity, "warning");
  } finally {
    cleanupTempDir(dir);
  }
});

test("normaliseCommand returns string commands unchanged", async () => {
  const { normaliseCommand } = await import("../../../lib/gates/doctor.mjs");
  assert.equal(normaliseCommand("npm test"), "npm test");
  assert.equal(normaliseCommand("cd dist && npm test"), "cd dist && npm test");
  assert.equal(normaliseCommand(""), "");
});

test("normaliseCommand yields '' for anything that is not a string or string list", async () => {
  const { normaliseCommand } = await import("../../../lib/gates/doctor.mjs");
  assert.equal(normaliseCommand([]), "");
  assert.equal(normaliseCommand({}), "");
  assert.equal(normaliseCommand(42), "");
  assert.equal(normaliseCommand(undefined), "");
  assert.equal(normaliseCommand(null), "");
  assert.equal(normaliseCommand(["npm", 42]), "", "a non-string element is not coerced into a token");
});

test("normaliseCommand round-trips a token containing whitespace through tokenize", async () => {
  const { normaliseCommand } = await import("../../../lib/gates/doctor.mjs");
  assert.deepEqual(
    tokenize(normaliseCommand(["sh", "-c", "exit 3"])),
    ["sh", "-c", "exit 3"],
    "three argv tokens must stay three tokens, not become four",
  );
});

test("normaliseCommand does not manufacture a shell operator from an argv token", async () => {
  const { normaliseCommand } = await import("../../../lib/gates/doctor.mjs");
  assert.deepEqual(
    tokenize(normaliseCommand(["echo", "&&"])),
    ["echo", "&&"],
    "the '&&' is a literal argument, so the join must quote it rather than emit an operator",
  );
  assert.equal(resolveBinary(normaliseCommand(["echo", "&&"]), process.cwd()).token, "echo");
});

test("an argv token spelling an operator stays inside the FIRST sub-command", async () => {
  const dir = createTempDir();
  try {
    // `path-missing` is only reported for segmentIndex 0 — a path a later
    // sub-command would create is legitimately absent at analysis time. So the
    // finding firing here is proof that 'no-such-dir/x' did NOT land in a
    // second sub-command: the quoted '&&' is an argument, not an operator.
    seedGates(
      dir,
      `gates:
  - id: test
    kind: deterministic
    tier: fast
    command: [echo, "&&", no-such-dir/x]
`,
    );
    const report = await runGateDoctor({ projectRoot: dir });
    const f = report.findings.find((x) => x.id === "gate-doctor/path-missing");
    assert.ok(f, "an argv gate is exactly one sub-command, so every token is analysed in it");
    assert.equal(f.severity, "error");
    assert.match(f.message, /no-such-dir\/x/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("negative control: an UNQUOTED operator in a string command still splits it", async () => {
  const dir = createTempDir();
  try {
    // The same shape as the test above, minus the quoting. The path now belongs
    // to the second sub-command, so path-missing is correctly suppressed. If
    // this starts failing, quote provenance has been over-applied and real
    // `a && b` gates stopped splitting.
    seedSingleGate(dir, "echo hi && no-such-dir/x");
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(
      !ids(report).includes("gate-doctor/path-missing"),
      "an unquoted && still starts a new sub-command",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ── SEC-2: the join must never hand `sh -c` an expansion ────────────────────

test("normaliseCommand single-quotes a token containing a quote, never double-quotes it", async () => {
  const { normaliseCommand } = await import("../../../lib/gates/doctor.mjs");
  const out = normaliseCommand(["touch", "a'b $(touch marker)"]);
  assert.equal(out, "touch 'a'\\''b $(touch marker)'");
  assert.ok(!out.includes('"'), "a double-quoted token still interpolates $(), backticks and \\");
  assert.match(out, /'[^']*\$\(touch marker\)'/, "the substitution sits inside single quotes");
});

test("an argv token carrying a command substitution is not executed under --execute", async () => {
  const dir = createTempDir();
  try {
    seedGates(
      dir,
      `gates:
  - id: test
    kind: deterministic
    tier: fast
    command: [touch, "a'b $(touch marker)"]
`,
    );
    await runGateDoctor({ projectRoot: dir, execute: true, env: {} });
    const { existsSync } = await import("node:fs");
    assert.equal(
      existsSync(join(dir, "marker")),
      false,
      "SEC-2: an argv token is data, and the join must not turn it into code",
    );
    // ...and the gate really did run, so the assertion above is not vacuous.
    assert.equal(existsSync(join(dir, "a'b $(touch marker)")), true);
  } finally {
    cleanupTempDir(dir);
  }
});

test("resolveCommandChain skips flag tokens after `npm run` (the --if-present idiom)", async () => {
  const { resolveCommandChain } = await import("../../../lib/gates/doctor.mjs");
  const dir = createTempDir();
  try {
    writeFixture(
      dir,
      "package.json",
      JSON.stringify({ name: "x", scripts: { "test:integration": "pytest tests/integration" } }),
    );
    const chain = resolveCommandChain("npm run --if-present test:integration", dir);
    assert.equal(chain.length, 2, "the script name is test:integration, not --if-present");
    assert.equal(chain[1].source, "package.json:scripts.test:integration");
    assert.equal(chain[1].command, "pytest tests/integration");
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Portability: the doctor must work on projects that are not this repo ────

test("runs to completion with no manifest, no git repo, and no node_modules", async () => {
  const dir = createTempDir();
  try {
    seedGates(
      dir,
      `gates:
  - id: pytest
    kind: deterministic
    tier: fast
    command: "pytest tests/"
  - id: lint
    kind: deterministic
    tier: fast
    command: "ruff check ."
`,
    );
    const report = await runGateDoctor({ projectRoot: dir });
    assert.ok(Array.isArray(report.findings));
    assert.equal(typeof report.summary.errors, "number");
  } finally {
    cleanupTempDir(dir);
  }
});

test("--gates pointing outside the project root is rejected", async () => {
  const dir = createTempDir();
  try {
    await assert.rejects(
      () => runGateDoctor({ projectRoot: dir, gatesPath: "../../../etc/passwd" }),
      /escape|contain/i,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ── Task 10: validate registry acceptance ───────────────────────────────────

test("check-14 is accepted as a deterministic-check by the validate registry loader", async () => {
  // `deterministic-check` is gated behind a bundled ID allowlist
  // (BUNDLED_DETERMINISTIC_IDS); an unlisted ID is rejected with
  // DETERMINISTIC_PROJECT. This asserts the new check joined that set.
  const { loadValidateConfig } = await import("../../../lib/governance/validate-config.mjs");
  const dir = createTempDir();
  try {
    writeFixture(
      dir,
      ".context-index/governance/validate.yaml",
      `checks:
  - id: validate.check-14-gate-executability
    name: "Gate Executability"
    kind: deterministic-check
    severity: warning
    prompt: plugin:validate/checks/validate.check-14-gate-executability.md
`,
    );
    const cfg = loadValidateConfig(dir);
    // Assert the WHOLE error list is empty, not just that DETERMINISTIC_PROJECT
    // is absent: a PROMPT_NOT_FOUND on the check's prompt URI would also drop
    // the entry, and the check would silently never run in real validate.
    assert.equal(cfg.errors.length, 0, JSON.stringify(cfg.errors));
    assert.ok(cfg.checks.some((c) => c.id === "validate.check-14-gate-executability"));
  } finally {
    cleanupTempDir(dir);
  }
});
