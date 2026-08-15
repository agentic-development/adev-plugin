// tests/cli/boundaries-check.test.mjs
//
// `adev boundaries check [--json]` — lib/cli/boundaries.mjs.
//
// Exit-code convention (mirrors `adev gate doctor`'s 0/1/2):
//   0  SKIP, PASS or WARN
//   2  FAIL (an error-severity finding, or a pattern that blew its budget)
//   1  argument error or a configuration refusal (INVALID_BOUNDARY_PATTERN)

import { test, describe } from "node:test";
import assert from "node:assert";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  cleanupTempDir,
  createTempDir,
  createTempGitRepo,
  writeFixture,
  PLUGIN_ROOT,
} from "../helpers.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");
const BOUNDARIES_PATH = ".context-index/governance/boundaries.yaml";

function runVerb(args, cwd) {
  return spawnSync("node", [CLI, "boundaries", ...args], {
    encoding: "utf8",
    cwd,
    timeout: 60_000,
  });
}

function seed(dir, yaml) {
  writeFixture(dir, ".context-index/manifest.yaml", 'project:\n  name: t\n');
  writeFixture(dir, BOUNDARIES_PATH, yaml);
}

function withDir(fn) {
  return () => {
    const dir = createTempDir();
    try {
      fn(dir);
    } finally {
      cleanupTempDir(dir);
    }
  };
}

describe("adev boundaries check", () => {
  test("is registered in the CLI verb table", async () => {
    const { VERB_REGISTRY } = await import("../../cli/index.mjs");
    assert.ok(VERB_REGISTRY.has("boundaries"));
  });

  test(
    "--json on an empty registry emits SKIP and exits 0",
    withDir((dir) => {
      seed(dir, "boundaries: []\n");
      const r = runVerb(["check", "--json", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      const doc = JSON.parse(r.stdout);
      assert.strictEqual(doc.verdict, "SKIP");
      assert.match(doc.reason, /no boundary rules declared/);
      assert.deepEqual(doc.findings, []);
      assert.strictEqual(doc.summary.errors, 0);
      assert.strictEqual(doc.summary.warnings, 0);
    }),
  );

  test(
    "an error-severity violation exits 2 and names file, rule and line",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: no-bad\n    severity: error\n    pattern: 'BAD'\n");
      writeFixture(dir, "src/a.mjs", "ok\nBAD here\n");
      const r = runVerb(["check", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 2, r.stderr);
      assert.match(r.stdout, /src\/a\.mjs/);
      assert.match(r.stdout, /no-bad/);
      assert.match(r.stdout, /BAD here/);
    }),
  );

  test(
    "a warning-severity violation exits 0 with verdict WARN",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: soft\n    severity: warning\n    pattern: 'TODO'\n");
      writeFixture(dir, "src/a.mjs", "// TODO\n");
      const r = runVerb(["check", "--json", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      const doc = JSON.parse(r.stdout);
      assert.strictEqual(doc.verdict, "WARN");
      assert.strictEqual(doc.summary.warnings, 1);
      assert.strictEqual(doc.summary.errors, 0);
    }),
  );

  test(
    "a clean tree exits 0 with verdict PASS",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: soft\n    severity: error\n    pattern: 'NEVER'\n");
      writeFixture(dir, "src/a.mjs", "clean\n");
      const r = runVerb(["check", "--json", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.strictEqual(JSON.parse(r.stdout).verdict, "PASS");
    }),
  );

  test(
    "an invalid pattern exits 1 with INVALID_BOUNDARY_PATTERN and no findings",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: broken\n    severity: error\n    pattern: '([unclosed'\n");
      writeFixture(dir, "src/a.mjs", "anything\n");
      const r = runVerb(["check", "--json", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /INVALID_BOUNDARY_PATTERN/);
      assert.match(r.stderr, /broken/);
      assert.strictEqual(r.stdout.trim(), "");
    }),
  );

  test(
    "--changed accepts a comma-separated list and repeated flags",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: r\n    severity: error\n    pattern: 'BAD'\n");
      writeFixture(dir, "src/a.mjs", "BAD\n");
      writeFixture(dir, "src/b.mjs", "BAD\n");
      writeFixture(dir, "src/c.mjs", "BAD\n");
      const r = runVerb(
        ["check", "--json", "--changed", "src/a.mjs,src/b.mjs", "--changed", "src/c.mjs"],
        dir,
      );
      assert.strictEqual(r.status, 2);
      const doc = JSON.parse(r.stdout);
      assert.deepEqual(
        doc.findings.map((f) => f.file),
        ["src/a.mjs", "src/b.mjs", "src/c.mjs"],
      );
    }),
  );

  test("--all evaluates every tracked file, including ones the diff does not name", () => {
    const dir = createTempGitRepo();
    try {
      // `B[A]D` matches "BAD" but not the registry line that spells it, so the
      // tracked boundaries.yaml does not trip its own rule under --all.
      seed(dir, "boundaries:\n  - id: no-bad\n    severity: error\n    pattern: 'B[A]D'\n");
      writeFixture(dir, "src/committed.mjs", "BAD in a committed file\n");
      execSync("git add -A && git commit -m seed", { cwd: dir, stdio: "ignore" });
      // Not tracked, so `--all` must not see it; the default set would.
      writeFixture(dir, "src/untracked.mjs", "BAD in an untracked file\n");

      const r = runVerb(["check", "--all", "--json"], dir);
      assert.strictEqual(r.status, 2, r.stderr);
      const doc = JSON.parse(r.stdout);
      assert.strictEqual(doc.verdict, "FAIL");
      assert.deepEqual(
        doc.findings.map((f) => f.file),
        ["src/committed.mjs"],
      );
      assert.strictEqual(doc.summary.errors, 1);
      // README.md, boundaries.yaml, manifest.yaml and src/committed.mjs.
      assert.strictEqual(doc.summary.files_checked, 4);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--all on a clean tracked tree exits 0", () => {
    const dir = createTempGitRepo();
    try {
      seed(dir, "boundaries:\n  - id: never\n    severity: error\n    pattern: 'NEVER[_]PRESENT'\n");
      writeFixture(dir, "src/clean.mjs", "fine\n");
      execSync("git add -A && git commit -m seed", { cwd: dir, stdio: "ignore" });
      const r = runVerb(["check", "--all", "--json"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.strictEqual(JSON.parse(r.stdout).verdict, "PASS");
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("rules declared with nothing changed is SKIP at exit 0, never PASS", () => {
    const dir = createTempGitRepo();
    try {
      seed(dir, "boundaries:\n  - id: live\n    severity: error\n    pattern: 'B[A]D'\n");
      writeFixture(dir, "src/a.mjs", "BAD\n");
      execSync("git add -A && git commit -m seed", { cwd: dir, stdio: "ignore" });
      // Nothing changed since HEAD and nothing untracked: the default set is empty.
      const r = runVerb(["check", "--json"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      const doc = JSON.parse(r.stdout);
      assert.strictEqual(doc.verdict, "SKIP");
      assert.match(doc.reason, /changed-file set is empty/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test(
    "--changed refuses a path escaping the project root",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: r\n    severity: error\n    pattern: 'BAD'\n");
      const r = runVerb(["check", "--changed", "../../etc/passwd"], dir);
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /escapes the project root/);
    }),
  );

  test(
    "an unknown sub-verb exits 1 with usage",
    withDir((dir) => {
      seed(dir, "boundaries: []\n");
      const r = runVerb(["frobnicate"], dir);
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /usage: adev boundaries check/);
    }),
  );

  test(
    "an unknown flag exits 1 with usage",
    withDir((dir) => {
      seed(dir, "boundaries: []\n");
      const r = runVerb(["check", "--nope"], dir);
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /usage: adev boundaries check/);
    }),
  );

  test(
    "the HUMAN report names disabled rules and their reasons in a mixed registry",
    withDir((dir) => {
      // `--json` already carried `disabled`; `printReport` did not, so in a
      // registry where some rules are on and some off the operator saw no trace
      // of the disabled ones. Behavior 5 requires the REPORT to record a
      // disabled entry with its reason, not just the loaded config.
      seed(
        dir,
        "boundaries:\n" +
          "  - id: live\n    severity: error\n    pattern: 'BAD'\n" +
          "  - id: parked\n    severity: error\n    pattern: 'ALSOBAD'\n" +
          "    enabled: false\n    disabled_reason: legacy module exempt\n",
      );
      writeFixture(dir, "src/a.mjs", "clean\n");
      const r = runVerb(["check", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.match(r.stdout, /Disabled rules/i);
      assert.match(r.stdout, /parked/);
      assert.match(r.stdout, /legacy module exempt/);
      assert.doesNotMatch(r.stdout, /\blive\b/);
    }),
  );

  test(
    "the HUMAN report surfaces DISABLED_WITHOUT_REASON",
    withDir((dir) => {
      seed(
        dir,
        "boundaries:\n" +
          "  - id: live\n    severity: error\n    pattern: 'BAD'\n" +
          "  - id: parked\n    severity: error\n    pattern: 'ALSOBAD'\n    enabled: false\n",
      );
      writeFixture(dir, "src/a.mjs", "clean\n");
      const r = runVerb(["check", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.match(r.stdout, /DISABLED_WITHOUT_REASON/);
    }),
  );

  test(
    "a report with no disabled rules and no schema warnings says nothing about either",
    withDir((dir) => {
      seed(dir, "boundaries:\n  - id: live\n    severity: error\n    pattern: 'BAD'\n");
      writeFixture(dir, "src/a.mjs", "clean\n");
      const r = runVerb(["check", "--changed", "src/a.mjs"], dir);
      assert.strictEqual(r.status, 0, r.stderr);
      assert.doesNotMatch(r.stdout, /Disabled rules/i);
      assert.doesNotMatch(r.stdout, /Registry warnings/i);
    }),
  );

  test("--help documents the sub-verb, flags and exit codes", () => {
    const r = spawnSync("node", [CLI, "boundaries", "check", "--help"], {
      encoding: "utf8",
      cwd: PLUGIN_ROOT,
      timeout: 30_000,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /adev boundaries check/);
    assert.match(r.stdout, /--json/);
    assert.match(r.stdout, /--changed/);
    assert.match(r.stdout, /--all/);
    assert.match(r.stdout, /Exit codes/);
  });

  // Until Task 14 this asserted SKIP on an EMPTY registry — the state this
  // project shipped while `boundaries.yaml` was a placeholder. Task 14 populated
  // it from the constitution's mechanically-decidable anti-patterns, so the
  // honest end-to-end assertion is now the opposite one: the shipped rules load,
  // run over every tracked file, and find nothing. A finding here means a rule
  // is mis-scoped — the fix belongs in `boundaries.yaml`, not in the file it
  // flagged. `tests/governance/boundary-rules-corpus.test.mjs` proves each rule
  // still fires on its own violating fixture, so this silence is not vacuous.
  test("this repository's own boundaries.yaml runs clean over the whole tree", () => {
    const r = runVerb(["check", "--all", "--json"], PLUGIN_ROOT);
    assert.strictEqual(r.status, 0, r.stderr);
    const doc = JSON.parse(r.stdout);
    assert.deepStrictEqual(doc.findings, []);
    assert.strictEqual(doc.verdict, "PASS");
    assert.ok(doc.summary.files_checked > 100, `only ${doc.summary.files_checked} file(s) checked`);
    // The one rule this project declares and deliberately switched off stays
    // visible with its reason rather than vanishing (Invariant 5).
    assert.ok(doc.disabled.some((d) => d.id === "no-manual-version-bump" && d.disabled_reason));
  });
});
