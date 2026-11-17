/**
 * Regression coverage for adev-plugin-hw1t.
 *
 * The issue reported two gaps in `skills/specify/SKILL.md`:
 *
 *   1. Step 0 instructs emitting the specify entry event
 *      (`adev report --type step --status started`) "before any spec
 *      authoring" — i.e. before `<spec-path>` exists — but `adev report`
 *      was once reported to require the target file to already exist.
 *   2. Step 5's incremental-write section names "the CLI verb" for the
 *      atomic `.partial` -> final rename, but `adev partial --help` was
 *      once reported to expose no such subverb.
 *
 * Both gaps were independently closed before this issue was investigated
 * (`adev-plugin-eval-harness-xj3k.3` / issue-p1uqr8 for #1, `adev-plugin-akoy.2`
 * for #2) — this test drives the literal sequence Step 0 → Step 5 documents,
 * end to end through the real CLI, so a regression in either fix is caught
 * here rather than only in each verb's own unit tests.
 */

import test from "node:test";
import assert from "node:assert/strict";
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
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "adev-specify-step0-test-"));
  mkdirSync(join(dir, ".context-index/specs/features/widgets"), { recursive: true });
  writeFileSync(join(dir, ".context-index/manifest.yaml"), "project:\n  name: t\n");
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function runCli(args, cwd) {
  return spawnSync("node", [CLI, ...args], { encoding: "utf8", cwd });
}

test("specify Step 0 -> Step 5 documented sequence completes end-to-end without ever hitting 'spec not found'", () => {
  const dir = makeTempProject();
  try {
    const specRel = ".context-index/specs/features/widgets/new-widget.spec.md";
    const specAbs = join(dir, specRel);

    // Step 0: emit the entry event BEFORE the spec file exists on disk, per
    // skills/specify/references/modes/standard-mode.md Step 0 and
    // skills/specify/references/shared/lifecycle-events.md's "Entry event".
    assert.strictEqual(existsSync(specAbs), false, "precondition: spec must not exist yet");
    const entry = runCli(
      ["report", "--type", "step", "--spec", specRel, "--step", "specify", "--status", "started"],
      dir,
    );
    assert.strictEqual(
      entry.status,
      0,
      `Step 0 entry event must succeed before the spec exists: stderr=${entry.stderr}`,
    );
    assert.doesNotMatch(entry.stderr, /spec not found/i);

    // Step 5: author incrementally to <spec-path>.partial (the `.partial`
    // pattern), then finalise via `adev partial commit` — the CLI verb named
    // in Step 5, not an inline Node rename.
    const partialAbs = `${specAbs}.partial`;
    writeFileSync(
      partialAbs,
      [
        "---",
        "partial_schema: spec@1",
        "charter: widgets",
        "status: draft",
        "milestone: v1",
        "created: 2026-11-15",
        "---",
        "",
        "# Live Spec: New Widget",
        "",
      ].join("\n"),
    );

    const commit = runCli(["partial", "commit", "--artifact", `${specRel}.partial`], dir);
    assert.strictEqual(
      commit.status,
      0,
      `adev partial commit must exist and succeed: stderr=${commit.stderr}`,
    );
    assert.strictEqual(existsSync(specAbs), true, "commit must atomically rename .partial into place");
    assert.strictEqual(existsSync(partialAbs), false, "commit must remove the .partial source");

    // Step 6: emit the exit event. Existence IS required here (status
    // completed), and now the spec is on disk, so this must also succeed.
    const exit = runCli(
      [
        "report",
        "--type",
        "step",
        "--spec",
        specRel,
        "--step",
        "specify",
        "--status",
        "completed",
        "--verdict",
        "PASS",
      ],
      dir,
    );
    assert.strictEqual(exit.status, 0, `Step 6 exit event must succeed: stderr=${exit.stderr}`);

    const logPath = join(dir, ".context-index/lifecycle-state/new-widget.jsonl");
    const lines = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].event, "lifecycle_step");
    assert.strictEqual(lines[0].status, "started");
    assert.strictEqual(lines[1].event, "step_completed");
    assert.strictEqual(lines[1].verdict, "PASS");
  } finally {
    cleanup(dir);
  }
});

test("adev partial --help advertises the commit subverb Step 5 names", () => {
  const dir = makeTempProject();
  try {
    const help = runCli(["partial", "--help"], dir);
    assert.strictEqual(help.status, 0);
    assert.match(help.stdout, /\bcommit\b.*atomic rename/i);
  } finally {
    cleanup(dir);
  }
});

test("skills/specify/references/shared/lifecycle-events.md does not claim the Step 0 entry event requires an existing spec file", () => {
  const md = readFileSync(
    resolve(PROJECT_ROOT, "skills/specify/references/shared/lifecycle-events.md"),
    "utf8",
  );

  // The stale claim this issue reported: that the `--status started` call
  // is rejected by the same existence guard as `completed`/`failed`.
  assert.doesNotMatch(
    md,
    /same `spec not found` guard rejects the `--status started` emission/i,
  );

  // The corrected claim: existence is required for completed/failed but not
  // for started, so the entry event can precede the spec's own creation.
  assert.match(md, /not\*\*.*for `--status started`|not.*for.*started/i);
  assert.match(md, /adev-plugin-eval-harness-xj3k\.3/);
});
