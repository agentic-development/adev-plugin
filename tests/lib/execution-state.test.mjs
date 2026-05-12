/**
 * Tests for lib/execution-state.mjs (JSON migration).
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 *
 * Tasks covered:
 *   1. Lock `.execution-state.json` schema (fixtures)
 *   2. Rewrite serialization to JSON (`writeExecutionState` / `readExecutionState`)
 *   3. Atomic temp-then-rename + cleanup-on-failure
 *   4. Path-containment defenses (`projectRoot` manifest presence + realpath prefix)
 *   5. Read tolerance + 256 KB cap (`STATE_FILE_TOO_LARGE`)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";
import {
  writeExecutionState,
  readExecutionState,
  clearExecutionState,
} from "../../lib/execution-state.mjs";

const STATE_FILE_REL = ".context-index/.execution-state.json";

/**
 * Helper: create a temp dir that satisfies the path-containment defenses
 * (manifest.yaml present in `.context-index/`).
 */
function createValidProjectRoot() {
  const tmp = createTempDir();
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
  return tmp;
}

// ── Task 2: Validation ──────────────────────────────────────────────────────

describe("execution-state validation", () => {
  it("rejects relative projectRoot with INVALID_PROJECT_ROOT", () => {
    assert.throws(
      () => writeExecutionState("relative/path", { status: "idle" }),
      (err) => err.code === "INVALID_PROJECT_ROOT"
    );
  });

  it("rejects projectRoot lacking manifest.yaml with INVALID_PROJECT_ROOT (Task 4)", () => {
    const tmp = createTempDir(); // no manifest written
    try {
      assert.throws(
        () => writeExecutionState(tmp, { status: "idle" }),
        (err) => err.code === "INVALID_PROJECT_ROOT"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("rejects invalid status with INVALID_STATUS", () => {
    const tmp = createValidProjectRoot();
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
    const tmp = createValidProjectRoot();
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
    const tmp = createValidProjectRoot();
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

// ── Task 2: writeExecutionState (JSON shape) ────────────────────────────────

describe("writeExecutionState — JSON shape", () => {
  it("writes a JSON document with all schema fields for active state", () => {
    const tmp = createValidProjectRoot();
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
      const filePath = join(tmp, STATE_FILE_REL);
      assert.ok(existsSync(filePath), ".execution-state.json must exist");
      const raw = readFileSync(filePath, "utf-8");
      // Must be valid JSON
      const parsed = JSON.parse(raw);
      assert.equal(parsed.status, "active");
      assert.equal(parsed.planRef, "specs/feature.plan.md");
      assert.equal(parsed.currentTask, 3);
      assert.equal(parsed.issueBinding, "ISSUE-42");
      assert.equal(parsed.blockers, "");
      assert.equal(parsed.nextAction, "Implement parser");
      assert.ok(parsed.updated, "updated timestamp must be present");
      assert.equal(parsed.progress.length, 3);
      assert.deepEqual(parsed.progress[0], { task: "Task 1: Setup", done: true });
      assert.deepEqual(parsed.progress[2], { task: "Task 3: Parser", done: false });
      // Must end with newline (matches lib/build-state.mjs::atomicWriteJson)
      assert.ok(raw.endsWith("\n"), "file should end with newline");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("does NOT write the legacy .execution-state.md file", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, { status: "idle" });
      const legacy = join(tmp, ".context-index/.execution-state.md");
      assert.ok(!existsSync(legacy), "legacy .md must not be written");
      const json = join(tmp, STATE_FILE_REL);
      assert.ok(existsSync(json), "json file must be written");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("creates .context-index/ directory if missing (rare: dir present, file missing)", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, { status: "idle" });
      assert.ok(existsSync(join(tmp, STATE_FILE_REL)));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("idle-normalization: clears all binding fields and progress to []", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, {
        status: "idle",
        planRef: "should-be-cleared",
        currentTask: 5,
        issueBinding: "ISSUE-99",
        blockers: "should-be-cleared",
        nextAction: "should-be-cleared",
        progress: [{ task: "should be cleared", done: true }],
      });
      const parsed = JSON.parse(readFileSync(join(tmp, STATE_FILE_REL), "utf-8"));
      assert.equal(parsed.status, "idle");
      assert.equal(parsed.planRef, "");
      assert.equal(parsed.currentTask, "");
      assert.equal(parsed.issueBinding, "");
      assert.equal(parsed.blockers, "");
      assert.equal(parsed.nextAction, "");
      assert.deepEqual(parsed.progress, []);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("standalone-normalization: same as idle (clears binding fields + progress)", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, {
        status: "standalone",
        planRef: "should-be-cleared",
        currentTask: 5,
        issueBinding: "ISSUE-99",
        blockers: "should-be-cleared",
        nextAction: "should-be-cleared",
        progress: [{ task: "should be cleared", done: false }],
      });
      const parsed = JSON.parse(readFileSync(join(tmp, STATE_FILE_REL), "utf-8"));
      assert.equal(parsed.status, "standalone");
      assert.equal(parsed.planRef, "");
      assert.equal(parsed.currentTask, "");
      assert.equal(parsed.issueBinding, "");
      assert.equal(parsed.blockers, "");
      assert.equal(parsed.nextAction, "");
      assert.deepEqual(parsed.progress, []);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("preserves newlines and --- sequences inside JSON-encoded free-text fields (no sanitizeField)", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, {
        status: "blocked",
        blockers: "line1\nline2\n---\nline3",
        nextAction: "do\nthis",
      });
      const parsed = JSON.parse(readFileSync(join(tmp, STATE_FILE_REL), "utf-8"));
      // JSON-encoding preserves the literal characters; on-disk format is JSON.
      assert.equal(parsed.blockers, "line1\nline2\n---\nline3");
      assert.equal(parsed.nextAction, "do\nthis");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 3: Atomic write + cleanup ──────────────────────────────────────────

describe("writeExecutionState — atomic write", () => {
  it("leaves no .tmp files after successful write", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, { status: "idle" });
      const files = readdirSync(join(tmp, ".context-index"));
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      assert.equal(tmpFiles.length, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("rename failure: temp file is cleaned up best-effort, original error propagates", () => {
    // Force rename failure by making `.execution-state.json` a non-empty directory
    // on disk (renameSync onto a non-empty directory fails with ENOTEMPTY/EISDIR/etc).
    const tmp = createValidProjectRoot();
    try {
      const blockingDir = join(tmp, STATE_FILE_REL);
      mkdirSync(blockingDir, { recursive: true });
      writeFileSync(join(blockingDir, "sentinel"), "blocker");

      let thrown;
      try {
        writeExecutionState(tmp, { status: "idle" });
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown, "rename failure must propagate as an error");
      // Best-effort cleanup: no orphaned .tmp files left over.
      const stragglers = readdirSync(join(tmp, ".context-index")).filter((f) =>
        f.endsWith(".tmp")
      );
      assert.equal(stragglers.length, 0, "no .tmp files should remain after rename failure");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 4: Path-containment defenses ───────────────────────────────────────

describe("path-containment defenses", () => {
  it("throws INVALID_PROJECT_ROOT when manifest.yaml is missing", () => {
    const tmp = createTempDir();
    try {
      // .context-index exists but no manifest.yaml
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      assert.throws(
        () => writeExecutionState(tmp, { status: "idle" }),
        (err) => err.code === "INVALID_PROJECT_ROOT"
      );
      assert.throws(
        () => readExecutionState(tmp),
        (err) => err.code === "INVALID_PROJECT_ROOT"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("throws INVALID_STORAGE_PATH when .context-index is a symlink that escapes the project root", () => {
    // Layout:
    //   <tmp>/project/.context-index -> <tmp>/escape/.context-index
    //   <tmp>/escape/.context-index/manifest.yaml exists
    // The realpath of the state-parent (`.context-index`) will resolve to
    // `<tmp>/escape/.context-index`, which does NOT start with
    // realpath(`<tmp>/project`)/.context-index. Expectation:
    // INVALID_STORAGE_PATH.
    const tmp = createTempDir();
    try {
      const project = join(tmp, "project");
      const escape = join(tmp, "escape");
      mkdirSync(project, { recursive: true });
      mkdirSync(join(escape, ".context-index"), { recursive: true });
      writeFileSync(join(escape, ".context-index", "manifest.yaml"), "project:\n  name: escape\n");
      // Symlink project/.context-index -> escape/.context-index
      symlinkSync(join(escape, ".context-index"), join(project, ".context-index"));
      // Verify the manifest is accessible via the symlink (so manifest-presence
      // check passes — i.e. this is precisely the symlink-escape scenario).
      assert.ok(existsSync(join(project, ".context-index", "manifest.yaml")));

      assert.throws(
        () => writeExecutionState(project, { status: "idle" }),
        (err) => err.code === "INVALID_STORAGE_PATH"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("succeeds when projectRoot has manifest.yaml and no symlink escape", () => {
    const tmp = createValidProjectRoot();
    try {
      writeExecutionState(tmp, { status: "idle" });
      const result = readExecutionState(tmp);
      assert.equal(result.status, "idle");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 5: Read tolerance + 256 KB cap ─────────────────────────────────────

describe("readExecutionState — tolerance", () => {
  it("returns null when file does not exist", () => {
    const tmp = createValidProjectRoot();
    try {
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for malformed JSON (truncated)", () => {
    const tmp = createValidProjectRoot();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, STATE_FILE_REL), '{"status": "active", "planRef"');
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for non-JSON content (legacy YAML detection)", () => {
    const tmp = createValidProjectRoot();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, STATE_FILE_REL), "---\nstatus: idle\n---\n");
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null when file exceeds 256 KB cap (STATE_FILE_TOO_LARGE)", () => {
    const tmp = createValidProjectRoot();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      // Build a 257 KB JSON file.
      const padding = "x".repeat(257 * 1024);
      writeFileSync(
        join(tmp, STATE_FILE_REL),
        JSON.stringify({ status: "active", planRef: padding, currentTask: 1, progress: [] })
      );
      const result = readExecutionState(tmp);
      assert.equal(result, null);
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

  it("never throws on read errors (returns null for binary garbage)", () => {
    const tmp = createValidProjectRoot();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, STATE_FILE_REL), "\x00\xff\x00garbage");
      const result = readExecutionState(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── readExecutionState round-trip ───────────────────────────────────────────

describe("readExecutionState — round-trip", () => {
  it("parses active state with all fields", () => {
    const tmp = createValidProjectRoot();
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
      assert.deepEqual(result.progress[0], { task: "Task 1: Setup", done: true });
      assert.deepEqual(result.progress[1], { task: "Task 2: Core", done: false });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("parses idle state with empty progress", () => {
    const tmp = createValidProjectRoot();
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

  it("coerces numeric-string currentTask to Number (round-trip compatibility)", () => {
    const tmp = createValidProjectRoot();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      // Hand-craft a JSON file with currentTask as a string of digits.
      writeFileSync(
        join(tmp, STATE_FILE_REL),
        JSON.stringify({
          status: "active",
          planRef: "specs/x.plan.md",
          currentTask: "7",
          issueBinding: "",
          blockers: "",
          nextAction: "",
          progress: [],
          updated: new Date().toISOString(),
        })
      );
      const result = readExecutionState(tmp);
      assert.equal(result.currentTask, 7);
      assert.equal(typeof result.currentTask, "number");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── clearExecutionState ─────────────────────────────────────────────────────

describe("clearExecutionState", () => {
  it("resets to idle with empty bindings", () => {
    const tmp = createValidProjectRoot();
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

// ── End-to-end round trip ───────────────────────────────────────────────────

describe("round-trip", () => {
  it("write then read produces identical state", () => {
    const tmp = createValidProjectRoot();
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
      assert.deepEqual(result.progress[0], { task: "Task 1: Schema", done: true });
      assert.deepEqual(result.progress[2], { task: "Task 3: API", done: false });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("blocked state round-trips correctly", () => {
    const tmp = createValidProjectRoot();
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
