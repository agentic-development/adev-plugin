#!/usr/bin/env node
/**
 * Helper for lifecycle-gate-edit.sh
 * Checks file exclusion and module resolution.
 *
 * Env vars:
 *   ADEV_CONTEXT_ROOT - project root containing .context-index/
 *   ADEV_PLUGIN_ROOT - plugin root directory
 *   ADEV_FILE_PATH - relative file path to check
 *
 * Outputs to stdout:
 *   "pass" - file should be allowed
 *   "enforce:<spec-path>" - file should be gated, includes spec path
 */

import { isFileExcluded, resolveModule, checkModuleLifecycle } from "../lib/lifecycle-gate-helpers.mjs";

const contextRoot = process.env.ADEV_CONTEXT_ROOT;
const pluginRoot = process.env.ADEV_PLUGIN_ROOT;
const filePath = process.env.ADEV_FILE_PATH;

if (!contextRoot || !pluginRoot || !filePath) {
  console.log("pass");
  process.exit(0);
}

// Check file exclusion
if (isFileExcluded(filePath, contextRoot, pluginRoot)) {
  console.log("pass");
  process.exit(0);
}

// Resolve module
const moduleSlug = resolveModule(filePath, contextRoot);
if (!moduleSlug) {
  console.log("pass");
  process.exit(0);
}

// Check module lifecycle
const { hasSpecs, hasPlan, specPath } = checkModuleLifecycle(moduleSlug, contextRoot);

if (!hasSpecs) {
  console.log("pass");
} else if (hasPlan) {
  console.log("pass");
} else {
  console.log("enforce:" + specPath);
}
