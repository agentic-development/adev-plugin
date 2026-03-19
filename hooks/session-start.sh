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

# Escape for JSON
SKILL_CONTENT=$(echo "$SKILL_CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
# Remove surrounding quotes from json.dumps
SKILL_CONTENT="${SKILL_CONTENT:1:${#SKILL_CONTENT}-2}"

# Detect platform and output appropriate format
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  # Claude Code native
  cat <<JSONEOF
{
  "hookSpecificOutput": {
    "additionalContext": "${SKILL_CONTENT}"
  }
}
JSONEOF
else
  # Other platforms (Cursor, etc.)
  cat <<JSONEOF
{
  "additional_context": "${SKILL_CONTENT}"
}
JSONEOF
fi
