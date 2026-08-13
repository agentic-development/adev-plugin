import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT, runHook } from "../helpers.mjs";

/**
 * Golden-fixture equivalence gate (spec Migration Path step 0 / Invariant 2).
 *
 * Fixtures under tests/fixtures/lifecycle-gate-golden/ were captured from the
 * ORIGINAL (pre-consolidation) hook scripts across the equivalence matrix:
 *   level (off/warn/confirm/block) x surface (edit/bash/advisory)
 *     x invocation-mode (plugin env-var / settings.json stdin)
 *     x advisory-counter-cadence (positions 1..3, interval=3)
 *
 * This test replays the SAME matrix against whichever script(s) the DISPATCH
 * table below points at, and asserts byte-identical stdout + exit codes.
 *
 * Migration Path step 3 flips DISPATCH from the three per-surface scripts to
 * the single consolidated `lifecycle-gate.sh <surface>` — that is the ONLY
 * change this file should need at that step; the fixtures and assertions do
 * not change (Invariant 2).
 */

const DISPATCH = {
  edit: { script: "lifecycle-gate-edit.sh", args: [] },
  bash: { script: "lifecycle-gate-bash.sh", args: [] },
  advisory: { script: "lifecycle-gate-advisory.sh", args: [] },
};

const ADVISORY_INTERVAL = 3;
const FIXTURES_DIR = join(PLUGIN_ROOT, "tests", "fixtures", "lifecycle-gate-golden");

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8"));
}

function setupDir(level) {
  const tmp = createTempDir();
  mkdirSync(join(tmp, ".context-index"), { recursive: true });
  writeFileSync(join(tmp, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
  writeFileSync(
    join(tmp, ".context-index", "user-config"),
    `lifecycle.gate=${level}\nlifecycle.gate.advisory_interval=${ADVISORY_INTERVAL}\n`
  );
  return tmp;
}

/**
 * Build the env/stdin pair for a given invocation mode.
 * `mode === "plugin"` sets CLAUDE_TOOL_INPUT_* env vars (plugin mode).
 * `mode === "stdin"` sends tool_input via stdin JSON and blanks the env vars
 * (settings.json mode) — matching Invariant: dispatch/behavior must not
 * depend on which mode supplied the fields.
 */
function buildInvocation(mode, fields) {
  if (mode === "plugin") {
    const env = {};
    for (const [k, v] of Object.entries(fields)) env[`CLAUDE_TOOL_INPUT_${k}`] = v;
    return { env, stdin: "" };
  }
  const env = { CLAUDE_TOOL_INPUT_file_path: "", CLAUDE_TOOL_INPUT_command: "" };
  const stdin = JSON.stringify({ tool_input: fields });
  return { env, stdin };
}

function invoke(surface, { cwd, env, stdin }) {
  const { script, args } = DISPATCH[surface];
  return runHook(script, {
    cwd,
    args,
    env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, ...env },
    stdin,
  });
}

describe("lifecycle-gate golden-fixture equivalence", () => {
  describe("edit surface", () => {
    const fixture = loadFixture("edit");
    for (const { level, mode, exitCode, stdout } of fixture) {
      it(`level=${level} mode=${mode} reproduces golden output`, () => {
        const tmp = setupDir(level);
        const { env, stdin } = buildInvocation(mode, { file_path: join(tmp, "src", "main.mjs") });
        const result = invoke("edit", { cwd: tmp, env, stdin });
        cleanupTempDir(tmp);
        assert.equal(result.exitCode, exitCode, `exitCode mismatch for level=${level} mode=${mode}`);
        assert.equal(result.stdout, stdout, `stdout mismatch for level=${level} mode=${mode}`);
      });
    }
  });

  describe("bash surface", () => {
    const fixture = loadFixture("bash");
    for (const { level, mode, exitCode, stdout } of fixture) {
      it(`level=${level} mode=${mode} reproduces golden output`, () => {
        const tmp = setupDir(level);
        const { env, stdin } = buildInvocation(mode, { command: "npm run build" });
        const result = invoke("bash", { cwd: tmp, env, stdin });
        cleanupTempDir(tmp);
        assert.equal(result.exitCode, exitCode, `exitCode mismatch for level=${level} mode=${mode}`);
        assert.equal(result.stdout, stdout, `stdout mismatch for level=${level} mode=${mode}`);
      });
    }
  });

  describe("advisory surface (counter cadence)", () => {
    const fixture = loadFixture("advisory");
    for (const { level, mode, sequence } of fixture) {
      it(`level=${level} mode=${mode} reproduces golden cadence sequence`, () => {
        const tmp = setupDir(level);
        for (const { position, exitCode, stdout } of sequence) {
          const { env, stdin } =
            mode === "plugin"
              ? { env: { CLAUDE_TOOL_INPUT_file_path: "" }, stdin: "" }
              : { env: { CLAUDE_TOOL_INPUT_file_path: "" }, stdin: JSON.stringify({ tool_input: {} }) };
          const result = invoke("advisory", { cwd: tmp, env, stdin });
          assert.equal(
            result.exitCode,
            exitCode,
            `exitCode mismatch for level=${level} mode=${mode} position=${position}`
          );
          assert.equal(
            result.stdout,
            stdout,
            `stdout mismatch for level=${level} mode=${mode} position=${position}`
          );
        }
        cleanupTempDir(tmp);
      });
    }
  });
});
