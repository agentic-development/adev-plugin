/**
 * Public manifest loader.
 *
 * Lifts the previously triplicated private `loadManifestForStorage()`
 * helper from `lib/migrate-state-artifacts.mjs`, `lib/milestones.mjs`,
 * and `lib/issues/render-markdown.mjs` to a single shared export, and
 * additionally returns the full parsed manifest (not just the
 * `tasks.db_path` scalar) so callers can read other fields like
 * `tasks.backend`, `project.name`, `lifecycle.gate_mode`, etc.
 *
 * Path-containment semantics are preserved verbatim on lift:
 *   1. `projectRoot` must be a non-empty string.
 *   2. After `path.resolve()`, the resolved directory must contain
 *      `.context-index/manifest.yaml`; otherwise throws
 *      `INVALID_PROJECT_ROOT`.
 *
 * Zero external dependencies — uses only `node:fs`, `node:path`, and
 * the existing in-tree `parseYaml` helper.
 *
 * @module lib/manifest
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseYaml } from "./profiles/yaml.mjs";
import { codedError as mkErr } from "./errors.mjs";

const MANIFEST_REL_PATH = join(".context-index", "manifest.yaml");

/**
 * Resolve and parse `<projectRoot>/.context-index/manifest.yaml`.
 *
 * @param {string} projectRoot - Absolute or relative path to the project
 *   root. Resolved via `path.resolve()`.
 * @returns {object} The parsed manifest object (full YAML body).
 * @throws {Error} `INVALID_PROJECT_ROOT` if `projectRoot` is invalid or
 *   does not contain `.context-index/manifest.yaml`.
 */
export function loadManifest(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") {
    throw mkErr(
      "INVALID_PROJECT_ROOT",
      "projectRoot must be a non-empty string path",
    );
  }
  const resolved = resolve(projectRoot);
  const manifestPath = join(resolved, MANIFEST_REL_PATH);
  if (!existsSync(manifestPath)) {
    throw mkErr(
      "INVALID_PROJECT_ROOT",
      `projectRoot "${resolved}" does not contain ${MANIFEST_REL_PATH}`,
    );
  }
  const raw = readFileSync(manifestPath, "utf8");
  const parsed = parseYaml(raw) ?? {};
  // Materialize `build` section with validated defaults.
  // Per review-block-auto-retry.spec.md Behavior 10:
  //   - default `build.max_review_retries` is 2 (was effectively 0 under the
  //     7e333fd guard)
  //   - explicit 0 disables the loop entirely (sidecar+fail-loud on first BLOCK)
  //   - negative or non-integer values rejected at load time
  if (!parsed.build || typeof parsed.build !== "object") {
    parsed.build = {};
  }
  validateMaxReviewRetries(parsed.build);
  // Materialize `implement` section with validated defaults.
  // Per batched-task-dispatch.spec.md Arguments table:
  //   - default `implement.batch_mode` is "on"
  //   - default `implement.max_batch_size` is 4
  //   - invalid values are rejected at load time
  if (!parsed.implement || typeof parsed.implement !== "object") {
    parsed.implement = {};
  }
  validateBatchMode(parsed.implement);
  validateMaxBatchSize(parsed.implement);
  validateMaxReviewCycles(parsed.implement);
  return parsed;
}

/**
 * Validate that `projectRoot` is a directory containing
 * `.context-index/manifest.yaml`, without parsing it. Throws
 * `INVALID_PROJECT_ROOT` if missing. Returns the resolved absolute path on
 * success.
 *
 * A lighter-weight sibling of {@link loadManifest} for callers that only
 * need containment-checked path resolution, not the parsed manifest body.
 * `lib/issues/json-adapter.mjs` (`assertProjectRoot`) and `lib/milestones.mjs`
 * (`validateProjectRoot`) each carried their own line-for-line copy of this
 * check (flagged by /adev:codehealth's duplicate-logic pass).
 *
 * @param {string} projectRoot
 * @returns {string} The resolved absolute project root.
 * @throws {Error} `INVALID_PROJECT_ROOT` if `projectRoot` is invalid or
 *   does not contain `.context-index/manifest.yaml`.
 */
export function assertProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") {
    throw mkErr("INVALID_PROJECT_ROOT", "projectRoot must be a non-empty string path");
  }
  const resolved = resolve(projectRoot);
  const manifestPath = join(resolved, MANIFEST_REL_PATH);
  if (!existsSync(manifestPath)) {
    throw mkErr(
      "INVALID_PROJECT_ROOT",
      `projectRoot "${resolved}" does not contain ${MANIFEST_REL_PATH}`,
    );
  }
  return resolved;
}

/**
 * Read the manifest for storage-root resolution. Tolerant by design: a
 * missing or unparseable manifest yields `null`, which `resolveStorageRoot`
 * (`lib/issues/resolve-root.mjs`) treats as "no explicit override".
 *
 * This is the actual single definition the module docstring above already
 * claimed existed — `lib/execution-state.mjs`, `lib/migrate-state-artifacts.mjs`,
 * `lib/milestones.mjs`, and `lib/issues/render-markdown.mjs` each carried their
 * own line-for-line copy of this try/catch-to-null wrapper around
 * {@link loadManifest} (flagged by /adev:codehealth's duplicate-logic pass).
 *
 * @param {string} projectRoot - Already-validated project root.
 * @returns {object|null}
 */
export function loadManifestForStorage(projectRoot) {
  try {
    return loadManifest(projectRoot);
  } catch {
    return null;
  }
}

/**
 * Validate (and default) `build.max_review_retries`. Mutates the input
 * object so `loadManifest` returns the materialized form.
 *
 * @param {object} build
 * @returns {void}
 * @throws {Error} `INVALID_MAX_REVIEW_RETRIES` on negative / non-integer / NaN.
 */
function validateMaxReviewRetries(build) {
  const raw = build.max_review_retries;
  if (raw === undefined || raw === null) {
    // Default 2 per spec Behavior 10.
    build.max_review_retries = 2;
    return;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw mkErr(
      "INVALID_MAX_REVIEW_RETRIES",
      `build.max_review_retries must be a non-negative integer; got ${JSON.stringify(raw)}`,
    );
  }
  if (!Number.isInteger(raw)) {
    throw mkErr(
      "INVALID_MAX_REVIEW_RETRIES",
      `build.max_review_retries must be a non-negative integer; got ${raw} (fractional)`,
    );
  }
  if (raw < 0) {
    throw mkErr(
      "INVALID_MAX_REVIEW_RETRIES",
      `build.max_review_retries must be a non-negative integer; got ${raw}`,
    );
  }
  build.max_review_retries = raw;
}

/**
 * Validate (and default) `implement.max_review_cycles`. Mutates the input
 * object so `loadManifest` returns the materialized form.
 *
 * @param {object} implement
 * @returns {void}
 * @throws {Error} `INVALID_MAX_REVIEW_CYCLES` on non-integer / non-finite /
 *   fractional / less-than-1 values.
 */
export function validateMaxReviewCycles(implement) {
  const raw = implement.max_review_cycles;
  if (raw === undefined || raw === null) {
    // Default 3 per tdd-cycle-simplification plan Task 1.
    implement.max_review_cycles = 3;
    return;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
    throw mkErr(
      "INVALID_MAX_REVIEW_CYCLES",
      `implement.max_review_cycles must be an integer >= 1; got ${JSON.stringify(raw)}`,
    );
  }
  implement.max_review_cycles = raw;
}

const VALID_BATCH_MODES = new Set(["on", "off"]);

/**
 * Validate (and default) `implement.batch_mode`. Mutates the input object
 * so `loadManifest` returns the materialized form.
 *
 * @param {object} implement
 * @returns {void}
 * @throws {Error} `INVALID_BATCH_MODE` when the value is not "on"/"off".
 */
export function validateBatchMode(implement) {
  const raw = implement.batch_mode;
  if (raw === undefined || raw === null) {
    // Default "on" per batched-task-dispatch.spec.md Arguments table.
    implement.batch_mode = "on";
    return;
  }
  if (!VALID_BATCH_MODES.has(raw)) {
    throw mkErr(
      "INVALID_BATCH_MODE",
      `implement.batch_mode must be 'on' or 'off'; got ${JSON.stringify(raw)}`,
    );
  }
  implement.batch_mode = raw;
}

/**
 * Validate (and default) `implement.max_batch_size`. Mutates the input
 * object so `loadManifest` returns the materialized form.
 *
 * @param {object} implement
 * @returns {void}
 * @throws {Error} `INVALID_MAX_BATCH_SIZE` on non-integer / non-finite /
 *   fractional / less-than-1 values.
 */
export function validateMaxBatchSize(implement) {
  const raw = implement.max_batch_size;
  if (raw === undefined || raw === null) {
    // Default 4 per batched-task-dispatch.spec.md Arguments table.
    implement.max_batch_size = 4;
    return;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
    throw mkErr(
      "INVALID_MAX_BATCH_SIZE",
      `implement.max_batch_size must be an integer >= 1; got ${JSON.stringify(raw)}`,
    );
  }
  implement.max_batch_size = raw;
}

/**
 * Detect top-level YAML keys declared more than once in raw manifest text.
 *
 * A duplicate top-level key is silently last-wins under standard YAML
 * parsing — the loader (and every downstream consumer) sees only the final
 * value, with no signal that an earlier block was ever there. Confirmed live
 * on this project's own manifest.yaml: `build:` was declared at line 152
 * (max_review_retries: 9, dead) and again at line 423 (max_review_retries: 2,
 * effective), both dated the same day with mutually contradictory rationale,
 * and nothing — not `loadManifest`, not `/adev:hygiene` — flagged it
 * (adev-plugin-gkfv.2).
 *
 * Operates on raw text, not the parsed object: by the time YAML parsing
 * folds duplicate keys down to one, the duplication itself is unrecoverable.
 * Only column-0 (true top-level) keys count; a key nested under another
 * top-level block (e.g. `tasks:\n  build: 2`) is a different key entirely.
 * Commented-out lines (`# key:`) are not real declarations and are ignored.
 *
 * @param {string} yamlText - Raw manifest.yaml content.
 * @returns {Array<{ key: string, lines: number[] }>} One entry per key that
 *   appears more than once, in first-appearance order; `lines` is every
 *   1-indexed line number the key was declared on, in file order.
 */
export function findDuplicateTopLevelKeys(yamlText) {
  const lines = String(yamlText).split(/\r?\n/);
  const byKey = new Map();
  const order = [];
  const TOP_LEVEL_KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):(\s|$)/;
  lines.forEach((line, idx) => {
    const m = TOP_LEVEL_KEY_RE.exec(line);
    if (!m) return;
    const key = m[1];
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key).push(idx + 1);
  });
  return order
    .filter((key) => byKey.get(key).length > 1)
    .map((key) => ({ key, lines: byKey.get(key) }));
}

export default { loadManifest, findDuplicateTopLevelKeys };
