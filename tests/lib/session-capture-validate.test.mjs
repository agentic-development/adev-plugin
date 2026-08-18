/**
 * Tests for the three validators in `lib/session-capture.mjs`:
 *   - validateSessionId(id)    — SEC-2 charset check
 *   - validateCwd(cwd)         — SEC-10 realpath-walk for manifest.yaml
 *   - validateTranscriptPath(path, cwd) — SEC-3, SEC-10 containment + extension
 */

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  validateSessionId,
  validateCwd,
  validateTranscriptPath,
} from "../../lib/session-capture.mjs";

// ────────────────────────────────────────────────────────────────────────────
// validateSessionId — SEC-2: ^[A-Za-z0-9_-]+$
// ────────────────────────────────────────────────────────────────────────────

test("validateSessionId accepts uuid-like ids (+2 more contract assertions)", () => {
  // validateSessionId accepts uuid-like ids
  assert.strictEqual(validateSessionId("0bd909e-1a2b-3c4d"), true);
  assert.strictEqual(validateSessionId("abc-123_DEF"), true);
  assert.strictEqual(validateSessionId("a"), true);
  assert.strictEqual(validateSessionId("0123456789ABCDEFabcdef-_"), true);

  // validateSessionId rejects path-injection attempts
  assert.strictEqual(validateSessionId("../../etc/passwd"), false);
  assert.strictEqual(validateSessionId("a/b"), false);
  assert.strictEqual(validateSessionId("a b"), false);
  assert.strictEqual(validateSessionId("a.b"), false);
  assert.strictEqual(validateSessionId(""), false);

  // validateSessionId rejects non-string input
  assert.strictEqual(validateSessionId(null), false);
  assert.strictEqual(validateSessionId(undefined), false);
  assert.strictEqual(validateSessionId(42), false);
  assert.strictEqual(validateSessionId({}), false);
});

// ────────────────────────────────────────────────────────────────────────────
// validateCwd — SEC-10: realpath walk from resolved input
// ────────────────────────────────────────────────────────────────────────────

test("validateCwd rejects non-absolute paths", () => {
  assert.strictEqual(validateCwd("relative/path"), false);
  assert.strictEqual(validateCwd("./foo"), false);
  assert.strictEqual(validateCwd(""), false);
  assert.strictEqual(validateCwd(null), false);
});

test("validateCwd accepts a directory with manifest.yaml", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-cwd-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "version: 1\n");
  assert.strictEqual(validateCwd(dir), true);
});

test("validateCwd walks upward to find manifest.yaml", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-cwd-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "version: 1\n");
  const sub = join(dir, "sub", "deeper");
  mkdirSync(sub, { recursive: true });
  assert.strictEqual(validateCwd(sub), true);
});

test("validateCwd rejects path with no manifest in ancestry", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-cwd-"));
  // No .context-index/manifest.yaml anywhere in ancestry of this tempdir.
  assert.strictEqual(validateCwd(dir), false);
});

test("validateCwd walks from realpath-resolved input (symlink escape)", () => {
  // Build:
  //   realRoot/.context-index/manifest.yaml
  //   linkRoot -> realRoot
  // Walking from raw `linkRoot/sub` works only if we realpath first.
  const realRoot = mkdtempSync(join(tmpdir(), "adev-cwd-real-"));
  mkdirSync(join(realRoot, ".context-index"), { recursive: true });
  writeFileSync(
    join(realRoot, ".context-index", "manifest.yaml"),
    "version: 1\n",
  );
  const sub = join(realRoot, "sub");
  mkdirSync(sub, { recursive: true });

  const linkParent = mkdtempSync(join(tmpdir(), "adev-cwd-link-"));
  const linkRoot = join(linkParent, "link");
  symlinkSync(realRoot, linkRoot);
  const linkSub = join(linkRoot, "sub");

  assert.strictEqual(validateCwd(linkSub), true);
});

// ────────────────────────────────────────────────────────────────────────────
// validateTranscriptPath — SEC-3, SEC-10: containment + .jsonl
// ────────────────────────────────────────────────────────────────────────────

test("validateTranscriptPath rejects path not ending in .jsonl", () => {
  // The cwd ↔ transcripts-root encoding is not enforced here, but extension check is.
  const cwd = mkdtempSync(join(tmpdir(), "adev-tx-cwd-"));
  assert.strictEqual(validateTranscriptPath("/tmp/foo.txt", cwd), false);
});

test("validateTranscriptPath rejects nonexistent path", () => {
  const cwd = mkdtempSync(join(tmpdir(), "adev-tx-cwd-"));
  assert.strictEqual(
    validateTranscriptPath("/nonexistent/path/file.jsonl", cwd),
    false,
  );
});

test("validateTranscriptPath accepts a real path under the transcripts root", () => {
  // We simulate the transcripts root structure: $HOME/.claude/projects/<cwd-encoded>/
  // by writing the file at the encoded path and pointing HOME there.
  const fakeHome = mkdtempSync(join(tmpdir(), "adev-tx-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "adev-tx-cwd-"));
  const cwdReal = realpathSync(cwd);
  const encoded = cwdReal.replace(/\//g, "-");
  const projectDir = join(fakeHome, ".claude", "projects", encoded);
  mkdirSync(projectDir, { recursive: true });
  const txPath = join(projectDir, "session.jsonl");
  writeFileSync(txPath, "{}\n");

  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    assert.strictEqual(validateTranscriptPath(txPath, cwd), true);
  } finally {
    process.env.HOME = prevHome;
  }
});

test("validateTranscriptPath rejects a path outside the transcripts root", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "adev-tx-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "adev-tx-cwd-"));
  // Build the legitimate transcripts root...
  const cwdReal = realpathSync(cwd);
  const encoded = cwdReal.replace(/\//g, "-");
  mkdirSync(join(fakeHome, ".claude", "projects", encoded), { recursive: true });
  // ...and write the file OUTSIDE it.
  const outside = mkdtempSync(join(tmpdir(), "adev-tx-out-"));
  const txPath = join(outside, "session.jsonl");
  writeFileSync(txPath, "{}\n");

  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    assert.strictEqual(validateTranscriptPath(txPath, cwd), false);
  } finally {
    process.env.HOME = prevHome;
  }
});

test("validateTranscriptPath compares realpath-vs-realpath (symlink escape)", () => {
  // The transcripts root is a symlink to a tempdir; ensure containment uses realpath
  // on BOTH operands. A file inside the symlink-resolved root must still be accepted.
  const fakeHome = mkdtempSync(join(tmpdir(), "adev-tx-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "adev-tx-cwd-"));
  const cwdReal = realpathSync(cwd);
  const encoded = cwdReal.replace(/\//g, "-");

  // Real target where transcripts actually live
  const realTranscriptsRoot = mkdtempSync(join(tmpdir(), "adev-tx-real-"));
  const txPath = join(realTranscriptsRoot, "session.jsonl");
  writeFileSync(txPath, "{}\n");

  // Make $HOME/.claude/projects/<encoded> a symlink to realTranscriptsRoot
  mkdirSync(join(fakeHome, ".claude", "projects"), { recursive: true });
  symlinkSync(realTranscriptsRoot, join(fakeHome, ".claude", "projects", encoded));

  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    assert.strictEqual(validateTranscriptPath(txPath, cwd), true);
  } finally {
    process.env.HOME = prevHome;
  }
});

// ────────────────────────────────────────────────────────────────────────────
// validateTranscriptPath — dot-directory cwd (adev-plugin-882a.1)
//
// Claude Code encodes the cwd by replacing `/` AND `.` with `-`. adev replaced
// only `/`, so for any cwd under `.claude/worktrees/` the transcripts root never
// resolved and every transcript was rejected — token-cost logging went silently
// inert in exactly the worktree workflow adev steers users toward.
// ────────────────────────────────────────────────────────────────────────────

test("validateTranscriptPath accepts a transcript for a worktree cwd (dot -> dash)", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "adev-home-"));
  const base = mkdtempSync(join(tmpdir(), "adev-wt-"));
  const cwd = join(base, ".claude", "worktrees", "wt-1");
  mkdirSync(cwd, { recursive: true });
  const cwdReal = realpathSync(cwd);

  // Current Claude Code encoding: both `/` and `.` become `-`.
  const encoded = cwdReal.replace(/[/.]/g, "-");
  const projectDir = join(fakeHome, ".claude", "projects", encoded);
  mkdirSync(projectDir, { recursive: true });
  const txPath = join(projectDir, "session.jsonl");
  writeFileSync(txPath, "{}\n");

  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    assert.strictEqual(validateTranscriptPath(txPath, cwd), true);
  } finally {
    process.env.HOME = prevHome;
  }
});

test("validateTranscriptPath still accepts the legacy dot-preserving root", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "adev-home-"));
  const base = mkdtempSync(join(tmpdir(), "adev-wt-"));
  const cwd = join(base, ".claude", "worktrees", "wt-legacy");
  mkdirSync(cwd, { recursive: true });
  const cwdReal = realpathSync(cwd);

  // Legacy encoding: only `/` becomes `-`, the dot survives.
  const encoded = cwdReal.replace(/\//g, "-");
  const projectDir = join(fakeHome, ".claude", "projects", encoded);
  mkdirSync(projectDir, { recursive: true });
  const txPath = join(projectDir, "session.jsonl");
  writeFileSync(txPath, "{}\n");

  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    assert.strictEqual(validateTranscriptPath(txPath, cwd), true);
  } finally {
    process.env.HOME = prevHome;
  }
});

test("validateTranscriptPath still rejects a transcript outside every candidate root", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "adev-home-"));
  const base = mkdtempSync(join(tmpdir(), "adev-wt-"));
  const cwd = join(base, ".claude", "worktrees", "wt-2");
  mkdirSync(cwd, { recursive: true });
  const cwdReal = realpathSync(cwd);

  mkdirSync(join(fakeHome, ".claude", "projects", cwdReal.replace(/[/.]/g, "-")), {
    recursive: true,
  });

  // A transcript that exists, ends in .jsonl, but lives outside both roots.
  const outside = mkdtempSync(join(tmpdir(), "adev-outside-"));
  const txPath = join(outside, "session.jsonl");
  writeFileSync(txPath, "{}\n");

  const prevHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    assert.strictEqual(validateTranscriptPath(txPath, cwd), false);
  } finally {
    process.env.HOME = prevHome;
  }
});
