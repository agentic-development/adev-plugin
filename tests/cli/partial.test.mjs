// tests/cli/partial.test.mjs
//
// Tests for `adev partial {detect,resume,discard,inspect}` (lib/cli/partial.mjs).
// Covers Task 9 from incremental-artifact-writes.plan.md.

import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-partial-test-"));
  mkdirSync(join(dir, ".context-index/specs/features/m"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index/manifest.yaml"),
    "project:\n  name: t\n",
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function runCli(args, opts = {}) {
  return spawnSync("node", [CLI, "partial", ...args], {
    encoding: "utf8",
    cwd: opts.cwd ?? PROJECT_ROOT,
  });
}

test("adev partial without subverb exits 1 with usage", () => {
  const r = runCli([]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr + r.stdout, /usage|detect|resume|discard|inspect/i);
});

test("adev partial unknown-subverb exits 1", () => {
  const r = runCli(["bogus"]);
  assert.strictEqual(r.status, 1);
});

test("adev partial detect lists .partial files in the project", () => {
  const dir = makeTempProject();
  try {
    const spec = join(dir, ".context-index/specs/features/m/foo.spec.md");
    writeFileSync(spec, "");
    writeFileSync(`${spec}.partial`, "partial content");
    writeFileSync(
      join(dir, ".context-index/specs/features/m/bar.plan.md.partial"),
      "another partial"
    );
    // Sibling files that should NOT appear:
    writeFileSync(
      join(dir, ".context-index/specs/features/m/bar.plan.md.partial.lock"),
      "{}"
    );
    writeFileSync(
      join(dir, ".context-index/specs/features/m/normal.spec.md"),
      ""
    );

    const r = runCli(["detect", "--root", ".context-index"], { cwd: dir });
    assert.strictEqual(r.status, 0);
    const output = JSON.parse(r.stdout);
    assert.ok(Array.isArray(output.partials));
    assert.equal(output.partials.length, 2);
    const names = output.partials.map((p) => p.path).sort();
    assert.ok(names.some((n) => n.endsWith("foo.spec.md.partial")));
    assert.ok(names.some((n) => n.endsWith("bar.plan.md.partial")));
    assert.ok(!names.some((n) => n.endsWith(".lock")));
  } finally {
    cleanup(dir);
  }
});

test("adev partial detect returns empty list when none exist", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(["detect", "--root", ".context-index"], { cwd: dir });
    assert.strictEqual(r.status, 0);
    const output = JSON.parse(r.stdout);
    assert.deepEqual(output.partials, []);
  } finally {
    cleanup(dir);
  }
});

test("adev partial inspect reports schema marker + lock state for an artifact", () => {
  const dir = makeTempProject();
  try {
    const finalP = join(dir, ".context-index/specs/features/m/foo.plan.md");
    const partial = `${finalP}.partial`;
    writeFileSync(
      partial,
      "<!-- partial_schema: plan@1 -->\n# Plan\nSection 1\n"
    );
    // No lock file.
    const r = runCli(["inspect", "--artifact", partial], { cwd: dir });
    assert.strictEqual(r.status, 0);
    const output = JSON.parse(r.stdout);
    assert.ok(output.partial_exists);
    assert.equal(output.schema_marker, "plan@1");
    assert.equal(output.schema_allowed, true);
    assert.equal(output.lock_exists, false);
    // Did NOT modify the partial.
    assert.ok(existsSync(partial));
  } finally {
    cleanup(dir);
  }
});

test("adev partial inspect reports missing schema marker", () => {
  const dir = makeTempProject();
  try {
    const finalP = join(dir, ".context-index/specs/features/m/foo.plan.md");
    const partial = `${finalP}.partial`;
    writeFileSync(partial, "no marker at the top of this file\n");
    const r = runCli(["inspect", "--artifact", partial], { cwd: dir });
    assert.strictEqual(r.status, 0);
    const output = JSON.parse(r.stdout);
    assert.equal(output.partial_exists, true);
    assert.equal(output.schema_marker, null);
    assert.equal(output.schema_allowed, false);
  } finally {
    cleanup(dir);
  }
});

test("adev partial discard unlinks partial + lock and emits partial_recovery", () => {
  const dir = makeTempProject();
  try {
    const finalP = join(dir, ".context-index/specs/features/m/foo.plan.md");
    const partial = `${finalP}.partial`;
    const lock = `${finalP}.partial.lock`;
    writeFileSync(partial, "<!-- partial_schema: plan@1 -->\nhello\n");
    writeFileSync(
      lock,
      JSON.stringify({ pid: 999999, started_at: new Date().toISOString() })
    );

    // Also need a spec file so the lifecycle log can be derived from a spec.
    const spec = join(dir, ".context-index/specs/features/m/foo.spec.md");
    writeFileSync(spec, "");

    const r = runCli(
      [
        "discard",
        "--artifact",
        partial,
        "--spec",
        ".context-index/specs/features/m/foo.spec.md",
      ],
      { cwd: dir }
    );
    assert.strictEqual(r.status, 0);
    assert.equal(existsSync(partial), false);
    assert.equal(existsSync(lock), false);
    // Lifecycle log entry recorded.
    const logPath = join(
      dir,
      ".context-index/lifecycle-state/foo.jsonl"
    );
    assert.ok(existsSync(logPath));
    const logLines = readFileSync(logPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const recovery = logLines.find((l) => l.event === "partial_recovery");
    assert.ok(recovery, "partial_recovery event written");
    assert.equal(recovery.action, "discarded");
  } finally {
    cleanup(dir);
  }
});

test("adev partial resume returns the partial's last coherent section (informational)", () => {
  const dir = makeTempProject();
  try {
    const finalP = join(dir, ".context-index/specs/features/m/foo.plan.md");
    const partial = `${finalP}.partial`;
    writeFileSync(
      partial,
      [
        "<!-- partial_schema: plan@1 -->",
        "# Plan",
        "",
        "## Section A",
        "alpha",
        "",
        "## Section B",
        "beta",
        "",
        "## Section ", // truncated mid-write
      ].join("\n") + "\n"
    );
    const r = runCli(["resume", "--artifact", partial], { cwd: dir });
    assert.strictEqual(r.status, 0);
    const output = JSON.parse(r.stdout);
    assert.equal(output.partial_exists, true);
    assert.equal(output.schema_marker, "plan@1");
    // last_section reports the last fully formed section before the truncation
    assert.ok(typeof output.last_section === "string");
    assert.match(output.last_section, /Section B/);
    // resume must not modify the partial
    assert.ok(existsSync(partial));
  } finally {
    cleanup(dir);
  }
});

test("adev partial rejects paths that escape the project root (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(["inspect", "--artifact", "/etc/passwd"], { cwd: dir });
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /INVALID_PARTIAL_PATH|containment|escapes/i);
  } finally {
    cleanup(dir);
  }
});

// ── check-size ─────────────────────────────────────────────────────────────

test("adev partial check-size exits 0 and reports ok:true when partial is under cap", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/under.md");
    writeFileSync(`${finalPath}.partial`, "x".repeat(10_000));
    const r = runCli(["check-size", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.actual, 10_000);
    assert.strictEqual(out.expected, 51200);
    assert.strictEqual(out.cap, 153600);
  } finally {
    cleanup(dir);
  }
});

test("adev partial check-size exits 2 with PARTIAL_ARTIFACT_OVERSIZE when over cap", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/over.md");
    writeFileSync(`${finalPath}.partial`, "x".repeat(200_000));
    const r = runCli(["check-size", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, "PARTIAL_ARTIFACT_OVERSIZE");
    assert.strictEqual(out.actual, 200_000);
  } finally {
    cleanup(dir);
  }
});

test("adev partial check-size accepts --expected override", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/override.md");
    writeFileSync(`${finalPath}.partial`, "x".repeat(100_000));
    // Default cap=153600 → 100K would PASS. With --expected 20000, cap=60000 → FAIL.
    const r = runCli(
      ["check-size", "--artifact", finalPath, "--expected", "20000"],
      { cwd: dir },
    );
    assert.strictEqual(r.status, 2);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.code, "PARTIAL_ARTIFACT_OVERSIZE");
    assert.strictEqual(out.expected, 20000);
    assert.strictEqual(out.cap, 60000);
  } finally {
    cleanup(dir);
  }
});

test("adev partial check-size exits 0 when no partial exists (no-op)", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/absent.md");
    const r = runCli(["check-size", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.actual, null);
  } finally {
    cleanup(dir);
  }
});

test("adev partial check-size accepts the .partial form of --artifact", () => {
  // Adopting skills may pass either the final path or the .partial path —
  // the verb normalises both so SKILL prose stays simple.
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/either.md");
    writeFileSync(`${finalPath}.partial`, "x".repeat(10_000));
    const r = runCli(["check-size", "--artifact", `${finalPath}.partial`], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.ok, true);
  } finally {
    cleanup(dir);
  }
});

// ── commit ───────────────────────────────────────────────────────────────
//
// Regression coverage for issue adev-plugin-akoy.2: `adev partial` had no
// `commit` subverb, so the three skills that write `.partial` artifacts
// could not name a real CLI verb for the atomic-rename step and the
// frontmatter-first contract went unenforced for that commit path (unlike
// `adev artifact commit`, which already guards `.validate.md`/`.review.md`).

test("adev partial commit renames a spec .partial into place when frontmatter is first", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/demo.spec.md");
    writeFileSync(
      `${finalPath}.partial`,
      "---\npartial_schema: spec@1\nstatus: draft\n---\n\n# Live Spec: Demo\n"
    );
    const r = runCli(["commit", "--artifact", `${finalPath}.partial`], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim());
    assert.strictEqual(out.committed, ".context-index/specs/features/m/demo.spec.md");
    assert.equal(existsSync(finalPath), true);
    assert.equal(existsSync(`${finalPath}.partial`), false);
    // The frontmatter key marker is left in place — it is the resume
    // contract, not scaffolding (skills/specify/SKILL.md Step 5).
    assert.match(readFileSync(finalPath, "utf8"), /partial_schema: spec@1/);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit accepts the final (non-.partial) form of --artifact", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/either.spec.md");
    writeFileSync(`${finalPath}.partial`, "---\nstatus: draft\n---\n\nbody\n");
    const r = runCli(["commit", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.equal(existsSync(finalPath), true);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit rejects a .spec.md .partial whose marker precedes the frontmatter", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/bad.spec.md");
    writeFileSync(
      `${finalPath}.partial`,
      "<!-- partial_schema: spec@1 -->\n\n---\nstatus: draft\n---\n\n# Live Spec: Bad\n"
    );
    const r = runCli(["commit", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /ARTIFACT_FRONTMATTER_NOT_FIRST/);
    // Refusal leaves the .partial untouched for inspection — no rename happened.
    assert.equal(existsSync(finalPath), false);
    assert.equal(existsSync(`${finalPath}.partial`), true);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit skips the frontmatter guard for .plan.md (no frontmatter contract)", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/demo.plan.md");
    writeFileSync(
      `${finalPath}.partial`,
      "<!-- partial_schema: plan@1 -->\n\n# Implementation Plan: Demo\n"
    );
    const r = runCli(["commit", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.equal(existsSync(finalPath), true);
    assert.match(readFileSync(finalPath, "utf8"), /partial_schema: plan@1/);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit unlinks a stale lock sidecar on success", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/locked.plan.md");
    writeFileSync(`${finalPath}.partial`, "<!-- partial_schema: plan@1 -->\n\nbody\n");
    writeFileSync(
      `${finalPath}.partial.lock`,
      JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })
    );
    const r = runCli(["commit", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.equal(existsSync(`${finalPath}.partial.lock`), false);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit exits 1 when the source .partial is missing", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/absent.spec.md");
    const r = runCli(["commit", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /source artifact missing/);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit exits 1 on a zero-byte .partial (refuses a truncated write)", () => {
  const dir = makeTempProject();
  try {
    const finalPath = join(dir, ".context-index/specs/features/m/empty.spec.md");
    writeFileSync(`${finalPath}.partial`, "");
    const r = runCli(["commit", "--artifact", finalPath], { cwd: dir });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /source is empty/);
    assert.equal(existsSync(finalPath), false);
  } finally {
    cleanup(dir);
  }
});

test("adev partial commit rejects paths that escape the project root (containment)", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(["commit", "--artifact", "/etc/passwd"], { cwd: dir });
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /INVALID_PARTIAL_PATH|containment|escapes/i);
  } finally {
    cleanup(dir);
  }
});
