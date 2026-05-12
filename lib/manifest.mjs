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

const MANIFEST_REL_PATH = join(".context-index", "manifest.yaml");

function mkErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

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
  return parseYaml(raw);
}

export default { loadManifest };
