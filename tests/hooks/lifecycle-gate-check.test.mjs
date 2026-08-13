import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";

const CHECKER = join(PLUGIN_ROOT, "hooks", "_lifecycle-gate-check.mjs");

function runChecker(args, env) {
  const result = spawnSync("node", [CHECKER, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 10_000,
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || "" };
}

describe("_lifecycle-gate-check.mjs --surface file|bash (merged checker)", () => {
  it("--surface file: outputs pass for excluded files", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate.file_exclusions=*.test.*,.context-index/**,README.md");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const { exitCode, stdout } = runChecker(["--surface", "file"], {
      ADEV_CONTEXT_ROOT: tmp,
      ADEV_PLUGIN_ROOT: PLUGIN_ROOT,
      ADEV_FILE_PATH: "README.md",
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "pass");
    cleanupTempDir(tmp);
  });

  it("--surface file: outputs enforce for non-excluded source files", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const { exitCode, stdout } = runChecker(["--surface", "file"], {
      ADEV_CONTEXT_ROOT: tmp,
      ADEV_PLUGIN_ROOT: PLUGIN_ROOT,
      ADEV_FILE_PATH: "src/main.mjs",
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "enforce");
    cleanupTempDir(tmp);
  });

  it("--surface file: defaults to pass when required env vars are missing", () => {
    const { exitCode, stdout } = runChecker(["--surface", "file"], {
      ADEV_CONTEXT_ROOT: "",
      ADEV_PLUGIN_ROOT: "",
      ADEV_FILE_PATH: "",
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "pass");
  });

  it("--surface bash: outputs passthrough for allowlisted commands", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/user-config", "lifecycle.gate.bash_passthrough=git status,git log,npm test");
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const { exitCode, stdout } = runChecker(["--surface", "bash"], {
      ADEV_CONTEXT_ROOT: tmp,
      ADEV_PLUGIN_ROOT: PLUGIN_ROOT,
      ADEV_COMMAND: "npm test",
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "passthrough");
    cleanupTempDir(tmp);
  });

  it("--surface bash: outputs gated for non-allowlisted commands", () => {
    const tmp = createTempDir();
    writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
    const { exitCode, stdout } = runChecker(["--surface", "bash"], {
      ADEV_CONTEXT_ROOT: tmp,
      ADEV_PLUGIN_ROOT: PLUGIN_ROOT,
      ADEV_COMMAND: "npm run build",
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "gated");
    cleanupTempDir(tmp);
  });

  it("--surface bash: defaults to passthrough when required env vars are missing", () => {
    const { exitCode, stdout } = runChecker(["--surface", "bash"], {
      ADEV_CONTEXT_ROOT: "",
      ADEV_PLUGIN_ROOT: "",
      ADEV_COMMAND: "",
    });
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "passthrough");
  });

  it("unknown --surface value: exits 1 with a stderr diagnostic (fail-open at caller)", () => {
    const { exitCode, stdout, stderr } = runChecker(["--surface", "nonsense"], {});
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /\[adev:lifecycle-gate-check\]/);
    assert.match(stderr, /nonsense/);
  });

  it("missing --surface argument entirely: exits 1 with a stderr diagnostic", () => {
    const { exitCode, stdout, stderr } = runChecker([], {});
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /\[adev:lifecycle-gate-check\]/);
  });
});
