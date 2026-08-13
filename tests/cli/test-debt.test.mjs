// CLI contract for `adev test-debt scan` (Audit Pass 23).
//
// Spec: .context-index/specs/features/maintenance/hygiene-test-debt.spec.md

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { PLUGIN_ROOT, createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const CLI = join(PLUGIN_ROOT, "cli", "index.mjs");

function adev(args, cwd) {
  return spawnSync(process.execPath, [CLI, "test-debt", ...args], { cwd, encoding: "utf8" });
}

function scaffold(files) {
  const dir = createTempDir();
  writeFixture(
    dir,
    ".context-index/manifest.yaml",
    ["hygiene:", "  source_roots:", "    - lib/", "  coverage_exclude:", '    - "tests/**"', ""].join("\n"),
  );
  for (const [rel, body] of Object.entries(files)) writeFixture(dir, rel, body);
  return dir;
}

describe("adev test-debt", () => {
  test("is registered in the verb registry", () => {
    // The registry listing is printed on the no-verb path (exit 1).
    const r = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /^\s*test-debt\s*$/m);
  });

  test("bare verb prints usage and exits 1", () => {
    const dir = scaffold({});
    try {
      const r = adev([], dir);
      assert.equal(r.status, 1);
      assert.match(r.stdout + r.stderr, /adev test-debt scan/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--help exits 0 and lists the five detector codes", () => {
    const dir = scaffold({});
    try {
      const r = adev(["--help"], dir);
      assert.equal(r.status, 0);
      for (const code of [
        "APPEND_CHAIN",
        "REV_NUMBERED",
        "PLAN_TASK_STRUCTURED",
        "DEAD_TEST_REFERENCE",
        "PROSE_ASSERTION",
      ]) {
        assert.match(r.stdout, new RegExp(code));
      }
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("an unknown subcommand exits 1", () => {
    const dir = scaffold({});
    try {
      const r = adev(["frobnicate"], dir);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /unknown subcommand/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("scan exits 0 with findings — hygiene is advisory, never blocking", () => {
    const dir = scaffold({ "tests/a_rev4.test.mjs": "assert.ok(1);" });
    try {
      const r = adev(["scan", "--json"], dir);
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.verdict, "WARN");
      assert.ok(out.findings.length > 0);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--json emits a single parseable document and nothing else", () => {
    const dir = scaffold({ "tests/a.test.mjs": "assert.ok(1);" });
    try {
      const r = adev(["scan", "--json"], dir);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout.trim());
      assert.equal(typeof out.scannedFileCount, "number");
      assert.ok(Array.isArray(out.findings));
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("human output labels findings as candidates, never defects", () => {
    const dir = scaffold({ "tests/a_rev4.test.mjs": "assert.ok(1);" });
    try {
      const r = adev(["scan"], dir);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /candidate/i);
      assert.match(r.stdout, /advisory/i);
      assert.doesNotMatch(r.stdout, /\bmust fix\b|\bbroken\b/i);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--detector with an unknown code exits 1 and lists the valid set", () => {
    const dir = scaffold({ "tests/a.test.mjs": "assert.ok(1);" });
    try {
      const r = adev(["scan", "--detector", "NONSENSE"], dir);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /UNKNOWN_DETECTOR/);
      assert.match(r.stderr, /APPEND_CHAIN/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--root outside the project root is refused", () => {
    const dir = scaffold({ "tests/a.test.mjs": "assert.ok(1);" });
    try {
      const r = adev(["scan", "--root", "../.."], dir);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /PATH_OUTSIDE_ROOT/);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("--root narrows the scan subtree", () => {
    const dir = scaffold({ "tests/a.test.mjs": "assert.ok(1);", "other/b.test.mjs": "assert.ok(1);" });
    try {
      const all = JSON.parse(adev(["scan", "--json"], dir).stdout);
      const narrowed = JSON.parse(adev(["scan", "--root", "tests", "--json"], dir).stdout);
      assert.equal(all.scannedFileCount, 2);
      assert.equal(narrowed.scannedFileCount, 1);
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("invalid manifest config exits 1 with INVALID_TEST_DEBT_CONFIG", () => {
    const dir = createTempDir();
    try {
      writeFixture(
        dir,
        ".context-index/manifest.yaml",
        ["hygiene:", "  source_roots:", "    - lib/", "  test_debt:", "    append_chain_threshold: 1", ""].join("\n"),
      );
      writeFixture(dir, "tests/a.test.mjs", "assert.ok(1);");
      const r = adev(["scan"], dir);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /INVALID_TEST_DEBT_CONFIG/);
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("dogfood — the pass against this repository", () => {
  test("discovers the real suite rather than silently matching nothing", () => {
    const r = adev(["scan", "--json"], PLUGIN_ROOT);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.ok(
      out.scannedFileCount > 300,
      `expected the real suite (hundreds of files), got ${out.scannedFileCount} — the glob matcher is broken`,
    );
  });

  test("surfaces real append chains and prose-assertion files in this repo", () => {
    const r = adev(["scan", "--json"], PLUGIN_ROOT);
    const out = JSON.parse(r.stdout);
    assert.ok(
      out.summary.APPEND_CHAIN > 0,
      "this repo has known append chains; zero means extraction is broken, not that the repo is clean",
    );
    assert.ok(
      out.summary.PROSE_ASSERTION > 0,
      "this repo has known prose-assertion files; zero means Class B extraction is broken",
    );
  });
});
