// tests/integration/spec-drift-no-merge-conflict.test.mjs
//
// Headline acceptance test for jsonl-drift-events.spec.md Behavior 8.
//
// The whole spec exists to fix one operational bug: two concurrent feature
// branches each invoking `stampDrift` on overlapping specs from different
// `source` files produced spurious merge conflicts on the spec's frontmatter
// `drift_source` / `drift_at` lines. The fix moves the per-detection payload
// out of frontmatter into per-spec append-only JSONL events, so:
//   - The frontmatter side of a stamp is byte-identical on both branches
//     (just `drift_detected: true`) → git's three-way merge auto-applies
//     the "both added" line.
//   - The JSONL side appends disjoint lines at the end of each branch's
//     own copy → append-only files merge cleanly when both branches add
//     non-conflicting lines.
//
// This test reproduces the conflict scenario and asserts that a merge of
// two such branches resolves cleanly with zero content conflicts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { stampDrift } from "../../lib/spec-drift.mjs";
import { readEvents } from "../../lib/lifecycle-state.mjs";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(__filename), "..", "..");

function git(args, opts) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

function writeFile(root, relPath, content) {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return relPath;
}

test("two concurrent feature branches stamping the same spec from different sources merge with zero conflicts (Behavior 8)", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "drift-merge-"));
  t.after(() => {
    try { rmSync(repo, { recursive: true, force: true }); } catch {}
  });

  // ── Initialize repo + minimal .context-index ─────────────────────────────
  git(["init", "-q", "--initial-branch=main"], { cwd: repo });
  git(["config", "user.email", "drift-test@example.com"], { cwd: repo });
  git(["config", "user.name", "Drift Test"], { cwd: repo });

  mkdirSync(join(repo, ".context-index", "specs", "features", "m"), {
    recursive: true,
  });
  writeFile(repo, ".context-index/manifest.yaml", "domain: software\n");

  // Mirror the project's .gitattributes so the test exercises the actual
  // production merge semantics. Without `merge=union` on JSONL paths, git's
  // default three-way merge marks the file as conflicted whenever two
  // branches each append disjoint lines — masking the real Behavior 8
  // question (do disjoint appends merge cleanly?). The shipped
  // `.gitattributes` at the repo root declares
  // `.context-index/lifecycle-state/*.jsonl merge=union`.
  writeFile(repo, ".gitattributes",
    ".context-index/lifecycle-state/*.jsonl merge=union\n"
  );

  const specRel = ".context-index/specs/features/m/shared.spec.md";
  writeFile(repo, specRel, [
    "---",
    "title: shared",
    "status: implemented",
    "source-manifest:",
    "  sha: \"abc1234\"",
    "  files:",
    "    - lib/a.mjs",
    "    - lib/b.mjs",
    "  computed-at: \"2026-04-01T12:00:00Z\"",
    "---",
    "",
    "# shared",
  ].join("\n"));

  // Seed the lifecycle JSONL on main with one event so the per-spec log file
  // exists at the merge base. Otherwise both branches would "add" the same
  // new file → git fires an add/add conflict on path identity, masking the
  // real Behavior 8 question (does the in-file content merge cleanly?). In
  // a real workspace the per-spec JSONL is created as soon as ANY lifecycle
  // event lands (specify/review/plan emit events long before stampDrift), so
  // a pre-existing file is the realistic merge base.
  const specAbs = join(repo, specRel);
  const { appendEvent } = await import("../../lib/lifecycle-state.mjs");
  appendEvent(repo, specRel, {
    event: "lifecycle_step",
    step: "specify",
    status: "started",
  });

  git(["add", "."], { cwd: repo });
  git(["commit", "-q", "-m", "init"], { cwd: repo });

  // ── Branch A: stamp drift from lib/a.mjs, commit ─────────────────────────
  git(["checkout", "-q", "-b", "branchA"], { cwd: repo });
  await stampDrift(specAbs, "lib/a.mjs");
  git(["add", "-A"], { cwd: repo });
  git(["commit", "-q", "-m", "stamp from a.mjs"], { cwd: repo });

  // ── Branch B (from main, NOT from branchA): stamp drift from lib/b.mjs ───
  git(["checkout", "-q", "main"], { cwd: repo });
  git(["checkout", "-q", "-b", "branchB"], { cwd: repo });
  await stampDrift(specAbs, "lib/b.mjs");
  git(["add", "-A"], { cwd: repo });
  git(["commit", "-q", "-m", "stamp from b.mjs"], { cwd: repo });

  // ── Merge branchA into branchB. Behavior 8 promises ZERO content conflict. ─
  // git merge exits non-zero on conflict; capture stderr/stdout for diagnostics.
  let mergeOut = "";
  let mergeErr = "";
  try {
    mergeOut = execFileSync(
      "git",
      ["merge", "branchA", "--no-edit", "-q"],
      { cwd: repo, encoding: "utf8" },
    );
  } catch (err) {
    mergeOut = err.stdout?.toString() ?? "";
    mergeErr = err.stderr?.toString() ?? "";
    // Surface diagnostics in the failure message.
    const status = execFileSync("git", ["status", "--short"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.fail(
      "git merge failed (Behavior 8 violation):\n" +
        `stdout: ${mergeOut}\n` +
        `stderr: ${mergeErr}\n` +
        `git status:\n${status}`,
    );
  }

  // Confirm no unmerged paths remain.
  const status = execFileSync("git", ["status", "--short"], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.doesNotMatch(
    status,
    /^[UAD][UAD] /m,
    "unexpected unmerged paths after merge:\n" + status,
  );

  // ── Both drift events must be present in the merged JSONL ────────────────
  const events = readEvents(repo, specRel).filter(
    (e) => e.event === "code_drift_detected",
  );
  const sources = events.map((e) => e.drift_source).sort();
  assert.deepEqual(
    sources,
    ["lib/a.mjs", "lib/b.mjs"],
    "both stamps must be preserved after merge",
  );

  // ── Spec frontmatter side has the byte-identical `drift_detected: true`
  //    line only — no per-detection payload to conflict on.
  const specBody = readFileSync(specAbs, "utf8");
  assert.match(specBody, /^drift_detected:\s*true$/m);
  assert.doesNotMatch(specBody, /^drift_source:/m, "no legacy drift_source in frontmatter");
  assert.doesNotMatch(specBody, /^drift_at:/m, "no legacy drift_at in frontmatter");
});
