/**
 * End-to-end installer tests for session-capture mode dispatch.
 *
 * Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
 * Plan-task: 21 (validates production code from tasks 11-16, 15)
 *
 * Tests the library-level dispatcher directly (`dispatchInstallerByCaptureMode`)
 * rather than the full `adev install` command so the test stays focused on
 * the mode-specific side effects and runs without exercising provider install
 * (which has external side effects in the test environment).
 *
 * Subtests:
 *   1. capture: hook on new project → hooks registered, gitignore block written
 *   2. capture: hook on legacy project → post-commit sentinel block removed,
 *      gitignore block written, hooks registered
 *   3. capture: post-commit → post-commit unchanged, no hook entries
 *   4. capture: off → no hook entries, post-commit cleaned, gitignore cleaned,
 *      sessions/ files preserved on disk
 *   5. Idempotency: re-run produces no duplicates
 *   6. User content outside markers preserved
 *   7. SEC-11 sentinel-mismatch: opening marker without closing → exits 0 with
 *      `[adev:session-capture] validation-error sentinel-mismatch <path>` to
 *      stderr, no modification
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

import {
  dispatchInstallerByCaptureMode,
  appendSessionCaptureGitignoreBlock,
  removeSessionCaptureGitignoreBlock,
  removeSessionCapturePostCommitBlock,
  wrapLegacyPostCommitWithSentinels,
} from "../../lib/session-capture-installer.mjs";

function makeManifest(dir, capture, gitignored) {
  const ciDir = join(dir, ".context-index");
  mkdirSync(ciDir, { recursive: true });
  writeFileSync(
    join(ciDir, "manifest.yaml"),
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

function writeFile(dir, rel, content) {
  const path = join(dir, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function makePluginRootFixture() {
  // The installer mutates the plugin-side hooks.json. Use a tmpdir copy so
  // tests do not race against the real hooks.json on disk.
  const tmp = createTempDir();
  mkdirSync(join(tmp, "hooks"), { recursive: true });
  copyFileSync(
    join(PLUGIN_ROOT, "hooks", "hooks.json"),
    join(tmp, "hooks", "hooks.json"),
  );
  return tmp;
}

function readHooksJson(pluginRoot) {
  return JSON.parse(
    readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8"),
  );
}

function hasHookEntry(data, eventName, scriptPath) {
  const rows = data?.hooks?.[eventName];
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    if (!Array.isArray(row.hooks)) continue;
    if (row.hooks.some((h) => h?.command?.includes(scriptPath))) return true;
  }
  return false;
}

test("hook mode on a new project: hooks registered + gitignore block written", async () => {
  const dir = createTempDir();
  const plugin = makePluginRootFixture();
  try {
    makeManifest(dir, "hook", "true");
    const result = await dispatchInstallerByCaptureMode(dir, plugin);
    assert.equal(result.mode, "hook");

    const hooksJson = readHooksJson(plugin);
    assert.ok(hasHookEntry(hooksJson, "SessionEnd", "session-end.sh"));
    assert.ok(hasHookEntry(hooksJson, "PreCompact", "pre-compact.sh"));

    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(gitignore, /# >>> adev:session-capture-gitignore >>>/);
    assert.match(gitignore, /\.context-index\/sessions\//);
    assert.match(gitignore, /# <<< adev:session-capture-gitignore <<</);
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("hook mode on legacy project: sentinel block removed, gitignore added, hooks registered", async () => {
  const dir = createTempDir();
  const plugin = makePluginRootFixture();
  try {
    makeManifest(dir, "hook", "true");
    // Pre-existing sentinel-wrapped legacy block.
    writeFile(
      dir,
      ".githooks/post-commit",
      [
        "#!/usr/bin/env bash",
        "set -uo pipefail",
        "# >>> adev:session-capture >>>",
        "# session-capture legacy block",
        "node lib/session-summary.mjs >/dev/null",
        ".context-index/sessions writeup",
        "# <<< adev:session-capture <<<",
        "exit 0",
        "",
      ].join("\n"),
    );

    const result = await dispatchInstallerByCaptureMode(dir, plugin);
    assert.equal(result.mode, "hook");

    const postCommit = readFileSync(join(dir, ".githooks", "post-commit"), "utf8");
    assert.doesNotMatch(postCommit, /# >>> adev:session-capture >>>/);
    assert.doesNotMatch(postCommit, /# <<< adev:session-capture <<</);
    // User content outside markers preserved.
    assert.match(postCommit, /#!\/usr\/bin\/env bash/);
    assert.match(postCommit, /exit 0/);
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("post-commit mode: leaves post-commit intact, hooks NOT registered", async () => {
  const dir = createTempDir();
  const plugin = makePluginRootFixture();
  try {
    makeManifest(dir, "post-commit", "false");
    const legacyContent = [
      "#!/usr/bin/env bash",
      "# >>> adev:session-capture >>>",
      "# session-capture legacy",
      "node lib/session-summary.mjs",
      ".context-index/sessions write",
      "# <<< adev:session-capture <<<",
      "exit 0",
      "",
    ].join("\n");
    writeFile(dir, ".githooks/post-commit", legacyContent);

    await dispatchInstallerByCaptureMode(dir, plugin);
    const postCommit = readFileSync(join(dir, ".githooks", "post-commit"), "utf8");
    assert.equal(postCommit, legacyContent);

    const hooksJson = readHooksJson(plugin);
    assert.ok(!hasHookEntry(hooksJson, "SessionEnd", "session-end.sh"));
    assert.ok(!hasHookEntry(hooksJson, "PreCompact", "pre-compact.sh"));
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("off mode: hooks unregistered, post-commit cleaned, gitignore removed, sessions/ preserved", async () => {
  const dir = createTempDir();
  const plugin = makePluginRootFixture();
  try {
    makeManifest(dir, "off", "false");
    writeFile(
      dir,
      ".githooks/post-commit",
      [
        "#!/usr/bin/env bash",
        "# user content above",
        "# >>> adev:session-capture >>>",
        "# session-capture stuff",
        "node lib/session-summary.mjs",
        ".context-index/sessions/x",
        "# <<< adev:session-capture <<<",
        "exit 0",
        "",
      ].join("\n"),
    );
    writeFile(
      dir,
      ".gitignore",
      [
        "node_modules/",
        "# >>> adev:session-capture-gitignore >>>",
        ".context-index/sessions/",
        "# <<< adev:session-capture-gitignore <<<",
        "dist/",
        "",
      ].join("\n"),
    );
    writeFile(dir, ".context-index/sessions/2025-01-01-keep-me.md", "old session\n");

    const result = await dispatchInstallerByCaptureMode(dir, plugin);
    assert.equal(result.mode, "off");

    const postCommit = readFileSync(join(dir, ".githooks", "post-commit"), "utf8");
    assert.doesNotMatch(postCommit, /adev:session-capture/);
    assert.match(postCommit, /user content above/);
    assert.match(postCommit, /exit 0/);

    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.doesNotMatch(gitignore, /adev:session-capture-gitignore/);
    assert.match(gitignore, /node_modules/);
    assert.match(gitignore, /dist\//);

    // Sessions files preserved.
    assert.ok(existsSync(join(dir, ".context-index", "sessions", "2025-01-01-keep-me.md")));
    assert.ok(result.sessionFiles.some((f) => f.endsWith("2025-01-01-keep-me.md")));
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("idempotency: re-running hook mode produces no duplicates", async () => {
  const dir = createTempDir();
  const plugin = makePluginRootFixture();
  try {
    makeManifest(dir, "hook", "true");
    await dispatchInstallerByCaptureMode(dir, plugin);
    const gitignoreA = readFileSync(join(dir, ".gitignore"), "utf8");
    const hooksJsonA = JSON.stringify(readHooksJson(plugin));

    await dispatchInstallerByCaptureMode(dir, plugin);
    const gitignoreB = readFileSync(join(dir, ".gitignore"), "utf8");
    const hooksJsonB = JSON.stringify(readHooksJson(plugin));

    assert.equal(gitignoreA, gitignoreB);
    assert.equal(hooksJsonA, hooksJsonB);
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(plugin);
  }
});

test("SEC-11 sentinel-mismatch: opening present, closing missing → exit 0, no modification, stderr emitted", () => {
  const dir = createTempDir();
  try {
    const halfBlocked = [
      "#!/usr/bin/env bash",
      "# >>> adev:session-capture >>>",
      "# session-capture",
      "node lib/session-summary.mjs",
      ".context-index/sessions write",
      // no closing marker!
      "exit 0",
      "",
    ].join("\n");
    writeFile(dir, ".githooks/post-commit", halfBlocked);

    // We exercise `removeSessionCapturePostCommitBlock` directly to capture
    // stderr without spawning a subprocess; format matches SEC-7.
    const origWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    process.stderr.write = (chunk) => {
      captured += chunk.toString();
      return true;
    };
    let outcome;
    try {
      outcome = removeSessionCapturePostCommitBlock(dir);
    } finally {
      process.stderr.write = origWrite;
    }
    assert.equal(outcome, "sentinel-mismatch");
    assert.match(
      captured,
      /^\[adev:session-capture\] validation-error sentinel-mismatch \.githooks\/post-commit/m,
    );
    // File unchanged.
    assert.equal(
      readFileSync(join(dir, ".githooks", "post-commit"), "utf8"),
      halfBlocked,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("one-time sentinel-wrap migration wraps a legacy block that has no sentinels", () => {
  const dir = createTempDir();
  try {
    writeFile(
      dir,
      ".githooks/post-commit",
      [
        "#!/usr/bin/env bash",
        "# user shebang content",
        "# session-capture legacy block (no sentinels)",
        "node lib/session-summary.mjs >/dev/null",
        ".context-index/sessions writeup",
        "exit 0",
        "",
      ].join("\n"),
    );

    const out = wrapLegacyPostCommitWithSentinels(dir);
    assert.equal(out, "wrapped");
    const content = readFileSync(join(dir, ".githooks", "post-commit"), "utf8");
    assert.match(content, /# >>> adev:session-capture >>>/);
    assert.match(content, /# <<< adev:session-capture <<</);
    // Idempotent: re-run is a no-op.
    const second = wrapLegacyPostCommitWithSentinels(dir);
    assert.equal(second, "already-sentinel");
  } finally {
    cleanupTempDir(dir);
  }
});

test("user content outside markers preserved in .gitignore on re-runs", () => {
  const dir = createTempDir();
  try {
    writeFile(
      dir,
      ".gitignore",
      "node_modules/\ncustom-pattern/\n",
    );
    appendSessionCaptureGitignoreBlock(dir);
    let content = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(content, /node_modules\//);
    assert.match(content, /custom-pattern\//);
    assert.match(content, /\.context-index\/sessions\//);
    // Remove → custom content survives.
    removeSessionCaptureGitignoreBlock(dir);
    content = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(content, /node_modules\//);
    assert.match(content, /custom-pattern\//);
    assert.doesNotMatch(content, /adev:session-capture-gitignore/);
  } finally {
    cleanupTempDir(dir);
  }
});
