import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { readdirSync, readFileSync, existsSync, writeFileSync, symlinkSync } from "fs";
import { join } from "path";
import { createTempGitRepo, cleanupTempDir, writeFixture, runGitHook, PLUGIN_ROOT } from "../helpers.mjs";

describe("post-commit git hook self-skip", () => {
  let gitDir;

  afterEach(() => {
    if (gitDir) cleanupTempDir(gitDir);
  });

  // The hook's node block resolves `./lib/session-summary.mjs` relative to the
  // commit's working directory. In a tempdir there is no `lib/`, so we symlink
  // the plugin's `lib/` in before invoking the hook. Without this, the hook's
  // node block fails silently (it has `2>/dev/null || true`) and no capture
  // file is ever written — which would make the capture-count assertions
  // tautologically false on both pre- and post-patch hooks.
  //
  // The symlink must be excluded from `git add -A` so it does not appear in
  // `git diff-tree HEAD` output (which would defeat the sessions-only skip
  // guard). Using `.git/info/exclude` keeps the exclusion local to the temp
  // repo without committing a .gitignore.
  //
  // SA-8 / Plan-task 18 — this test exercises only the post-commit back-compat
  // path. After hook-driven-capture lands, the legacy capture lives behind
  // `integrations.session_capture.capture: post-commit` in the manifest. Each
  // fixture writes that manifest so the test continues to gate the post-commit
  // hook even after the spec it covers (post-commit-self-skip.spec.md) is
  // marked `superseded` by hook-driven-capture.spec.md.
  function setupHookEnv(dir) {
    symlinkSync(join(PLUGIN_ROOT, "lib"), join(dir, "lib"), "dir");
    // Exclude both the symlinked lib AND the post-commit-mode manifest from
    // `git add -A` so neither appears in `git diff-tree HEAD` output (which
    // would defeat the sessions-only skip guard).
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
  }

  // Helper: stage a set of files then create a commit, return the SHA.
  function commitFiles(dir, files, message = "test commit") {
    for (const [relPath, content] of Object.entries(files)) {
      writeFixture(dir, relPath, content);
    }
    execSync(`git add -A`, { cwd: dir, stdio: "ignore" });
    execSync(`git commit -m "${message}"`, { cwd: dir, stdio: "ignore" });
    return execSync("git rev-parse HEAD", { cwd: dir, encoding: "utf8" }).trim();
  }

  function captureCount(dir) {
    const sessionsDir = join(dir, ".context-index", "sessions");
    if (!existsSync(sessionsDir)) return 0;
    return readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).length;
  }

  it("skips capture when all changed files are inside .context-index/sessions/", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitFiles(gitDir, {
      ".context-index/sessions/2026-05-19-abc1234.md": "## Intent\nprior\n",
      ".context-index/sessions/2026-05-19-def5678.md": "## Intent\nprior 2\n",
    }, "chore(sessions): record transcripts");

    const before = captureCount(gitDir);
    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before, "no new capture file should be written");
    assert.match(stderr, /session-capture skipped: sessions-only commit/);
  });

  it("writes capture for a mixed commit (one source file + N session files)", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitFiles(gitDir, {
      "src/index.ts": "export const foo = 1;\n",
      ".context-index/sessions/2026-05-19-mix0001.md": "## Intent\nprior\n",
    }, "feat(core): mixed commit");

    const before = captureCount(gitDir);
    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before + 1, "one new capture file should be written");
    assert.doesNotMatch(stderr, /sessions-only commit/);
  });

  it("writes capture for a non-session commit", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitFiles(gitDir, { "src/lib.ts": "export const bar = 2;\n" }, "feat(lib): bar");

    const before = captureCount(gitDir);
    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before + 1);
  });

  it("writes capture for prefix-collision paths like .context-index/sessions-archive/", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitFiles(gitDir, {
      ".context-index/sessions-archive/old.md": "archived\n",
      ".context-index/sessions.bak": "backup\n",
    }, "chore: archive sessions");

    const before = captureCount(gitDir);
    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(captureCount(gitDir), before + 1, "capture should be written for non-strict-prefix paths");
    assert.doesNotMatch(stderr, /sessions-only commit/);
  });

  it("emits diagnostic on stderr without affecting exit status", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);
    commitFiles(gitDir, {
      ".context-index/sessions/2026-05-19-diag0001.md": "## Intent\nprior\n",
    }, "chore(sessions): single");

    const { exitCode, stderr } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.match(stderr, /session-capture skipped: sessions-only commit/);
  });

  it("preserves .session-tracking.jsonl on the skip path (NOT truncated)", () => {
    // Addresses review note CON-1: skip path inherits the existing behavior
    // that .context-index/.session-tracking.jsonl is NOT cleared when
    // writeSummary is not called. Tool-call records continue to accumulate
    // until the next non-session commit triggers the capture-write path.
    //
    // Seed the JSONL AFTER the commit but BEFORE the hook runs — this models
    // the real-world flow where the JSONL is a hidden state file that is NOT
    // part of any commit (it accumulates between commits via the pretooluse
    // hook). If the JSONL were seeded before `git add -A`, it would be added
    // to the commit and force the hook through the non-skip path.
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);

    commitFiles(gitDir, {
      ".context-index/sessions/2026-05-19-jsonl001.md": "## Intent\nprior\n",
    }, "chore(sessions): record");

    const trackingPath = join(gitDir, ".context-index", ".session-tracking.jsonl");
    const seeded = '{"tool":"Edit","files":["src/x.ts"],"timestamp":"2026-05-19T10:00:00Z"}\n';
    writeFileSync(trackingPath, seeded);

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0);
    assert.equal(readFileSync(trackingPath, "utf8"), seeded,
      "JSONL should be byte-identical on the skip path");
  });
});
