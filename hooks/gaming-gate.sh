#!/usr/bin/env bash
# adev PreToolUse hook: Gaming Detector Gate
# Fires on: Write, Edit (test files only)
# Blocks (exit 2) a pending Write/Edit that would introduce a new gaming
# violation not present in the file's current on-disk content. Because this
# runs PreToolUse, a block means the write never happens — the file on disk
# is untouched.
# See: .context-index/specs/features/test-strategies/gaming-detector-gate-enforcement.spec.md
# Exit codes: 0 = allow, 2 = block.

set -uo pipefail

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars
source "$(dirname "$0")/_parse-stdin.sh"

# _parse-stdin.sh's stdin-JSON branch EXPORTs these, so at this point they
# are part of the current shell's environment. A test file's content has no
# size cap (spec SEC-1), and Linux's execve() rejects any single argv/envp
# string over 128KB (MAX_ARG_STRLEN) regardless of overall ARG_MAX -- every
# external command this script spawns from here on (dirname, mktemp, rm,
# node) would inherit that env and could be killed with "Argument list too
# long" before it even runs, well before this script's own temp-file relay
# (below) gets a chance to help. `export -n` drops the export attribute
# without unsetting the value, so `${CLAUDE_TOOL_INPUT_content:-}` below
# still reads it via normal shell variable expansion (no exec involved),
# but child processes no longer inherit it via envp.
export -n CLAUDE_TOOL_INPUT_content CLAUDE_TOOL_INPUT_old_string CLAUDE_TOOL_INPUT_new_string 2>/dev/null || true

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# This repo's hook protocol never exposes a tool-name env var (only
# CLAUDE_TOOL_INPUT_* tool_input fields — see docs/hooks.md's Hook Protocol
# section and hooks/_parse-stdin.sh, which only ever exports tool_input
# keys). Infer Write vs Edit from which fields are actually SET (bash
# `${VAR+x}` presence test — true even for an empty string, false only when
# the var is entirely unset), rather than depending on a nonexistent env
# var or a second, possibly-unreliable stdin read.
if [ -n "${CLAUDE_TOOL_INPUT_old_string+x}" ] || [ -n "${CLAUDE_TOOL_INPUT_new_string+x}" ]; then
  TOOL_KIND="Edit"
elif [ -n "${CLAUDE_TOOL_INPUT_content+x}" ]; then
  TOOL_KIND="Write"
else
  TOOL_KIND="unknown"
fi

# Large field values (a whole test file's content, potentially megabytes)
# are passed via temp files, never via the spawned node process's
# environment: execve() has an OS ARG_MAX limit on combined argv+envp size
# ("Argument list too long"), which this gate's no-size-cap guarantee
# (spec Behavior 5 / SEC-1) must not be silently defeated by. Only file
# PATHS (always short) cross the env boundary.
GATE_TMPDIR=$(mktemp -d "${TMPDIR:-/tmp}/adev-gaming-gate.XXXXXX")
trap 'rm -rf "$GATE_TMPDIR"' EXIT

CONTENT_FILE=""
OLD_STRING_FILE=""
NEW_STRING_FILE=""

if [ -n "${CLAUDE_TOOL_INPUT_content+x}" ]; then
  CONTENT_FILE="$GATE_TMPDIR/content"
  printf '%s' "${CLAUDE_TOOL_INPUT_content:-}" > "$CONTENT_FILE"
fi
if [ -n "${CLAUDE_TOOL_INPUT_old_string+x}" ]; then
  OLD_STRING_FILE="$GATE_TMPDIR/old_string"
  printf '%s' "${CLAUDE_TOOL_INPUT_old_string:-}" > "$OLD_STRING_FILE"
fi
if [ -n "${CLAUDE_TOOL_INPUT_new_string+x}" ]; then
  NEW_STRING_FILE="$GATE_TMPDIR/new_string"
  printf '%s' "${CLAUDE_TOOL_INPUT_new_string:-}" > "$NEW_STRING_FILE"
fi

RESULT=$(ADEV_FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}" \
  ADEV_TOOL_KIND="$TOOL_KIND" \
  ADEV_CONTENT_FILE="$CONTENT_FILE" \
  ADEV_OLD_STRING_FILE="$OLD_STRING_FILE" \
  ADEV_NEW_STRING_FILE="$NEW_STRING_FILE" \
  node "${PLUGIN_ROOT}/hooks/_gaming-gate-check.mjs" 2>/dev/null || echo '{"blocked":false,"violations":[]}')

BLOCKED=$(printf '%s' "$RESULT" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(s);console.log(j.blocked?"1":"0");}catch{console.log("0");}})' 2>/dev/null || echo "0")

if [ "$BLOCKED" = "1" ]; then
  echo "BLOCKED: this edit introduces a new gaming violation (see lib/test-strategies/gaming.mjs)." >&2
  printf '%s\n' "$RESULT" >&2
  exit 2
fi

exit 0
