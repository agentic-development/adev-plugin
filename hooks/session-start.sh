#!/usr/bin/env bash
# adev SessionStart hook
# Injects adev awareness into every Claude Code session.
# Fires on: startup, resume, clear, compact

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILL_FILE="${PLUGIN_ROOT}/skills/using-adev/SKILL.md"

if [ ! -f "$SKILL_FILE" ]; then
  exit 0
fi

# Read the skill content
SKILL_CONTENT=$(cat "$SKILL_FILE")

# Escape for JSON using python3
SKILL_CONTENT=$(printf '%s' "$SKILL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
# Remove surrounding quotes from json.dumps output
SKILL_CONTENT="${SKILL_CONTENT:1:${#SKILL_CONTENT}-2}"

cat <<JSONEOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${SKILL_CONTENT}"
  }
}
JSONEOF
