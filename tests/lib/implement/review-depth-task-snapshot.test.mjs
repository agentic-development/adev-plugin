// The final pass's touched-path legs must judge what the TASK touched, not what
// happened to be untracked or dirty in the worktree when the task started.
// Diffing against HEAD and counting every untracked file as an addition floored
// every task in a consumer project to `full` (14/14), because session logs and
// other specs' untracked lifecycle logs were always present.
//
// snapshotWorkingTree() records the worktree at dispatch as a git tree object
// (index + every non-ignored file), and computeTouchedFiles() diffs that tree
// against a fresh snapshot, so anything already present before the task drops
// out. A plain commit as the base keeps the previous semantics exactly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, appendFileSync, rmSync, symlinkSync, utimesSync } from "node:fs";
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

function finalPass(dir, base, declared, { spec = SPEC, sensitivePaths } = {}) {
  return resolveImplementReviewDepth({
    spec,
    task: { id: "t1", declared_files: declared },
    routingEntry: null, tierFlag: null, policies: {},
    sensitivePaths,
    pass: "final", baseSha: base, projectRoot: dir,
  });
}

const sorted = (records) =>
  records.map((r) => `${r.status} ${r.path}`).sort();

test("a file untracked before the task and left alone holds no touched-path leg", () => {
  const dir = repo();
  try {
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, ".context-index/lifecycle-state/other.jsonl"), "{}\n");
    writeFileSync(join(dir, ".DS_Store"), "x");
    const base = snapshotWorkingTree(dir);

    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), ["A new.mjs"]);
    const sensitivePaths = [".context-index/lifecycle-state/**", ".DS_Store"];
    assert.deepEqual(finalPass(dir, base, ["new.mjs"], { sensitivePaths }).floor_legs, []);
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

test("a pre-existing untracked file the task modifies or deletes is still a touched path the floor sees", () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, "scratch.txt"), "before\n");
    writeFileSync(join(dir, "gone.txt"), "before\n");
    const base = snapshotWorkingTree(dir);

    writeFileSync(join(dir, "scratch.txt"), "after\n");
    rmSync(join(dir, "gone.txt"));
    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), ["A new.mjs", "D gone.txt", "M scratch.txt"]);
    for (const sensitive of ["scratch.txt", "gone.txt"]) {
      const r = resolveImplementReviewDepth({
        spec: SPEC, task: { id: "t1", declared_files: ["new.mjs"] }, routingEntry: null, policies: {},
        sensitivePaths: [sensitive], pass: "final", baseSha: base, projectRoot: dir,
      });
      assert.deepEqual(r.floor_legs, ["sensitive-path"], sensitive);
    }
  } finally {
    cleanupTempDir(dir);
  }
});

test("the current spec's own log, untracked at dispatch and appended during the task, is excluded from the touched-path legs (status M)", () => {
  const dir = repo();
  try {
    mkdirSync(join(dir, ".context-index/lifecycle-state"), { recursive: true });
    writeFileSync(join(dir, OWN_LOG), '{"event":"step_started"}\n');
    const base = snapshotWorkingTree(dir);

    appendFileSync(join(dir, OWN_LOG), '{"event":"test_depth_assigned"}\n');
    writeFileSync(join(dir, "new.mjs"), "export {};\n");
    assert.deepEqual(sorted(computeTouchedFiles(dir, base)), [`A new.mjs`, `M ${OWN_LOG}`]);
    const sensitivePaths = [".context-index/lifecycle-state/**"];
    assert.deepEqual(finalPass(dir, base, ["new.mjs"], { sensitivePaths }).floor_legs, []);
    // The same touch is not excluded for a spec that does not own the log.
    const otherSpec = { ...SPEC, specPath: ".context-index/specs/features/m/not-own.spec.md" };
    assert.deepEqual(finalPass(dir, base, ["new.mjs"], { spec: otherSpec, sensitivePaths }).floor_legs, ["sensitive-path"]);
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

test("computeTouchedFiles reports git modes; a new symlink has mode 120000", () => {
  const dir = repo();
  try {
    writeFileSync(join(dir, "a.mjs"), "export {};\n");
    writeFileSync(join(dir, "gone.txt"), "g\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "files");
    const base = snapshotWorkingTree(dir);

    symlinkSync("a.mjs", join(dir, "link.mjs"));
    writeFileSync(join(dir, "tracked.txt"), "2\n");
    rmSync(join(dir, "gone.txt"));
    const byPath = (records) => [...records].sort((x, y) => x.path.localeCompare(y.path));
    assert.deepEqual(byPath(computeTouchedFiles(dir, base)), [
      { path: "gone.txt", status: "D", mode: "000000", src_mode: "100644" },
      { path: "link.mjs", status: "A", mode: "120000", src_mode: "000000" },
      { path: "tracked.txt", status: "M", mode: "100644", src_mode: "100644" },
    ]);
  } finally {
    cleanupTempDir(dir);
  }
});

test("computeTouchedFiles keeps git's own path bytes: spaces and newlines are never re-split", () => {
  const dir = repo();
  try {
    const base = snapshotWorkingTree(dir);
    writeFileSync(join(dir, "a b.mjs"), "x\n");
    writeFileSync(join(dir, "c\nd.mjs"), "x\n");
    assert.deepEqual(computeTouchedFiles(dir, base).map((r) => r.path).sort(), ["a b.mjs", "c\nd.mjs"]);
  } finally {
    cleanupTempDir(dir);
  }
});

// The snapshot seeds its throwaway index from the real one to reuse the stat
// cache. Git re-hashes an entry only if its stat changed or it is "racily
// clean" (file mtime not older than the index file's mtime). A copied index
// with a fresh mtime disabled that second check, so a same-size edit made in
// the same timestamp tick as the commit was missed (about 1 run in 20).
// Pinning every mtime to one whole second builds that racy state on purpose.
test("a same-size edit whose stat matches the index is still seen (racy-git stat cache)", () => {
  const dir = createTempDir();
  try {
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "t@t.com");
    git(dir, "config", "user.name", "t");
    git(dir, "config", "core.trustctime", "false");
    const T0 = 1_700_000_000;
    const file = join(dir, "e.txt");
    writeFileSync(file, "1");
    utimesSync(file, T0, T0);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    const head = git(dir, "rev-parse", "HEAD").trim();

    writeFileSync(file, "2");
    utimesSync(file, T0, T0);
    utimesSync(join(dir, ".git", "index"), T0, T0);

    // `git status` refreshes and rewrites the real index, so it runs after.
    assert.deepEqual(sorted(computeTouchedFiles(dir, head)), ["M e.txt"]);
    assert.match(git(dir, "status", "--porcelain"), /^ M e\.txt/m, "git itself sees the edit too");
  } finally {
    cleanupTempDir(dir);
  }
});
