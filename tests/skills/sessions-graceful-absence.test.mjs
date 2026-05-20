/**
 * Consumer regression: graceful absence of .context-index/sessions/ (CON-4).
 *
 * Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
 * Plan-task: 20
 *
 * Charter QA: "Graceful absence" — session-capture consumers (/adev:work,
 * /adev:status, /adev:hygiene, /adev:retro) must degrade silently when
 * .context-index/sessions/ is missing or empty.
 *
 * In this codebase, the consumers are skill prose (markdown). The library
 * surface that they invoke from /adev:init and /adev:install
 * (`detectExistingCapture`, the installer dispatcher) must NOT emit warnings
 * or errors when the directory is missing or empty. This test asserts that
 * contract at the library boundary — the layer the consumers actually call.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { detectExistingCapture } from "../../lib/session-capture.mjs";
import {
  dispatchInstallerByCaptureMode,
  appendSessionCaptureGitignoreBlock,
  removeSessionCaptureGitignoreBlock,
  removeSessionCapturePostCommitBlock,
} from "../../lib/cli/install-session-capture.mjs";

function makeBareProject() {
  const dir = createTempDir();
  const ciDir = join(dir, ".context-index");
  mkdirSync(ciDir, { recursive: true });
  writeFileSync(
    join(ciDir, "manifest.yaml"),
    "project:\n  name: test\n",
  );
  return dir;
}

function makeManifest(dir, capture, gitignored) {
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    [
      "project:",
      "  name: test",
      "integrations:",
      "  session_capture:",
      `    capture: ${capture}`,
      `    gitignored: ${gitignored}`,
      "",
    ].join("\n"),
  );
}

function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = "";
  process.stderr.write = (chunk) => {
    buf += chunk.toString();
    return true;
  };
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(
        (v) => {
          process.stderr.write = orig;
          return { result: v, stderr: buf };
        },
        (e) => {
          process.stderr.write = orig;
          throw e;
        },
      );
    }
    process.stderr.write = orig;
    return { result: r, stderr: buf };
  } catch (e) {
    process.stderr.write = orig;
    throw e;
  }
}

test("detectExistingCapture on missing sessions/ returns existing:false silently", async () => {
  const dir = makeBareProject();
  try {
    const { result, stderr } = await captureStderr(() => detectExistingCapture(dir));
    assert.equal(result.existing, false);
    assert.deepEqual(result.signals, []);
    assert.equal(stderr, "", "no stderr expected for empty/missing sessions/");
  } finally {
    cleanupTempDir(dir);
  }
});

test("detectExistingCapture on empty sessions/ returns existing:false silently", async () => {
  const dir = makeBareProject();
  try {
    mkdirSync(join(dir, ".context-index", "sessions"), { recursive: true });
    const { result, stderr } = await captureStderr(() => detectExistingCapture(dir));
    assert.equal(result.existing, false);
    assert.equal(stderr, "");
  } finally {
    cleanupTempDir(dir);
  }
});

test("installer in off mode with missing sessions/ emits no warnings/errors", async () => {
  const dir = makeBareProject();
  const plugin = createTempDir();
  try {
    makeManifest(dir, "off", "false");
    // Plugin tmp has no hooks.json — dispatcher uses default empty data.
    const { result, stderr } = await captureStderr(() =>
      dispatchInstallerByCaptureMode(dir, plugin),
    );
    assert.equal(result.mode, "off");
    assert.deepEqual(result.sessionFiles, []);
    assert.doesNotMatch(stderr, /warn|error|fail/i);
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("installer in hook mode with empty sessions/ emits no warnings/errors", async () => {
  const dir = makeBareProject();
  const plugin = createTempDir();
  try {
    mkdirSync(join(dir, ".context-index", "sessions"), { recursive: true });
    makeManifest(dir, "hook", "true");
    const { result, stderr } = await captureStderr(() =>
      dispatchInstallerByCaptureMode(dir, plugin),
    );
    assert.equal(result.mode, "hook");
    assert.doesNotMatch(stderr, /warn|error|fail/i);
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("paired-marker helpers no-op silently on missing .gitignore / .githooks/post-commit", () => {
  const dir = makeBareProject();
  try {
    // Remove (idempotent) when nothing to remove → noop, no stderr.
    const { result: removed, stderr: s1 } = captureStderr(() =>
      removeSessionCaptureGitignoreBlock(dir),
    );
    assert.equal(removed, "noop");
    assert.equal(s1, "");

    const { result: postRm, stderr: s2 } = captureStderr(() =>
      removeSessionCapturePostCommitBlock(dir),
    );
    assert.equal(postRm, "noop");
    assert.equal(s2, "");

    // Append creates a fresh .gitignore on a project that has none — no warning.
    const { stderr: s3 } = captureStderr(() => appendSessionCaptureGitignoreBlock(dir));
    assert.equal(s3, "");
    assert.ok(existsSync(join(dir, ".gitignore")));
  } finally {
    cleanupTempDir(dir);
  }
});
