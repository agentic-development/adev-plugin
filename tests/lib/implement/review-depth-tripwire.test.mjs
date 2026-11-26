// tests/lib/implement/review-depth-tripwire.test.mjs
//
// The lite final-pass tripwire: a task that resolved `lite` on the provisional
// pass is re-checked against what it actually touched. An undeclared,
// non-exempt path escalates it to `quick` (scope-mismatch); a sensitive or
// boundary path, exempt or not and including gitignored files written since
// the task started, escalates it to `full`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  isTripwireExempt,
  listIgnoredWrittenSince,
  resolveImplementReviewDepth,
  snapshotWorkingTree,
} from "../../../lib/implement/review-depth.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

const SPEC_PATH = ".context-index/specs/features/m/own.spec.md";
const OWN_LOG = ".context-index/lifecycle-state/own.jsonl";
const OTHER_LOG = ".context-index/lifecycle-state/other.jsonl";
const DECLARED = ["lib/declared.mjs"];

function write(dir, rel, content = "x\n") {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), content);
}

function repo(files = {}) {
  const dir = createTempDir();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  write(dir, "lib/declared.mjs", "export {};\n");
  write(dir, "lib/x.mjs", "export const x = 1;\n");
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

function withRepo(files, fn) {
  const dir = repo(files);
  try {
    return fn(dir);
  } finally {
    cleanupTempDir(dir);
  }
}

function finalPass(dir, baseSha, overrides = {}) {
  return resolveImplementReviewDepth({
    spec: { risk_level: "medium", specPath: SPEC_PATH },
    task: { id: "7", declared_files: DECLARED },
    routingEntry: { selected_agent: "auto-agent", scores: { spec_completeness: 0.8, pattern_coverage: 0.8, blast_radius: 0.8, novelty: 0.8 } },
    tierFlag: null,
    liteFlag: true,
    policies: {},
    targetPaths: DECLARED,
    pass: "final",
    provisionalDepth: "lite",
    inProgressAt: null,
    baseSha,
    projectRoot: dir,
    ...overrides,
  });
}

// The fields the tripwire decides, with the LITE_TRIPWIRE_ESCALATED warning
// reduced to what it must name.
function outcome(r) {
  const w = r.warnings.find((x) => x.code === "LITE_TRIPWIRE_ESCALATED");
  return {
    depth: r.depth,
    source: r.source,
    escalated_from: r.escalated_from,
    floor_applied: r.floor_applied,
    floor_legs: r.floor_legs,
    tripwire: w ? { task_id: w.task_id, legs: w.legs } : null,
  };
}

const STAYS_LITE = { depth: "lite", source: "lite-grant", escalated_from: null, floor_applied: false, floor_legs: [], tripwire: null };
const escalated = (depth, legs) => ({
  depth, source: "lite-tripwire", escalated_from: "lite", floor_applied: true, floor_legs: legs, tripwire: { task_id: "7", legs },
});

// ── isTripwireExempt ────────────────────────────────────────────────────────

test("isTripwireExempt: case-sensitive exemptions", () => {
  for (const p of ["tests/x.mjs", "docs/guide.md", "lib/a.test.mjs", "src/b.spec.ts", "pkg/README.md", "x.test.py", "README.md", "go/a.spec.go", "r/a.test.rs"])
    assert.equal(isTripwireExempt(p, "100644"), true, p);
  for (const p of ["Tests/x.mjs", "DOCS/a.md", "lib/a.TEST.mjs", "lib/readme.md", "lib/a.test.md", "lib/a.mjs", "lib/.test.mjs", "lib/a.test.java", "mytests/x.mjs", "lib/tests/x.mjs"])
    assert.equal(isTripwireExempt(p, "100644"), false, p);
});

test("isTripwireExempt: case-insensitive exclusions and symlinks", () => {
  for (const p of ["docs/x.spec.md", "tests/X.SPEC.MD", ".context-index/a.test.mjs", ".Context-Index/tests/a.mjs", "tests/.context-index/x.md", "docs/.CONTEXT-INDEX/README.md"])
    assert.equal(isTripwireExempt(p, "100644"), false, p);
  assert.equal(isTripwireExempt("tests/link.mjs", "120000"), false);
  assert.equal(isTripwireExempt("pkg/README.md", "120000"), false);
  assert.equal(isTripwireExempt("tests/run.sh", "100755"), true);
});

test("isTripwireExempt: empty, `.` and `..` segments and a leading `/` are never exempt", () => {
  for (const p of ["docs/../src/x.mjs", "tests/../lib/a.mjs", "tests/./a.mjs", "tests//a.mjs", "/tests/a.mjs", "docs/", "lib/../README.md", "tests/a.test.mjs/.."])
    assert.equal(isTripwireExempt(p, "100644"), false, p);
});

// ── scope-mismatch → quick ──────────────────────────────────────────────────

test("lite task touching an undeclared source file escalates to quick (tracked and untracked)", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    writeFileSync(join(dir, "lib/x.mjs"), "export const x = 2;\n");
    assert.deepEqual(outcome(finalPass(dir, base)), escalated("quick", ["scope-mismatch"]), "tracked lib/x.mjs");
  });
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "lib/y.mjs", "export const y = 1;\n");
    const r = finalPass(dir, base);
    assert.deepEqual(outcome(r), escalated("quick", ["scope-mismatch"]), "untracked lib/y.mjs");
    assert.equal(r.warnings.some((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED"), false, "quick escalation is not a full floor");
  });
});

test("a declared file edited by the lite task keeps lite", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    writeFileSync(join(dir, "lib/declared.mjs"), "export const d = 1;\n");
    assert.deepEqual(outcome(finalPass(dir, base)), STAYS_LITE);
  });
});

test("undeclared tests/ or docs/ file keeps lite", () => {
  withRepo({ "docs/guide.md": "old\n" }, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "tests/new.test.mjs", "// t\n");
    writeFileSync(join(dir, "docs/guide.md"), "new\n");
    write(dir, "lib/a.test.mjs", "// t\n");
    write(dir, "pkg/README.md", "# pkg\n");
    assert.deepEqual(outcome(finalPass(dir, base)), STAYS_LITE);
  });
});

test("undeclared *.spec.md, X.SPEC.MD, .context-index/, .Context-Index/ and symlink escalate", () => {
  const cases = [
    ["docs/x.spec.md", (dir) => write(dir, "docs/x.spec.md")],
    ["tests/X.SPEC.MD", (dir) => write(dir, "tests/X.SPEC.MD")],
    [".context-index/notes.md", (dir) => write(dir, ".context-index/notes.md")],
    [".Context-Index/tests/a.mjs", (dir) => write(dir, ".Context-Index/tests/a.mjs")],
    ["tests/link.mjs (new symlink)", (dir) => { mkdirSync(join(dir, "tests"), { recursive: true }); symlinkSync("../lib/x.mjs", join(dir, "tests/link.mjs")); }],
  ];
  for (const [label, act] of cases) {
    withRepo({}, (dir) => {
      const base = snapshotWorkingTree(dir);
      act(dir);
      assert.deepEqual(outcome(finalPass(dir, base)), escalated("quick", ["scope-mismatch"]), label);
    });
  }
});

test("deleting a tracked symlink under tests/ escalates: a D record is judged by its source mode", () => {
  withRepo({}, (dir) => {
    mkdirSync(join(dir, "tests"), { recursive: true });
    symlinkSync("../lib/x.mjs", join(dir, "tests/link.mjs"));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "symlink");
    const base = snapshotWorkingTree(dir);
    rmSync(join(dir, "tests/link.mjs"));
    assert.deepEqual(outcome(finalPass(dir, base)), escalated("quick", ["scope-mismatch"]));
  });
});

// ── sensitive-path / boundary → full ────────────────────────────────────────

test("sensitive path escalates to full even under docs/", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "docs/secrets/a.md");
    const r = finalPass(dir, base, { sensitivePaths: ["docs/secrets/**"] });
    assert.deepEqual(outcome(r), escalated("full", ["sensitive-path"]), "configured docs/secrets/**");
    assert.equal(r.warnings.some((w) => w.code === "REVIEW_DEPTH_FLOOR_APPLIED"), true);
  });
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "docs/my-secret.md");
    assert.deepEqual(outcome(finalPass(dir, base)), escalated("full", ["sensitive-path"]), "built-in **/*secret*");
  });
});

test("a sensitive and an undeclared source path together escalate to full, not quick", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "lib/y.mjs");
    write(dir, "lib/auth/token.mjs");
    assert.deepEqual(outcome(finalPass(dir, base)), escalated("full", ["sensitive-path"]));
  });
});

test("a touched path crossing a boundary escalates to full, exempt or not", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "docs/api/contract.md");
    const seen = [];
    const boundaryCheck = (paths) => {
      seen.push(...paths);
      return paths.some((p) => /^docs\/api\//.test(p));
    };
    assert.deepEqual(outcome(finalPass(dir, base, { boundaryCheck })), escalated("full", ["boundary"]));
    assert.ok(seen.includes("docs/api/contract.md"));
  });
});

// ── RI-8: own lifecycle-log exclusion runs first ────────────────────────────

test("own lifecycle-log M touch is excluded before the exemption check (RI-8)", () => {
  withRepo({ [OWN_LOG]: '{"event":"a"}\n', [OTHER_LOG]: '{"event":"a"}\n' }, (dir) => {
    const base = snapshotWorkingTree(dir);
    appendFileSync(join(dir, OWN_LOG), '{"event":"b"}\n');
    assert.deepEqual(outcome(finalPass(dir, base)), STAYS_LITE, "own log appended");

    appendFileSync(join(dir, OTHER_LOG), '{"event":"b"}\n');
    assert.deepEqual(outcome(finalPass(dir, base)), escalated("quick", ["scope-mismatch"]), "another spec's log");
  });
});

// ── BD-11: gitignored files written since the task started ──────────────────

test("gitignored .env written after the task started escalates to full (BD-11)", () => {
  const inProgressAt = 1_800_000_000_000;
  withRepo({ ".gitignore": ".env\n" }, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, ".env", "TOKEN=1\n");
    utimesSync(join(dir, ".env"), inProgressAt / 1000 + 5, inProgressAt / 1000 + 5);
    assert.deepEqual(outcome(finalPass(dir, base, { inProgressAt })), escalated("full", ["sensitive-path"]), "ignored .env after start");
  });
  withRepo({ ".gitignore": ".env\n" }, (dir) => {
    write(dir, ".env", "TOKEN=1\n");
    utimesSync(join(dir, ".env"), inProgressAt / 1000 - 60, inProgressAt / 1000 - 60);
    const base = snapshotWorkingTree(dir);
    assert.deepEqual(outcome(finalPass(dir, base, { inProgressAt })), STAYS_LITE, "pre-existing ignored .env");
  });
});

test("an ignored sensitive file whose mtime is 1 s before inProgressAt still escalates (coarse-mtime slack)", () => {
  const inProgressAt = 1_800_000_000_000;
  withRepo({ ".gitignore": ".env\n" }, (dir) => {
    write(dir, ".env", "TOKEN=1\n");
    utimesSync(join(dir, ".env"), inProgressAt / 1000 - 1, inProgressAt / 1000 - 1);
    const base = snapshotWorkingTree(dir);
    assert.deepEqual(outcome(finalPass(dir, base, { inProgressAt })), escalated("full", ["sensitive-path"]));
  });
});

test("a null inProgressAt fails closed: every ignored sensitive file counts", () => {
  withRepo({ ".gitignore": ".env\n" }, (dir) => {
    write(dir, ".env", "TOKEN=1\n");
    utimesSync(join(dir, ".env"), 1_000_000, 1_000_000);
    const base = snapshotWorkingTree(dir);
    assert.deepEqual(outcome(finalPass(dir, base, { inProgressAt: null })), escalated("full", ["sensitive-path"]));
  });
});

test("a gitignored path crossing a boundary escalates to full", () => {
  withRepo({ ".gitignore": "gen/\n" }, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "gen/api/schema.json", "{}\n");
    const boundaryCheck = (paths) => paths.some((p) => p.startsWith("gen/api/"));
    assert.deepEqual(outcome(finalPass(dir, base, { boundaryCheck, inProgressAt: null })), escalated("full", ["boundary"]));
  });
});

test("gitignored paths never feed scope-mismatch", () => {
  withRepo({ ".gitignore": "build/\n" }, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "build/out.js", "x\n");
    assert.deepEqual(outcome(finalPass(dir, base, { inProgressAt: null })), STAYS_LITE);
  });
});

test("listIgnoredWrittenSince: cut-off is sinceMs - 2 s, inclusive; null keeps all; filter narrows", () => {
  withRepo({ ".gitignore": "*.log\nbuild/\n" }, (dir) => {
    const T = 1_800_000_000_000;
    write(dir, "a.log");
    write(dir, "b.log");
    write(dir, "build/c.js");
    utimesSync(join(dir, "a.log"), T / 1000 - 2, T / 1000 - 2);
    utimesSync(join(dir, "b.log"), T / 1000 - 3, T / 1000 - 3);
    utimesSync(join(dir, "build/c.js"), T / 1000 + 1, T / 1000 + 1);
    assert.deepEqual(listIgnoredWrittenSince(dir, T).sort(), ["a.log", "build/c.js"]);
    assert.deepEqual(listIgnoredWrittenSince(dir, null).sort(), ["a.log", "b.log", "build/c.js"]);
    assert.deepEqual(listIgnoredWrittenSince(dir, null, { filter: (p) => p.endsWith(".js") }), ["build/c.js"]);
  });
});

// ── keyed on provisionalDepth, not on re-evaluating the grant ───────────────

test("provisionalDepth lite without liteFlag still runs the tripwire and escalates", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, "lib/y.mjs");
    assert.deepEqual(outcome(finalPass(dir, base, { liteFlag: false })), escalated("quick", ["scope-mismatch"]));
  });
});

test("liteFlag with provisionalDepth quick resolves quick, never lite", () => {
  withRepo({}, (dir) => {
    const base = snapshotWorkingTree(dir);
    const r = finalPass(dir, base, { provisionalDepth: "quick" });
    assert.equal(r.depth, "quick");
    assert.equal(r.source, "default-quick");
    assert.equal(r.escalated_from, null);
    for (const provisionalDepth of [null, "full"]) {
      assert.equal(finalPass(dir, base, { provisionalDepth }).depth, "quick", String(provisionalDepth));
    }
  });
});

test("a non-lite final pass sees no gitignored paths and has no scope-mismatch leg", () => {
  withRepo({ ".gitignore": ".env\n" }, (dir) => {
    const base = snapshotWorkingTree(dir);
    write(dir, ".env", "TOKEN=1\n");
    write(dir, "lib/y.mjs");
    const r = finalPass(dir, base, { provisionalDepth: "quick" });
    assert.equal(r.depth, "quick");
    assert.deepEqual(r.floor_legs, []);
  });
});

test("the tripwire needs a diff range: MISSING_DIFF_RANGE without baseSha", () => {
  withRepo({}, (dir) => {
    assert.throws(() => finalPass(dir, undefined), (err) => err.code === "MISSING_DIFF_RANGE");
  });
});
