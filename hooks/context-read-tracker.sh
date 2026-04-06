#!/usr/bin/env bash
# adev PostToolUse hook: Context Read Tracker
# Fires on: Read
# Sets a flag file when any .context-index/ file is read, signaling that
# the agent has loaded project context in this session.
# The flag is cleared by session-start.sh on each new session.

set -uo pipefail

# Read stdin (hook protocol)
cat > /dev/null

FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# Only track reads of .context-index/ files
case "$FILE_PATH" in
  *.context-index/*|*/.context-index/*)
    # Set the flag file
    mkdir -p .context-index
    touch .context-index/.context-preflight-ok
    ;;
esac

echo '{}'
exit 0
