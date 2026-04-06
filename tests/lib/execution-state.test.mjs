/**
 * Tests for lib/execution-state.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  writeExecutionState,
  readExecutionState,
  clearExecutionState,
} from "../../lib/execution-state.mjs";

// ── Task 1: Validation ──────────────────────────────────────────────────────

describe("execution-state validation", () => {
  it("rejects relative projectRoot with INVALID_PROJECT_ROOT", () => {
    assert.throws(
      () => writeExecutionState("relative/path", { status: "idle" }),
      (err) => err.code === "INVALID_PROJECT_ROOT"
    );
  });

  it("rejects invalid status with INVALID_STATUS", () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => writeExecutionState(tmp, { status: "running" }),
        (err) => err.code === "INVALID_STATUS"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("rejects active status without planRef with MISSING_PLAN_REF", () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => writeExecutionState(tmp, { status: "active", currentTask: 1 }),
        (err) => err.code === "MISSING_PLAN_REF"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("rejects active status without currentTask with MISSING_CURRENT_TASK", () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () =>
          writeExecutionState(tmp, {
            status: "active",
            planRef: "specs/foo.plan.md",
          }),
        (err) => err.code === "MISSING_CURRENT_TASK"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 2: writeExecutionState ─────────────────────────────────────────────

describe("writeExecutionState", () => {
  it("writes file with correct YAML frontmatter for active state", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: "active",
        planRef: "specs/feature.plan.md",
        currentTask: 3,
        issueBinding: "ISSUE-42",
        blockers: "",
        nextAction: "Implement parser",
        progress: [
          { task: "Task 1: Setup", done: true },
          { task: "Task 2: Core", done: true },
          { task: "Task 3: Parser", done: false },
        ],
      });
      const content = readFileSync(
        join(tmp, ".context-index/.execution-state.md"),
        "utf-8"
      );
      assert.ok(content.startsWith("---\n"));
      assert.ok(content.includes("status: active"));
      assert.ok(content.includes("planRef: specs/feature.plan.md"));
      assert.ok(content.includes("currentTask: 3"));
      assert.ok(content.includes("issueBinding: ISSUE-42"));
      assert.ok(content.includes("updated:"));
      assert.ok(content.includes("- [x] Task 1: Setup"));
      assert.ok(content.includes("- [ ] Task 3: Parser"));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("creates .context-index/ directory if missing", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, { status: "idle" });
      assert.ok(existsSync(join(tmp, ".context-index/.execution-state.md")));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("clears all fields when status is idle", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: "idle",
        planRef: "should-be-cleared",
        currentTask: 5,
        issueBinding: "ISSUE-99",
        blockers: "should-be-cleared",
        nextAction: "should-be-cleared",
      });
      const content = readFileSync(
        join(tmp, ".context-index/.execution-state.md"),
        "utf-8"
      );
      assert.ok(content.includes("status: idle"));
      assert.ok(!content.includes("should-be-cleared"));
      assert.ok(!content.includes("ISSUE-99"));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("leaves no .tmp files after successful write", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeExecutionState(tmp, { status: "idle" });
      const files = readdirSync(join(tmp, ".context-index"));
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      assert.equal(tmpFiles.length, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("sanitizes newlines and --- in free-text fields", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: "blocked",
        blockers: "line1\nline2\n---\nline3",
        nextAction: "do\nthis",
      });
      const content = readFileSync(
        join(tmp, ".context-index/.execution-state.md"),
        "utf-8"
      );
      const lines = content.split("\n");
      const blockersLine = lines.find((l) => l.startsWith("blockers:"));
      assert.ok(blockersLine);
      // The sanitized value should be on a single line with no ---
      assert.ok(!blockersLine.includes("---"));
      const nextActionLine = lines.find((l) => l.startsWith("nextAction:"));
      assert.ok(nextActionLine);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 3: readExecutionState ──────────────────────────────────────────────

describe("readExecutionState", () => {
  it("returns null when file does not exist", () => {
    const tmp = createTempDir();
    try {
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for malformed frontmatter", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(
        join(tmp, ".context-index/.execution-state.md"),
        "no frontmatter here"
      );
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("parses active state with all fields", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: "active",
        planRef: "specs/feature.plan.md",
        currentTask: 2,
        issueBinding: "ISSUE-7",
        blockers: "waiting on API",
        nextAction: "implement endpoint",
        progress: [
          { task: "Task 1: Setup", done: true },
          { task: "Task 2: Core", done: false },
        ],
      });
      const result = readExecutionState(tmp);
      assert.equal(result.status, "active");
      assert.equal(result.planRef, "specs/feature.plan.md");
      assert.equal(result.currentTask, 2);
      assert.equal(result.issueBinding, "ISSUE-7");
      assert.equal(result.blockers, "waiting on API");
      assert.equal(result.nextAction, "implement endpoint");
      assert.ok(result.updated);
      assert.equal(result.progress.length, 2);
      assert.deepEqual(result.progress[0], {
        task: "Task 1: Setup",
        done: true,
      });
      assert.deepEqual(result.progress[1], {
        task: "Task 2: Core",
        done: false,
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("parses idle state with empty progress", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, { status: "idle" });
      const result = readExecutionState(tmp);
      assert.equal(result.status, "idle");
      assert.equal(result.planRef, "");
      assert.equal(result.currentTask, "");
      assert.deepEqual(result.progress, []);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("rejects relative projectRoot", () => {
    assert.throws(
      () => readExecutionState("relative/path"),
      (err) => err.code === "INVALID_PROJECT_ROOT"
    );
  });

  it("never throws on read errors (returns null)", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(
        join(tmp, ".context-index/.execution-state.md"),
        "---\ngarbage: [[["
      );
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 4: clearExecutionState and Round-Trip ──────────────────────────────

describe("clearExecutionState", () => {
  it("resets to idle with empty bindings", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: "active",
        planRef: "specs/feature.plan.md",
        currentTask: 3,
        issueBinding: "ISSUE-42",
        blockers: "stuck",
        nextAction: "fix it",
        progress: [{ task: "Task 1", done: true }],
      });
      clearExecutionState(tmp);
      const result = readExecutionState(tmp);
      assert.equal(result.status, "idle");
      assert.equal(result.planRef, "");
      assert.equal(result.currentTask, "");
      assert.equal(result.issueBinding, "");
      assert.equal(result.blockers, "");
      assert.equal(result.nextAction, "");
      assert.deepEqual(result.progress, []);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

describe("round-trip", () => {
  it("write then read produces identical state", () => {
    const tmp = createTempDir();
    try {
      const state = {
        status: "active",
        planRef: "specs/auth.plan.md",
        currentTask: 2,
        issueBinding: "ISSUE-10",
        blockers: "",
        nextAction: "write tests",
        progress: [
          { task: "Task 1: Schema", done: true },
          { task: "Task 2: Logic", done: false },
          { task: "Task 3: API", done: false },
        ],
      };
      writeExecutionState(tmp, state);
      const result = readExecutionState(tmp);
      assert.equal(result.status, state.status);
      assert.equal(result.planRef, state.planRef);
      assert.equal(result.currentTask, state.currentTask);
      assert.equal(result.issueBinding, state.issueBinding);
      assert.equal(result.nextAction, state.nextAction);
      assert.equal(result.progress.length, 3);
      assert.deepEqual(result.progress[0], {
        task: "Task 1: Schema",
        done: true,
      });
      assert.deepEqual(result.progress[2], {
        task: "Task 3: API",
        done: false,
      });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("blocked state round-trips correctly", () => {
    const tmp = createTempDir();
    try {
      writeExecutionState(tmp, {
        status: "blocked",
        blockers: "waiting on upstream API",
        nextAction: "check back tomorrow",
      });
      const result = readExecutionState(tmp);
      assert.equal(result.status, "blocked");
      assert.equal(result.blockers, "waiting on upstream API");
      assert.equal(result.nextAction, "check back tomorrow");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
