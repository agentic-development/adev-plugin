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
import { spawnSync, execSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";

import {
  createTempDir,
  cleanupTempDir,
  createTempGitRepo,
  runGitHook,
  writeFixture,
  PLUGIN_ROOT,
} from "../helpers.mjs";

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

// ─────────────────────────────────────────────────────────────────────────
// issue-588 regression: the sentinel-wrap bound detection used to anchor on
// the FIRST line merely mentioning "session-capture" — in the real
// .githooks/post-commit that line is the self-skip guard's diagnostic echo,
// which sits INSIDE the guard's own (from the wrapped block's point of
// view, unclosed) `if` structure. Wrapping there opened a sentinel mid-way
// through that structure; the later sentinel-bounded removal then deleted
// the guard's closing `fi`s and left invalid bash (`bash -n` failure).
// ─────────────────────────────────────────────────────────────────────────

test("issue-588: wrap+remove on a self-skip-guard-shaped fixture leaves a bash -n clean script", () => {
  const dir = createTempDir();
  try {
    // Shaped like the real .githooks/post-commit: a self-skip guard whose
    // diagnostic echo mentions "session-capture" and lives inside nested
    // `if` blocks, followed later by the actual capture-writer invocation.
    const fixture = [
      "#!/usr/bin/env bash",
      "set -uo pipefail",
      "",
      'COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null) || exit 0',
      'CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r "$COMMIT_HASH" 2>/dev/null || echo "")',
      "",
      "# Self-skip guard: mentions session-capture in its diagnostic, BEFORE",
      "# the writer block below.",
      'if [ -n "$CHANGED_FILES" ]; then',
      "  SESSIONS_ONLY=1",
      "  while IFS= read -r CHANGED_PATH; do",
      '    [ -z "$CHANGED_PATH" ] && continue',
      '    case "$CHANGED_PATH" in',
      "      .context-index/sessions/*) ;;",
      "      *) SESSIONS_ONLY=0; break ;;",
      "    esac",
      '  done <<< "$CHANGED_FILES"',
      "",
      '  if [ "$SESSIONS_ONLY" = "1" ]; then',
      '    echo "session-capture skipped: sessions-only commit" >&2',
      "    exit 0",
      "  fi",
      "fi",
      "",
      'OUTPUT_DIR=".context-index/sessions"',
      'TRACKING_FILE=".context-index/.session-tracking.jsonl"',
      "",
      "# Call session-summary writer with enriched content",
      'node --input-type=module -e "',
      "  import { writeSummary } from './lib/session-summary.mjs';",
      "  await writeSummary('body', {}, process.env.ADEV_PC_OUTPUT_DIR);",
      '" 2>/dev/null || true',
      "",
      "exit 0",
      "",
    ].join("\n");
    writeFile(dir, ".githooks/post-commit", fixture);

    const wrapOut = wrapLegacyPostCommitWithSentinels(dir);
    assert.equal(wrapOut, "wrapped");

    const afterWrap = readFileSync(join(dir, ".githooks", "post-commit"), "utf8");
    const wrapCheck = spawnSync("bash", ["-n"], { input: afterWrap, encoding: "utf8" });
    assert.equal(wrapCheck.status, 0, `wrapped script should be bash -n clean: ${wrapCheck.stderr}`);

    const removeOut = removeSessionCapturePostCommitBlock(dir);
    assert.equal(removeOut, "removed");

    const afterRemove = readFileSync(join(dir, ".githooks", "post-commit"), "utf8");
    const removeCheck = spawnSync("bash", ["-n"], { input: afterRemove, encoding: "utf8" });
    assert.equal(
      removeCheck.status,
      0,
      `post-removal script should be bash -n clean: ${removeCheck.stderr}`,
    );

    // The self-skip guard's if/fi structure must survive intact — both
    // closing `fi`s remain, and the writer invocation is gone.
    assert.match(afterRemove, /if \[ -n "\$CHANGED_FILES" \]; then/);
    assert.match(afterRemove, /^fi$/m);
    assert.doesNotMatch(afterRemove, /node --input-type=module/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("issue-588: removal that would break bash syntax is refused via the syntax-guard, file left untouched", () => {
  // A hand-authored (or otherwise mis-anchored) sentinel pair that opens
  // INSIDE an `if` and closes AFTER its `fi` — the same corruption shape
  // as the original bug: removing everything between the sentinels deletes
  // the `fi` without its `if`, leaving invalid bash. The syntax-guard must
  // catch this BEFORE writing.
  const dir = createTempDir();
  try {
    const original = [
      "#!/usr/bin/env bash",
      'if [ -n "$X" ]; then',
      "# >>> adev:session-capture >>>",
      "  echo hi",
      "fi",
      "# <<< adev:session-capture <<<",
      "exit 0",
      "",
    ].join("\n");
    writeFile(dir, ".githooks/post-commit", original);

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

    assert.equal(outcome, "syntax-guard");
    assert.match(captured, /\[adev:session-capture\] syntax-guard/);
    // File must be byte-identical — the guard refuses to write.
    assert.equal(
      readFileSync(join(dir, ".githooks", "post-commit"), "utf8"),
      original,
      "post-commit must be left untouched when removal would break bash syntax",
    );
  } finally {
    cleanupTempDir(dir);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// issue-582 regression: a crafted `Spec:` trailer on a commit (e.g. fetched
// from a remote, then checked out) used to be shell-interpolated directly
// into the inline `node --input-type=module -e "..."` JS source, letting
// attacker-controlled trailer text break out of the JS string literal it
// was spliced into and execute arbitrary code on first post-commit. The fix
// passes every git-derived value through environment variables instead
// (read back via `process.env` inside the script) so the value is always
// treated as inert data, never as source text.
// ─────────────────────────────────────────────────────────────────────────

test("issue-582 regression: post-commit's inline JS never shell-interpolates git-derived values", () => {
  const hookPath = join(PLUGIN_ROOT, ".githooks", "post-commit");
  const content = readFileSync(hookPath, "utf8");

  const match = content.match(/node --input-type=module -e "\n([\s\S]*?)\n"/);
  assert.ok(match, "post-commit should contain the node --input-type=module -e invocation");
  const jsBody = match[1];

  // None of the git-derived bash variables may be spliced into the JS
  // source via ${...} interpolation.
  for (const name of [
    "COMMIT_HASH",
    "COMMIT_DATE",
    "COMMIT_SUBJECT",
    "COMMIT_BODY",
    "SPECS_TOUCHED",
    "CHANGED_FILES",
    "OUTPUT_DIR",
    "TRACKING_FILE",
  ]) {
    assert.doesNotMatch(
      jsBody,
      new RegExp(`\\$\\{${name}\\}`),
      `JS body must not interpolate bash variable \${${name}} into the JS source`,
    );
  }
  // No residual ${VAR}-style bash interpolation or $(...) command
  // substitution anywhere in the JS body.
  assert.doesNotMatch(jsBody, /\$\{[A-Za-z_][A-Za-z0-9_]*\}/, "no ${VAR}-style bash interpolation in the JS body");
  assert.doesNotMatch(jsBody, /\$\([^)]*\)/, "no $(...) command substitution in the JS body");
  // Dynamic values are read via process.env instead.
  assert.match(jsBody, /process\.env/, "dynamic values must be read via process.env");
});

test("issue-582 regression: a malicious Spec: trailer never reaches the JS as code (live git repo)", () => {
  const dir = createTempGitRepo({ branch: "feat/test" });
  try {
    // Same fixture wiring as tests/hooks/post-commit-self-skip.test.mjs:
    // the hook's node block resolves `./lib/session-summary.mjs` relative
    // to cwd, so symlink the plugin's lib/ in and exclude it (+ the
    // post-commit-mode manifest) from `git add -A`.
    symlinkSync(join(PLUGIN_ROOT, "lib"), join(dir, "lib"), "dir");
    writeFileSync(
      join(dir, ".git", "info", "exclude"),
      "lib\n.context-index/manifest.yaml\n",
    );
    writeFixture(
      dir,
      ".context-index/manifest.yaml",
      [
        "project:",
        "  name: test",
        "integrations:",
        "  session_capture:",
        "    capture: post-commit",
        "    gitignored: false",
        "",
      ].join("\n"),
    );

    writeFixture(dir, "src/index.ts", "export const foo = 1;\n");
    execSync("git add -A", { cwd: dir, stdio: "ignore" });

    // A trailer value shaped like a JS-string-breakout + shell-metachar
    // payload: closes a hypothetical enclosing quote, chains a statement
    // that would create a marker file, then comments out the remainder —
    // plus raw shell substitution syntax for good measure.
    const shellMarker = join(dir, "PWNED_SHELL");
    const jsMarker = join(dir, "PWNED_JS");
    const payload =
      `$(touch ${shellMarker})` +
      "`touch " + shellMarker + "`" +
      `'); (async()=>{ const fs = await import('node:fs'); fs.writeFileSync('${jsMarker}', 'x'); })(); ('` +
      "${IFS}//";

    const messageFile = join(dir, ".commit-msg");
    writeFileSync(messageFile, `feat(x): trigger capture\n\nSpec: ${payload}\n`);
    execSync(`git commit -F "${messageFile}"`, { cwd: dir, stdio: "ignore" });

    const { exitCode } = runGitHook("post-commit", { cwd: dir });
    assert.equal(exitCode, 0, "hook must always exit 0");

    assert.ok(!existsSync(shellMarker), "shell command/backtick substitution in the trailer must not execute");
    assert.ok(!existsSync(jsMarker), "JS string-breakout in the trailer must not execute");

    // Capture still succeeds for this non-session commit — the payload
    // flows through as inert data.
    const sessionsDir = join(dir, ".context-index", "sessions");
    const files = existsSync(sessionsDir)
      ? readdirSync(sessionsDir).filter((f) => f.endsWith(".md"))
      : [];
    assert.equal(files.length, 1, "one capture file should be written");

    const raw = readFileSync(join(sessionsDir, files[0]), "utf8");
    assert.match(raw, /^specs-touched:/m, "frontmatter should still contain specs-touched");
    // The payload survives verbatim in the rendered commit body — proof it
    // flowed through as inert data rather than altering control flow.
    assert.ok(
      raw.includes(payload),
      "payload should appear as literal data in the capture, not have altered control flow",
    );
    // issue-564: it must NOT reach `specs-touched`. That field is now an
    // allow-list of repo-relative `.context-index/specs/**/*.spec.md` paths,
    // so a trailer of any other shape is dropped rather than recorded for
    // downstream consumers to resolve.
    assert.match(
      raw,
      /^specs-touched: \[\]$/m,
      "a non-spec-path trailer must be dropped from specs-touched",
    );
  } finally {
    cleanupTempDir(dir);
  }
});
