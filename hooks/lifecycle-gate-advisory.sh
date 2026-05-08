#!/usr/bin/env bash
# adev PostToolUse hook: Lifecycle Gate — Session Advisory (Layer 3)
# Fires on: .* (all tool calls)
# Injects lifecycle reminder when agent operates without a plan.
# Exit code: always 0 (PostToolUse hooks cannot block).

set -uo pipefail

# Read stdin (hook protocol)
cat > /dev/null

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

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

# No .context-index → exit silently
if [ -z "$CONTEXT_ROOT" ]; then
  exit 0
fi

# Read enforcement level
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

LEVEL=$(read_user_config_value "lifecycle.gate")

# Layer 3 only fires at confirm or block level
case "$LEVEL" in
  confirm|block) ;;
  *)
    # off, warn, or absent → no advisory
    exit 0
    ;;
esac

# Check execution state — if active or standalone, no advisory needed
STATE_FILE="$CONTEXT_ROOT/.context-index/.execution-state.md"
if [ -f "$STATE_FILE" ]; then
  STATE_STATUS=$(grep -E "^status:" "$STATE_FILE" 2>/dev/null | head -1 | sed 's/status:\s*//' | tr -d '[:space:]' || true)
  if [ "$STATE_STATUS" = "standalone" ] || [ "$STATE_STATUS" = "active" ]; then
    exit 0
  fi
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
ADVISORY="You are operating without an active plan. Run \`/adev:work\` to classify this task and enter the lifecycle, or \`/adev:standalone\` to disable enforcement for this session."
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
