#!/usr/bin/env bash
# adev PostToolUse hook: Session Capture
# Delegates JSONL tracking-line capture to lib/session-capture.mjs's
# `tool-use` path (spec Migration Path step 5b — the former ~180-line
# inline-Node program now lives there, with unit-tested schema
# byte-compatibility). Appends a line to
# .context-index/.session-tracking.jsonl when the manifest provider is
# "native".
# Also touches .context-preflight-ok when the tool call read a
# .context-index/ file (formerly hooks/context-read-tracker.sh, folded in
# at Task 5 — session-capture's `.*` matcher is a superset of
# context-read-tracker's `Read`-only matcher).
# Fires on: any tool use (broad matcher)

set -uo pipefail

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars (bridges tool_input
# fields — including file_path). Also drains stdin into $_HOOK_STDIN, reused
# below instead of reading stdin a second time.
source "$(dirname "$0")/_parse-stdin.sh"

# Context-read-tracker fold-in: touch the flag unconditionally — this must
# run BEFORE (and independently of) the provider=="native" gate inside the
# lib capture path, since the original context-read-tracker.sh had no such
# gate.
FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"
case "$FILE_PATH" in
  *.context-index/*|*/.context-index/*)
    mkdir -p .context-index
    touch .context-index/.context-preflight-ok
    ;;
esac

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Delegate to the lib tool-use capture path. Always exits 0 (non-blocking)
# and always emits '{}' on stdout (hook protocol) — the `|| echo '{}'`
# fallback matches the pre-refactor contract for the case node itself is
# unavailable or crashes (spec error case: allow).
printf '%s' "$_HOOK_STDIN" | node "${PLUGIN_ROOT}/lib/session-capture.mjs" --event tool-use 2>/dev/null || echo '{}'
