/**
 * Subprocess contract tests for hooks/_execution-state.mjs.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 *
 * Covered tasks:
 *   6. `hooks/_execution-state.mjs` skeleton + both modes
 *   7. Field-rendering safety in `resume-block` mode
 *  10. Helper subprocess contract tests
 *
 * The helper is invoked via `child_process.spawnSync` with crafted env vars,
 * matching how `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh`
 * will invoke it after the refactor.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture, PLUGIN_ROOT } from "../helpers.mjs";

const HELPER_PATH = join(PLUGIN_ROOT, "hooks", "_execution-state.mjs");

/**
 * Invoke the helper as a subprocess.
 */
function invokeHelper({ contextRoot, mode, extraEnv = {} } = {}) {
  const env = { ...process.env };
  // Strip parent inheritance of mode/context vars so each test is hermetic.
  delete env.ADEV_CONTEXT_ROOT;
  delete env.ADEV_EXECUTION_STATE_MODE;
  if (contextRoot !== undefined) env.ADEV_CONTEXT_ROOT = contextRoot;
  if (mode !== undefined) env.ADEV_EXECUTION_STATE_MODE = mode;
  Object.assign(env, extraEnv);
  return spawnSync("node", [HELPER_PATH], {
    env,
    encoding: "utf-8",
    timeout: 10_000,
  });
}

/**
 * Write a valid `.execution-state.json` fixture under the temp project root.
 */
function writeStateFixture(tmp, state) {
  mkdirSync(join(tmp, ".context-index"), { recursive: true });
  writeFileSync(
    join(tmp, ".context-index/.execution-state.json"),
    JSON.stringify({ progress: [], ...state }) + "\n"
  );
}

// ── read mode ───────────────────────────────────────────────────────────────

describe("hooks/_execution-state.mjs — read mode", () => {
  it("emits JSON.stringify(state) on stdout for valid active state", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "active",
        planRef: "specs/x.plan.md",
        currentTask: 3,
        issueBinding: "ISSUE-1",
        blockers: "",
        nextAction: "next",
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "read" });
      assert.equal(result.status, 0);
      const parsed = JSON.parse(result.stdout.trim());
      assert.equal(parsed.status, "active");
      assert.equal(parsed.planRef, "specs/x.plan.md");
      assert.equal(parsed.currentTask, 3);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('emits "null" when ADEV_CONTEXT_ROOT is unset', () => {
    const result = invokeHelper({ mode: "read" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "null");
  });

  it('emits "null" when state file is missing', () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      const result = invokeHelper({ contextRoot: tmp, mode: "read" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "null");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('emits "null" when JSON is malformed', () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, ".context-index/.execution-state.json"), '{"status": "active');
      const result = invokeHelper({ contextRoot: tmp, mode: "read" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "null");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it('emits "null" when ADEV_CONTEXT_ROOT points to a non-existent path', () => {
    const result = invokeHelper({
      contextRoot: "/this/path/definitely/does/not/exist",
      mode: "read",
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "null");
  });

  it('emits "null" when oversized state file (>256 KB) is on disk', () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      const padding = "x".repeat(257 * 1024);
      writeFileSync(
        join(tmp, ".context-index/.execution-state.json"),
        JSON.stringify({ status: "active", planRef: padding, currentTask: 1, progress: [] })
      );
      const result = invokeHelper({ contextRoot: tmp, mode: "read" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "null");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── resume-block mode ───────────────────────────────────────────────────────

describe("hooks/_execution-state.mjs — resume-block mode", () => {
  it("emits resume block for active state with progress list", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "active",
        planRef: ".context-index/specs/features/test/test.plan.md",
        currentTask: 2,
        issueBinding: "ISSUE-5",
        blockers: "",
        nextAction: "Implement parser",
        progress: [
          { task: "Task 1: Setup", done: true },
          { task: "Task 2: Implement parser", done: false },
        ],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Session Resume/);
      assert.match(result.stdout, /Status:.*active/);
      assert.match(result.stdout, /Task 2/);
      assert.match(result.stdout, /Implement parser/);
      // Progress checklist lines
      assert.match(result.stdout, /- \[x\] Task 1: Setup/);
      assert.match(result.stdout, /- \[ \] Task 2: Implement parser/);
      assert.match(result.stdout, /Resume from Task 2/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("emits resume block for blocked state", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "blocked",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "Missing API credentials",
        nextAction: "Ask user for credentials",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Status:.*blocked/);
      assert.match(result.stdout, /Missing API credentials/);
      assert.match(result.stdout, /Ask user for credentials/);
      assert.match(result.stdout, /Address the blocker before continuing/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("emits empty stdout for idle state", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "idle",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("emits empty stdout for standalone state", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "standalone",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("emits empty stdout when state file is missing", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("emits empty stdout for unknown status", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "weird-status",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), "");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("defaults to resume-block mode when ADEV_EXECUTION_STATE_MODE is unset", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "blocked",
        blockers: "stuck",
        nextAction: "fix it",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp /* no mode */ });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Status:.*blocked/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("defaults to resume-block on unknown mode (with stderr warning)", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "blocked",
        blockers: "stuck",
        nextAction: "fix it",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "totally-bogus-mode" });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /Status:.*blocked/);
      assert.match(result.stderr, /UNKNOWN_HELPER_MODE_DEFAULTED|unknown.*mode/i);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Task 7: field-rendering safety ──────────────────────────────────────────

describe("hooks/_execution-state.mjs — field-rendering safety", () => {
  it("replaces newlines with spaces in blockers / nextAction / currentTask slots", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "blocked",
        planRef: "",
        currentTask: "step\nwith\nnewlines",
        issueBinding: "",
        blockers: "line1\nline2\r\nline3",
        nextAction: "do\nthis\nnext",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      // Find the lines containing the blockers / nextAction values — they must
      // be single-line (no embedded \n).
      const blockersLine = result.stdout
        .split("\n")
        .find((l) => l.toLowerCase().includes("blocker:"));
      assert.ok(blockersLine, "must have a Blocker: line");
      assert.ok(
        !blockersLine.includes("line1") || !blockersLine.includes("\n"),
        "blockers line must not embed raw newlines"
      );
      // All three substrings should appear, joined by spaces:
      assert.match(blockersLine, /line1 line2 line3/);
      const nextActionLine = result.stdout
        .split("\n")
        .find((l) => l.toLowerCase().includes("next action:"));
      assert.ok(nextActionLine);
      assert.match(nextActionLine, /do this next/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("truncates blockers to 4 KB codepoints with …[truncated] marker", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      const oversizedBlockers = "x".repeat(5000); // 5 KB ASCII = 5000 codepoints
      writeStateFixture(tmp, {
        status: "blocked",
        blockers: oversizedBlockers,
        nextAction: "fix it",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /…\[truncated\]/);
      // Total stdout should be much smaller than 5 KB raw — at most 4 KB + framing
      // We check that the original >5000 'x' string is NOT present in full.
      const xRuns = result.stdout.match(/x+/g) || [];
      const longestRun = xRuns.reduce((m, s) => Math.max(m, s.length), 0);
      assert.ok(longestRun <= 4096, `longest x-run is ${longestRun} (cap: 4096)`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("truncates nextAction to 4 KB codepoints", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      const oversized = "y".repeat(5000);
      writeStateFixture(tmp, {
        status: "blocked",
        blockers: "short",
        nextAction: oversized,
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      const yRuns = result.stdout.match(/y+/g) || [];
      const longestRun = yRuns.reduce((m, s) => Math.max(m, s.length), 0);
      assert.ok(longestRun <= 4096, `longest y-run is ${longestRun} (cap: 4096)`);
      assert.match(result.stdout, /…\[truncated\]/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("truncates progress[].task to 256 codepoints per entry", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      const longTask = "z".repeat(500);
      writeStateFixture(tmp, {
        status: "active",
        planRef: "specs/x.plan.md",
        currentTask: 1,
        issueBinding: "",
        blockers: "",
        nextAction: "go",
        progress: [
          { task: longTask, done: false },
        ],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      const zRuns = result.stdout.match(/z+/g) || [];
      const longestRun = zRuns.reduce((m, s) => Math.max(m, s.length), 0);
      assert.ok(longestRun <= 256, `longest z-run is ${longestRun} (cap: 256)`);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("truncates progress[] to 100 entries with …[N more] trailing line", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      const progress = Array.from({ length: 150 }, (_, i) => ({
        task: `Task ${i + 1}`,
        done: i < 50,
      }));
      writeStateFixture(tmp, {
        status: "active",
        planRef: "specs/x.plan.md",
        currentTask: 51,
        issueBinding: "",
        blockers: "",
        nextAction: "continue",
        progress,
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      // Count checklist lines
      const checklistLines = result.stdout
        .split("\n")
        .filter((l) => /^- \[(x| )\] /.test(l));
      assert.ok(
        checklistLines.length <= 100,
        `should have at most 100 checklist lines, got ${checklistLines.length}`
      );
      assert.match(result.stdout, /…\[50 more\]/);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("does not emit truncated marker when within caps", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "blocked",
        blockers: "short",
        nextAction: "ok",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.ok(!result.stdout.includes("…[truncated]"));
      assert.ok(!result.stdout.match(/…\[\d+ more\]/));
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── stdout contract postconditions ──────────────────────────────────────────

describe("hooks/_execution-state.mjs — stdout postconditions", () => {
  it("read mode stdout is exactly one parseable JSON value", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "active",
        planRef: "specs/x.plan.md",
        currentTask: 1,
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "read" });
      assert.equal(result.status, 0);
      // Must JSON.parse without throwing.
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.status, "active");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("resume-block mode stdout ends with a single trailing newline (or is empty)", () => {
    const tmp = createTempDir();
    try {
      writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: test\n");
      writeStateFixture(tmp, {
        status: "blocked",
        blockers: "stuck",
        nextAction: "fix",
        progress: [],
        updated: new Date().toISOString(),
      });
      const result = invokeHelper({ contextRoot: tmp, mode: "resume-block" });
      assert.equal(result.status, 0);
      assert.ok(result.stdout.endsWith("\n"));
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
