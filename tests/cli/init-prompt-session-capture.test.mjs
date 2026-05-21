/**
 * Tests for `adev init prompt session-capture` CLI verb.
 *
 * Spec: .context-index/specs/features/session-awareness/hook-driven-capture.spec.md
 * Plan-task: 9, 10
 *
 * Covers:
 *  - Defaults for new project (hook, true) when no detection signals.
 *  - Defaults for existing project (post-commit, false) when legacy block detected.
 *  - Stored config trumps detection (SA-4) — re-run offers stored values as defaults.
 *  - CON-8 conflict warning rendered ABOVE the default-accept question.
 *  - Manifest write preserves the existing `provider` key verbatim.
 *  - Invalid --capture value rejected with non-zero exit and clear error.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { createTempDir, cleanupTempDir, runCLI } from "../helpers.mjs";

function makeProject(captureMode, opts = {}) {
  const dir = createTempDir();
  const ciDir = join(dir, ".context-index");
  mkdirSync(ciDir, { recursive: true });
  if (opts.manifest !== false) {
    writeFileSync(join(ciDir, "manifest.yaml"), opts.manifest || [
      "project:",
      "  name: test",
      "",
    ].join("\n"));
  }
  if (opts.legacyPostCommit) {
    const hooksDir = join(dir, ".githooks");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      join(hooksDir, "post-commit"),
      "#!/usr/bin/env bash\n# session-capture helper\nnode lib/session-summary.mjs\n.context-index/sessions",
    );
  }
  return dir;
}

function runVerb(args, cwd) {
  return runCLI("init", ["prompt", "session-capture", ...args].length > 0 ? [] : [], {
    cwd,
  });
}

// Simpler: invoke node directly to keep arg parsing predictable.
function runInitPrompt(args, cwd, inputs = []) {
  return runCLI("init", inputs, { cwd, env: {} }) /* not used directly */;
}

// Use raw node spawn for precise argv control.
import { spawnSync } from "node:child_process";
import { PLUGIN_ROOT } from "../helpers.mjs";
function runInitPromptCmd(extra, cwd, inputs = []) {
  const argv = [join(PLUGIN_ROOT, "cli", "index.mjs"), "init", "prompt", "session-capture", ...extra];
  return spawnSync("node", argv, {
    cwd,
    env: { ...process.env },
    input: inputs.length ? inputs.join("\n") + "\n" : "",
    encoding: "utf8",
    timeout: 15_000,
  });
}

test("default for new project: capture: hook, gitignored: true", () => {
  const dir = makeProject();
  try {
    const r = runInitPromptCmd(["--non-interactive"], dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /capture:\s+hook \[default\]/);
    assert.match(r.stdout, /gitignored:\s+true \[default\]/);
    const m = readFileSync(join(dir, ".context-index", "manifest.yaml"), "utf8");
    assert.match(m, /capture:\s*hook/);
    assert.match(m, /gitignored:\s*true/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("default for existing project (legacy block): capture: post-commit, gitignored: false", () => {
  const dir = makeProject(undefined, { legacyPostCommit: true });
  try {
    const r = runInitPromptCmd(["--non-interactive"], dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /capture:\s+post-commit \[default\]/);
    assert.match(r.stdout, /gitignored:\s+false \[default\]/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("stored config trumps detection: re-run offers stored value (SA-4)", () => {
  const manifest = [
    "project:",
    "  name: test",
    "integrations:",
    "  session_capture:",
    "    provider: native",
    "    capture: post-commit",
    "    gitignored: false",
    "",
  ].join("\n");
  const dir = makeProject(undefined, { manifest });
  try {
    const r = runInitPromptCmd(["--non-interactive"], dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /capture:\s+post-commit \[default\]/);
    assert.match(r.stdout, /gitignored:\s+false \[default\]/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("CON-8 warning renders ABOVE the [default] question when stored conflicts with detection", () => {
  // Manifest stores post-commit but project has no legacy block — conflict.
  const manifest = [
    "project:",
    "  name: test",
    "integrations:",
    "  session_capture:",
    "    provider: native",
    "    capture: post-commit",
    "    gitignored: false",
    "",
  ].join("\n");
  const dir = makeProject(undefined, { manifest, legacyPostCommit: false });
  try {
    const r = runInitPromptCmd(["--non-interactive"], dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // [warning] line MUST precede the line with `capture:    <value> [default]`.
    const warningIdx = r.stdout.indexOf("[warning]");
    const defaultIdx = r.stdout.indexOf("[default]");
    assert.ok(warningIdx > -1, `expected [warning] in output: ${r.stdout}`);
    assert.ok(defaultIdx > -1, `expected [default] in output`);
    assert.ok(
      warningIdx < defaultIdx,
      `CON-8: warning must render before the default-accept question (warning=${warningIdx}, default=${defaultIdx})`,
    );
  } finally {
    cleanupTempDir(dir);
  }
});

test("manifest write preserves provider key verbatim", () => {
  const manifest = [
    "project:",
    "  name: test",
    "integrations:",
    "  session_capture:",
    "    provider: native",
    "",
  ].join("\n");
  const dir = makeProject(undefined, { manifest });
  try {
    const r = runInitPromptCmd(
      ["--capture", "hook", "--gitignored", "true", "--non-interactive"],
      dir,
    );
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const m = readFileSync(join(dir, ".context-index", "manifest.yaml"), "utf8");
    assert.match(m, /provider:\s*native/);
    assert.match(m, /capture:\s*hook/);
    assert.match(m, /gitignored:\s*true/);
  } finally {
    cleanupTempDir(dir);
  }
});

test("invalid --capture rejected with non-zero exit and clear error", () => {
  const dir = makeProject();
  try {
    const r = runInitPromptCmd(
      ["--capture", "manual", "--non-interactive"],
      dir,
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /capture must be one of: hook, post-commit, off/);
  } finally {
    cleanupTempDir(dir);
  }
});
