/**
 * Tests for `lib/cli/issues-migrate.mjs` and `lib/cli/issues.mjs`
 * (the `adev issues migrate` CLI verb).
 *
 * Spec: .context-index/specs/features/task-management/backend-migration.spec.md
 * Plan: .context-index/specs/features/task-management/backend-migration.plan.md
 *
 * Tests are added incrementally across plan tasks 2-9. Task 9 closes any
 * coverage gaps once the verb implementation lands.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run as runMigrate, help as helpMigrate } from "../../lib/cli/issues-migrate.mjs";
import { run as runIssues, help as helpIssues } from "../../lib/cli/issues.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

/**
 * Create an isolated temp project root with `.context-index/manifest.yaml`.
 * @param {object} [opts]
 * @param {string} [opts.backend] - tasks.backend value (default "json")
 */
function makeTempProject({ backend = "json" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "adev-issues-migrate-test-"));
  mkdirSync(join(dir, ".context-index", "tasks"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    `project:\n  name: test\n  adev_version: "0.27.1"\ntasks:\n  backend: ${backend}\n`,
  );
  // Seed an empty json board so list() doesn't fall through to legacy parse.
  writeFileSync(
    join(dir, ".context-index", "tasks", "tasks.json"),
    JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }, null, 2) + "\n",
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Spawn the CLI as a subprocess to capture real exit codes + stdio.
 *
 * @param {string[]} argv - args after `node cli/index.mjs`
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @param {Record<string,string>} [opts.env]
 */
function runCli(argv, { cwd, env } = {}) {
  const result = spawnSync("node", [CLI, ...argv], {
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...(env || {}) },
    encoding: "utf8",
    timeout: 15000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

describe("issues migrate verb wiring (plan-task 2)", () => {
  it("issues-migrate exposes a run() function", () => {
    assert.equal(typeof runMigrate, "function");
  });

  it("issues-migrate exposes a help() function", () => {
    assert.equal(typeof helpMigrate, "function");
  });

  it("issues parent verb exposes a run() function", () => {
    assert.equal(typeof runIssues, "function");
  });

  it("issues parent verb exposes a help() function", () => {
    assert.equal(typeof helpIssues, "function");
  });

  it("issues parent prints usage and exits 1 when no subcommand", async () => {
    // Capture stdout/stderr to keep test output clean.
    const originalLog = console.log;
    const originalErr = console.error;
    const stdoutBuf = [];
    const stderrBuf = [];
    console.log = (msg) => stdoutBuf.push(String(msg));
    console.error = (msg) => stderrBuf.push(String(msg));
    try {
      const exit = await runIssues({ projectRoot: process.cwd(), argv: [], manifest: null });
      assert.equal(exit, 1);
      assert.ok(stdoutBuf.join("\n").includes("subcommand"),
        "expected usage banner on stdout");
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });

  it("issues parent rejects unknown subcommands with exit 1", async () => {
    const originalLog = console.log;
    const originalErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      const exit = await runIssues({
        projectRoot: process.cwd(),
        argv: ["unknown-subcommand"],
        manifest: null,
      });
      assert.equal(exit, 1);
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });

  it("issues parent dispatches migrate to issues-migrate.run", async () => {
    // Without any args, migrate prints usage and exits non-zero (MIGRATE_MISSING_TARGET
    // once Task 3 lands; in the Task 2 skeleton, the stub returns 0). The
    // wiring assertion is that calling issues with ["migrate"] reaches
    // issues-migrate's run() instead of throwing "unknown subcommand".
    const originalLog = console.log;
    const originalErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      // Should not throw "unknown issues subcommand: migrate"
      const exit = await runIssues({
        projectRoot: process.cwd(),
        argv: ["migrate"],
        manifest: null,
      });
      assert.equal(typeof exit, "number");
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });
});

describe("issues migrate argument validation (plan-task 3)", () => {
  it("emits MIGRATE_MISSING_TARGET when --to is omitted (Behavior 4)", () => {
    const proj = makeTempProject();
    try {
      const { exitCode, stderr } = runCli(["issues", "migrate"], { cwd: proj });
      assert.notEqual(exitCode, 0, "expected non-zero exit");
      assert.ok(
        stderr.includes("MIGRATE_MISSING_TARGET"),
        `expected MIGRATE_MISSING_TARGET in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_UNKNOWN_BACKEND with supported list when --to is unrecognised (Behavior 5)", () => {
    const proj = makeTempProject();
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "xyz"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_UNKNOWN_BACKEND"),
        `expected MIGRATE_UNKNOWN_BACKEND in stderr, got: ${stderr}`,
      );
      // Must list the supported values (per SEC-2 the source is SUPPORTED_BACKENDS).
      assert.ok(stderr.includes("json"), "expected supported list to include 'json'");
      assert.ok(stderr.includes("beads"), "expected supported list to include 'beads'");
      assert.ok(stderr.includes("file"), "expected supported list to include 'file'");
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_TARGET_READONLY when --to file (Behavior 6)", () => {
    const proj = makeTempProject();
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "file"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_TARGET_READONLY"),
        `expected MIGRATE_TARGET_READONLY in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_NOOP when source backend equals target (Behavior 3)", () => {
    const proj = makeTempProject({ backend: "json" });
    try {
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "json"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_NOOP"),
        `expected MIGRATE_NOOP in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits MIGRATE_NOOP when --from explicitly matches --to (Behavior 2 + 3)", () => {
    const proj = makeTempProject({ backend: "beads" });
    try {
      // Override source via --from to confirm the noop check uses the resolved
      // source, not just manifest.
      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "json", "--from", "json"],
        { cwd: proj },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("MIGRATE_NOOP"),
        `expected MIGRATE_NOOP in stderr, got: ${stderr}`,
      );
    } finally {
      cleanup(proj);
    }
  });

  it("emits BEADS_NOT_AVAILABLE when --to beads and br is missing (Behavior 7)", () => {
    // Force `br` lookup to fail by setting PATH to a directory that contains
    // only `node` (and a `which` shim) — `br` is not on this PATH, but the
    // subprocess can still spawn node to run the CLI.
    //
    // To keep the test hermetic regardless of whether `br` happens to be
    // installed on the host machine, we build a minimal PATH dir that
    // contains a symlink to the real `node` binary (so spawnSync can resolve
    // it) AND a symlink to a real `which` (so BeadsAdapter._detectBr's
    // `which br` call resolves the binary but returns non-zero for `br`).
    const proj = makeTempProject();
    const minimalBin = mkdtempSync(join(tmpdir(), "adev-min-path-"));
    try {
      // Symlink only the binaries BeadsAdapter._detectBr explicitly needs:
      // `which`. We do NOT symlink `br`. Node itself is found by spawnSync
      // via PATH lookup of the bare "node" name — so include the node bin
      // dir AND a real `which`.
      //
      // Cross-platform note: on Linux/macOS `which` lives at /usr/bin/which
      // or /usr/local/bin/which. We resolve at test time.
      const nodeBin = dirname(process.execPath);
      // Locate `which` in the current PATH.
      const whichLookup = spawnSync(
        process.platform === "win32" ? "where" : "which",
        ["which"],
        { encoding: "utf8" },
      );
      const whichPath = (whichLookup.stdout || "").trim().split("\n")[0];
      if (!whichPath) {
        // No `which` resolver available — skip this assertion rather than
        // false-fail.
        return;
      }
      // Build a colon-joined PATH containing only what we need.
      const restrictedPath = [nodeBin, dirname(whichPath)].join(":");

      const { exitCode, stderr } = runCli(
        ["issues", "migrate", "--to", "beads"],
        {
          cwd: proj,
          // Hermetic env: clean PATH limited to node + which only.
          env: {
            PATH: restrictedPath,
            HOME: process.env.HOME || "/tmp",
          },
        },
      );
      assert.notEqual(exitCode, 0);
      assert.ok(
        stderr.includes("BEADS_NOT_AVAILABLE"),
        `expected BEADS_NOT_AVAILABLE in stderr, got: ${stderr}`,
      );
      // Install hint must be present.
      assert.ok(
        stderr.toLowerCase().includes("install") ||
          stderr.includes("beads_rust"),
        "expected install hint in stderr",
      );
    } finally {
      cleanup(minimalBin);
      cleanup(proj);
    }
  });

  it("accepts --include-closed and --dry-run flags without erroring on parse", () => {
    const proj = makeTempProject();
    try {
      // With dry-run on a json→json setup we still expect MIGRATE_NOOP since
      // source == target; this proves the flag parse succeeded before the
      // noop check fired (i.e., no "unrecognized flag" error).
      const { stderr } = runCli(
        ["issues", "migrate", "--to", "json", "--dry-run", "--include-closed"],
        { cwd: proj },
      );
      // Should NOT contain "unrecognized" / "unknown flag" type errors.
      assert.ok(!/unrecognized|unknown flag/i.test(stderr));
    } finally {
      cleanup(proj);
    }
  });
});
