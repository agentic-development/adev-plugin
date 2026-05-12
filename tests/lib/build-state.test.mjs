/**
 * Tests for lib/build-state.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  slugFromSpec,
  readBuildState,
  createBuildState,
  recordStepResult,
  getNextStep,
} from "../../lib/build-state.mjs";

// ── slugFromSpec ────────────────────────────────────────────────────────────

describe("slugFromSpec", () => {
  it("strips .spec.md extension and lowercases", () => {
    assert.equal(slugFromSpec("my-feature.spec.md"), "my-feature");
  });

  it("strips .md extension when no .spec.md", () => {
    assert.equal(slugFromSpec("some-doc.md"), "some-doc");
  });

  it("replaces dots and underscores with hyphens", () => {
    assert.equal(slugFromSpec("my_feature.v2.spec.md"), "my-feature-v2");
  });

  it("handles full path, uses basename only", () => {
    assert.equal(
      slugFromSpec(".context-index/specs/features/build/my-spec.spec.md"),
      "my-spec"
    );
  });

  it("throws INVALID_SPEC_PATH on empty string", () => {
    assert.throws(
      () => slugFromSpec(""),
      (err) => err.code === "INVALID_SPEC_PATH"
    );
  });

  it("throws INVALID_SPEC_PATH on null", () => {
    assert.throws(
      () => slugFromSpec(null),
      (err) => err.code === "INVALID_SPEC_PATH"
    );
  });
});

// ── readBuildState ──────────────────────────────────────────────────────────

describe("readBuildState", () => {
  it("returns null when no state file exists", () => {
    const tmp = createTempDir();
    try {
      const result = readBuildState(tmp, "nonexistent.spec.md");
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null on malformed JSON", () => {
    const tmp = createTempDir();
    try {
      const dir = join(tmp, ".context-index", "lifecycle-state");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "bad.json"), "not json{{{");
      const result = readBuildState(tmp, "bad.spec.md");
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("throws INVALID_PROJECT_ROOT on relative path", () => {
    assert.throws(
      () => readBuildState("relative", "spec.md"),
      (err) => err.code === "INVALID_PROJECT_ROOT"
    );
  });

  it("falls back to legacy .context-index/build-state/ when new path absent", () => {
    const tmp = createTempDir();
    try {
      const legacyDir = join(tmp, ".context-index", "build-state");
      mkdirSync(legacyDir, { recursive: true });
      const legacyState = {
        spec: "legacy.spec.md",
        milestone: null,
        status: "in_progress",
        steps: [{ name: "review", status: "pending" }],
        started: "2026-05-01T00:00:00.000Z",
        updated: "2026-05-01T00:00:00.000Z",
      };
      writeFileSync(join(legacyDir, "legacy.json"), JSON.stringify(legacyState));
      const result = readBuildState(tmp, "legacy.spec.md");
      assert.equal(result.spec, "legacy.spec.md");
      assert.equal(result.steps[0].name, "review");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("prefers new lifecycle-state path over legacy build-state path", () => {
    const tmp = createTempDir();
    try {
      const newDir = join(tmp, ".context-index", "lifecycle-state");
      const legacyDir = join(tmp, ".context-index", "build-state");
      mkdirSync(newDir, { recursive: true });
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(
        join(newDir, "shadow.json"),
        JSON.stringify({ spec: "shadow.spec.md", source: "new", steps: [] })
      );
      writeFileSync(
        join(legacyDir, "shadow.json"),
        JSON.stringify({ spec: "shadow.spec.md", source: "legacy", steps: [] })
      );
      const result = readBuildState(tmp, "shadow.spec.md");
      assert.equal(result.source, "new");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── createBuildState ────────────────────────────────────────────────────────

describe("createBuildState", () => {
  it("creates state file with implement pipeline steps by default", () => {
    const tmp = createTempDir();
    try {
      const state = createBuildState(tmp, "feature.spec.md");
      assert.equal(state.status, "in_progress");
      assert.equal(state.spec, "feature.spec.md");
      assert.equal(state.milestone, null);
      assert.equal(state.steps.length, 5);
      assert.deepEqual(
        state.steps.map(s => s.name),
        ["review", "plan", "route", "implement", "validate"]
      );
      assert.ok(state.steps.every(s => s.status === "pending"));

      // Verify file on disk
      const filePath = join(tmp, ".context-index", "lifecycle-state", "feature.json");
      assert.ok(existsSync(filePath));
      const onDisk = JSON.parse(readFileSync(filePath, "utf-8"));
      assert.equal(onDisk.status, "in_progress");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("creates state with full pipeline steps when full=true", () => {
    const tmp = createTempDir();
    try {
      const state = createBuildState(tmp, "feature.spec.md", { full: true });
      assert.equal(state.steps.length, 6);
      assert.deepEqual(
        state.steps.map(s => s.name),
        ["specify", "review", "plan", "route", "implement", "validate"]
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("sets milestone when provided", () => {
    const tmp = createTempDir();
    try {
      const state = createBuildState(tmp, "feature.spec.md", { milestone: "v1" });
      assert.equal(state.milestone, "v1");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── recordStepResult ────────────────────────────────────────────────────────

describe("recordStepResult", () => {
  it("records a completed step and keeps build in_progress", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      const updated = recordStepResult(tmp, "feature.spec.md", "review", {
        status: "completed",
        verdict: "PASS",
        notes: "All good",
      });
      assert.equal(updated.steps[0].status, "completed");
      assert.equal(updated.steps[0].verdict, "PASS");
      assert.equal(updated.steps[0].notes, "All good");
      assert.ok(updated.steps[0].timestamp);
      assert.equal(updated.status, "in_progress");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("sets build status to failed when a step fails", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      const updated = recordStepResult(tmp, "feature.spec.md", "review", {
        status: "failed",
        error: "Constitution violation",
      });
      assert.equal(updated.status, "failed");
      assert.equal(updated.steps[0].error, "Constitution violation");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("sets build status to completed when all steps are done", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      const steps = ["review", "plan", "route", "implement", "validate"];
      let state;
      for (const step of steps) {
        state = recordStepResult(tmp, "feature.spec.md", step, {
          status: "completed",
          verdict: "PASS",
        });
      }
      assert.equal(state.status, "completed");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("marks build completed when all steps are completed or skipped", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      recordStepResult(tmp, "feature.spec.md", "review", { status: "skipped" });
      recordStepResult(tmp, "feature.spec.md", "plan", { status: "completed" });
      recordStepResult(tmp, "feature.spec.md", "route", { status: "skipped" });
      recordStepResult(tmp, "feature.spec.md", "implement", { status: "completed" });
      const state = recordStepResult(tmp, "feature.spec.md", "validate", {
        status: "completed",
        verdict: "PASS",
      });
      assert.equal(state.status, "completed");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("throws NO_BUILD_STATE when no state file exists", () => {
    const tmp = createTempDir();
    try {
      assert.throws(
        () => recordStepResult(tmp, "missing.spec.md", "review", { status: "completed" }),
        (err) => err.code === "NO_BUILD_STATE"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("throws UNKNOWN_STEP for invalid step name", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      assert.throws(
        () => recordStepResult(tmp, "feature.spec.md", "nonexistent", { status: "completed" }),
        (err) => err.code === "UNKNOWN_STEP"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("throws INVALID_STEP_STATUS for bad status", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      assert.throws(
        () => recordStepResult(tmp, "feature.spec.md", "review", { status: "running" }),
        (err) => err.code === "INVALID_STEP_STATUS"
      );
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("records retry history on validate step", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      const retryHistory = [
        { cycle: 1, verdict: "FAIL", failed_checks: [2, 4] },
        { cycle: 2, verdict: "PASS" },
      ];
      const updated = recordStepResult(tmp, "feature.spec.md", "validate", {
        status: "completed",
        verdict: "PASS",
        retryHistory,
      });
      const validateStep = updated.steps.find(s => s.name === "validate");
      assert.equal(validateStep.retry_cycles, 2);
      assert.deepEqual(validateStep.retry_history, retryHistory);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("persists to disk atomically (verified by re-read)", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      recordStepResult(tmp, "feature.spec.md", "review", {
        status: "completed",
        verdict: "PASS",
      });
      // Read from disk independently
      const filePath = join(tmp, ".context-index", "lifecycle-state", "feature.json");
      const onDisk = JSON.parse(readFileSync(filePath, "utf-8"));
      assert.equal(onDisk.steps[0].status, "completed");
      assert.equal(onDisk.steps[0].verdict, "PASS");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── getNextStep ─────────────────────────────────────────────────────────────

describe("getNextStep", () => {
  it("returns the first pending step", () => {
    const tmp = createTempDir();
    try {
      const state = createBuildState(tmp, "feature.spec.md");
      const next = getNextStep(state);
      assert.deepEqual(next, { name: "review", index: 0 });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("skips completed/skipped steps", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      recordStepResult(tmp, "feature.spec.md", "review", { status: "skipped" });
      recordStepResult(tmp, "feature.spec.md", "plan", { status: "completed" });
      const state = readBuildState(tmp, "feature.spec.md");
      const next = getNextStep(state);
      assert.deepEqual(next, { name: "route", index: 2 });
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null when all steps are done", () => {
    const tmp = createTempDir();
    try {
      createBuildState(tmp, "feature.spec.md");
      for (const step of ["review", "plan", "route", "implement", "validate"]) {
        recordStepResult(tmp, "feature.spec.md", step, { status: "completed" });
      }
      const state = readBuildState(tmp, "feature.spec.md");
      const next = getNextStep(state);
      assert.equal(next, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for null state", () => {
    assert.equal(getNextStep(null), null);
  });

  it("returns null for state with no steps array", () => {
    assert.equal(getNextStep({ status: "in_progress" }), null);
  });
});
