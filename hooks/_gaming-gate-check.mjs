#!/usr/bin/env node
/**
 * Helper for gaming-gate.sh
 * Computes whether a pending Write/Edit tool call should be blocked because
 * it introduces a new gaming-detector violation.
 *
 * Env vars:
 *   ADEV_FILE_PATH         - absolute (or cwd-relative) path the tool call targets
 *   ADEV_TOOL_KIND          - "Write" | "Edit" | "unknown" (computed in gaming-gate.sh
 *                             from which CLAUDE_TOOL_INPUT_* fields are present —
 *                             this repo's hook protocol never exposes a tool-name
 *                             env var, only CLAUDE_TOOL_INPUT_* tool_input fields)
 *   ADEV_CONTENT_FILE       - path to a temp file holding the Write tool's new file
 *                             content, if present (may be an empty file)
 *   ADEV_OLD_STRING_FILE    - path to a temp file holding the Edit tool's old_string,
 *                             if present
 *   ADEV_NEW_STRING_FILE    - path to a temp file holding the Edit tool's new_string,
 *                             if present
 *
 * Large field values are passed via temp files, not env vars: passing a
 * whole test file's content through a spawned child process's environment
 * hits the OS execve() ARG_MAX limit ("Argument list too long") well under
 * this gate's required no-size-cap guarantee (spec Behavior 5 / SEC-1) — a
 * real, empirically-reproduced failure mode, not a theoretical one. Files
 * have no such limit.
 *
 * Outputs to stdout: JSON `{ blocked: boolean, violations: [...] }`.
 * Always exits 0 — the caller (gaming-gate.sh) decides the hook exit code
 * from the JSON. Any internal error degrades to a "pass" result (fail-open
 * — spec Behavior 9, and CLAUDE.md's hook protocol: a crash must never
 * brick an editing session, only a genuinely detected violation blocks).
 */

import { readFileSync, existsSync } from "node:fs";
import {
  isTestFile,
  isDetectorFixtureFile,
  reconstructAfterContent,
  diffNewViolations,
} from "../lib/test-strategies/gaming-gate.mjs";

function pass() {
  console.log(JSON.stringify({ blocked: false, violations: [] }));
}

/** Reads a field from its temp file, or returns undefined if the file was never created (field absent from tool_input). */
function readField(envVarName) {
  const path = process.env[envVarName];
  if (!path || !existsSync(path)) return undefined;
  return readFileSync(path, "utf8");
}

try {
  const filePath = process.env.ADEV_FILE_PATH || "";
  const tool = process.env.ADEV_TOOL_KIND || "unknown";
  const content = readField("ADEV_CONTENT_FILE");
  const oldString = readField("ADEV_OLD_STRING_FILE");
  const newString = readField("ADEV_NEW_STRING_FILE");

  if (!filePath || !isTestFile(filePath) || isDetectorFixtureFile(filePath)) {
    pass();
    process.exit(0);
  }

  const before = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const after = reconstructAfterContent({ tool, before, content, oldString, newString });

  if (after === null) {
    pass();
    process.exit(0);
  }

  const { newViolations } = diffNewViolations(before, after, filePath);
  console.log(JSON.stringify({ blocked: newViolations.length > 0, violations: newViolations }));
} catch {
  pass();
}
