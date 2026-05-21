/**
 * PreCompact hook end-to-end tests.
 *
 * Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
 * Plan-task: 8
 *
 * Covers:
 *  - Bash gate (capture != hook → exit 0, no Node spawn).
 *  - Happy-path write produces frontmatter with `kind: pre-compact`.
 *  - SA-2 skip-if-session-end: if the target path already has `kind:
 *    session-end`, the hook exits 0 with `[adev:session-capture] disabled
 *    <project-relative-path>` and does NOT overwrite.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";

const HOOK = join(PLUGIN_ROOT, "hooks", "pre-compact.sh");

function writeManifest(dir, captureMode) {
  const manifestDir = join(dir, ".context-index");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, "manifest.yaml"),
    [
      "project:",
      "  name: test",
      "integrations:",
      "  session_capture:",
      `    capture: ${captureMode}`,
      "    gitignored: false",
      "",
    ].join("\n"),
  );
}

function runPreCompactHook(projectDir, payload) {
  return spawnSync("bash", [HOOK], {
    cwd: projectDir,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
    },
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 15_000,
  });
}

function writeTranscript(transcriptPath, lines) {
  mkdirSync(join(transcriptPath, ".."), { recursive: true });
  writeFileSync(
    transcriptPath,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

function setupTranscript(dir, sessionId) {
  const home = process.env.HOME;
  const cwdReal = realpathSync(dir);
  const encoded = cwdReal.replace(/\//g, "-");
  const transcriptsRoot = join(home, ".claude", "projects", encoded);
  const transcriptPath = join(transcriptsRoot, `${sessionId}.jsonl`);
  writeTranscript(transcriptPath, [
    { role: "user", message: { content: "hello" } },
    { role: "assistant", message: { content: "hi there" } },
  ]);
  return { transcriptPath, transcriptsRoot };
}

test("pre-compact.sh exits 0 silently when capture: off", () => {
  const dir = createTempDir();
  try {
    writeManifest(dir, "off");
    const result = runPreCompactHook(dir, {
      session_id: "abc-123",
      transcript_path: "/tmp/x.jsonl",
      cwd: dir,
    });
    assert.equal(result.status, 0);
    const sessionsDir = join(dir, ".context-index", "sessions");
    assert.ok(!existsSync(sessionsDir) || readdirSync(sessionsDir).length === 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test("pre-compact.sh happy path writes a file with kind: pre-compact", () => {
  if (!process.env.HOME) return;
  const sessionId = "sess-pc-001";
  const dir = createTempDir();
  let transcriptsRoot;
  try {
    writeManifest(dir, "hook");
    const setup = setupTranscript(dir, sessionId);
    transcriptsRoot = setup.transcriptsRoot;

    const result = runPreCompactHook(dir, {
      session_id: sessionId,
      transcript_path: setup.transcriptPath,
      cwd: dir,
    });
    assert.equal(result.status, 0);

    const sessionsDir = join(dir, ".context-index", "sessions");
    assert.ok(existsSync(sessionsDir));
    const files = readdirSync(sessionsDir);
    assert.equal(files.length, 1);
    const content = readFileSync(join(sessionsDir, files[0]), "utf8");
    assert.match(content, /^kind:\s*pre-compact\s*$/m);
    assert.match(content, new RegExp(`^session_id:\\s*${sessionId}\\s*$`, "m"));
  } finally {
    if (transcriptsRoot) {
      try {
        rmSync(transcriptsRoot, { recursive: true, force: true });
      } catch {}
    }
    cleanupTempDir(dir);
  }
});

test("pre-compact.sh skips when target file already has kind: session-end (SA-2)", () => {
  if (!process.env.HOME) return;
  const sessionId = "sess-pc-skip";
  const dir = createTempDir();
  let transcriptsRoot;
  try {
    writeManifest(dir, "hook");
    const setup = setupTranscript(dir, sessionId);
    transcriptsRoot = setup.transcriptsRoot;

    // Pre-create the target file with kind: session-end.
    const sessionsDir = join(dir, ".context-index", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const targetPath = join(sessionsDir, `${date}-${sessionId}.md`);
    const preexisting =
      `---\nkind: session-end\nsession_id: ${sessionId}\ndate: ${date}\n---\n\n## Preexisting content\n`;
    writeFileSync(targetPath, preexisting);

    const result = runPreCompactHook(dir, {
      session_id: sessionId,
      transcript_path: setup.transcriptPath,
      cwd: dir,
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^\[adev:session-capture\] disabled .+/m);
    // File content is unchanged.
    assert.equal(readFileSync(targetPath, "utf8"), preexisting);
  } finally {
    if (transcriptsRoot) {
      try {
        rmSync(transcriptsRoot, { recursive: true, force: true });
      } catch {}
    }
    cleanupTempDir(dir);
  }
});
