#!/usr/bin/env node
/**
 * Helper for artifact-frontmatter-guard.sh
 *
 * Computes whether a pending Write/Edit tool call would leave a final
 * `*.review.md` / `*.validate.md` artifact with a markdown body (heading,
 * HTML comment, table, etc.) before its `---` frontmatter delimiter.
 *
 * adev-plugin-nkz found the frontmatter-first rule bypassed on two
 * independent paths: `skills/review-specs/SKILL.md` writes `.review.md`
 * directly with no `.tmp` + `adev artifact commit` step at all, and
 * `.validate.md` gets bypassed in practice even though `validate`'s SKILL.md
 * documents the commit verb correctly (an agent that hits the verb's
 * ARTIFACT_FRONTMATTER_NOT_FIRST error can just write the final path
 * directly instead of fixing the `.tmp` and re-running). Enforcing the
 * shape at the PreToolUse boundary — on the FINAL path, not the `.tmp` one —
 * is the only mechanism that closes both bypasses regardless of which
 * writer produced the content.
 *
 * Env vars (mirrors _gaming-gate-check.mjs's contract):
 *   ADEV_FILE_PATH        - path the tool call targets
 *   ADEV_TOOL_KIND        - "Write" | "Edit" | "unknown"
 *   ADEV_CONTENT_FILE     - temp file holding the Write tool's new content, if any
 *   ADEV_OLD_STRING_FILE  - temp file holding the Edit tool's old_string, if any
 *   ADEV_NEW_STRING_FILE  - temp file holding the Edit tool's new_string, if any
 *
 * Large field values cross via temp files, never via a spawned child's
 * environment (execve() ARG_MAX / "Argument list too long" — see
 * _gaming-gate-check.mjs for the empirical basis).
 *
 * Outputs to stdout: JSON `{ blocked: boolean }`. Always exits 0 — the
 * caller (artifact-frontmatter-guard.sh) decides the hook exit code from
 * the JSON. Any internal error, or any case where the resulting content
 * cannot be determined (e.g. an Edit whose old_string does not match the
 * file's current on-disk content), degrades to "allow" — a false positive
 * on a legitimate patch (like review-specs Step 6c's file-sha stamp deep
 * inside an already-conformant file) is worse than an uncaught bypass here,
 * and the Edit/Write tool's own semantics still govern whether a
 * non-matching edit applies at all.
 */

import { readFileSync, existsSync } from "node:fs";
import { reconstructAfterContent } from "../lib/test-strategies/gaming-gate.mjs";

function allow() {
  console.log(JSON.stringify({ blocked: false }));
}

function block() {
  console.log(JSON.stringify({ blocked: true }));
}

/**
 * Mirrors `lib/cli/artifact.mjs::hasLeadingFrontmatter` and
 * `lib/diagnostics/tier1/frontmatter-present.mjs`, applied to an in-memory
 * string instead of a path already on disk, so the guard can evaluate a
 * PENDING write/edit before it lands. Leading blank lines are tolerated,
 * matching both of those.
 * @param {string} content
 * @returns {boolean}
 */
function isFrontmatterFirst(content) {
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    return line.trim() === "---";
  }
  return false;
}

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

  const before = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const after = reconstructAfterContent({ tool, before, content, oldString, newString });

  if (after === null) {
    allow();
    process.exit(0);
  }

  if (isFrontmatterFirst(after)) {
    allow();
  } else {
    block();
  }
} catch {
  allow();
}
