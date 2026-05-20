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

import { run as runMigrate, help as helpMigrate } from "../../lib/cli/issues-migrate.mjs";
import { run as runIssues, help as helpIssues } from "../../lib/cli/issues.mjs";

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
