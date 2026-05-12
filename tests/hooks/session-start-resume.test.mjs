/**
 * End-to-end resume-block tests for `hooks/session-start.sh`.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 *
 * Covered tasks:
 *  11. Hook integration tests — four-status fixture matrix.
 *
 * Each test seeds a fixture project with `.execution-state.json` in one of
 * the four valid statuses and asserts the resume-block content matches the
 * spec's contract.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, runHook, PLUGIN_ROOT } from "../helpers.mjs";

function seedProject(projectRoot, state) {
  mkdirSync(join(projectRoot, ".context-index"), { recursive: true });
  writeFileSync(
    join(projectRoot, ".context-index", "manifest.yaml"),
    "project:\n  name: test\n"
  );
  writeFileSync(
    join(projectRoot, ".context-index", ".execution-state.json"),
    JSON.stringify(state) + "\n"
  );
}

describe("session-start.sh — resume-block per status", () => {
  it("active status: renders full Session Resume block", () => {
    const tmp = createTempDir();
    try {
      const project = join(tmp, "project");
      seedProject(project, {
        status: "active",
        planRef: ".context-index/specs/x.plan.md",
        currentTask: 2,
        issueBinding: "ISSUE-7",
        blockers: "",
        nextAction: "implement endpoint",
        progress: [
          { task: "Task 1: scaffold", done: true },
          { task: "Task 2: parse", done: false },
        ],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("session-start.sh", {
        cwd: project,
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });
      assert.equal(result.exitCode, 0);
      const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      assert.match(ctx, /# Session Resume/);
      assert.match(ctx, /\*\*Status:\*\* active/);
      assert.match(ctx, /\*\*Plan:\*\* \.context-index\/specs\/x\.plan\.md/);
      assert.match(ctx, /\*\*Current Task:\*\* 2/);
      assert.match(ctx, /\*\*Issue:\*\* ISSUE-7/);
      assert.match(ctx, /\*\*Next Action:\*\* implement endpoint/);
      assert.match(ctx, /- \[x\] Task 1: scaffold/);
      assert.match(ctx, /- \[ \] Task 2: parse/);
      assert.match(ctx, /Resume from Task 2/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("blocked status: renders Blocker / Next Action / address-the-blocker line", () => {
    const tmp = createTempDir();
    try {
      const project = join(tmp, "project");
      seedProject(project, {
        status: "blocked",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "Upstream API down",
        nextAction: "Wait for ops",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("session-start.sh", {
        cwd: project,
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });
      assert.equal(result.exitCode, 0);
      const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      assert.match(ctx, /\*\*Status:\*\* blocked/);
      assert.match(ctx, /\*\*Blocker:\*\* Upstream API down/);
      assert.match(ctx, /\*\*Next Action:\*\* Wait for ops/);
      assert.match(ctx, /Address the blocker before continuing/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("idle status: NO resume block", () => {
    const tmp = createTempDir();
    try {
      const project = join(tmp, "project");
      seedProject(project, {
        status: "idle",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("session-start.sh", {
        cwd: project,
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });
      assert.equal(result.exitCode, 0);
      const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      assert.ok(!ctx.includes("Session Resume"));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("standalone status: NO resume block", () => {
    const tmp = createTempDir();
    try {
      const project = join(tmp, "project");
      seedProject(project, {
        status: "standalone",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("session-start.sh", {
        cwd: project,
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });
      assert.equal(result.exitCode, 0);
      const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
      assert.ok(!ctx.includes("Session Resume"));
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
