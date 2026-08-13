#!/usr/bin/env bash
# adev Lifecycle Gate — consolidated dispatcher (formerly three scripts:
# lifecycle-gate-edit.sh, lifecycle-gate-bash.sh, lifecycle-gate-advisory.sh).
#
# Dispatch surface comes from argv $1 — a channel the plugin fully controls,
# with no dependency on unverified stdin fields:
#   lifecycle-gate.sh pre-edit    (PreToolUse:Edit gate, Layer 1)
#   lifecycle-gate.sh pre-bash    (PreToolUse:Bash gate, Layer 2)
#   lifecycle-gate.sh advisory    (PostToolUse:.* advisory, Layer 3)
#
# Unknown or missing $1 → exit 0 (fail-open) with a stderr diagnostic —
# a mis-registration must be loudly visible but never a block.
#
# Exit codes: 0 = allow, 2 = block (pre-edit/pre-bash only; advisory always 0).

set -uo pipefail

SURFACE="${1:-}"

case "$SURFACE" in
  pre-edit|pre-bash|advisory) ;;
  *)
    echo "[adev:lifecycle-gate] unknown or missing dispatch surface: '${SURFACE}' (expected pre-edit|pre-bash|advisory)" >&2
    exit 0
    ;;
esac

# Read stdin and populate CLAUDE_TOOL_INPUT_* env vars; also provides
# find_context_index().
source "$(dirname "$0")/_parse-stdin.sh"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Read user-config to determine enforcement level. Shared by all three
# surfaces (formerly duplicated verbatim in each gate script).
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
  local value
  value=$(grep -E "^\\s*${key}\\s*=" "$config_file" 2>/dev/null | head -1 | sed "s/.*=\\s*//" | tr -d '[:space:]' || true)
  echo "$value"
}

# ─────────────────────────────────────────────────────────────────────────
# Surface: pre-edit — PreToolUse:Edit gate (Layer 1)
# ─────────────────────────────────────────────────────────────────────────
if [ "$SURFACE" = "pre-edit" ]; then
  FILE_PATH="${CLAUDE_TOOL_INPUT_file_path:-}"

  # No file path — nothing to check
  if [ -z "$FILE_PATH" ]; then
    exit 0
  fi

  CONTEXT_ROOT=$(find_context_index 2>/dev/null || true)

  # Bypass 4: No .context-index → exit 0
  if [ -z "$CONTEXT_ROOT" ]; then
    exit 0
  fi

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

  # Delegate file exclusion check and module resolution to the merged node helper
  RESULT=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_PLUGIN_ROOT="$PLUGIN_ROOT" ADEV_FILE_PATH="$RELATIVE_PATH" \
    node "${PLUGIN_ROOT}/hooks/_lifecycle-gate-check.mjs" --surface file 2>/dev/null || echo "pass")

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
      STOP_MSG="STOP. No active lifecycle session. You MUST run \`/adev:work\` to classify this task before editing source files. If this is a bug fix, invoke \`/adev:debug\`. If this is exploratory, run \`adev execution-state write --status standalone\` to disable enforcement for this session."
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
fi

# ─────────────────────────────────────────────────────────────────────────
# Surface: pre-bash — PreToolUse:Bash gate (Layer 2)
# ─────────────────────────────────────────────────────────────────────────
if [ "$SURFACE" = "pre-bash" ]; then
  COMMAND="${CLAUDE_TOOL_INPUT_command:-}"

  # No command — nothing to check
  if [ -z "$COMMAND" ]; then
    exit 0
  fi

  CONTEXT_ROOT=$(find_context_index 2>/dev/null || true)

  # Bypass 4: No .context-index → exit 0
  if [ -z "$CONTEXT_ROOT" ]; then
    exit 0
  fi

  LEVEL=$(read_user_config_value "lifecycle.gate")

  # Bypass 1: level=off or absent → exit 0
  if [ "$LEVEL" = "off" ] || [ -z "$LEVEL" ]; then
    exit 0
  fi

  # Bypass 5: invalid level → treat as warn
  case "$LEVEL" in
    warn|confirm|block) ;;
    *)
      LEVEL="warn"
      ;;
  esac

  # Bypass 2+3: Check execution state (standalone or active → exit 0).
  # Delegates parsing to hooks/_execution-state.mjs (read mode). The mode emits
  # JSON.stringify(state) or "null"; inline Node extracts .status from it.
  # Stderr is discarded per spec CON-4 SEC-4.
  STATE_STATUS=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=read node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{ try { const j=JSON.parse(s); console.log((j&&j.status)||""); } catch { console.log(""); } })' 2>/dev/null || echo "")
  if [ "$STATE_STATUS" = "standalone" ] || [ "$STATE_STATUS" = "active" ]; then
    exit 0
  fi

  # Check command against passthrough patterns via the merged node helper
  PASSTHROUGH_CHECK=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_PLUGIN_ROOT="$PLUGIN_ROOT" ADEV_COMMAND="$COMMAND" \
    node "${PLUGIN_ROOT}/hooks/_lifecycle-gate-check.mjs" --surface bash 2>/dev/null || echo "passthrough")

  if [ "$PASSTHROUGH_CHECK" = "passthrough" ]; then
    exit 0
  fi

  # Command is gated — apply enforcement
  MESSAGE="No active plan. Run \`/adev:work\` to enter the lifecycle before running mutating commands, or \`adev execution-state write --status standalone\` to disable gates for this session."

  case "$LEVEL" in
    warn)
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
      STOP_MSG="STOP. No active plan detected. You MUST run \`/adev:work\` to classify this task and enter the lifecycle, or \`adev execution-state write --status standalone\` to disable enforcement for this session. Only proceed for trivial non-tracked changes."
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
      MSG_JSON=$(printf '%s' "Blocked: $MESSAGE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "Blocked: $MESSAGE")
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
fi

# ─────────────────────────────────────────────────────────────────────────
# Surface: advisory — PostToolUse:.* advisory (Layer 3)
# Exit code: always 0 (PostToolUse hooks cannot block).
# ─────────────────────────────────────────────────────────────────────────
if [ "$SURFACE" = "advisory" ]; then
  CONTEXT_ROOT=$(find_context_index 2>/dev/null || true)

  # No .context-index → exit silently
  if [ -z "$CONTEXT_ROOT" ]; then
    exit 0
  fi

  LEVEL=$(read_user_config_value "lifecycle.gate")

  # Layer 3 only fires at confirm or block level
  case "$LEVEL" in
    confirm|block) ;;
    *)
      # off, warn, or absent → no advisory
      exit 0
      ;;
  esac

  # Check execution state — if active or standalone, no advisory needed.
  # Delegates parsing to hooks/_execution-state.mjs (read mode). Stderr is
  # discarded per spec CON-4 SEC-4.
  STATE_STATUS=$(ADEV_CONTEXT_ROOT="$CONTEXT_ROOT" ADEV_EXECUTION_STATE_MODE=read node "$PLUGIN_ROOT/hooks/_execution-state.mjs" 2>/dev/null | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{ try { const j=JSON.parse(s); console.log((j&&j.status)||""); } catch { console.log(""); } })' 2>/dev/null || echo "")
  if [ "$STATE_STATUS" = "standalone" ] || [ "$STATE_STATUS" = "active" ]; then
    exit 0
  fi

  # Throttle: only inject advisory every N calls
  ADVISORY_INTERVAL=$(read_user_config_value "lifecycle.gate.advisory_interval")
  if [ -z "$ADVISORY_INTERVAL" ]; then
    ADVISORY_INTERVAL="5"
  fi

  COUNTER_FILE="$CONTEXT_ROOT/.context-index/.advisory-counter"
  COUNTER=0
  if [ -f "$COUNTER_FILE" ]; then
    COUNTER=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
    # Validate numeric
    if ! [[ "$COUNTER" =~ ^[0-9]+$ ]]; then
      COUNTER=0
    fi
  fi

  COUNTER=$((COUNTER + 1))
  echo "$COUNTER" > "$COUNTER_FILE" 2>/dev/null || true

  # Only emit advisory on interval boundaries
  if [ $((COUNTER % ADVISORY_INTERVAL)) -ne 0 ]; then
    exit 0
  fi

  # Inject advisory
  ADVISORY="You are operating without an active plan. Run \`/adev:work\` to classify this task and enter the lifecycle, or \`adev execution-state write --status standalone\` to disable enforcement for this session."
  MSG_JSON=$(printf '%s' "$ADVISORY" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$ADVISORY")
  MSG_JSON="${MSG_JSON:1:${#MSG_JSON}-2}"

  cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "${MSG_JSON}"
  }
}
JSONEOF

  exit 0
fi
