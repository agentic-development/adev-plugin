import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { readdirSync, readFileSync, existsSync, writeFileSync, symlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTempGitRepo, cleanupTempDir, writeFixture, runGitHook, PLUGIN_ROOT } from "../helpers.mjs";

/**
 * Regression guard for the `Spec:` trailer command-injection vulnerability.
 *
 * The post-commit hook derives `specsTouched` from the commit message's
 * `Spec:` trailers — a value any author of a fetched branch controls. It was
 * interpolated directly into the hook's `node --input-type=module -e` source
 * as `'${SPECS_TOUCHED}'.split(',')`, so a crafted trailer executed arbitrary
 * code on the machine of anyone who merged or pulled the branch, while the
 * hook reported success.
 *
 * The fix passes the value through the environment (`ADEV_SPECS_TOUCHED`) and
 * reads it via `process.env`, so it is never parsed as source.
 */
describe("post-commit git hook — Spec: trailer is data, never source", () => {
  let gitDir;
  const MARKER = join(tmpdir(), "adev-trailer-injection-marker");

  afterEach(() => {
    if (gitDir) cleanupTempDir(gitDir);
    rmSync(MARKER, { force: true });
  });

  function setupHookEnv(dir) {
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
  }

  /** Commit `files` with a raw multi-line commit message (trailers included). */
  function commitWithMessage(dir, files, message) {
    for (const [relPath, content] of Object.entries(files)) {
      writeFixture(dir, relPath, content);
    }
    execSync("git add -A", { cwd: dir, stdio: "ignore" });
    const msgFile = join(dir, ".git", "COMMIT_MSG_FIXTURE");
    writeFileSync(msgFile, message);
    execSync(`git commit -F "${msgFile}"`, { cwd: dir, stdio: "ignore" });
  }

  function captureFiles(dir) {
    const sessionsDir = join(dir, ".context-index", "sessions");
    if (!existsSync(sessionsDir)) return [];
    return readdirSync(sessionsDir).filter((f) => f.endsWith(".md"));
  }

  it("does not execute code embedded in a Spec: trailer", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);

    // ESM-valid payload: top-level await + dynamic import. If the trailer is
    // interpolated into the hook's source, this writes MARKER.
    const payload =
      `a'+(await import('node:fs')).writeFileSync(${JSON.stringify(MARKER)},'PWNED')+'`;

    commitWithMessage(
      gitDir,
      { "src/index.ts": "export const foo = 1;\n" },
      `feat(core): benign subject\n\nSpec: ${payload}\n`,
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });

    assert.equal(exitCode, 0, "hook should still exit 0");
    assert.equal(
      existsSync(MARKER),
      false,
      "trailer payload must not execute — it is data, not source",
    );
  });

  it("keeps the session file well-formed when the trailer contains YAML metacharacters", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);

    commitWithMessage(
      gitDir,
      { "src/index.ts": "export const foo = 2;\n" },
      [
        "feat(core): quoting torture",
        "",
        `Spec: .context-index/specs/features/x/a'b"c].spec.md`,
        "Spec: .context-index/specs/features/x/plain.spec.md",
        "",
      ].join("\n"),
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const files = captureFiles(gitDir);
    assert.equal(files.length, 1, "one capture file should be written");

    const body = readFileSync(
      join(gitDir, ".context-index", "sessions", files[0]),
      "utf8",
    );
    // The frontmatter block must still terminate — an unescaped `]` or quote
    // leaking into the flow sequence would break every downstream parser.
    const lines = body.split(/\r?\n/);
    assert.equal(lines[0].trim(), "---", "capture must open with frontmatter");
    assert.ok(
      lines.slice(1).some((l) => l.trim() === "---"),
      "frontmatter block must have a closing delimiter",
    );
  });

  it("drops absolute and traversing trailer paths", () => {
    gitDir = createTempGitRepo({ branch: "feat/test" });
    setupHookEnv(gitDir);

    commitWithMessage(
      gitDir,
      { "src/index.ts": "export const foo = 3;\n" },
      [
        "feat(core): path containment",
        "",
        "Spec: /etc/passwd",
        "Spec: ../../../../etc/shadow",
        "Spec: .context-index/specs/features/x/kept.spec.md",
        "",
      ].join("\n"),
    );

    const { exitCode } = runGitHook("post-commit", { cwd: gitDir });
    assert.equal(exitCode, 0);

    const files = captureFiles(gitDir);
    assert.equal(files.length, 1);
    const body = readFileSync(
      join(gitDir, ".context-index", "sessions", files[0]),
      "utf8",
    );

    // Assert on the `specs-touched:` frontmatter field specifically. The
    // capture legitimately echoes the raw commit message under `## Intent`,
    // so the rejected paths still appear there as prose — that is expected.
    const specsLine = body
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("specs-touched:"));
    assert.ok(specsLine, "capture must carry a specs-touched field");

    assert.ok(!specsLine.includes("/etc/passwd"), "absolute paths must be dropped");
    assert.ok(!specsLine.includes("etc/shadow"), "traversing paths must be dropped");
    assert.ok(specsLine.includes("kept.spec.md"), "legitimate spec path must survive");
  });

  it("hook source never interpolates the trailer variable into JS", () => {
    const hook = readFileSync(join(PLUGIN_ROOT, ".githooks", "post-commit"), "utf8");
    assert.ok(
      !/\$\{SPECS_TOUCHED\}/.test(hook),
      "SPECS_TOUCHED must not be interpolated into the node -e source",
    );
    assert.ok(
      /ADEV_SPECS_TOUCHED=/.test(hook) && /process\.env\.ADEV_SPECS_TOUCHED/.test(hook),
      "trailer value must be passed via the environment and read from process.env",
    );
  });
});
