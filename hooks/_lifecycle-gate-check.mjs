#!/usr/bin/env node
/**
 * Merged helper for lifecycle-gate-edit.sh and lifecycle-gate-bash.sh
 * (formerly two separate shims: _lifecycle-gate-check-edit.mjs and
 * _lifecycle-gate-check-bash.mjs — differed only in which lib function
 * they called).
 *
 * Usage:
 *   node _lifecycle-gate-check.mjs --surface file
 *   node _lifecycle-gate-check.mjs --surface bash
 *
 * Env vars:
 *   ADEV_CONTEXT_ROOT - project root containing .context-index/
 *   ADEV_PLUGIN_ROOT - plugin root directory
 *   ADEV_FILE_PATH - relative file path to check (--surface file)
 *   ADEV_COMMAND - command string to check (--surface bash)
 *
 * Outputs to stdout:
 *   --surface file: "pass" (excluded — config, test, docs, etc.) | "enforce"
 *   --surface bash: "passthrough" (allowlisted) | "gated"
 *
 * Unknown/missing --surface: emits a stderr diagnostic and exits 1 so the
 * calling hook's `$(... || echo <default>)` fallback applies the safe
 * fail-open default (matches the pre-existing checker-subprocess-crash
 * error case in the spec).
 */

import { isFileExcluded, isBashPassthrough } from "../lib/lifecycle-gate-helpers.mjs";

function parseSurfaceArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--surface" && i + 1 < argv.length) {
      return argv[i + 1];
    }
  }
  return null;
}

const surface = parseSurfaceArg(process.argv.slice(2));

const contextRoot = process.env.ADEV_CONTEXT_ROOT;
const pluginRoot = process.env.ADEV_PLUGIN_ROOT;

if (surface === "file") {
  const filePath = process.env.ADEV_FILE_PATH;
  if (!contextRoot || !pluginRoot || !filePath) {
    console.log("pass");
    process.exit(0);
  }
  console.log(isFileExcluded(filePath, contextRoot, pluginRoot) ? "pass" : "enforce");
  process.exit(0);
} else if (surface === "bash") {
  const command = process.env.ADEV_COMMAND;
  if (!contextRoot || !pluginRoot || !command) {
    console.log("passthrough");
    process.exit(0);
  }
  console.log(isBashPassthrough(command, contextRoot, pluginRoot) ? "passthrough" : "gated");
  process.exit(0);
} else {
  process.stderr.write(`[adev:lifecycle-gate-check] unknown or missing --surface argument: ${surface}\n`);
  process.exit(1);
}
