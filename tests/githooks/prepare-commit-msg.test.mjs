/**
 * Regression test for issue-526: the prepare-commit-msg hook must append
 * provenance trailers (Author-type, Operator, Issue) without breaking the
 * trailer block that the commit body already provides (Spec, Plan-task).
 *
 * Before the fix, the hook's `printf '\n%s'` unconditionally inserted a
 * blank line between the body-trailer paragraph and the appended trailers,
 * splitting the trailer block into two paragraphs. Per git's trailer
 * convention, only the LAST paragraph is parsed as trailers — so
 * `git interpret-trailers --parse` returned only the appended block and
 * silently dropped Spec: / Plan-task: from the body.
 *
 * The fix detects when the body already ends with a trailer-formatted line
 * and appends the new trailers without the leading newline, keeping the
 * trailer block as a single contiguous paragraph.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const HOOK_PATH = join(PLUGIN_ROOT, ".githooks", "prepare-commit-msg");

function runHook(tmp, messageBody) {
  const msgFile = join(tmp, "COMMIT_EDITMSG");
  writeFileSync(msgFile, messageBody, "utf8");

  // Seed minimal session tracking so the hook has something to inject.
  const ciDir = join(tmp, ".context-index");
  mkdirSync(ciDir, { recursive: true });
  writeFileSync(
    join(ciDir, ".session-tracking.jsonl"),
    JSON.stringify({
      operator: "test/local",
      author_type: "agent/claude-code",
      ts: new Date().toISOString(),
    }) + "\n",
    "utf8",
  );

  const result = spawnSync("bash", [HOOK_PATH, msgFile], {
    cwd: tmp,
    env: { ...process.env, ADEV_PROJECT_ROOT: tmp },
    encoding: "utf8",
  });

  return { exitCode: result.status, stderr: result.stderr, body: readFileSync(msgFile, "utf8") };
}

function parseTrailers(messageBody) {
  // Use git interpret-trailers --parse to get the canonical trailer block.
  const result = execFileSync("git", ["interpret-trailers", "--parse"], {
    input: messageBody,
    encoding: "utf8",
  });
  return result.trim().split("\n").filter(Boolean);
}

test("prepare-commit-msg: appends to existing in-body trailer block as single paragraph", () => {
  const tmp = createTempDir();
  try {
    const body = [
      "feat(test): something",
      "",
      "Body paragraph explaining the change.",
      "",
      "Spec: .context-index/specs/features/foo/bar.spec.md",
      "Plan-task: 3",
      "",
    ].join("\n");

    const { exitCode, body: out } = runHook(tmp, body);
    assert.equal(exitCode, 0, "hook should exit 0");

    const trailers = parseTrailers(out);
    // All trailers — both body-injected and hook-appended — must be parseable
    // by `git interpret-trailers --parse` as a single trailer block.
    const keys = trailers.map((line) => line.split(":")[0]);
    assert.ok(keys.includes("Spec"), "Spec: must be parsed as a trailer (was: " + keys.join(",") + ")");
    assert.ok(keys.includes("Plan-task"), "Plan-task: must be parsed as a trailer");
    assert.ok(keys.includes("Author-type"), "Author-type: must be parsed as a trailer");
    assert.ok(keys.includes("Operator"), "Operator: must be parsed as a trailer");
  } finally {
    cleanupTempDir(tmp);
  }
});

test("prepare-commit-msg: appends as new paragraph when body has no trailer block", () => {
  const tmp = createTempDir();
  try {
    const body = [
      "feat(test): something else",
      "",
      "Body paragraph with no trailers at the end.",
      "",
    ].join("\n");

    const { exitCode, body: out } = runHook(tmp, body);
    assert.equal(exitCode, 0, "hook should exit 0");

    const trailers = parseTrailers(out);
    const keys = trailers.map((line) => line.split(":")[0]);
    assert.ok(keys.includes("Author-type"), "Author-type: must be parsed");
    assert.ok(keys.includes("Operator"), "Operator: must be parsed");
  } finally {
    cleanupTempDir(tmp);
  }
});

test("prepare-commit-msg: %(trailers) returns all trailers when body has in-trailer-block trailers", () => {
  // The core regression: before the fix, %(trailers) skipped the body
  // trailers because the hook split the trailer block with a blank line.
  // After the fix, %(trailers) must return Spec, Plan-task, AND the
  // hook-appended trailers as one block.
  const tmp = createTempDir();
  try {
    const body = [
      "feat(test): integration check",
      "",
      "Body text.",
      "",
      "Spec: .context-index/specs/features/foo/bar.spec.md",
      "Plan-task: 7",
      "",
    ].join("\n");

    const { body: out } = runHook(tmp, body);
    const trailers = parseTrailers(out);
    const keys = trailers.map((line) => line.split(":")[0]);

    // All four trailers must coexist in a single parseable block.
    for (const required of ["Spec", "Plan-task", "Author-type", "Operator"]) {
      assert.ok(
        keys.includes(required),
        `${required}: must be parsed (got: ${keys.join(", ")})`,
      );
    }
  } finally {
    cleanupTempDir(tmp);
  }
});
