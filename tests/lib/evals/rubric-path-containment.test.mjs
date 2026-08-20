import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";

/**
 * Run `fn`, assert that it threw, and return the thrown error.
 *
 * `assert.throws()` itself returns `undefined` (it is a void assertion), so it
 * cannot hand the error back for further inspection. This keeps the strictness
 * of `assert.throws` — nothing thrown is still a failure — while exposing the
 * error so the code/message assertions below can run against it.
 */
function captureThrow(fn) {
  let thrown;
  assert.throws(fn, (err) => {
    thrown = err;
    return true;
  });
  return thrown;
}

test("a traversal path is rejected and nothing is read", () => {
  const root = createTempDir();
  try {
    const err = captureThrow(() => loadRubric("../../etc/passwd", { projectRoot: root }));
    assert.equal(err.code, "UNSAFE_RUBRIC_PATH");
    assert.match(err.message, /\.\.\/\.\.\/etc\/passwd/); // reported verbatim
  } finally {
    cleanupTempDir(root);
  }
});

test("a symlink escaping the project root is rejected", () => {
  const root = createTempDir();
  const outside = createTempDir();
  try {
    writeFileSync(join(outside, "real.yaml"), "rubric_id: x\n");
    mkdirSync(join(root, "rubrics"));
    symlinkSync(join(outside, "real.yaml"), join(root, "rubrics", "link.yaml"));
    const err = captureThrow(() => loadRubric("rubrics/link.yaml", { projectRoot: root }));
    assert.equal(err.code, "UNSAFE_RUBRIC_PATH");
  } finally {
    cleanupTempDir(root);
    cleanupTempDir(outside);
  }
});

test("a contained but absent path throws RUBRIC_NOT_FOUND naming the resolved path", () => {
  const root = createTempDir();
  try {
    const err = captureThrow(() => loadRubric("rubrics/gone.yaml", { projectRoot: root }));
    assert.equal(err.code, "RUBRIC_NOT_FOUND");
    assert.match(err.message, /gone\.yaml/);
  } finally {
    cleanupTempDir(root);
  }
});
