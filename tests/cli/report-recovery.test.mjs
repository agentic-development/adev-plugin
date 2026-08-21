// tests/cli/report-recovery.test.mjs
//
// Tests for `adev report --type recovery` — the CLI producer for the
// `recovery_record` canonical event.
//
// Regression coverage for issue-513: `recovery_record` sat in
// CANONICAL_EVENTS and in the projection's interventions[] fold with no
// producer anywhere in the tree. `--type intervention` documents
// `--kind recover` but always emits `debug_intervention`, so the canonical
// discriminator was unreachable from any skill. `/adev:recover` Step 6 now
// calls this verb after writing its recovery record.

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

const SPEC_REL = ".context-index/specs/features/m/sample.spec.md";
const REF = ".context-index/hygiene/recoveries/2026-08-20-task-3.md";

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-report-recovery-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: t\nlifecycle:\n  event_diagnostics: off\n',
  );
  writeFileSync(join(dir, SPEC_REL), "# Sample spec\n");
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function readLog(dir, slug) {
  const logPath = join(dir, ".context-index", "lifecycle-state", `${slug}.jsonl`);
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function runCli(dir, args) {
  return spawnSync(process.execPath, [CLI, "report", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

test("--type recovery appends a recovery_record event carrying its ref", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      "--type", "recovery",
      "--spec", SPEC_REL,
      "--ref", REF,
      "--category", "MISSING_CONTEXT",
      "--note", "Injected the adapter contract and re-dispatched.",
    ]);
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
    const events = readLog(dir, "sample");
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, "recovery_record");
    assert.strictEqual(events[0].ref, REF);
    assert.strictEqual(events[0].category, "MISSING_CONTEXT");
    assert.match(events[0].note, /re-dispatched/);
  } finally {
    cleanup(dir);
  }
});

test("--type recovery works with --ref alone; optionals are omitted", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ["--type", "recovery", "--spec", SPEC_REL, "--ref", REF]);
    assert.strictEqual(r.status, 0, r.stderr);
    const [ev] = readLog(dir, "sample");
    assert.strictEqual(ev.event, "recovery_record");
    assert.ok(!("category" in ev));
    assert.ok(!("note" in ev));
  } finally {
    cleanup(dir);
  }
});

test("--type recovery requires --spec and --ref", () => {
  const dir = makeTempProject();
  try {
    const noSpec = runCli(dir, ["--type", "recovery", "--ref", REF]);
    assert.strictEqual(noSpec.status, 1);
    assert.match(noSpec.stderr, /requires --spec/);

    const noRef = runCli(dir, ["--type", "recovery", "--spec", SPEC_REL]);
    assert.strictEqual(noRef.status, 1);
    assert.match(noRef.stderr, /requires --ref/);
    assert.strictEqual(readLog(dir, "sample").length, 0, "no event on arg error");
  } finally {
    cleanup(dir);
  }
});

test("--type recovery rejects a spec outside the project root", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      "--type", "recovery",
      "--spec", "../escape/other.spec.md",
      "--ref", REF,
    ]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/);
  } finally {
    cleanup(dir);
  }
});

test("--type recovery rejects an absolute --ref (SEC-3 boundary)", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      "--type", "recovery",
      "--spec", SPEC_REL,
      "--ref", "/etc/passwd",
    ]);
    assert.notStrictEqual(r.status, 0, "absolute ref must not succeed");
    assert.strictEqual(readLog(dir, "sample").length, 0);
  } finally {
    cleanup(dir);
  }
});

test("--help documents --type recovery", () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ["--help"]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /--type recovery/);
    assert.match(r.stdout, /recovery_record/);
  } finally {
    cleanup(dir);
  }
});
