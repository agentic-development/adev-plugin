// The scope-mismatch leg must judge what the TASK touched, not what happened to
// be untracked or dirty in the worktree when the task started. Diffing against
// HEAD and counting every untracked file as an addition floored every task in
// a consumer project to `full` (14/14), because session logs and other specs'
// untracked lifecycle logs were always present.
//
// snapshotWorkingTree() records the worktree at dispatch as a git tree object
// (index + every non-ignored file), and computeTouchedFiles() diffs that tree
// against a fresh snapshot, so anything already present before the task drops
// out. A plain commit as the base keeps the previous semantics exactly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  resolveImplementReviewDepth,
  computeTouchedFiles,
  snapshotWorkingTree,
} from "../../../lib/implement/review-depth.mjs";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";

const git = (dir, ...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

function repo() {
  const dir = createTempDir();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t.com");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "tracked.txt"), "1\n");
  writeFileSync(join(dir, ".gitignore"), "ignored/\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  return dir;
}

const SPEC = { risk_level: "low", specPath: ".context-index/specs/features/m/own.spec.md" };
const OWN_LOG = ".context-index/lifecycle-state/own.jsonl";

function finalPass(dir, base, declared) {
  return resolveImplementReviewDepth({
    spec: SPEC,
    task: { id: "t1", declared_files: declared },
    routingEntry: null, tierFlag: null, policies: {},
    pass: "final", baseSha: base, projectRoot: dir,
  });
}

const sorted = (records) =>
  records.map((r) => `${r.status} ${r.path}`).sort();

test("a file untracked before the task and left alone does not fire scope-mismatch", () => {
  const dir = repo();
  try {
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/other.jsonl"), "{}\n");
    writeFileSync(join(dir, ".DS_Store"), "x");
    const base = snapshotWorkingTree(dir);

    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), ["A new.mjs"]);
    assert.ok(!finalPass(dir, base, ["new.mjs"]).floor_legs.includes("scope-mismatch"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("a tracked file already dirty before the task and left alone is not counted", () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, "tracked.txt"), "dirty before dispatch\n");
    const base = snapshotWorkingTree(dir);
    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), ["A new.mjs"]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("a pre-existing untracked file the task modifies or deletes still fires the leg", () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, "scratch.txt"), "before\n");
    writeFileSync(join(dir, "gone.txt"), "before\n");
    const base = snapshotWorkingTree(dir);

    writeFileSync(join(dir, "scratch.txt"), "after\n");
    rmSync(join(dir, "gone.txt"));
    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), ["A new.mjs", "D gone.txt", "M scratch.txt"]);
    assert.ok(finalPass(dir, base, ["new.mjs"]).floor_legs.includes("scope-mismatch"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("the current spec's own log, untracked at dispatch and appended during the task, is the K exclusion (status M)", () => {
  const dir = repo();
  try {
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, OWN_LOG), '{"event":"step_started"}\n');
    const base = snapshotWorkingTree(dir);

    appendFileSync(join(dir, OWN_LOG), '{"event":"test_depth_assigned"}\n');
    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), [`A new.mjs`, `M ${OWN_LOG}`]);
    assert.ok(!finalPass(dir, base, ["new.mjs"]).floor_legs.includes("scope-mismatch"));
  } finally {
    cleanupTempDir(dir);
  }
});

test("snapshotting never touches the real index or the working tree", () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, "staged.txt"), "s\n");
    git(dir, "add", "staged.txt");
    writeFileSync(join(dir, "untracked.txt"), "u\n");
    const before = git(dir, "status", "--porcelain=v1", "-z");
    snapshotWorkingTree(dir);
    assert.equal(git(dir, "status", "--porcelain=v1", "-z"), before);
  } finally {
    cleanupTempDir(dir);
  }
});

test("ignored files are outside the snapshot and the diff, as with --exclude-standard", () => {
  const dir = repo();
  try {
    const base = snapshotWorkingTree(dir);
    mkdirSync(join(dir, "ignored"), { recursive: true });
    writeFileSync(join(dir, "ignored/build.out"), "x");
    assert.deepEqual(computeTouchedFiles(dir, base), []);
  } finally {
    cleanupTempDir(dir);
  }
});

test("a commit base keeps the previous semantics: tracked changes plus every untracked file as A", () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, "already-untracked.txt"), "x");
    const head = git(dir, "rev-parse", "HEAD").trim();
    writeFileSync(join(dir, "tracked.txt"), "2\n");
    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, head)), [
      "A already-untracked.txt",
      "A new.mjs",
      "M tracked.txt",
    ]);
  } finally {
    cleanupTempDir(dir);
  }
});
