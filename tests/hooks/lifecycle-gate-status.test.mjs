/**
 * End-to-end status-gate tests for `hooks/lifecycle-gate.sh` (pre-bash surface).
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 *
 * Covered tasks:
 *  11. Hook integration tests — four-status fixture matrix.
 *
 * Each test seeds a fixture project with `.execution-state.json` in one of
 * the four valid statuses and asserts the gate exit-code matches the spec:
 *   - active / standalone → exit 0 (bypass)
 *   - idle / blocked + mutating command + level=block → exit 2
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, runHook } from "../helpers.mjs";

function seedProject(projectRoot, state, userConfig = "lifecycle.gate=block") {
  mkdirSync(join(projectRoot, ".context-index"), { recursive: true });
  writeFileSync(
    join(projectRoot, ".context-index", "manifest.yaml"),
    "project:\n  name: test\n"
  );
  writeFileSync(join(projectRoot, ".context-index", "user-config"), userConfig);
  writeFileSync(
    join(projectRoot, ".context-index", ".execution-state.json"),
    JSON.stringify(state) + "\n"
  );
}

describe("lifecycle-gate.sh pre-bash — status bypass per status", () => {
  it("active status: bypass, exit 0 even for mutating command", () => {
    const tmp = createTempDir();
    try {
      seedProject(tmp, {
        status: "active",
        planRef: "x.plan.md",
        currentTask: 1,
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("lifecycle-gate.sh", {
        args: ["pre-bash"],
        cwd: tmp,
        env: { CLAUDE_TOOL_INPUT_command: "npm run build" },
      });
      assert.equal(result.exitCode, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("standalone status: bypass, exit 0 even for mutating command", () => {
    const tmp = createTempDir();
    try {
      seedProject(tmp, {
        status: "standalone",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("lifecycle-gate.sh", {
        args: ["pre-bash"],
        cwd: tmp,
        env: { CLAUDE_TOOL_INPUT_command: "rm -rf dist" },
      });
      assert.equal(result.exitCode, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("idle status: no bypass — mutating command + level=block → exit 2", () => {
    const tmp = createTempDir();
    try {
      seedProject(tmp, {
        status: "idle",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("lifecycle-gate.sh", {
        args: ["pre-bash"],
        cwd: tmp,
        env: { CLAUDE_TOOL_INPUT_command: "npm run build" },
      });
      assert.equal(result.exitCode, 2);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("blocked status: no bypass — mutating command + level=block → exit 2", () => {
    const tmp = createTempDir();
    try {
      seedProject(tmp, {
        status: "blocked",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "stuck",
        nextAction: "fix it",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      });
      const result = runHook("lifecycle-gate.sh", {
        args: ["pre-bash"],
        cwd: tmp,
        env: { CLAUDE_TOOL_INPUT_command: "npm run build" },
      });
      assert.equal(result.exitCode, 2);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("malformed state file: gate falls through to enforcement (exit 2 on block)", () => {
    // Per spec: malformed JSON → helper emits "null" in read mode → status
    // resolves to empty string → no bypass.
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
      writeFileSync(join(tmp, ".context-index", "user-config"), "lifecycle.gate=block");
      writeFileSync(
        join(tmp, ".context-index", ".execution-state.json"),
        "{not valid json"
      );
      const result = runHook("lifecycle-gate.sh", {
        args: ["pre-bash"],
        cwd: tmp,
        env: { CLAUDE_TOOL_INPUT_command: "npm run build" },
      });
      assert.equal(result.exitCode, 2);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("missing state file: no bypass, gate enforces (exit 2 on block)", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, ".context-index", "manifest.yaml"), "project:\n  name: test\n");
      writeFileSync(join(tmp, ".context-index", "user-config"), "lifecycle.gate=block");
      const result = runHook("lifecycle-gate.sh", {
        args: ["pre-bash"],
        cwd: tmp,
        env: { CLAUDE_TOOL_INPUT_command: "npm run build" },
      });
      assert.equal(result.exitCode, 2);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
