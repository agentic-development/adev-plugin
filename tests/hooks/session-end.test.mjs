/**
 * SessionEnd hook end-to-end tests.
 *
 * Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
 * Plan-task: 7
 *
 * Covers:
 *  - Bash gate: `capture: off` (and missing manifest) never spawns Node.
 *  - Happy-path write produces a sessions/ file with required frontmatter.
 *  - Validation rejections (session_id, cwd, transcript_path) emit SEC-7
 *    formatted stderr and write no file.
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

const HOOK = join(PLUGIN_ROOT, "hooks", "session-end.sh");

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

function runSessionEndHook(projectDir, payload) {
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
  writeFileSync(transcriptPath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

test("session-end.sh exits 0 and writes nothing when capture: off", () => {
  const dir = createTempDir();
  try {
    writeManifest(dir, "off");
    const result = runSessionEndHook(dir, {
      session_id: "abc-123",
      transcript_path: "/tmp/does-not-matter.jsonl",
      cwd: dir,
    });
    assert.equal(result.status, 0);
    const sessionsDir = join(dir, ".context-index", "sessions");
    assert.ok(!existsSync(sessionsDir) || readdirSync(sessionsDir).length === 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test("session-end.sh exits 0 silently when manifest missing", () => {
  const dir = createTempDir();
  try {
    const result = runSessionEndHook(dir, {
      session_id: "abc-123",
      transcript_path: "/tmp/x.jsonl",
      cwd: dir,
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    cleanupTempDir(dir);
  }
});

test("session-end.sh rejects invalid session_id with SEC-7 stderr", () => {
  const dir = createTempDir();
  try {
    writeManifest(dir, "hook");
    const result = runSessionEndHook(dir, {
      session_id: "../../etc/passwd",
      transcript_path: "/tmp/x.jsonl",
      cwd: dir,
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^\[adev:session-capture\] validation-error session-id/m);
    const sessionsDir = join(dir, ".context-index", "sessions");
    assert.ok(!existsSync(sessionsDir) || readdirSync(sessionsDir).length === 0);
  } finally {
    cleanupTempDir(dir);
  }
});

test("session-end.sh rejects invalid cwd with SEC-7 stderr", () => {
  const dir = createTempDir();
  try {
    writeManifest(dir, "hook");
    const result = runSessionEndHook(dir, {
      session_id: "valid-id-123",
      transcript_path: "/tmp/x.jsonl",
      cwd: "relative/path",
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^\[adev:session-capture\] validation-error cwd/m);
  } finally {
    cleanupTempDir(dir);
  }
});

test("session-end.sh rejects transcript not ending in .jsonl with SEC-7 stderr", () => {
  const dir = createTempDir();
  try {
    writeManifest(dir, "hook");
    const result = runSessionEndHook(dir, {
      session_id: "valid-id-123",
      transcript_path: "/tmp/transcript.txt",
      cwd: dir,
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /^\[adev:session-capture\] (path-error|validation-error) /m);
  } finally {
    cleanupTempDir(dir);
  }
});

test("session-end.sh happy path writes a session file with required frontmatter", () => {
  // Skip if HOME is missing — the transcripts-root containment check needs it.
  if (!process.env.HOME) return;
  const home = process.env.HOME;
  const sessionId = "sess-happy-001";

  // Build the temp project dir UNDER $HOME so realpath-resolved transcripts-root
  // anchoring works (the transcripts root is computed from the realpath of cwd).
  const dir = createTempDir();
  try {
    writeManifest(dir, "hook");

    // Compute the transcripts-root path Claude Code would use.
    const cwdReal = realpathSync(dir);
    const encoded = cwdReal.replace(/\//g, "-");
    const transcriptsRoot = join(home, ".claude", "projects", encoded);
    const transcriptPath = join(transcriptsRoot, `${sessionId}.jsonl`);

    writeTranscript(transcriptPath, [
      { role: "user", message: { content: "hello" } },
      { role: "assistant", message: { content: "hi there" } },
    ]);

    const result = runSessionEndHook(dir, {
      session_id: sessionId,
      transcript_path: transcriptPath,
      cwd: dir,
    });

    assert.equal(result.status, 0);

    const sessionsDir = join(dir, ".context-index", "sessions");
    assert.ok(existsSync(sessionsDir), "sessions/ should be created");
    const files = readdirSync(sessionsDir);
    assert.equal(files.length, 1, `expected one session file, got ${files.length}`);

    const content = readFileSync(join(sessionsDir, files[0]), "utf8");
    assert.match(content, /^---\s*$/m);
    assert.match(content, /^kind:\s*session-end\s*$/m);
    assert.match(content, new RegExp(`^session_id:\\s*${sessionId}\\s*$`, "m"));
    assert.match(content, /^date:\s*\d{4}-\d{2}-\d{2}\s*$/m);
    // Clean up the transcript fixture afterwards.
    try {
      rmSync(transcriptsRoot, { recursive: true, force: true });
    } catch {}
  } finally {
    cleanupTempDir(dir);
  }
});
