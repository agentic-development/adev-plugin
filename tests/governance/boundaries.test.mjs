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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanupTempDir, createTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";
import {
  BINARY_SNIFF_BYTES,
  MAX_INPUT_BYTES,
  PER_FILE_BUDGET_MS,
  checkBoundaries,
  evaluateTasks,
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
    if (r.flags) lines.push(`    flags: '${r.flags}'`);
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
    "rules declared against an empty changed set is SKIP, not PASS",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "live", severity: "error", pattern: "BAD" }]);
      writeFixture(dir, "src/a.mjs", "BAD\n");
      const r = await checkBoundaries(dir, { changed: [] });
      // A PASS here would assert that boundaries held; nothing was checked.
      assert.strictEqual(r.verdict, "SKIP");
      assert.match(r.reason, /changed-file set is empty/);
      assert.match(r.reason, /1 boundary rule\(s\) declared/);
      assert.deepEqual(r.findings, []);
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
      // Fixture maintenance (Task 13) — the SKIP is unchanged; its REASON was
      // wrong. "No boundary rules declared" was a false statement about a
      // registry that declares one and disables it, and it hid the only thing
      // an operator needs to know here. The disabled rule is now also visible
      // on the result. Full coverage: tests/governance/enabled-flag.test.mjs.
      assert.doesNotMatch(r.reason, /no boundary rules declared/);
      assert.match(r.reason, /disabled/);
      assert.deepEqual(r.disabled.map((d) => d.id), ["off"]);
      assert.deepEqual(r.findings, []);
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

describe("checkBoundaries — lazy content loading", () => {
  test(
    "a many-file tree spanning every outcome yields exactly the eager path's result",
    withDir(async (dir) => {
      // 80 files × 2 rules = 160 tasks, so evaluation crosses several chunks and
      // content is read chunk-at-a-time rather than all at once. The findings
      // must be byte-identical to what reading everything up front produced.
      seedRules(dir, [
        { id: "alpha", severity: "error", pattern: "ALPHA" },
        { id: "beta", severity: "warning", pattern: "BETA" },
      ]);
      const changed = [];
      for (let i = 0; i < 80; i++) {
        const file = `src/f${i}.mjs`;
        const marks = [];
        if (i === 7 || i === 71) marks.push("ALPHA");
        if (i === 12 || i === 71) marks.push("BETA");
        writeFixture(dir, file, `const i = ${i};\n${marks.join("\n")}\n`);
        changed.push(file);
      }
      writeFixture(dir, "src/big.mjs", "");
      writeFileSync(join(dir, "src/big.mjs"), "x".repeat(MAX_INPUT_BYTES + 1));
      changed.push("src/big.mjs");
      writeFileSync(
        join(dir, "src/blob.dat"),
        Buffer.concat([Buffer.from("ALPHA"), Buffer.from([0x00])]),
      );
      changed.push("src/blob.dat");

      const r = await checkBoundaries(dir, { changed });
      assert.strictEqual(r.verdict, "FAIL");
      assert.deepEqual(
        r.findings.map((f) => `${f.file}|${f.ruleId}|${f.line}|${f.code}`),
        [
          "src/f7.mjs|alpha|2|BOUNDARY_RULE_MATCH",
          "src/f12.mjs|beta|2|BOUNDARY_RULE_MATCH",
          "src/f71.mjs|alpha|2|BOUNDARY_RULE_MATCH",
          "src/f71.mjs|beta|3|BOUNDARY_RULE_MATCH",
          "src/big.mjs|alpha|null|BOUNDARY_INPUT_TOO_LARGE",
          "src/big.mjs|beta|null|BOUNDARY_INPUT_TOO_LARGE",
          "src/blob.dat|null|null|BOUNDARY_BINARY_SKIPPED",
        ],
        "file-major, rule-minor ordering and every finding kind survive lazy loading",
      );
      // Stable across repeated runs, as the contract promises.
      const again = await checkBoundaries(dir, { changed });
      assert.deepEqual(again.findings, r.findings);
    }),
  );

  test(
    "a file deleted between collection and evaluation is dropped, not charged",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "r", severity: "error", pattern: "BAD" }]);
      writeFixture(dir, "src/a.mjs", "BAD\n");
      writeFixture(dir, "src/b.mjs", "BAD\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs", "src/b.mjs"] });
      assert.deepEqual(
        r.findings.map((f) => f.file),
        ["src/a.mjs", "src/b.mjs"],
      );
    }),
  );
});

describe("checkBoundaries — pattern flags", () => {
  test(
    "a g-flag pattern matches every file, with no lastIndex carried between tasks",
    withDir(async (dir) => {
      // A `g` RegExp carries `lastIndex` across `exec` calls. The worker builds a
      // fresh RegExp per task and execs once, so the state cannot persist — this
      // locks that in, because sharing one compiled RegExp would silently make
      // every file after the first come back clean.
      seedRules(dir, [{ id: "global", severity: "error", pattern: "MARK", flags: "g" }]);
      const changed = [];
      for (let i = 0; i < 4; i++) {
        writeFixture(dir, `src/g${i}.mjs`, "MARK\nMARK\n");
        changed.push(`src/g${i}.mjs`);
      }
      const r = await checkBoundaries(dir, { changed });
      assert.strictEqual(r.verdict, "FAIL");
      assert.deepEqual(
        r.findings.map((f) => `${f.file}:${f.line}`),
        ["src/g0.mjs:1", "src/g1.mjs:1", "src/g2.mjs:1", "src/g3.mjs:1"],
      );
    }),
  );

  test(
    "an i-flag pattern is case-insensitive",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "ci", severity: "warning", pattern: "todo", flags: "i" }]);
      writeFixture(dir, "src/a.mjs", "// TODO\n");
      const r = await checkBoundaries(dir, { changed: ["src/a.mjs"] });
      assert.strictEqual(r.verdict, "WARN");
      assert.strictEqual(r.findings[0].ruleId, "ci");
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

describe("checkBoundaries — symlink containment", () => {
  test(
    "a symlink inside the project pointing outside it is refused, not read",
    withDir(async (dir) => {
      const outside = mkdtempSync(join(tmpdir(), "boundaries-outside-"));
      try {
        writeFileSync(join(outside, "secrets.txt"), "ROOTPASS=hunter2\n");
        seedRules(dir, [{ id: "leak", severity: "error", pattern: "ROOTPASS" }]);
        mkdirSync(join(dir, "src"), { recursive: true });
        symlinkSync(join(outside, "secrets.txt"), join(dir, "src/link.txt"));

        await assert.rejects(
          () => checkBoundaries(dir, { changed: ["src/link.txt"] }),
          (err) => {
            assert.strictEqual(err.code, "BOUNDARY_PATH_ESCAPE");
            assert.match(err.message, /src\/link\.txt/);
            // The refusal must not carry the out-of-tree content it refused.
            assert.ok(!/hunter2/.test(err.message), "no out-of-tree content leaked");
            return true;
          },
        );
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    }),
  );

  test(
    "a symlink to a file inside the project is still evaluated",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "inside", severity: "error", pattern: "BAD" }]);
      writeFixture(dir, "src/real.mjs", "BAD\n");
      symlinkSync(join(dir, "src/real.mjs"), join(dir, "src/alias.mjs"));
      const r = await checkBoundaries(dir, { changed: ["src/alias.mjs"] });
      assert.strictEqual(r.verdict, "FAIL");
      assert.strictEqual(r.findings[0].file, "src/alias.mjs");
    }),
  );

  test(
    "a dangling symlink is ignored like any other missing path",
    withDir(async (dir) => {
      seedRules(dir, [{ id: "any", severity: "error", pattern: "x" }]);
      mkdirSync(join(dir, "src"), { recursive: true });
      symlinkSync(join(dir, "src/gone.mjs"), join(dir, "src/dangling.mjs"));
      const r = await checkBoundaries(dir, { changed: ["src/dangling.mjs"] });
      assert.strictEqual(r.verdict, "PASS");
      assert.deepEqual(r.findings, []);
    }),
  );
});

describe("chunk-boundary interruption accounting", () => {
  // These drive `evaluateTasks` through its `runner` seam. A real worker cannot
  // be made to lose the `done`-vs-timer race on demand — in production the gap
  // between the last `result` and `done` is microseconds — but a 250 ms
  // scheduler stall or GC pause on a loaded CI box reaches it, and the outcome
  // the parent then observes is exactly what these runners return:
  // `interrupted: true` with every task already reported.
  const RULE = { id: "r", severity: "error", pattern: "NEVER_PRESENT", flags: "", exclude: [] };
  const FILE_COUNT = 70; // > MAX_CHUNK_TASKS (64), so chunk 2 exists.

  function seedTasks(dir) {
    const tasks = [];
    for (let i = 0; i < FILE_COUNT; i++) {
      const file = `src/f${i}.mjs`;
      writeFixture(dir, file, `export const n = ${i};\n`);
      const abs = join(dir, file);
      const content = readFileSync(abs, "utf8");
      tasks.push({
        fileIdx: i,
        ruleIdx: 0,
        file,
        abs,
        rule: RULE,
        content,
        size: Buffer.byteLength(content),
      });
    }
    return tasks;
  }

  /**
   * @param {string[]} seen mutated: every file a chunk was handed, in order.
   * @param {string|null} bomb the file whose task the worker dies on, or null
   *   for the late-`done` case (all tasks report, `interrupted` still true).
   */
  function fakeRunner(seen, bomb, error = null) {
    return async (chunk) => {
      for (const t of chunk) seen.push(t.file);
      const at = bomb === null ? -1 : chunk.findIndex((t) => t.file === bomb);
      if (at === -1) {
        // Every task reported. `interrupted` is true only in the late-`done`
        // case; otherwise the worker said `done` and nothing is in flight.
        const all = chunk.map((_, i) => ({ i, index: null }));
        return { completed: all.length, results: all, interrupted: bomb === null, error: null };
      }
      const done = chunk.slice(0, at).map((_, i) => ({ i, index: null }));
      return { completed: done.length, results: done, interrupted: true, error };
    };
  }

  test(
    "a chunk that reports every task then loses the done race drops no file and charges no timeout",
    withDir(async (dir) => {
      const tasks = seedTasks(dir);
      const seen = [];
      const findings = await evaluateTasks(tasks, fakeRunner(seen, null));

      assert.deepEqual(
        [...new Set(seen)].sort(),
        tasks.map((t) => t.file).sort(),
        "every input file was handed to a worker — none silently dropped",
      );
      assert.strictEqual(seen.length, FILE_COUNT, "and none was evaluated twice");
      assert.deepEqual(
        findings.filter((f) => f.code === "BOUNDARY_PATTERN_TIMEOUT"),
        [],
        "no task was in flight, so nothing may be charged a timeout",
      );
      assert.deepEqual(findings, []);
    }),
  );

  // The positions the reviewer verified are already correct. They stay correct.
  for (const idx of [0, 63, 64, 69]) {
    test(
      `a genuine interruption at task ${idx} is charged to that task and evaluation resumes`,
      withDir(async (dir) => {
        const tasks = seedTasks(dir);
        const bomb = tasks[idx].file;
        const seen = [];
        const findings = await evaluateTasks(tasks, fakeRunner(seen, bomb));

        const timeouts = findings.filter((f) => f.code === "BOUNDARY_PATTERN_TIMEOUT");
        assert.strictEqual(timeouts.length, 1);
        assert.strictEqual(timeouts[0].file, bomb);
        assert.strictEqual(timeouts[0].severity, "error");
        assert.strictEqual(timeouts[0].ruleId, "r");

        // Every other file was still evaluated, and the bomb is never retried.
        const evaluated = seen.filter((f) => f !== bomb);
        assert.deepEqual(
          [...new Set(evaluated)].sort(),
          tasks.map((t) => t.file).filter((f) => f !== bomb).sort(),
          "the rules after the interrupted one were still evaluated",
        );
      }),
    );
  }

  test(
    "a worker error is a BOUNDARY_WORKER_ERROR finding at error severity",
    withDir(async (dir) => {
      const tasks = seedTasks(dir);
      const seen = [];
      const findings = await evaluateTasks(
        tasks,
        fakeRunner(seen, tasks[3].file, "the boundary worker exited before finishing"),
      );
      const err = findings.filter((f) => f.code === "BOUNDARY_WORKER_ERROR");
      assert.strictEqual(err.length, 1);
      assert.strictEqual(err[0].file, tasks[3].file);
      assert.strictEqual(err[0].severity, "error");
      assert.match(err[0].message, /exited before finishing/);
      assert.match(err[0].message, /fails closed/);
      assert.deepEqual(
        findings.filter((f) => f.code === "BOUNDARY_PATTERN_TIMEOUT"),
        [],
        "an error is not a timeout",
      );
    }),
  );
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
