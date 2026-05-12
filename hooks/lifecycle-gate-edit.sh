#!/usr/bin/env bash
# adev PreToolUse hook: Lifecycle Gate — File-Edit Layer (Layer 1)
# Fires on: Edit, Write
# Gates source code modifications based on lifecycle state (planned flow vs unplanned).
# Exit codes: 0 = allow, 2 = block.

set -uo pipefail

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars
source "$(dirname "$0")/_parse-stdin.sh"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

# No file path — nothing to check
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Walk up from cwd to find the nearest directory containing .context-index/
find_context_index() {
  local dir
  dir=$(pwd)
  while true; do
    if [ -d "$dir/.context-index" ]; then
      echo "$dir"
      return 0
    fi
    local parent
    parent=$(dirname "$dir")
    if [ "$parent" = "$dir" ]; then
      return 1
    fi
    dir="$parent"
  done
}

CONTEXT_ROOT=$(find_context_index 2>/dev/null || true)

# Bypass 4: No .context-index → exit 0
if [ -z "$CONTEXT_ROOT" ]; then
  exit 0
fi

# Read user-config to determine enforcement level
read_user_config_value() {
  local key="$1"
  local config_file="$CONTEXT_ROOT/.context-index/user-config"
  if [ ! -f "$config_file" ]; then
    config_file="$PLUGIN_ROOT/user-config"
  fi
  if [ ! -f "$config_file" ]; then
    echo ""
    return
  fi
  # Parse key=value
  local value
  value=$(grep -E "^\\s*${key}\\s*=" "$config_file" 2>/dev/null | head -1 | sed "s/.*=\\s*//" | tr -d '[:space:]' || true)
  echo "$value"
}

LEVEL=$(read_user_config_value "lifecycle.gate")

# Bypass 1: level=off or absent → exit 0
if [ "$LEVEL" = "off" ] || [ -z "$LEVEL" ]; then
  exit 0
fi

# Bypass 5: malformed/invalid level → treat as warn
case "$LEVEL" in
  warn|confirm|block) ;;
  *)
    LEVEL="warn"
    ;;
esac

# Bypass 2+3: Check execution state (standalone or active → exit 0).
# Delegates parsing to hooks/_execution-state.mjs (read mode). Stderr is
# discarded per spec CON-4 SEC-4.
STATE_STATUS=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=read node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{ try { const j=JSON.parse(s); console.log((j&&j.status)||""); } catch { console.log(""); } })' 2>/dev/null || echo "")
if [ "$STATE_STATUS" = "standalone" ] || [ "$STATE_STATUS" = "active" ]; then
  exit 0
fi

# Make path relative to CONTEXT_ROOT if absolute
# Handle macOS /private/var vs /var symlink mismatch by normalizing
NORM_FILE="$FILE_PATH"
NORM_ROOT="$CONTEXT_ROOT"
# Strip /private prefix from both for comparison
NORM_FILE="${NORM_FILE#/private}"
NORM_ROOT="${NORM_ROOT#/private}"

RELATIVE_PATH="$FILE_PATH"
if [[ "$NORM_FILE" == "$NORM_ROOT"/* ]]; then
  RELATIVE_PATH="${NORM_FILE#$NORM_ROOT/}"
fi

# Delegate file exclusion check and module resolution to node helper
RESULT=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_PLUGIN_ROOT="$PLUGIN_ROOT" ADEV_FILE_PATH="$RELATIVE_PATH" \
  node "${PLUGIN_ROOT}/hooks/_lifecycle-gate-check-edit.mjs" 2>/dev/null || echo "pass")

if [[ "$RESULT" == "pass" ]]; then
  exit 0
fi

# Apply enforcement based on level
case "$LEVEL" in
  warn)
    MESSAGE="No active lifecycle session. Run \`/adev:work\` to classify this task, or \`/adev:debug\` for a bug fix, before editing source files."
    MSG_JSON=$(printf '%s' "$MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$MESSAGE")
    MSG_JSON="${MSG_JSON:1:${#MSG_JSON}-2}"
    cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "${MSG_JSON}"
  }
}
JSONEOF
    exit 0
    ;;
  confirm)
    STOP_MSG="STOP. No active lifecycle session. You MUST run \`/adev:work\` to classify this task before editing source files. If this is a bug fix, invoke \`/adev:debug\`. If this is exploratory, run \`/adev:standalone\` to disable enforcement for this session."
    MSG_JSON=$(printf '%s' "$STOP_MSG" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$STOP_MSG")
    MSG_JSON="${MSG_JSON:1:${#MSG_JSON}-2}"
    cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "${MSG_JSON}"
  }
}
JSONEOF
    exit 0
    ;;
  block)
    MESSAGE="Blocked: No active lifecycle session. Run \`/adev:work\` to enter the lifecycle before editing source files."
    MSG_JSON=$(printf '%s' "$MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$MESSAGE")
    MSG_JSON="${MSG_JSON:1:${#MSG_JSON}-2}"
    cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "${MSG_JSON}"
  }
}
JSONEOF
    exit 2
    ;;
esac

exit 0
