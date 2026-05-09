#!/usr/bin/env node
/**
 * Helper for lifecycle-gate-edit.sh
 * Checks whether a file edit should be gated by the lifecycle gate.
 *
 * Logic: if the file is NOT excluded (config, tests, docs, etc.),
 * then it's a source file and should be gated when no lifecycle
 * session is active. The execution-state check happens in the
 * parent bash script — this helper only handles file classification.
 *
 * Env vars:
 *   ADEV_CONTEXT_ROOT - project root containing .context-index/
 *   ADEV_PLUGIN_ROOT - plugin root directory
 *   ADEV_FILE_PATH - relative file path to check
 *
 * Outputs to stdout:
 *   "pass" - file is excluded (config, test, docs, etc.)
 *   "enforce" - file is a source file, should be gated
 */

import { isFileExcluded } from "../lib/lifecycle-gate-helpers.mjs";

const contextRoot = process.env.ADEV_CONTEXT_ROOT;
const pluginRoot = process.env.ADEV_PLUGIN_ROOT;
const filePath = process.env.ADEV_FILE_PATH;

if (!contextRoot || !pluginRoot || !filePath) {
  console.log("pass");
  process.exit(0);
}

if (isFileExcluded(filePath, contextRoot, pluginRoot)) {
  console.log("pass");
} else {
  console.log("enforce");
}
