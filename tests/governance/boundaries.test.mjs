// tests/governance/boundaries.test.mjs
//
// Contract tests for lib/governance/boundaries.mjs — the pure boundary-rule
// evaluator behind `adev boundaries check` and /adev:validate Check 8.
//
// Spec: .context-index/specs/cross-cutting/explicit-governance-registries.spec.md
// Behaviors 1, 2; Error Cases INVALID_BOUNDARY_PATTERN / BOUNDARY_PATTERN_TIMEOUT;
// AC 12 (250 ms budget, 1 MB input cap), DDR-14 (binary skip), SEC-3, SEC-5.

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import {
  BINARY_SNIFF_BYTES,
  MAX_INPUT_BYTES,
  PER_FILE_BUDGET_MS,
  checkBoundaries,
} from "../../lib/governance/boundaries.mjs";

const BOUNDARIES_PATH = ".context-index/governance/boundaries.yaml";

/**
 * Write a boundaries.yaml holding `rules`.
 *
 * Patterns are emitted SINGLE-quoted: lib/profiles/yaml.mjs `unquote()` does not
 * process escape sequences, so a double-quoted `"console\\.log"` would survive
 * as a literal double backslash. Single quotes round-trip verbatim in both this
 * parser and real YAML.
 */
function seedRules(dir, rules) {
  if (rules.length === 0) {
    writeFixture(dir, BOUNDARIES_PATH, "boundaries: []\n");
    return;
  }
  const lines = ["boundaries:"];
  for (const r of rules) {
    lines.push(`  - id: ${r.id}`);
    lines.push(`    severity: ${r.severity}`);
    lines.push(`    pattern: '${r.pattern}'`);
    if (r.description) lines.push(`    description: '${r.description}'`);
    if (r.enabled === false) lines.push("    enabled: false");
    if (r.exclude) {
      lines.push("    exclude:");
      for (const g of r.exclude) lines.push(`      - '${g}'`);
    }
  }
  writeFixture(dir, BOUNDARIES_PATH, lines.join("\n") + "\n");
}

function withDir(fn) {
  return async () => {
    const dir = createTempDir();
    try {
      await fn(dir);
    } finally {
      cleanupTempDir(dir);
    }
  };
}

describe("checkBoundaries — rule loading", () => {
  test(
    "no rules declared records SKIP and dispatches nothing",
    withDir(async (dir) => {
      seedRules(dir, []);
      // A path that does not exist: if anything were read or dispatched, this
      // would throw or produce a finding. Neither happens — nothing is opened.
      const r = await checkBoundaries(dir, { changed: ["src/never-read.mjs"] });
      assert.strictEqual(r.verdict, "SKIP");
      assert.match(r.reason, /no boundary rules declared/);
      assert.deepEqual(r.findings, []);
    }),
  );

  test(
    "a missing boundaries.yaml is SKIP, not an error",
    withDir(async (dir) => {
      const r = await checkBoundaries(dir, { changed: [] });
      assert.strictEqual(r.verdict, "SKIP");
      assert.match(r.reason, /no boundary rules declared/);
    }),
  );

  test(
    "boundaries.yaml is marker-exempt: no materialized_at required",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "no-marker", severity: "warning", pattern: "zzz" }]);
      writeFixture(dir, "src/a.mjs", "clean\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      // Would have raised REGISTRY_NOT_MATERIALIZED had a marker guard been added.
      assert.strictEqual(r.verdict, "PASS");
    }),
  );

  test(
    "a rule with enabled: false does not fire",
    withDir(async (dir) => {
      seedRules(dir, [
        { id: "off", severity: "error", pattern: "FORBIDDEN", enabled: false },
      ]);
      writeFixture(dir, "src/a.mjs", "FORBIDDEN\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      assert.strictEqual(r.verdict, "SKIP");
      assert.match(r.reason, /no boundary rules declared/);
    }),
  );
});

describe("checkBoundaries — matching", () => {
  test(
    "an error-severity rule match FAILs naming file, rule and line",
    withDir(async (dir) => {
      seedRules(dir, [
        { id: "no-console", severity: "error", pattern: 'console\\.log' },
      ]);
      writeFixture(dir, "src/a.mjs", "const x = 1;\nconsole.log(x);\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      assert.strictEqual(r.verdict, "FAIL");
      assert.strictEqual(r.findings.length, 1);
      const f = r.findings[0];
      assert.strictEqual(f.file, "src/a.mjs");
      assert.strictEqual(f.ruleId, "no-console");
      assert.strictEqual(f.severity, "error");
      assert.strictEqual(f.line, 2);
      assert.strictEqual(f.matchedLine, "console.log(x);");
    }),
  );

  test(
    "a warning-severity rule match WARNs rather than FAILs",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "soft", severity: "warning", pattern: "TODO" }]);
      writeFixture(dir, "src/a.mjs", "// TODO: later\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      assert.strictEqual(r.verdict, "WARN");
      assert.strictEqual(r.findings[0].severity, "warning");
      assert.strictEqual(r.findings[0].line, 1);
    }),
  );

  test(
    "a rule with no exclude works",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "bare", severity: "error", pattern: "BAD" }]);
      writeFixture(dir, "scripts/x.mjs", "BAD\n");
      const r = await checkBoundaries(dir, { changed: ["scripts/x.mjs"] });
      assert.strictEqual(r.verdict, "FAIL");
      assert.strictEqual(r.findings.length, 1);
    }),
  );

  test(
    "exclude globs suppress a match",
    withDir(async (dir) => {
      seedRules(dir, [
        { id: "no-db", severity: "error", pattern: "prisma", exclude: ["src/db/**"] },
      ]);
      writeFixture(dir, "src/db/client.mjs", "import prisma from 'x';\n");
      const r = await checkBoundaries(dir, { changed: ["src/db/client.mjs"] });
      assert.strictEqual(r.verdict, "PASS");
      assert.deepEqual(r.findings, []);
    }),
  );

  test(
    "exclude with multiple globs suppresses each of them and only them",
    withDir(async (dir) => {
      seedRules(dir, [
        {
          id: "multi",
          severity: "error",
          pattern: "BAD",
          exclude: ["scripts/**", "**/*.test.mjs"],
        },
      ]);
      writeFixture(dir, "scripts/a.mjs", "BAD\n");
      writeFixture(dir, "tests/b.test.mjs", "BAD\n");
      writeFixture(dir, "src/c.mjs", "BAD\n");
      const r = await checkBoundaries(dir, {
        changed: ["scripts/a.mjs", "tests/b.test.mjs", "src/c.mjs"],
      });
      assert.strictEqual(r.verdict, "FAIL");
      assert.deepEqual(
        r.findings.map((f) => f.file),
        ["src/c.mjs"],
      );
    }),
  );

  test(
    "findings for multiple rules and files are ordered file-major, rule-minor",
    withDir(async (dir) => {
      seedRules(dir, [
        { id: "r1", severity: "warning", pattern: "alpha" },
        { id: "r2", severity: "warning", pattern: "beta" },
      ]);
      writeFixture(dir, "src/a.mjs", "alpha\nbeta\n");
      writeFixture(dir, "src/b.mjs", "beta\nalpha\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs", "src/b.mjs"] });
      assert.deepEqual(
        r.findings.map((f) => `${f.file}:${f.ruleId}:${f.line}`),
        ["src/a.mjs:r1:1", "src/a.mjs:r2:2", "src/b.mjs:r1:2", "src/b.mjs:r2:1"],
      );
      // Stable across repeated runs.
      const again = await checkBoundaries(dir, { changed: ["src/a.mjs", "src/b.mjs"] });
      assert.deepEqual(again.findings, r.findings);
    }),
  );

  test(
    "a changed path that no longer exists produces no finding",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "any", severity: "error", pattern: "x" }]);
      const r = await checkBoundaries(dir, { changed: ["src/deleted.mjs"] });
      assert.strictEqual(r.verdict, "PASS");
      assert.deepEqual(r.findings, []);
    }),
  );

  test(
    "a large changed-file list is practical",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "big", severity: "error", pattern: "NEVER_PRESENT" }]);
      const changed = [];
      for (let i = 0; i < 400; i++) {
        writeFixture(dir, `src/f${i}.mjs`, `export const n = ${i};\n`);
        changed.push(`src/f${i}.mjs`);
      }
      const t0 = Date.now();
      const r = await checkBoundaries(dir, { changed });
      assert.strictEqual(r.verdict, "PASS");
      assert.deepEqual(r.findings, []);
      assert.ok(Date.now() - t0 < 30_000, `400 files took ${Date.now() - t0}ms`);
    }),
  );
});

describe("checkBoundaries — refusals", () => {
  test(
    "an invalid pattern refuses before any file is evaluated",
    withDir(async (dir) => {
      seedRules(dir, [
        { id: "sound", severity: "error", pattern: "WOULD_MATCH" },
        { id: "broken", severity: "error", pattern: "([unclosed" },
      ]);
      writeFixture(dir, "src/a.mjs", "WOULD_MATCH\n");
      await assert.rejects(
        () => checkBoundaries(dir, { changed: ["src/a.mjs"] }),
        (err) => {
          assert.strictEqual(err.code, "INVALID_BOUNDARY_PATTERN");
          assert.match(err.message, /broken/);
          // No partial evaluation: the refusal carries no findings at all.
          assert.strictEqual(err.findings, undefined);
          return true;
        },
      );
    }),
  );

  test(
    "an invalid flags string is also INVALID_BOUNDARY_PATTERN",
    withDir(async (dir) => {
      writeFixture(
        dir,
        BOUNDARIES_PATH,
        "boundaries:\n  - id: badflags\n    severity: error\n    pattern: 'x'\n    flags: 'qq'\n",
      );
      writeFixture(dir, "src/a.mjs", "x\n");
      await assert.rejects(
        () => checkBoundaries(dir, { changed: ["src/a.mjs"] }),
        (err) => {
          assert.strictEqual(err.code, "INVALID_BOUNDARY_PATTERN");
          assert.match(err.message, /badflags/);
          return true;
        },
      );
    }),
  );

  test(
    "a rule missing an id or pattern is INVALID_BOUNDARY_PATTERN",
    withDir(async (dir) => {
      writeFixture(dir, BOUNDARIES_PATH, "boundaries:\n  - severity: error\n    pattern: 'x'\n");
      await assert.rejects(
        () => checkBoundaries(dir, { changed: [] }),
        (err) => {
          assert.strictEqual(err.code, "INVALID_BOUNDARY_PATTERN");
          return true;
        },
      );
    }),
  );

  test("a catastrophically-backtracking pattern terminates within budget", async () => {
    const dir = createTempDir();
    try {
      seedRules(dir, [{ id: "redos", severity: "error", pattern: "(a+)+$" }]);
      writeFixture(dir, "src/b.mjs", "a".repeat(40) + "!");
      const t0 = Date.now();
      const r = await checkBoundaries(dir, { changed: ["src/b.mjs"] });
      const elapsed = Date.now() - t0;
      assert.ok(elapsed < 5000, `worker was terminated, not awaited forever (${elapsed}ms)`);
      assert.match(JSON.stringify(r), /BOUNDARY_PATTERN_TIMEOUT/);
      assert.match(JSON.stringify(r), /redos/);
      // Fails closed.
      assert.strictEqual(r.verdict, "FAIL");
      const f = r.findings.find((x) => x.code === "BOUNDARY_PATTERN_TIMEOUT");
      assert.strictEqual(f.severity, "error");
      assert.strictEqual(f.file, "src/b.mjs");
      assert.strictEqual(f.ruleId, "redos");
    } finally {
      cleanupTempDir(dir);
    }
  });

  test("evaluation resumes after a timed-out rule", async () => {
    const dir = createTempDir();
    try {
      seedRules(dir, [
        { id: "redos", severity: "error", pattern: "(a+)+$" },
        { id: "after", severity: "warning", pattern: "SENTINEL" },
      ]);
      writeFixture(dir, "src/b.mjs", "a".repeat(40) + "!");
      writeFixture(dir, "src/c.mjs", "SENTINEL\n");
      const r = await checkBoundaries(dir, { changed: ["src/b.mjs", "src/c.mjs"] });
      assert.ok(r.findings.some((f) => f.code === "BOUNDARY_PATTERN_TIMEOUT"));
      assert.ok(
        r.findings.some((f) => f.ruleId === "after" && f.file === "src/c.mjs"),
        "the rules after the timed-out one were still evaluated",
      );
    } finally {
      cleanupTempDir(dir);
    }
  });
});

describe("checkBoundaries — input caps", () => {
  test(
    "an oversized file is a finding at rule severity, not silence",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "cap", severity: "error", pattern: "NOPE" }]);
      writeFixture(dir, "src/big.mjs", "");
      writeFileSync(join(dir, "src/big.mjs"), "x".repeat(MAX_INPUT_BYTES + 1));
      const r = await checkBoundaries(dir, { changed: ["src/big.mjs"] });
      assert.strictEqual(r.verdict, "FAIL");
      assert.strictEqual(r.findings.length, 1);
      const f = r.findings[0];
      assert.strictEqual(f.severity, "error");
      assert.strictEqual(f.file, "src/big.mjs");
      assert.strictEqual(f.ruleId, "cap");
      assert.match(f.message, /exceeds the input cap/);
    }),
  );

  test(
    "an oversized file under a warning rule is a WARN finding, not an error",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "softcap", severity: "warning", pattern: "NOPE" }]);
      writeFixture(dir, "src/big.mjs", "");
      writeFileSync(join(dir, "src/big.mjs"), "x".repeat(MAX_INPUT_BYTES + 1));
      const r = await checkBoundaries(dir, { changed: ["src/big.mjs"] });
      assert.strictEqual(r.verdict, "WARN");
      assert.strictEqual(r.findings[0].severity, "warning");
      assert.match(r.findings[0].message, /exceeds the input cap/);
    }),
  );

  test(
    "a binary file is skipped with an INFO note and no regex is run on it",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "bin", severity: "error", pattern: "MATCHME" }]);
      writeFileSync(
        join(dir, "blob.dat"),
        Buffer.concat([Buffer.from("MATCHME"), Buffer.from([0x00]), Buffer.from("MATCHME")]),
      );
      const r = await checkBoundaries(dir, { changed: ["blob.dat"] });
      assert.strictEqual(r.verdict, "PASS", "an INFO note does not make a verdict");
      assert.strictEqual(r.findings.length, 1);
      assert.strictEqual(r.findings[0].severity, "info");
      assert.strictEqual(r.findings[0].code, "BOUNDARY_BINARY_SKIPPED");
      assert.strictEqual(r.findings[0].file, "blob.dat");
      assert.ok(
        !r.findings.some((f) => f.ruleId === "bin" && f.severity === "error"),
        "no rule was evaluated against the binary content",
      );
    }),
  );

  test(
    "a NUL byte beyond the sniff window does not make a file binary",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "late", severity: "error", pattern: "MATCHME" }]);
      writeFileSync(
        join(dir, "late.dat"),
        Buffer.concat([
          Buffer.from("MATCHME\n"),
          Buffer.from("z".repeat(BINARY_SNIFF_BYTES)),
          Buffer.from([0x00]),
        ]),
      );
      const r = await checkBoundaries(dir, { changed: ["late.dat"] });
      assert.strictEqual(r.verdict, "FAIL");
      assert.strictEqual(r.findings[0].ruleId, "late");
    }),
  );

  test("the caps are named exported constants", () => {
    assert.strictEqual(MAX_INPUT_BYTES, 1024 * 1024);
    assert.strictEqual(PER_FILE_BUDGET_MS, 250);
    assert.strictEqual(BINARY_SNIFF_BYTES, 8192);
  });
});

describe("worker safety (SEC-5)", () => {
  const WORKER_SRC = readFileSync(
    join(PLUGIN_ROOT, "lib", "governance", "boundary-worker.mjs"),
    "utf8",
  );
  const EVALUATOR_SRC = readFileSync(
    join(PLUGIN_ROOT, "lib", "governance", "boundaries.mjs"),
    "utf8",
  );

  test("the worker source contains no eval and no Function constructor", () => {
    assert.ok(!/\beval\s*\(/.test(WORKER_SRC), "no eval() call");
    assert.ok(!/\beval\b\s*:/.test(WORKER_SRC), "no eval: option");
    assert.ok(!/\bnew\s+Function\b/.test(WORKER_SRC), "no new Function");
    assert.ok(!/\bFunction\s*\(/.test(WORKER_SRC), "no Function() call");
    assert.ok(/new RegExp\(/.test(WORKER_SRC), "the regex is built with new RegExp only");
  });

  test("the worker is a static file on disk, spawned by path", () => {
    assert.ok(!/eval\s*:\s*true/.test(EVALUATOR_SRC), "never new Worker(src, { eval: true })");
    assert.ok(!/\bnew\s+Function\b/.test(EVALUATOR_SRC), "no new Function in the evaluator");
    const call = EVALUATOR_SRC.match(/new Worker\(([^)]*)\)/s);
    assert.ok(call, "the evaluator spawns a Worker");
    assert.match(call[1], /WORKER_PATH/, "the first argument is a resolved file path");
    assert.ok(
      /boundary-worker\.mjs/.test(EVALUATOR_SRC),
      "the path names the static worker file",
    );
  });

  test("the worker file is importable as a URL from the evaluator's directory", () => {
    const url = new URL("../../lib/governance/boundary-worker.mjs", import.meta.url);
    assert.ok(readFileSync(fileURLToPath(url), "utf8").length > 0);
  });
});
