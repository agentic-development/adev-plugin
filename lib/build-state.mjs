/**
 * Build state persistence helper.
 *
 * Provides programmatic read/write for build state JSON files at
 * `.context-index/build-state/<slug>.json`. Replaces the instruction-only
 * JSON writing in skills/build/SKILL.md with atomic, validated operations.
 *
 * @module lib/build-state
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { join, isAbsolute, basename, dirname } from "node:path";
import { randomBytes } from "node:crypto";

const BUILD_STATE_DIR = ".context-index/build-state";

const IMPLEMENT_STEPS = ["review", "plan", "route", "implement", "validate"];
const FULL_STEPS = ["specify", "review", "plan", "route", "implement", "validate"];
const VALID_STEP_STATUSES = new Set(["pending", "completed", "failed", "skipped"]);
const VALID_BUILD_STATUSES = new Set(["in_progress", "completed", "failed"]);

/**
 * Derive a slug from a spec path.
 * Strips directory and extension, lowercases, replaces dots/underscores with hyphens.
 *
 * @param {string} specPath - Path to the spec file
 * @returns {string} Slug suitable for build state filename
 */
export function slugFromSpec(specPath) {
  if (!specPath || typeof specPath !== "string") {
    const err = new Error("specPath must be a non-empty string");
    err.code = "INVALID_SPEC_PATH";
    throw err;
  }
  return basename(specPath)
    .replace(/\.spec\.md$/, "")
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[._]/g, "-");
}

/**
 * Resolve the absolute path to a build state file.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} specPath - Path to the spec file
 * @returns {string} Absolute path to the build state JSON file
 */
function resolveStatePath(projectRoot, specPath) {
  if (!isAbsolute(projectRoot)) {
    const err = new Error("projectRoot must be an absolute path");
    err.code = "INVALID_PROJECT_ROOT";
    throw err;
  }
  const slug = slugFromSpec(specPath);
  return join(projectRoot, BUILD_STATE_DIR, `${slug}.json`);
}

/**
 * Atomic JSON write via temp-file-then-rename.
 *
 * @param {string} filePath - Absolute path to write to
 * @param {object} data - JSON-serializable object
 */
function atomicWriteJson(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* swallow cleanup errors */ }
    throw err;
  }
}

/**
 * Read build state from disk.
 * Returns null if the file does not exist or is malformed.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} specPath - Path to the spec file
 * @returns {object|null} Parsed build state or null
 */
export function readBuildState(projectRoot, specPath) {
  const filePath = resolveStatePath(projectRoot, specPath);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Create a fresh build state file with all steps pending.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} specPath - Path to the spec file
 * @param {object} [options]
 * @param {string|null} [options.milestone] - Milestone name (e.g. "0.25.0") or null
 * @param {boolean} [options.full] - If true, include the "specify" step (Full Pipeline)
 * @returns {object} The created build state object
 */
export function createBuildState(projectRoot, specPath, options = {}) {
  const { milestone = null, full = false } = options;
  const stepNames = full ? FULL_STEPS : IMPLEMENT_STEPS;
  const now = new Date().toISOString();

  const state = {
    spec: specPath,
    milestone,
    status: "in_progress",
    steps: stepNames.map(name => ({ name, status: "pending" })),
    started: now,
    updated: now,
  };

  const filePath = resolveStatePath(projectRoot, specPath);
  atomicWriteJson(filePath, state);
  return state;
}

/**
 * Record the result of a completed pipeline step.
 * Reads current state, updates the named step, recalculates build status,
 * and writes atomically.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} specPath - Path to the spec file
 * @param {string} stepName - Name of the step to record
 * @param {object} result - Step result
 * @param {string} result.status - "completed", "failed", or "skipped"
 * @param {string} [result.verdict] - Skill-specific outcome (e.g., PASS, BLOCK)
 * @param {string} [result.error] - Error details if failed
 * @param {string} [result.notes] - Optional notes
 * @param {object} [result.retryHistory] - Retry data for validate step
 * @returns {object} The updated build state object
 */
export function recordStepResult(projectRoot, specPath, stepName, result) {
  const state = readBuildState(projectRoot, specPath);
  if (!state) {
    const err = new Error(
      `No build state found for spec: ${specPath}. Call createBuildState() first.`
    );
    err.code = "NO_BUILD_STATE";
    throw err;
  }

  if (!result || !VALID_STEP_STATUSES.has(result.status)) {
    const err = new Error(
      `Invalid step status: ${result?.status}. Must be one of: ${[...VALID_STEP_STATUSES].join(", ")}`
    );
    err.code = "INVALID_STEP_STATUS";
    throw err;
  }

  const stepIndex = state.steps.findIndex(s => s.name === stepName);
  if (stepIndex === -1) {
    const err = new Error(
      `Unknown step "${stepName}" in build state. Known steps: ${state.steps.map(s => s.name).join(", ")}`
    );
    err.code = "UNKNOWN_STEP";
    throw err;
  }

  const now = new Date().toISOString();
  const stepRecord = {
    name: stepName,
    status: result.status,
    timestamp: now,
  };
  if (result.verdict) stepRecord.verdict = result.verdict;
  if (result.error) stepRecord.error = result.error;
  if (result.notes) stepRecord.notes = result.notes;
  if (result.retryHistory) {
    stepRecord.retry_cycles = result.retryHistory.length;
    stepRecord.retry_history = result.retryHistory;
  }

  state.steps[stepIndex] = stepRecord;
  state.updated = now;

  // Recalculate build status
  if (result.status === "failed") {
    state.status = "failed";
  } else {
    const allDone = state.steps.every(
      s => s.status === "completed" || s.status === "skipped"
    );
    if (allDone) {
      state.status = "completed";
    }
    // otherwise remains "in_progress"
  }

  const filePath = resolveStatePath(projectRoot, specPath);
  atomicWriteJson(filePath, state);
  return state;
}

/**
 * Determine the next pending step in the pipeline.
 * Returns the first step that is still "pending", or null if all steps
 * are completed/skipped/failed.
 *
 * @param {object} state - Build state object (from readBuildState)
 * @returns {{ name: string, index: number }|null} Next step info or null
 */
export function getNextStep(state) {
  if (!state || !Array.isArray(state.steps)) return null;

  for (let i = 0; i < state.steps.length; i++) {
    if (state.steps[i].status === "pending") {
      return { name: state.steps[i].name, index: i };
    }
  }
  return null;
}

export default {
  slugFromSpec,
  readBuildState,
  createBuildState,
  recordStepResult,
  getNextStep,
};
