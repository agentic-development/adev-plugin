#!/usr/bin/env node
/**
 * Helper for lifecycle-gate-bash.sh
 * Checks if a bash command matches passthrough patterns.
 *
 * Env vars:
 *   ADEV_CONTEXT_ROOT - project root containing .context-index/
 *   ADEV_PLUGIN_ROOT - plugin root directory
 *   ADEV_COMMAND - command string to check
 *
 * Outputs to stdout:
 *   "passthrough" - command is in allowlist
 *   "gated" - command should be gated
 */

import { isBashPassthrough } from "../lib/lifecycle-gate-helpers.mjs";

const contextRoot = process.env.ADEV_CONTEXT_ROOT;
const pluginRoot = process.env.ADEV_PLUGIN_ROOT;
const command = process.env.ADEV_COMMAND;

if (!contextRoot || !pluginRoot || !command) {
  console.log("passthrough");
  process.exit(0);
}

if (isBashPassthrough(command, contextRoot, pluginRoot)) {
  console.log("passthrough");
} else {
  console.log("gated");
}
