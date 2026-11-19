import { test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { reportStep } from "../../lib/lifecycle-state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");
const FIXTURE = join(PROJECT_ROOT, "tests", "fixtures", "review-notes", "mixed-formats.review.md");
const SPEC_REL = ".context-index/specs/features/demo/sample.spec.md";
const REVIEW_REL = ".context-index/specs/features/demo/sample.review.md";

function makeProject({ verdict = "PASS_WITH_NOTES" } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-review-notes-cli-")));
  mkdirSync(join(dir, ".context-index", "specs", "features", "demo"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    "project:\n  name: t\nlifecycle:\n  event_diagnostics: off\n",
  );
  writeFileSync(join(dir, SPEC_REL), "---\nstatus: review-passed\nrevision: 5\n---\n\n# Sample\n");
  const sha = createHash("sha256").update(readFileSync(join(dir, SPEC_REL))).digest("hex");
  writeFileSync(join(dir, REVIEW_REL), readFileSync(FIXTURE, "utf8").replace("file-sha: <PENDING>", `file-sha: ${sha}`));
  reportStep(dir, SPEC_REL, { step: "review", status: "started" });
  reportStep(dir, SPEC_REL, { step: "review", status: "completed", verdict });
  return dir;
}

function runCli(dir, args) {
  return spawnSync(process.execPath, [CLI, "review-notes", ...args], { cwd: dir, encoding: "utf8" });
}

test("review-notes show --json emits verdict, unchanged flag and warnings", () => {
  const dir = makeProject();
  try {
    const r = runCli(dir, ["show", "--spec", SPEC_REL, "--json"]);
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.verdict, "PASS_WITH_NOTES");
    assert.strictEqual(out.unchangedSinceReview, true);
    assert.deepStrictEqual(out.warnings.map((w) => w.id), ["SA-1", "SA-2", "SEC-1", "CON-1", "CON-3", "BD-1", "BD-2", "BD-3"]);
    assert.strictEqual(out.warnings[0].section, 'Error Cases, "Store missing or unreadable" row');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("review-notes show prints one line per warning in text mode", () => {
  const dir = makeProject();
  try {
    const r = runCli(dir, ["show", "--spec", SPEC_REL]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /^- SA-1 \[Error Cases, "Store missing or unreadable" row\]: The error row names/m);
    assert.match(r.stdout, /^- CON-1 \[no section cited\]: /m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("review-notes show rejects a spec path that escapes the project root", () => {
  const dir = makeProject();
  try {
    const r = runCli(dir, ["show", "--spec", "../outside.spec.md"]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /spec not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("review-notes without a subcommand exits 1 with usage", () => {
  const dir = makeProject();
  try {
    const r = runCli(dir, []);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /usage: adev review-notes show/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
